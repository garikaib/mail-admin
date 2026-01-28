from django.shortcuts import render, redirect, get_object_or_404
from django.template.loader import render_to_string
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.contrib import messages
from django.http import HttpResponse, HttpResponseForbidden
from .models import MailDomain, MailUser, MailAlias, AdminLog, DomainStats, ServerHealth, MailPlan, DomainAllocation, DomainAssignment
from .auth_backend import CheckMailServerBackend
import secrets
import string
import os
import shutil
import subprocess
import shlex
import re
from passlib.hash import sha512_crypt
import requests
from django.conf import settings
import json
import logging

logger = logging.getLogger(__name__)

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

def get_managed_domains(user):
    """
    Get a list of domain names that the user is allowed to manage.
    Returns: list of strings (domain names).
    """
    if user.is_superuser:
        # Superuser can manage ALL domains
        return list(MailDomain.objects.using('mail_data').values_list('name', flat=True))
        
    # Check for explicit DomainAssignment
    assigned_domains = list(DomainAssignment.objects.filter(user=user).values_list('domain_name', flat=True))
    if assigned_domains:
        return assigned_domains
        
    # Legacy Fallback: infer from email
    try:
        domain_part = user.username.split('@')[1]
        if MailDomain.objects.using('mail_data').filter(name=domain_part).exists():
            return [domain_part]
    except IndexError:
        pass
        
    return []

def is_protected_account(email):
    """
    Returns True if the email belongs to a Django superuser.
    This prevents domain admins from managing superuser mail accounts.
    """
    return User.objects.filter(username=email, is_superuser=True).exists()

def verify_turnstile(token):
    """Verify Cloudflare Turnstile token."""
    if not token:
        # If no secret key is set, skip verification (dev mode)
        if not settings.TURNSTILE_SECRET_KEY:
            return True
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
        
        if not verify_turnstile(turnstile_token) and settings.TURNSTILE_SECRET_KEY:
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
    """Main Dashboard: Lists all domains the user is allowed to manage."""
    user_managed_domains = get_managed_domains(request.user)
    
    if not user_managed_domains and not request.user.is_superuser:
        messages.error(request, "You do not have administrative access to any domains.")
        return render(request, 'dashboard_super.html', {'domains': []}) 

    health = None
    if request.user.is_superuser:
        health = ServerHealth.objects.using('mail_data').order_by('-id').first()
        
    if request.user.is_superuser:
        domains = MailDomain.objects.using('mail_data').all()
    else:
        domains = MailDomain.objects.using('mail_data').filter(name__in=user_managed_domains)

    domain_list = []
    for dom in domains:
        stats = DomainStats.objects.using('mail_data').filter(domain_name=dom.name).first()
        plan_obj = get_effective_plan(dom.name)
        current_plan = plan_obj.name if plan_obj else "Custom"
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
        
    query = request.GET.get('q', '').lower()
    status_filter = request.GET.get('status', 'all')
    sort_by = request.GET.get('sort', 'name_asc')

    if query:
        domain_list = [d for d in domain_list if query in d['name'].lower()]
        
    if status_filter == 'active':
        domain_list = [d for d in domain_list if d['is_active']]
    elif status_filter == 'suspended':
        domain_list = [d for d in domain_list if not d['is_active']]

    sort_key = 'name'
    reverse = False
    
    if sort_by == 'name_desc':
        sort_key = 'name'
        reverse = True
    elif sort_by == 'usage_high':
        sort_key = 'sent' 
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

@login_required
def manage_domain(request, domain_id):
    """Single Domain Management View."""
    domain = get_object_or_404(MailDomain.objects.using('mail_data'), id=domain_id)
    
    allowed_domains = get_managed_domains(request.user)
    if domain.name not in allowed_domains:
        return HttpResponseForbidden("You do not have permission to manage this domain.")
        
    if not domain.is_active and not request.user.is_superuser:
        messages.error(request, f"Access Denied: The domain {domain.name} has been suspended.")
        return redirect('dashboard')
        
    users = MailUser.objects.using('mail_data').filter(domain=domain).order_by('email')
    
    # Loophole Fix: Domain admins must not see protected accounts (superusers)
    if not request.user.is_superuser:
        protected_emails = list(User.objects.filter(is_superuser=True).values_list('username', flat=True))
        users = users.exclude(email__in=protected_emails)

    aliases = MailAlias.objects.using('mail_data').filter(domain=domain, managed_by_platform=True).order_by('source')
    
    # Resource Monitoring
    plan = get_effective_plan(domain.name)
    
    usage = {
        'users_used': users.count(),
        'users_limit': plan.max_users if plan else 0,
        'aliases_used': aliases.count(),
        'aliases_limit': plan.max_aliases if plan else 0,
        'quota_mb': plan.quota_mb if plan else 1024,
        'plan_name': plan.name if plan else "No Plan",
        'is_over_users': False,
        'is_over_aliases': False
    }
    
    if plan:
        usage['users_percent'] = min(100, (usage['users_used'] / plan.max_users) * 100) if plan.max_users > 0 else 0
        usage['aliases_percent'] = min(100, (usage['aliases_used'] / plan.max_aliases) * 100) if plan.max_aliases > 0 else 0
        usage['is_over_users'] = usage['users_used'] > plan.max_users
        usage['is_over_aliases'] = usage['aliases_used'] > plan.max_aliases
    
    return render(request, 'manage_domain.html', {
        'domain': domain,
        'users': users,
        'aliases': aliases,
        'usage': usage
    })

# --- HTMX Fragments ---

@login_required
def user_list(request, domain_id):
    """Return the updated user list for HTMX updates."""
    domain = get_object_or_404(MailDomain.objects.using('mail_data'), id=domain_id)
    allowed_domains = get_managed_domains(request.user)
    if domain.name not in allowed_domains:
         return HttpResponseForbidden()
         
    users = MailUser.objects.using('mail_data').filter(domain=domain).order_by('email')
    
    # Loophole Fix: Domain admins must not see protected accounts (superusers)
    if not request.user.is_superuser:
        protected_emails = list(User.objects.filter(is_superuser=True).values_list('username', flat=True))
        users = users.exclude(email__in=protected_emails)

    response_html = render_to_string('partials/user_list.html', {'users': users, 'domain': domain}, request=request)
    response_html += render_to_string('partials/messages.html', {}, request=request)
    return HttpResponse(response_html)

@login_required
@require_http_methods(["POST"])
def add_user(request, domain_id):
    domain = get_object_or_404(MailDomain.objects.using('mail_data'), id=domain_id)
    
    allowed_domains = get_managed_domains(request.user)
    if domain.name not in allowed_domains:
        return HttpResponseForbidden("Unauthorized")
    
    username = request.POST.get('username')
    display_name = request.POST.get('display_name')
    
    # Check Plan Limits
    plan = get_effective_plan(domain.name)
    
    if plan:
        current_users = MailUser.objects.using('mail_data').filter(domain=domain).count()
        if current_users >= plan.max_users:
            messages.error(request, f"Plan Limit Reached: Your current plan only allows {plan.max_users} mailboxes.")
            response_html = render_to_string('partials/messages.html', {}, request=request)
            return HttpResponse(response_html)
    
    if not username:
        return HttpResponse("Username required", status=400)
    
    # SECURITY: Validate username to prevent path traversal
    if not re.match(r'^[a-zA-Z0-9._-]+$', username):
        messages.error(request, "Invalid username. Only letters, numbers, dots, underscores, and hyphens are allowed.")
        response_html = render_to_string('partials/messages.html', {}, request=request)
        return HttpResponse(response_html)
        
    email = f"{username}@{domain.name}"
    plan = get_effective_plan(domain.name)
    max_users = plan.max_users if plan else domain.max_users
    
    current_count = MailUser.objects.using('mail_data').filter(domain=domain).count()
    if current_count >= max_users:
        messages.error(request, f"Limit reached: This domain's plan is capped at {max_users} mailboxes.")
        return user_list(request, domain_id)

    if MailUser.objects.using('mail_data').filter(email=email).exists():
        messages.error(request, f"User {email} already exists.")
        return user_list(request, domain_id)
        
    password = generate_password()
    password_hash = sha512_crypt.using(rounds=5000).hash(password)
    if not password_hash.startswith('{SHA512-CRYPT}'):
        password_hash = f"{{SHA512-CRYPT}}{password_hash}"

    quota_kb = 1048576 
    if plan:
        quota_kb = plan.quota_mb * 1024
        
    MailUser.objects.using('mail_data').create(
        uid=email,
        email=email,
        password=password_hash,
        full_name=username,
        name=display_name,
        domain=domain,
        quota_kb=quota_kb
    )
    
    maildir_path = f"/var/vmail/{domain.name}/{username}"
    try:
        # Use sudo for operations in /var/vmail
        subprocess.run(["/usr/bin/sudo", "/usr/bin/mkdir", "-p", maildir_path], check=True)
        subprocess.run(["/usr/bin/sudo", "/usr/bin/chown", "-R", "vmail:vmail", f"/var/vmail/{domain.name}"], check=True)
    except Exception as e:
        logger.error(f"Maildir creation failed for {email}: {e}")
        # Don't show technical details to user

    audit_log(request.user, "CREATE", email, f"Name: {display_name}")
    messages.success(request, f"User {email} created. Password: {password}", extra_tags=f"copy:{password}")
    
    return user_list(request, domain_id)

@login_required
@require_http_methods(["POST"])
def add_alias(request, domain_id):
    domain = get_object_or_404(MailDomain.objects.using('mail_data'), id=domain_id)
    if domain.name not in get_managed_domains(request.user):
        return HttpResponseForbidden("Unauthorized")
    
    source_username = request.POST.get('source')
    destination = request.POST.get('destination')
    
    if not source_username or not destination:
        return HttpResponse("Source and Destination required", status=400)
    
    # SECURITY: Validate source username chars
    if not re.match(r'^[a-zA-Z0-9._-]+$', source_username):
         messages.error(request, "Invalid source username.")
         return alias_list(request, domain_id)
         
    # SECURITY: Validate destination email format
    if not re.match(r'[^@]+@[^@]+\.[^@]+', destination):
         messages.error(request, "Invalid destination email address.")
         return alias_list(request, domain_id)
    
    # Check Plan Limits
    plan = get_effective_plan(domain.name)
    if plan:
        current_aliases = MailAlias.objects.using('mail_data').filter(domain=domain, managed_by_platform=True).count()
        if current_aliases >= plan.max_aliases:
            messages.error(request, f"Plan Limit Reached: Your current plan only allows {plan.max_aliases} aliases.")
            response_html = render_to_string('partials/messages.html', {}, request=request)
            return HttpResponse(response_html)

    source = f"{source_username}@{domain.name}"

    if MailAlias.objects.using('mail_data').filter(source=source, destination=destination).exists():
        messages.error(request, f"Alias {source} -> {destination} already exists.")
        return alias_list(request, domain_id)
        
    MailAlias.objects.using('mail_data').create(source=source, destination=destination, domain=domain, managed_by_platform=True)
    audit_log(request.user, "CREATE_ALIAS", source, f"To: {destination}")
    messages.success(request, f"Alias {source} -> {destination} created.")
    return alias_list(request, domain_id)

@login_required
@require_http_methods(["POST"])
def delete_alias(request, alias_id):
    alias = get_object_or_404(MailAlias.objects.using('mail_data'), id=alias_id)
    if alias.domain.name not in get_managed_domains(request.user):
        return HttpResponseForbidden("Unauthorized")
        
    source = alias.source
    dest = alias.destination
    domain_id = alias.domain.id
    alias.delete(using='mail_data')
    audit_log(request.user, "DELETE_ALIAS", source, f"To: {dest}")
    messages.success(request, f"Alias {source} -> {dest} removed.")
    return alias_list(request, domain_id)

@login_required
def alias_list(request, domain_id):
    domain = get_object_or_404(MailDomain.objects.using('mail_data'), id=domain_id)
    if domain.name not in get_managed_domains(request.user):
         return HttpResponseForbidden()
    aliases = MailAlias.objects.using('mail_data').filter(domain=domain, managed_by_platform=True).order_by('source')
    response_html = render_to_string('partials/alias_list.html', {'aliases': aliases, 'domain': domain}, request=request)
    response_html += render_to_string('partials/messages.html', {}, request=request)
    return HttpResponse(response_html)

@login_required
@require_http_methods(["DELETE"])
def delete_user(request, email):
    try:
        user_to_delete = MailUser.objects.using('mail_data').get(email=email)
        domain = user_to_delete.domain
    except MailUser.DoesNotExist:
        return HttpResponse("User not found", status=404)
        
    if domain.name not in get_managed_domains(request.user):
        return HttpResponseForbidden("Unauthorized")
        
    # Loophole Fix: Block domain admins from deleting superuser accounts
    if is_protected_account(email) and not request.user.is_superuser:
        return HttpResponseForbidden("Cannot manage protected accounts.")

    # SECURITY: Validate email string format from DB to prevent path traversal
    if not re.match(r'^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$', email):
         logger.critical(f"Security Alert: Attempt to delete malformed email user: {email}")
         return HttpResponseForbidden("Security Violation: Malformed email user.")

    # 1. Physical Purge (Maildir)
    try:
        username = email.split('@')[0]
        maildir_path = f"/var/vmail/{domain.name}/{username}"
        # We use sudo rm -rf. 
        # The deploy.sh script will be updated to allow this.
        subprocess.run(["/usr/bin/sudo", "/usr/bin/rm", "-rf", maildir_path], check=True)
    except Exception as e:
        logger.error(f"Failed to purge Maildir for {email}: {e}")
        # We continue even if files fail, to ensure DB cleanup happens

    # 2. Mail DB Purge
    user_to_delete.delete(using='mail_data')
    
    # 3. Django Auth Purge (if they exist as a platform user)
    User.objects.filter(username=email).delete()

    audit_log(request.user, "PURGE", email)
    messages.success(request, f"User {email} has been completely purged from the system.")
    
    # Trigger full page reload to refresh resource usage stats
    response = HttpResponse()
    response['HX-Redirect'] = f"/domain/{domain.id}/manage/"
    return response

@login_required
@require_http_methods(["POST"])
def reset_password(request, email):
    try:
        user_obj = MailUser.objects.using('mail_data').get(email=email)
        domain = user_obj.domain
    except MailUser.DoesNotExist:
        return HttpResponse("User not found", status=404)

    if domain.name not in get_managed_domains(request.user):
        return HttpResponseForbidden("Unauthorized")
        
    # Loophole Fix: Block domain admins from resetting superuser passwords
    if is_protected_account(email) and not request.user.is_superuser:
        return HttpResponseForbidden("Cannot manage protected accounts.")
        
    password = generate_password()
    password_hash = sha512_crypt.using(rounds=5000).hash(password)
    if not password_hash.startswith('{SHA512-CRYPT}'):
        password_hash = f"{{SHA512-CRYPT}}{password_hash}"
        
    MailUser.objects.using('mail_data').filter(email=email).update(password=password_hash)
    audit_log(request.user, "RESET_PASSWORD", email)
    messages.success(request, f"Password for {email} reset to: {password}", extra_tags=f"copy:{password}")
    return render(request, 'partials/messages.html')

@login_required
@require_http_methods(["POST"])
def update_domain(request):
    """Update domain configuration via Plan (Super Admin only)."""
    if not request.user.is_superuser:
        return HttpResponse("Unauthorized", status=403)
        
    domain_id = request.POST.get('domain_id')
    plan_id = request.POST.get('plan_id') 
    is_active = request.POST.get('is_active') == 'on'
    
    try:
        domain = MailDomain.objects.using('mail_data').get(id=domain_id)
        plan = MailPlan.objects.get(id=plan_id)
        DomainAllocation.objects.update_or_create(domain_name=domain.name, defaults={'plan': plan})
        
        domain.max_users = plan.max_users
        domain.max_aliases = plan.max_aliases
        domain.is_active = is_active
        domain.save(using='mail_data')
        
        new_quota_kb = plan.quota_mb * 1024
        MailUser.objects.using('mail_data').filter(domain=domain).update(quota_kb=new_quota_kb)
        
        try:
            subprocess.run(["/usr/bin/sudo", "/usr/sbin/doveadm", "reload"], check=True, timeout=10)
        except Exception as e:
            messages.warning(request, f"Quotas updated but Dovecot reload failed: {e}")
        
        audit_log(request.user, "UPDATE_DOMAIN", domain.name, f"Plan: {plan.name}, Active: {is_active}")
        messages.success(request, f"Configuration for {domain.name} updated to {plan.name} Plan.")
    except (MailDomain.DoesNotExist, MailPlan.DoesNotExist):
        messages.error(request, "Domain or Plan not found.")
        
    response = HttpResponse("")
    response['HX-Refresh'] = 'true'
    return response

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
        
    health_record = ServerHealth.objects.using('mail_data').order_by('-id').first()
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
            result = subprocess.run(['/usr/bin/systemctl', 'is-active', service_name], capture_output=True, text=True)
            is_active = result.stdout.strip() == 'active'
            status_results.append({
                'name': display_name,
                'status': 'Online' if is_active else 'Offline',
                'active': is_active
            })
        except Exception as e:
            status_results.append({'name': display_name, 'status': 'Error', 'active': False})

    return render(request, 'server_health.html', {'health': health_record, 'services': status_results})

@login_required
def audit_logs(request):
    """View admin activity logs."""
    if not request.user.is_superuser:
        return HttpResponse("Unauthorized", status=403)
    logs = AdminLog.objects.order_by('-timestamp')[:100]
    return render(request, 'audit_logs.html', {'logs': logs})

@login_required
def system_logs(request):
    """View and stream system logs."""
    if not request.user.is_superuser:
        return HttpResponse("Unauthorized", status=403)
        
    service = request.GET.get('service', 'mail')
    try:
        lines = int(request.GET.get('lines', 50))
        if lines < 1 or lines > 1000:
            lines = 50  # Enforce reasonable bounds
    except (ValueError, TypeError):
        lines = 50
    filter_keyword = request.GET.get('filter', '')
    
    # SECURITY: Whitelist service names to prevent path traversal
    allowed_services = {'mail', 'nginx', 'app'}
    if service not in allowed_services:
        service = 'mail'
    
    log_map = { 'mail': '/var/log/mail.log', 'nginx': '/var/log/nginx/error.log', 'app': 'journalctl -u mail-admin -n' }
    
    log_content = ""
    import html
    try:
        if service == 'app':
            # SECURITY: Avoid shell=True by using list arguments
            cmd = ["/usr/bin/sudo", "/usr/bin/journalctl", "-u", "mail-admin", "-n", str(lines), "--no-pager"]
            if filter_keyword:
                # SECURITY: Use grep as a separate process, safely quoted
                cmd_str = " ".join(cmd) + f" | grep -i {shlex.quote(filter_keyword)}"
                result = subprocess.run(cmd_str, shell=True, capture_output=True, text=True)
            else:
                result = subprocess.run(cmd, capture_output=True, text=True)
            log_content = result.stdout if result.returncode == 0 else f"Error: {result.stderr}"
        else:
            log_path = log_map.get(service, '/var/log/mail.log')
            cmd = ["/usr/bin/sudo", "/usr/bin/tail", "-n", str(lines), log_path]
            if filter_keyword:
                # SECURITY: Sanitize filter_keyword with shlex.quote
                cmd_str = " ".join(cmd) + f" | grep -i {shlex.quote(filter_keyword)}"
                result = subprocess.run(cmd_str, shell=True, capture_output=True, text=True)
            else:
                result = subprocess.run(cmd, capture_output=True, text=True)
            log_content = result.stdout if result.returncode == 0 else f"Error: {result.stderr}"
    except Exception as e:
        log_content = f"Exception reading logs: {e}"

    if not log_content.strip(): log_content = "No logs found or empty output."

    if request.headers.get('HX-Request'):
        safe_content = html.escape(log_content)
        return HttpResponse(f"<pre class='text-xs font-mono text-slate-300 bg-slate-900 p-4 rounded-xl overflow-x-auto'>{safe_content}</pre>")

    return render(request, 'system_logs.html', {'log_content': log_content, 'current_service': service, 'current_lines': lines, 'current_filter': filter_keyword})

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
        defaults = {'quota_mb': quota_mb, 'max_users': max_users, 'max_aliases': max_aliases}
        
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
        if DomainAllocation.objects.filter(plan=plan).exists():
            messages.error(request, "Cannot delete plan: It is currently assigned to domains.")
        else:
            plan.delete()
            messages.success(request, "Plan deleted.")
    except MailPlan.DoesNotExist: pass
    return redirect('manage_plans')

@login_required
def manage_admins(request):
    """Manage external admins and their domain assignments."""
    if not request.user.is_superuser:
        return HttpResponseForbidden()
        
    if request.method == "POST":
        action = request.POST.get('action')
        if action == "create_admin":
            email = request.POST.get('email')
            password = request.POST.get('password')
            if User.objects.filter(username=email).exists():
                messages.error(request, "User already exists.")
            else:
                User.objects.create_user(username=email, email=email, password=password)
                messages.success(request, f"Admin {email} created.")
        elif action == "assign_domain":
            user_id = request.POST.get('user_id'); domain_name = request.POST.get('domain_name')
            try:
                user = User.objects.get(id=user_id)
                if MailDomain.objects.using('mail_data').filter(name=domain_name).exists():
                    if not DomainAssignment.objects.filter(user=user, domain_name=domain_name).exists():
                        DomainAssignment.objects.create(user=user, domain_name=domain_name)
                        messages.success(request, f"Assigned {domain_name} to {user.username}.")
                    else: messages.warning(request, "Already assigned.")
                else: messages.error(request, "Domain does not exist.")
            except User.DoesNotExist: messages.error(request, "User not found.")
        elif action == "revoke_domain":
            assignment_id = request.POST.get('assignment_id'); DomainAssignment.objects.filter(id=assignment_id).delete(); messages.success(request, "Access revoked.")
        elif action == "delete_admin":
             user_id = request.POST.get('user_id')
             if int(user_id) == request.user.id: messages.error(request, "Cannot delete yourself.")
             else: User.objects.filter(id=user_id).delete(); messages.success(request, "Admin user deleted.")
        return redirect('manage_admins')

    admins = User.objects.prefetch_related('assignments').order_by('username')
    domains = MailDomain.objects.using('mail_data').order_by('name')
    return render(request, 'manage_admins.html', {'admins': admins, 'domains': domains})
