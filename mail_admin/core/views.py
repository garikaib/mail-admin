from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.contrib import messages
from django.http import HttpResponse
from .models import MailDomain, MailUser, MailAlias, AdminLog, DomainStats, ServerHealth, MailPlan, DomainAllocation
from .auth_backend import CheckMailServerBackend
import secrets
import string
import os
import shutil
import subprocess
from passlib.hash import sha512_crypt
import requests
from django.conf import settings
import json

# --- Helper Functions ---

def audit_log(user, action, target, details=""):
    """Record an action in the audit log."""
    AdminLog.objects.create(
        admin_email=user.username,
        action=action,
        target=target,
        details=details
    )

def generate_password(length=16):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*()-_=+"
    return ''.join(secrets.choice(alphabet) for i in range(length))

def get_admin_domain(user):
    """
    Get the domain implementation for the logged-in admin.
    Returns the domain string (e.g. 'example.com').
    """
    if user.is_superuser:
        return None # Superuser sees all
    try:
        return user.username.split('@')[1]
    except IndexError:
        return None

def verify_turnstile(token):
    """Verify Cloudflare Turnstile token."""
    if not token:
        return False
    
    try:
        response = requests.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={
                "secret": settings.TURNSTILE_SECRET_KEY,
                "response": token,
            },
            timeout=5
        )
        result = response.json()
        return result.get("success", False)
    except Exception as e:
        print(f"Turnstile Error: {e}")
        return False

def get_effective_plan(domain_name):
    """
    Get the effective MailPlan for a domain.
    Falls back to 'Standard' if no allocation exists.
    """
    try:
        alloc = DomainAllocation.objects.select_related('plan').get(domain_name=domain_name)
        return alloc.plan
    except DomainAllocation.DoesNotExist:
        # Fallback to Standard
        return MailPlan.objects.filter(name="Standard").first()

# --- Views ---

def login_view(request):
    if request.user.is_authenticated:
        return redirect('dashboard')
    
    if request.method == 'POST':
        email = request.POST.get('email')
        password = request.POST.get('password')
        turnstile_token = request.POST.get('cf-turnstile-response')
        
        if not verify_turnstile(turnstile_token):
            messages.error(request, "Security check failed. Please solve the Turnstile challenge.")
            return render(request, 'login.html')

        user = authenticate(request, username=email, password=password)
        if user:
            login(request, user)
            return redirect('dashboard')
        else:
            messages.error(request, "Invalid email or password.")
    
    return render(request, 'login.html')

def logout_view(request):
    logout(request)
    return redirect('login')

@login_required
def dashboard(request):
    domain_name = get_admin_domain(request.user)
    
    if request.user.is_superuser:
        domains = MailDomain.objects.using('mail_data').all()
        health = ServerHealth.objects.using('mail_data').order_by('-id').first()
        
        # Merge domain data with stats and Plans
        domain_list = []
        for dom in domains:
            stats = DomainStats.objects.using('mail_data').filter(domain_name=dom.name).first()
            
            # Fetch Effective Plan
            plan_obj = get_effective_plan(dom.name)
            current_plan = plan_obj.name if plan_obj else "Custom"
            
            # Use Plan limits for display
            display_max_users = plan_obj.max_users if plan_obj else dom.max_users
            display_max_aliases = plan_obj.max_aliases if plan_obj else dom.max_aliases
                
            domain_list.append({
                'id': dom.id,
                'name': dom.name,
                'max_users': display_max_users,
                'max_aliases': display_max_aliases,
                'is_active': dom.is_active,
                'sent': stats.sent_count if stats else 0,
                'received': stats.received_count if stats else 0,
                'top_sender': stats.top_sender if stats else "N/A",
                'plan_name': current_plan
            })
            
        # --- Filtering & Sorting ---
        query = request.GET.get('q', '').lower()
        status_filter = request.GET.get('status', 'all')
        sort_by = request.GET.get('sort', 'name_asc')

        # 1. Filtering
        if query:
            domain_list = [d for d in domain_list if query in d['name'].lower()]
            
        if status_filter == 'active':
            domain_list = [d for d in domain_list if d['is_active']]
        elif status_filter == 'suspended':
            domain_list = [d for d in domain_list if not d['is_active']]

        # 2. Sorting
        sort_key = 'name'
        reverse = False
        
        if sort_by == 'name_desc':
            sort_key = 'name'
            reverse = True
        elif sort_by == 'usage_high':
            sort_key = 'sent' # Rough proxy for usage
            reverse = True
        elif sort_by == 'usage_low':
            sort_key = 'sent'
            reverse = False
            
        domain_list.sort(key=lambda x: x[sort_key], reverse=reverse)
            
        plans = MailPlan.objects.all()
            
        return render(request, 'dashboard_super.html', {
            'domains': domain_list,
            'plans': plans,
            'health': health,
            'current_q': query,
            'current_status': status_filter,
            'current_sort': sort_by
        })
    
    # Regular Admin Dashboard
    if not domain_name:
        messages.error(request, "Invalid admin account configuration.")
        return redirect('login')
        
    try:
        domain = MailDomain.objects.using('mail_data').get(name=domain_name)
        if not domain.is_active:
            messages.error(request, f"Access Denied: The domain {domain_name} has been suspended.")
            logout(request)
            return redirect('login')
    except MailDomain.DoesNotExist:
        messages.error(request, f"Domain {domain_name} not found in mail system.")
        return redirect('login')
        
    users = MailUser.objects.using('mail_data').filter(domain=domain).order_by('email')
    aliases = MailAlias.objects.using('mail_data').filter(domain=domain, managed_by_platform=True).order_by('source')
    
    return render(request, 'dashboard.html', {
        'domain': domain,
        'users': users,
        'aliases': aliases
    })

# --- HTMX Fragments ---

@login_required
def user_list(request):
    """Return the updated user list for HTMX updates."""
    domain_name = get_admin_domain(request.user)
    domain = MailDomain.objects.using('mail_data').get(name=domain_name)
    users = MailUser.objects.using('mail_data').filter(domain=domain).order_by('email')
    return render(request, 'partials/user_list.html', {'users': users})

@login_required
@require_http_methods(["POST"])
def add_user(request):
    domain_name = get_admin_domain(request.user)
    domain = MailDomain.objects.using('mail_data').get(name=domain_name)
    
    username = request.POST.get('username') # local part
    display_name = request.POST.get('display_name')
    
    if not username:
        return HttpResponse("Username required", status=400)
        
    email = f"{username}@{domain_name}"
    
    # Check Plan Limits
    plan = get_effective_plan(domain_name)
    max_users = plan.max_users if plan else domain.max_users
    
    current_count = MailUser.objects.using('mail_data').filter(domain=domain).count()
    if current_count >= max_users:
        messages.error(request, f"Limit reached: This domain's plan is capped at {max_users} mailboxes.")
        return user_list(request)

    # Check existence
    if MailUser.objects.using('mail_data').filter(email=email).exists():
        messages.error(request, f"User {email} already exists.")
        return user_list(request)
        
    password = generate_password()
    password_hash = sha512_crypt.using(rounds=5000).hash(password)
    # Ensure {SHA512-CRYPT} prefix if Dovecot expects it (often optional but good practice)
    if not password_hash.startswith('{SHA512-CRYPT}'):
        password_hash = f"{{SHA512-CRYPT}}{password_hash}"

    # DB Insert with Plan-Enforced Quota
    quota_kb = 1048576 # Default 1GB
    if plan:
        quota_kb = plan.quota_mb * 1024
        
    MailUser.objects.using('mail_data').create(
        email=email,
        password=password_hash,
        name=display_name,
        domain=domain,
        quota_kb=quota_kb
    )
    
    # Maildir Creation (Local Filesystem)
    # /var/vmail/domain/user
    maildir_path = f"/var/vmail/{domain_name}/{username}"
    try:
        os.makedirs(maildir_path, exist_ok=True)
        # Set permissions vmail:vmail (uid:gid 5000:5000 typically check /etc/passwd on remote)
        # We'll use chown command to be safe
        subprocess.run(["chown", "-R", "vmail:vmail", f"/var/vmail/{domain_name}"], check=True)
    except Exception as e:
        messages.warning(request, f"User created but Maildir creation failed: {e}")

    audit_log(request.user, "CREATE", email, f"Name: {display_name}")
    messages.success(request, f"User {email} created. Password: {password}")
    
    return user_list(request)

@login_required
@require_http_methods(["POST"])
def add_alias(request):
    domain_name = get_admin_domain(request.user)
    domain = MailDomain.objects.using('mail_data').get(name=domain_name)
    
    source_username = request.POST.get('source')
    destination = request.POST.get('destination')
    
    if not source_username or not destination:
        return HttpResponse("Source and Destination required", status=400)
        
    source = f"{source_username}@{domain_name}"
    
    # Check Plan Limits
    plan = get_effective_plan(domain_name)
    max_aliases = plan.max_aliases if plan else domain.max_aliases
    
    current_count = MailAlias.objects.using('mail_data').filter(domain=domain, managed_by_platform=True).count()
    if current_count >= max_aliases:
        messages.error(request, f"Limit reached: This domain's plan is capped at {max_aliases} aliases.")
        return alias_list(request)

    # Check existence
    if MailAlias.objects.using('mail_data').filter(source=source, destination=destination).exists():
        messages.error(request, f"Alias {source} -> {destination} already exists.")
        return alias_list(request)
        
    MailAlias.objects.using('mail_data').create(
        source=source,
        destination=destination,
        domain=domain,
        managed_by_platform=True
    )

    audit_log(request.user, "CREATE_ALIAS", source, f"To: {destination}")
    messages.success(request, f"Alias {source} -> {destination} created.")
    
    return alias_list(request)

@login_required
@require_http_methods(["POST"])
def delete_alias(request, alias_id):
    domain_name = get_admin_domain(request.user)
    alias = get_object_or_404(MailAlias.objects.using('mail_data'), id=alias_id)
    
    # Security Check
    if alias.domain.name != domain_name and not request.user.is_superuser:
        return HttpResponse("Unauthorized", status=403)
        
    source = alias.source
    dest = alias.destination
    alias.delete(using='mail_data')
    
    audit_log(request.user, "DELETE_ALIAS", source, f"To: {dest}")
    messages.success(request, f"Alias {source} -> {dest} removed.")
    
    return alias_list(request)

@login_required
def alias_list(request):
    """Return the updated alias list fragment for HTMX."""
    domain_name = get_admin_domain(request.user)
    domain = MailDomain.objects.using('mail_data').get(name=domain_name)
    aliases = MailAlias.objects.using('mail_data').filter(domain=domain, managed_by_platform=True).order_by('source')
    return render(request, 'partials/alias_list.html', {'aliases': aliases})

@login_required
@require_http_methods(["DELETE"])
def delete_user(request, email):
    # Validate authorization
    domain_name = get_admin_domain(request.user)
    if not email.endswith(f"@{domain_name}") and not request.user.is_superuser:
        return HttpResponse("Unauthorized", status=403)
        
    MailUser.objects.using('mail_data').filter(email=email).delete()
    audit_log(request.user, "DELETE", email)
    messages.success(request, f"User {email} deleted.")
    
    return user_list(request)

@login_required
@require_http_methods(["POST"])
def reset_password(request, email):
    domain_name = get_admin_domain(request.user)
    if not email.endswith(f"@{domain_name}") and not request.user.is_superuser:
        return HttpResponse("Unauthorized", status=403)
        
    password = generate_password()
    password_hash = sha512_crypt.using(rounds=5000).hash(password)
    if not password_hash.startswith('{SHA512-CRYPT}'):
        password_hash = f"{{SHA512-CRYPT}}{password_hash}"
        
    MailUser.objects.using('mail_data').filter(email=email).update(password=password_hash)
    audit_log(request.user, "RESET_PASSWORD", email)
    
    # Return a snippet showing the new password
    # In a real HTMX flow we might show a modal or a toast
    messages.success(request, f"Password for {email} reset to: {password}")
    return user_list(request)
@login_required
@require_http_methods(["POST"])
@login_required
@require_http_methods(["POST"])
def update_domain(request):
    """Update domain configuration via Plan (Super Admin only)."""
    if not request.user.is_superuser:
        return HttpResponse("Unauthorized", status=403)
        
    domain_id = request.POST.get('domain_id')
    plan_id = request.POST.get('plan_id') # New Field
    is_active = request.POST.get('is_active') == 'on'
    
    try:
        domain = MailDomain.objects.using('mail_data').get(id=domain_id)
        
        # Resolve Plan
        plan = MailPlan.objects.get(id=plan_id)
        
        # Update DomainAllocation (Default DB)
        allocation, created = DomainAllocation.objects.update_or_create(
            domain_name=domain.name,
            defaults={'plan': plan}
        )
        
        # Enforce on MailDomain (MariaDB)
        domain.max_users = plan.max_users
        domain.max_aliases = plan.max_aliases
        domain.is_active = is_active
        domain.save(using='mail_data')
        
        # --- CRITICAL: Update existing users' quotas ---
        new_quota_kb = plan.quota_mb * 1024
        updated_count = MailUser.objects.using('mail_data').filter(domain=domain).update(quota_kb=new_quota_kb)
        
        # --- CRITICAL: Reload Dovecot to apply new quotas ---
        try:
            subprocess.run(["/usr/bin/sudo", "/usr/sbin/doveadm", "reload"], check=True, timeout=10)
        except Exception as e:
            messages.warning(request, f"Quotas updated but Dovecot reload failed: {e}")
        
        audit_log(request.user, "UPDATE_DOMAIN", domain.name, f"Plan: {plan.name}, Active: {is_active}, Quotas: {updated_count} users updated to {plan.quota_mb}MB")
        messages.success(request, f"Configuration for {domain.name} updated to {plan.name} Plan. {updated_count} user quotas synced.")
    except (MailDomain.DoesNotExist, MailPlan.DoesNotExist):
        messages.error(request, "Domain or Plan not found.")
        
    response = HttpResponse("")
    response['HX-Refresh'] = 'true'
    response = HttpResponse("")
    response['HX-Refresh'] = 'true'
    return response # Refresh the page to reflect changes

@login_required
def monitor_domain(request, domain_id):
    """Detailed monitoring view for a specific domain."""
    if not request.user.is_superuser:
        return HttpResponse("Unauthorized", status=403)
        
    domain = get_object_or_404(MailDomain.objects.using('mail_data'), id=domain_id)
    stats = DomainStats.objects.using('mail_data').filter(domain_name=domain.name).first()
    
    metrics = {}
    if stats and stats.metrics_json:
        try:
            metrics = json.loads(stats.metrics_json)
        except json.JSONDecodeError:
            pass
            
    return render(request, 'monitor_domain.html', {
        'domain': domain,
        'stats': stats,
        'metrics': metrics
    })

@login_required
def server_health(request):
    """Detailed server health and service monitoring."""
    if not request.user.is_superuser:
        return HttpResponse("Unauthorized", status=403)
        
    # Latest system stats from DB
    health_record = ServerHealth.objects.using('mail_data').order_by('-id').first()
    
    # Real-time service status checks
    services = {
        'Postfix (MTA)': 'postfix',
        'Dovecot (IMAP/POP)': 'dovecot',
        'MariaDB (Database)': 'mariadb',
        'Nginx (Web Server)': 'nginx',
        'Mail Admin (Gunicorn)': 'mail-admin'
    }
    
    status_results = []
    for display_name, service_name in services.items():
        try:
            # Use absolute path for systemctl
            result = subprocess.run(['/usr/bin/systemctl', 'is-active', service_name], capture_output=True, text=True)
            is_active = result.stdout.strip() == 'active'
            status_results.append({
                'name': display_name,
                'status': 'Online' if is_active else 'Offline',
                'active': is_active
            })
        except Exception as e:
            print(f"Error checking status for {service_name}: {e}")
            status_results.append({
                'name': display_name,
                'status': 'Error',
                'active': False
            })

    return render(request, 'server_health.html', {
        'health': health_record,
        'services': status_results
    })

@login_required
def audit_logs(request):
    """View admin activity logs."""
    if not request.user.is_superuser:
        return HttpResponse("Unauthorized", status=403)
        
    logs = AdminLog.objects.order_by('-timestamp')[:100] # Last 100 actions
    return render(request, 'audit_logs.html', {'logs': logs})

@login_required
def system_logs(request):
    """View and stream system logs."""
    if not request.user.is_superuser:
        return HttpResponse("Unauthorized", status=403)
        
    service = request.GET.get('service', 'mail')
    try:
        lines = int(request.GET.get('lines', 50))
    except (ValueError, TypeError):
        lines = 50
    filter_keyword = request.GET.get('filter', '')
    
    log_map = {
        'mail': '/var/log/mail.log',
        'nginx': '/var/log/nginx/error.log',
        'app': 'journalctl -u mail-admin -n'
    }
    
    log_content = ""
    import html
    try:
        if service == 'app':
            cmd = f"/usr/bin/sudo /usr/bin/journalctl -u mail-admin -n {lines} --no-pager"
            if filter_keyword:
                cmd += f" | grep -i '{filter_keyword}'"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            log_content = result.stdout if result.returncode == 0 else f"Error: {result.stderr}"
        else:
            log_path = log_map.get(service, '/var/log/mail.log')
            cmd = f"/usr/bin/sudo /usr/bin/tail -n {lines} {log_path}"
            if filter_keyword:
                cmd += f" | grep -i '{filter_keyword}'"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            log_content = result.stdout if result.returncode == 0 else f"Error: {result.stderr}"
    except Exception as e:
        log_content = f"Exception reading logs: {e}"

    # Default if empty
    if not log_content.strip():
        log_content = "No logs found or empty output."

    if request.headers.get('HX-Request'):
        safe_content = html.escape(log_content)
        return HttpResponse(f"<pre class='text-xs font-mono text-slate-300 bg-slate-900 p-4 rounded-xl overflow-x-auto'>{safe_content}</pre>")

    return render(request, 'system_logs.html', {
        'log_content': log_content,
        'current_service': service,
        'current_lines': lines,
        'current_filter': filter_keyword
    })

@login_required
def manage_plans(request):
    """View and manage subscription plans."""
    if not request.user.is_superuser:
        return HttpResponse("Unauthorized", status=403)
        
    if request.method == "POST":
        plan_id = request.POST.get('plan_id')
        name = request.POST.get('name')
        quota_mb = request.POST.get('quota_mb')
        max_users = request.POST.get('max_users')
        max_aliases = request.POST.get('max_aliases')
        
        defaults = {
            'quota_mb': quota_mb,
            'max_users': max_users,
            'max_aliases': max_aliases
        }
        
        if plan_id:
            MailPlan.objects.filter(id=plan_id).update(name=name, **defaults)
            action = "UPDATED"
        else:
            MailPlan.objects.create(name=name, **defaults)
            action = "CREATED"
            
        messages.success(request, f"Plan '{name}' {action} successfully.")
        return redirect('manage_plans')

    plans = MailPlan.objects.all().order_by('quota_mb')
    return render(request, 'plans.html', {'plans': plans})

@login_required
def delete_plan(request, plan_id):
    if not request.user.is_superuser:
        return HttpResponse("Unauthorized", status=403)
        
    try:
        plan = MailPlan.objects.get(id=plan_id)
        # Check if used
        if DomainAllocation.objects.filter(plan=plan).exists():
            messages.error(request, "Cannot delete plan: It is currently assigned to domains.")
        else:
            plan.delete()
            messages.success(request, "Plan deleted.")
    except MailPlan.DoesNotExist:
        pass
        
    return redirect('manage_plans')
