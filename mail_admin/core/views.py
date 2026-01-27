from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.contrib import messages
from django.http import HttpResponse
from .models import MailUser, MailAlias, MailDomain, AdminLog, DomainStats, ServerHealth
from .auth_backend import CheckMailServerBackend
import secrets
import string
import os
import shutil
import subprocess
from passlib.hash import sha512_crypt
import requests
from django.conf import settings

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
        
        # Merge domain data with stats
        domain_list = []
        for dom in domains:
            stats = DomainStats.objects.using('mail_data').filter(domain_name=dom.name).first()
            domain_list.append({
                'id': dom.id,
                'name': dom.name,
                'max_users': dom.max_users,
                'max_aliases': dom.max_aliases,
                'is_active': dom.is_active,
                'sent': stats.sent_count if stats else 0,
                'received': stats.received_count if stats else 0,
                'top_sender': stats.top_sender if stats else "N/A"
            })
            
        return render(request, 'dashboard_super.html', {
            'domains': domain_list,
            'health': health
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
    
    # Check Limits
    current_count = MailUser.objects.using('mail_data').filter(domain=domain).count()
    if current_count >= domain.max_users:
        messages.error(request, f"Limit reached: This domain is capped at {domain.max_users} mailboxes.")
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

    # DB Insert
    MailUser.objects.using('mail_data').create(
        email=email,
        password=password_hash,
        name=display_name,
        domain=domain
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
def update_domain(request):
    """Update domain configuration (Super Admin only)."""
    if not request.user.is_superuser:
        return HttpResponse("Unauthorized", status=403)
        
    domain_id = request.POST.get('domain_id')
    max_users = request.POST.get('max_users')
    max_aliases = request.POST.get('max_aliases')
    is_active = request.POST.get('is_active') == 'on'
    
    try:
        domain = MailDomain.objects.using('mail_data').get(id=domain_id)
        domain.max_users = max_users
        domain.max_aliases = max_aliases
        domain.is_active = is_active
        domain.save(using='mail_data')
        
        audit_log(request.user, "UPDATE_DOMAIN", domain.name, f"Users: {max_users}, Aliases: {max_aliases}, Active: {is_active}")
        messages.success(request, f"Configuration for {domain.name} updated successfully.")
    except MailDomain.DoesNotExist:
        messages.error(request, "Domain not found.")
        
    return HttpResponse("") # HTMX will handle message display via #messages
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
