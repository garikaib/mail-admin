import base64
import subprocess
import os
import shutil
import logging
from typing import List, Optional
from datetime import datetime, date, time, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel

from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user
from backend.app.core.permissions import require_permission
from backend.app.core.sudo import popen_sudo, run_sudo, sudo_cmd
from backend.app.models import AuthUser, ServerHealth, AdminLog
from backend.app.schemas import AdminLogResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/system", tags=["system"])

# Whitelisted Services
SERVICES = {
    'postfix': 'Postfix (MTA)',
    'dovecot': 'Dovecot (IMAP/POP)',
    'mariadb': 'MariaDB (Database)',
    'nginx': 'Nginx (Web Server)',
    'mail-admin': 'Mail Admin API (Uvicorn)',
    'rspamd': 'Rspamd (Spam Filter)',
    'sogo': 'SOGo (Groupware/Webmail)',
    'redis-server': 'Redis (Key-Value Store/Cache)'
}

# Whitelisted Configuration Files
CONFIG_FILES = {
    "postfix_main": {
        "path": "/etc/postfix/main.cf",
        "dev_path": "configs/dev_configs/postfix_main.cf",
        "label": "Postfix Main Config (main.cf)",
        "service": "postfix",
        "check_cmd": ["/usr/sbin/postfix", "check"]
    },
    "postfix_master": {
        "path": "/etc/postfix/master.cf",
        "dev_path": "configs/dev_configs/postfix_master.cf",
        "label": "Postfix Master Config (master.cf)",
        "service": "postfix",
        "check_cmd": ["/usr/sbin/postfix", "check"]
    },
    "dovecot": {
        "path": "/etc/dovecot/dovecot.conf",
        "dev_path": "configs/dev_configs/dovecot.conf",
        "label": "Dovecot Main Config (dovecot.conf)",
        "service": "dovecot",
        "check_cmd": ["/usr/sbin/doveconf"]
    },
    "sogo": {
        "path": "/etc/sogo/sogo.conf",
        "dev_path": "configs/dev_configs/sogo.conf",
        "label": "SOGo Webmail Config (sogo.conf)",
        "service": "sogo",
        "check_cmd": None
    },
    "rspamd_local": {
        "path": "/etc/rspamd/rspamd.local.lua",
        "dev_path": "configs/dev_configs/rspamd.local.lua",
        "label": "Rspamd Local Rules (rspamd.local.lua)",
        "service": "rspamd",
        "check_cmd": ["/usr/bin/rspamadm", "configtest"]
    },
    "nginx_global": {
        "path": "/etc/nginx/nginx.conf",
        "dev_path": "configs/dev_configs/nginx.conf",
        "label": "Nginx Global Config (nginx.conf)",
        "service": "nginx",
        "check_cmd": ["/usr/sbin/nginx", "-t"]
    }
}

# In-memory mock service states for local development mode
MOCK_SERVICES_STATES = {
    'postfix': True,
    'dovecot': True,
    'mariadb': True,
    'nginx': True,
    'mail-admin': True,
    'rspamd': True,
    'sogo': True,
    'redis-server': True
}

SERVICE_LOG_FILES = {
    "postfix": {"path": "/var/log/mail.log", "terms": ("postfix",)},
    "dovecot": {"path": "/var/log/mail.log", "terms": ("dovecot",)},
    "rspamd": {"path": "/var/log/rspamd/rspamd.log", "terms": ()},
    "sogo": {"path": "/var/log/sogo/sogo.log", "terms": ("sogod", "sogo")},
    "redis-server": {"path": "/var/log/redis/redis-server.log", "terms": ()},
}

JOURNAL_IDENTIFIERS = {
    "postfix": ("postfix", "postfix/master", "postfix/smtpd", "postfix/smtp", "postfix/qmgr", "postfix/pickup", "postfix/cleanup", "postfix/submission/smtpd", "postfix/anvil"),
    "dovecot": ("dovecot",),
    "rspamd": ("rspamd",),
    "sogo": ("sogod", "sogo"),
    "redis-server": ("redis-server",),
}


def parse_date_boundary(value: Optional[date], end_of_day: bool = False) -> Optional[datetime]:
    if value is None:
        return None
    boundary_time = time.max if end_of_day else time.min
    return datetime.combine(value, boundary_time)


def journal_since_value(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    presets = {
        "15m": "15 minutes ago",
        "1h": "1 hour ago",
        "6h": "6 hours ago",
        "today": "today",
        "yesterday": "yesterday",
    }
    return presets.get(value, value)


def journal_priority_value(value: Optional[str]) -> Optional[str]:
    if not value or value == "all":
        return None
    priorities = {
        "error": "0..3",
        "warning": "4",
        "info": "5..6",
        "debug": "7",
    }
    return priorities.get(value, value)


def run_log_command(cmd: list[str], timeout: int = 8) -> list[str]:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        logger.warning("Log command failed: %s stderr=%s", " ".join(cmd), result.stderr.strip())
        return []
    return [line for line in result.stdout.splitlines() if line.strip() and line.strip() != "-- No entries --"]


def filter_log_lines(lines: list[str], terms: tuple[str, ...] = (), q: Optional[str] = None, priority: Optional[str] = None) -> list[str]:
    filtered = lines
    if terms:
        lowered_terms = tuple(term.lower() for term in terms)
        filtered = [line for line in filtered if any(term in line.lower() for term in lowered_terms)]
    if q:
        needle = q.lower()
        filtered = [line for line in filtered if needle in line.lower()]
    if priority and priority != "all":
        level_terms = {
            "error": ("error", "err", "fatal", "failed", "failure", "reject", "warning:"),
            "warning": ("warning", "warn"),
            "info": ("info", "connect", "disconnect", "sent", "saved", "started", "stopped"),
            "debug": ("debug",),
        }.get(priority, ())
        if level_terms:
            filtered = [line for line in filtered if any(term in line.lower() for term in level_terms)]
    return filtered


def journal_commands_for_service(service: str, limit: int, since: Optional[str], until: Optional[str], priority: Optional[str]) -> list[list[str]]:
    since_value = journal_since_value(since)
    priority_value = journal_priority_value(priority)
    commands = []

    def add_common_args(cmd: list[str]) -> list[str]:
        if since_value:
            cmd.extend(["--since", since_value])
        if until:
            cmd.extend(["--until", until])
        if priority_value:
            cmd.extend(["-p", priority_value])
        return cmd

    commands.append(sudo_cmd(add_common_args(["/usr/bin/journalctl", "-u", service, "--no-pager", "-n", str(limit)])))
    if not service.endswith(".service"):
        commands.append(sudo_cmd(add_common_args(["/usr/bin/journalctl", "-u", f"{service}.service", "--no-pager", "-n", str(limit)])))
    for identifier in JOURNAL_IDENTIFIERS.get(service, ()): 
        commands.append(sudo_cmd(add_common_args(["/usr/bin/journalctl", "-t", identifier, "--no-pager", "-n", str(limit)])))
    return commands


def file_log_lines_for_service(service: str, limit: int, q: Optional[str], priority: Optional[str]) -> list[str]:
    source = SERVICE_LOG_FILES.get(service)
    if not source:
        return []
    read_count = min(max(limit * 20, 500), 10000)
    lines = run_log_command(sudo_cmd(["/usr/bin/tail", "-n", str(read_count), source["path"]]), timeout=5)
    return filter_log_lines(lines, source.get("terms", ()), q=q, priority=priority)[-limit:]


def unique_recent_lines(lines: list[str], limit: int) -> list[str]:
    seen = set()
    unique = []
    for line in lines:
        if line in seen:
            continue
        seen.add(line)
        unique.append(line)
    return unique[-limit:]

class ConfigEditRequest(BaseModel):
    content: str

class ServiceControlRequest(BaseModel):
    action: str  # start, stop, restart, reload

def is_prod_environment() -> bool:
    return os.getenv("ENVIRONMENT", "development").lower() == "production"


def nginx_site_dirs() -> tuple[str, str]:
    if is_prod_environment():
        return "/etc/nginx/sites-available", "/etc/nginx/sites-enabled"
    return "configs/nginx", "configs/nginx/sites-enabled"


def safe_filename(filename: str) -> str:
    if not filename or filename in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid configuration filename.")
    if any(sep in filename for sep in ("/", "\\", "\x00")) or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid configuration filename.")
    return filename


def encode_site_id(filename: str) -> str:
    token = base64.urlsafe_b64encode(filename.encode("utf-8")).decode("ascii").rstrip("=")
    return f"nginx_site_{token}"


def decode_site_id(config_id: str) -> str:
    if not config_id.startswith("nginx_site_"):
        raise HTTPException(status_code=404, detail="Configuration file not found.")
    token = config_id.removeprefix("nginx_site_")
    try:
        padded = token + "=" * (-len(token) % 4)
        filename = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Nginx site id.")
    return safe_filename(filename)


def nginx_site_meta(filename: str) -> dict:
    filename = safe_filename(filename)
    available_dir, enabled_dir = nginx_site_dirs()
    active_path = os.path.join(available_dir, filename)
    enabled_path = os.path.join(enabled_dir, filename)
    return {
        "id": encode_site_id(filename),
        "label": f"Nginx Site: {filename}",
        "path": active_path,
        "dev_path": active_path,
        "service": "nginx",
        "check_cmd": ["/usr/sbin/nginx", "-t"],
        "kind": "nginx_site",
        "filename": filename,
        "enabled": os.path.islink(enabled_path) or os.path.exists(enabled_path),
    }


def scan_nginx_sites() -> list[dict]:
    available_dir, _ = nginx_site_dirs()
    if not os.path.isdir(available_dir):
        return []
    sites = []
    for entry in sorted(os.scandir(available_dir), key=lambda e: e.name):
        if not entry.is_file() and not entry.is_symlink():
            continue
        if entry.name.startswith(".") or entry.name == "sites-enabled":
            continue
        try:
            sites.append(nginx_site_meta(entry.name))
        except HTTPException:
            continue
    return sites


def resolve_config(config_id: str) -> dict:
    if config_id in CONFIG_FILES:
        meta = dict(CONFIG_FILES[config_id])
        meta.update({"id": config_id, "kind": "static", "filename": os.path.basename(meta["path"]), "enabled": None})
        return meta
    if config_id.startswith("nginx_site_"):
        meta = nginx_site_meta(decode_site_id(config_id))
        active_path = meta["path"]
        if not os.path.exists(active_path):
            raise HTTPException(status_code=404, detail="Configuration file not found.")
        return meta
    raise HTTPException(status_code=404, detail="Configuration file not found.")


def parse_postfix_config(content: str) -> dict[str, str]:
    params = {}
    current_key = None
    current_val_lines = []
    
    for line in content.splitlines():
        if current_key and line and line[0] in {' ', '\t'}:
            clean_line = line.split('#', 1)[0]
            current_val_lines.append(clean_line)
            continue
            
        clean_line = line.split('#', 1)[0].strip()
        if not clean_line:
            continue
            
        if '=' in clean_line:
            if current_key:
                params[current_key] = " ".join("".join(current_val_lines).split())
                current_val_lines = []
            key, val = clean_line.split('=', 1)
            current_key = key.strip()
            current_val_lines = [val]
            
    if current_key:
        params[current_key] = " ".join("".join(current_val_lines).split())
    return params


def write_with_sudo(path: str, content: str, timeout: int = 5) -> None:
    write_proc = popen_sudo(["/usr/bin/tee", path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    stdout, stderr = write_proc.communicate(input=content, timeout=timeout)
    if write_proc.returncode != 0:
        raise RuntimeError(stderr.strip() or f"Failed to write {path}")


def prepare_nginx_site_validation(config_id: str, content: str) -> tuple[list[str], str]:
    filename = decode_site_id(config_id)
    tmp_dir = f"/tmp/mail_admin_validate_{config_id}_{os.getpid()}"
    sites_dir = os.path.join(tmp_dir, "sites-enabled")
    run_sudo(["/usr/bin/rm", "-rf", tmp_dir], check=True, timeout=5)
    run_sudo(["/usr/bin/mkdir", "-p", sites_dir], check=True, timeout=5)
    write_with_sudo(os.path.join(sites_dir, filename), content)
    nginx_conf = f"""events {{ worker_connections 128; }}
http {{
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    include {sites_dir}/*;
}}
"""
    write_with_sudo(os.path.join(tmp_dir, "nginx.conf"), nginx_conf)
    return sudo_cmd(["/usr/sbin/nginx", "-t", "-c", os.path.join(tmp_dir, "nginx.conf")]), tmp_dir


def prepare_validation_command(config_id: str, active_path: str, check_cmd: list[str], content: str) -> tuple[list[str], str]:
    if config_id.startswith("nginx_site_"):
        return prepare_nginx_site_validation(config_id, content)

    tmp_base = f"/tmp/mail_admin_validate_{config_id}_{os.getpid()}"

    if config_id in {"postfix_main", "postfix_master"}:
        tmp_dir = tmp_base
        run_sudo(["/usr/bin/rm", "-rf", tmp_dir], check=True, timeout=5)
        run_sudo(["/usr/bin/mkdir", "-p", tmp_dir], check=True, timeout=5)
        run_sudo(["/usr/bin/cp", "-a", "/etc/postfix/.", tmp_dir], check=True, timeout=10)
        staged_file = os.path.join(tmp_dir, "main.cf" if config_id == "postfix_main" else "master.cf")
        write_with_sudo(staged_file, content)
        return sudo_cmd(["/usr/sbin/postfix", "-c", tmp_dir, "check"]), tmp_dir

    tmp_path = tmp_base
    write_with_sudo(tmp_path, content)

    if config_id == "nginx_global":
        return sudo_cmd(["/usr/sbin/nginx", "-t", "-c", tmp_path]), tmp_path
    if config_id == "dovecot":
        return sudo_cmd(["/usr/sbin/doveconf", "-c", tmp_path]), tmp_path
    if config_id == "rspamd_local":
        return sudo_cmd(["/usr/bin/rspamadm", "configtest", "-c", tmp_path]), tmp_path

    return sudo_cmd(check_cmd), tmp_path

def get_service_info(service_name: str, display_name: str) -> dict:
    is_prod = is_prod_environment()
    
    if not is_prod:
        # Dev mode mock status
        is_active = MOCK_SERVICES_STATES.get(service_name, True)
        import random
        return {
            "name": display_name,
            "service_name": service_name,
            "status": "Online" if is_active else "Offline",
            "active": is_active,
            "pid": random.randint(1000, 9999) if is_active else 0,
            "memory": f"{random.randint(15, 120)} MB" if is_active else "0 MB",
            "uptime": "3d 4h 12m" if is_active else "N/A"
        }
        
    try:
        # Run systemctl show to extract structured systemd properties
        result = subprocess.run(
            ['systemctl', 'show', service_name, '--property=ActiveState,SubState,MainPID,MemoryCurrent,ActiveEnterTimestamp'],
            capture_output=True, text=True, timeout=3
        )
        props = {}
        for line in result.stdout.splitlines():
            if '=' in line:
                k, v = line.split('=', 1)
                props[k] = v
                
        is_active = props.get("ActiveState") == "active"
        pid = int(props.get("MainPID", 0))
        
        # Format memory usage
        mem_bytes_str = props.get("MemoryCurrent", "0")
        if mem_bytes_str.isdigit():
            mem_bytes = int(mem_bytes_str)
            if mem_bytes > 0 and mem_bytes < 100 * 1024 * 1024 * 1024:
                mem_mb = f"{mem_bytes / (1024 * 1024):.1f} MB"
            else:
                mem_mb = "N/A"
        else:
            mem_mb = "N/A"
            
        uptime = props.get("ActiveEnterTimestamp", "Unknown")
        if uptime == "[not set]":
            uptime = "N/A"
        
        return {
            "name": display_name,
            "service_name": service_name,
            "status": "Online" if is_active else "Offline",
            "active": is_active,
            "pid": pid if is_active else 0,
            "memory": mem_mb if is_active else "0 MB",
            "uptime": uptime if is_active else "N/A"
        }
    except Exception as e:
        logger.error(f"Failed to get systemctl status for {service_name}: {e}")
        return {
            "name": display_name,
            "service_name": service_name,
            "status": "Unknown/Error",
            "active": False,
            "pid": 0,
            "memory": "N/A",
            "uptime": "N/A"
        }

@router.get("/health")
def get_system_health(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    require_permission(current_user, db, "system:health")
    """
    Get the latest server metrics (CPU, RAM, Disk) and service statuses.
    """
    health = db.query(ServerHealth).order_by(ServerHealth.id.desc()).first()
    
    return {
        "metrics": {
            "cpu_usage": health.cpu_usage if health else 0.0,
            "ram_usage": health.ram_usage if health else 0.0,
            "disk_usage": health.disk_usage if health else 0.0,
            "uptime": health.uptime if health else "Unknown",
            "updated_at": health.updated_at if health else None
        }
    }

@router.get("/services/status")
def get_services_status(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    require_permission(current_user, db, "system:service_status")
    """
    Detailed check of all services on the mail server.
    """
    service_statuses = []
    for service_name, display_name in SERVICES.items():
        service_statuses.append(get_service_info(service_name, display_name))
    return service_statuses

@router.post("/services/{service}/control")
def control_service(
    service: str,
    payload: ServiceControlRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    # Validate service
    if service not in SERVICES:
        raise HTTPException(status_code=400, detail=f"Service '{service}' is not in the allowed management list.")
        
    action = payload.action.lower()
    if action not in ["start", "stop", "restart", "reload"]:
        raise HTTPException(status_code=400, detail="Action must be start, stop, restart, or reload.")
        
    # Enforce granular permissions
    if action == "start":
        require_permission(current_user, db, "system:service_start")
    elif action == "stop":
        require_permission(current_user, db, "system:service_stop")
    else:
        require_permission(current_user, db, "system:service_restart")
        
    is_prod = os.getenv("ENVIRONMENT", "development").lower() == "production"
    
    if not is_prod:
        # Dev mode mock behavior
        if action == "start":
            MOCK_SERVICES_STATES[service] = True
        elif action == "stop":
            MOCK_SERVICES_STATES[service] = False
        elif action == "restart":
            MOCK_SERVICES_STATES[service] = True
        
        # Write audit log
        db.add(AdminLog(
            admin_email=current_user.username,
            action=f"SERVICE_{action.upper()}",
            target=service,
            details=f"Service {service} state changed via {action} [MOCK]"
        ))
        db.commit()
        return {"status": "success", "message": f"Service {service} {action}ed successfully (Sandbox)."}
        
    # Production systemctl call
    try:
        # Run systemctl action
        cmd = sudo_cmd(["/usr/bin/systemctl", action, service])
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode != 0:
            logger.error(f"Failed to control service {service}: {result.stderr}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to {action} service: {result.stderr.strip()}"
            )
            
        # Write audit log
        db.add(AdminLog(
            admin_email=current_user.username,
            action=f"SERVICE_{action.upper()}",
            target=service,
            details=f"Successfully executed: systemctl {action} {service}"
        ))
        db.commit()
        return {"status": "success", "message": f"Service {service} {action}ed successfully."}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Service control command timed out.")
    except Exception as e:
        logger.error(f"Error controlling service {service}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/services/{service}/logs")
def get_service_logs(
    service: str,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    require_permission(current_user, db, "system:service_logs")
    
    if service not in SERVICES:
        raise HTTPException(status_code=400, detail=f"Service '{service}' is not in the allowed logging list.")
        
    is_prod = os.getenv("ENVIRONMENT", "development").lower() == "production"
    
    if not is_prod:
        # Return mock logs for development sandbox
        now_str = datetime.now().strftime("%b %d %H:%M:%S")
        mock_logs = [f"{now_str} localhost systemd[1]: Starting {SERVICES[service]}..."]
        for i in range(5):
            mock_logs.append(f"{now_str} localhost {service}[{1200 + i}]: Log entry {i} for {service} config reload success.")
        mock_logs.append(f"{now_str} localhost systemd[1]: Started {SERVICES[service]}.")
        return {"logs": mock_logs}
        
    try:
        # Run journalctl to stream logs
        cmd = sudo_cmd(["/usr/bin/journalctl", "-u", service, "--no-pager", "-n", str(limit)])
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Failed to fetch logs: {result.stderr}")
            
        lines = [line for line in result.stdout.splitlines() if line.strip()]
        return {"logs": lines}
    except Exception as e:
        logger.error(f"Failed to read logs for service {service}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/configs")
def list_configs(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    require_permission(current_user, db, "system:config_read")
    
    configs_list = []
    for config_id in CONFIG_FILES:
        meta = resolve_config(config_id)
        configs_list.append({
            "id": meta["id"],
            "label": meta["label"],
            "service": meta["service"],
            "kind": meta["kind"],
            "filename": meta["filename"],
            "path": meta["path"] if is_prod_environment() else meta["dev_path"],
            "enabled": meta["enabled"],
        })
    for meta in scan_nginx_sites():
        configs_list.append({
            "id": meta["id"],
            "label": meta["label"],
            "service": meta["service"],
            "kind": meta["kind"],
            "filename": meta["filename"],
            "path": meta["path"],
            "enabled": meta["enabled"],
        })
    return configs_list

@router.get("/configs/{config_id}")
def get_config_content(
    config_id: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    require_permission(current_user, db, "system:config_read")
    
    meta = resolve_config(config_id)
    is_prod = is_prod_environment()
    active_path = meta["path"] if is_prod else meta["dev_path"]
    
    if is_prod:
        # Read using sudo cat to ensure access to root-owned files
        try:
            cmd = sudo_cmd(["/usr/bin/cat", active_path])
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if result.returncode != 0:
                raise HTTPException(status_code=500, detail=f"Failed to read configuration: {result.stderr}")
            content = result.stdout
        except Exception as e:
            logger.error(f"Error reading configuration {config_id}: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    else:
        # Local file read
        if not os.path.exists(active_path):
            raise HTTPException(status_code=404, detail=f"Mock file not found at {active_path}")
        with open(active_path, "r") as f:
            content = f.read()
            
    return {
        "id": config_id,
        "label": meta["label"],
        "path": active_path,
        "service": meta["service"],
        "kind": meta["kind"],
        "filename": meta["filename"],
        "enabled": meta["enabled"],
        "content": content
    }

@router.post("/configs/{config_id}/validate")
def validate_config(
    config_id: str,
    payload: ConfigEditRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    require_permission(current_user, db, "system:config_write")
    
    meta = resolve_config(config_id)
    check_cmd = meta["check_cmd"]
    
    if not check_cmd:
        return {"valid": True, "message": "Syntax validation is not supported for this file type."}
        
    is_prod = os.getenv("ENVIRONMENT", "development").lower() == "production"
    
    if not is_prod:
        if config_id == "rspamd_local":
            try:
                compile(payload.content, '<string>', 'exec')
            except SyntaxError:
                pass
        if config_id.startswith("nginx_site_") and "server" not in payload.content:
            return {"valid": False, "message": "Nginx site files should contain at least one server block."}
        return {"valid": True, "message": "Sandbox dry-run syntax check passed successfully."}
        
    active_path = meta["path"]
    cleanup_path = None
    
    try:
        cmd_check, cleanup_path = prepare_validation_command(config_id, active_path, check_cmd, payload.content)
        result = subprocess.run(cmd_check, capture_output=True, text=True, timeout=10)
        run_sudo(["/usr/bin/rm", "-rf", cleanup_path], capture_output=True, timeout=5)
        cleanup_path = None
        
        if result.returncode != 0:
            error_output = result.stderr if result.stderr.strip() else result.stdout
            return {
                "valid": False,
                "message": f"Syntax validation failed:\n{error_output.strip()}"
            }
            
        return {"valid": True, "message": "Syntax validation dry-run check passed successfully."}
        
    except Exception as e:
        if cleanup_path:
            run_sudo(["/usr/bin/rm", "-rf", cleanup_path], capture_output=True)
        logger.error(f"Configuration validation failed: {e}")
        return {"valid": False, "message": f"Validation execution error: {str(e)}"}

@router.post("/configs/{config_id}")
def save_config(
    config_id: str,
    payload: ConfigEditRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    require_permission(current_user, db, "system:config_write")
    
    meta = resolve_config(config_id)
    is_prod = is_prod_environment()
    active_path = meta["path"] if is_prod else meta["dev_path"]
    
    # Define local/dev backup directory
    backup_dir = "/opt/mail_admin/backups/configs" if is_prod else "configs/backups"
    os.makedirs(backup_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"{config_id}.cf.bak.{timestamp}"
    backup_filepath = os.path.join(backup_dir, backup_filename)
    
    if not is_prod:
        # Dev Mode write with local backup
        try:
            # 1. Backup if original file exists
            if os.path.exists(active_path):
                shutil.copy(active_path, backup_filepath)
                
            # 2. Write new content
            with open(active_path, "w") as f:
                f.write(payload.content)
                
            # Log action
            db.add(AdminLog(
                admin_email=current_user.username,
                action="CONFIG_EDIT",
                target=config_id,
                details=f"Edited config file {config_id} (Sandbox). Backup saved as {backup_filename}."
            ))
            db.commit()
            return {"status": "success", "message": "Configuration saved successfully in sandbox."}
        except Exception as e:
            logger.error(f"Failed to edit sandbox config {config_id}: {e}")
            raise HTTPException(status_code=500, detail=str(e))
            
    # Production deployment with backup & validation checks
    active_backup_path = f"{active_path}.active_bak"
    try:
        if config_id.startswith("nginx_site_"):
            cleanup_path = None
            try:
                cmd_check, cleanup_path = prepare_validation_command(config_id, active_path, meta["check_cmd"], payload.content)
                dry_run = subprocess.run(cmd_check, capture_output=True, text=True, timeout=10)
                if dry_run.returncode != 0:
                    error_output = dry_run.stderr.strip() or dry_run.stdout.strip()
                    raise HTTPException(
                        status_code=422,
                        detail=f"Configuration syntax check failed. Content not saved.\n\nErrors:\n{error_output}"
                    )
            finally:
                if cleanup_path:
                    run_sudo(["/usr/bin/rm", "-rf", cleanup_path], capture_output=True)

        # 1. Back up active file to active_bak
        run_sudo(["/usr/bin/cp", active_path, active_backup_path], check=True, timeout=5)
        # Also copy to historical backups directory
        run_sudo(["/usr/bin/cp", active_path, backup_filepath], check=True, timeout=5)
        
        # 2. Write new content or update using postconf
        if config_id == "postfix_main":
            current_raw = ""
            if os.path.exists(active_path):
                cat_res = run_sudo(["/usr/bin/cat", active_path], capture_output=True, text=True, timeout=5)
                if cat_res.returncode == 0:
                    current_raw = cat_res.stdout
            current_params = parse_postfix_config(current_raw)
            new_params = parse_postfix_config(payload.content)
            
            # Deletions
            for key in current_params:
                if key not in new_params:
                    run_sudo(["/usr/sbin/postconf", "-X", key], check=True, timeout=5)
            # Additions & updates
            for key, val in new_params.items():
                if current_params.get(key) != val:
                    run_sudo(["/usr/sbin/postconf", "-e", f"{key}={val}"], check=True, timeout=5)
        else:
            write_with_sudo(active_path, payload.content)
        
        # 3. Perform syntax check if check_cmd exists
        if meta["check_cmd"]:
            cmd_check = sudo_cmd(meta["check_cmd"])
            check_result = subprocess.run(cmd_check, capture_output=True, text=True, timeout=5)
            
            if check_result.returncode != 0:
                # Syntax validation failed! Atomic rollback!
                run_sudo(["/usr/bin/cp", active_backup_path, active_path], check=True, timeout=5)
                # Cleanup temp active backup
                run_sudo(["/usr/bin/rm", "-f", active_backup_path], check=True)
                
                error_output = check_result.stderr if check_result.stderr.strip() else check_result.stdout
                raise HTTPException(
                    status_code=422,
                    detail=f"Configuration syntax check failed. Content rolled back.\n\nErrors:\n{error_output.strip()}"
                )
                
        # Cleanup temp active backup on success
        run_sudo(["/usr/bin/rm", "-f", active_backup_path], check=True)
        
        # Reload the target service if configured
        reload_service = meta["service"]
        if reload_service:
            reload_result = run_sudo(
                ["/usr/bin/systemctl", "reload", reload_service],
                capture_output=True,
                text=True,
                timeout=10
            )
            if reload_result.returncode != 0:
                error_output = reload_result.stderr.strip() or reload_result.stdout.strip()
                db.add(AdminLog(
                    admin_email=current_user.username,
                    action="CONFIG_EDIT_RELOAD_FAILED",
                    target=config_id,
                    details=f"Edited config file {config_id}, but reload failed: {error_output}"
                ))
                db.commit()
                raise HTTPException(
                    status_code=500,
                    detail=f"Configuration saved, but {reload_service} reload failed: {error_output}"
                )
            
        # Log action
        db.add(AdminLog(
            admin_email=current_user.username,
            action="CONFIG_EDIT",
            target=config_id,
            details=f"Edited config file {config_id}. Syntax check passed. Backup saved as {backup_filename}."
        ))
        db.commit()
        return {"status": "success", "message": f"Configuration saved successfully and {reload_service} reloaded."}
        
    except HTTPException:
        raise
    except Exception as e:
        # Rollback on unexpected errors
        run_sudo(["/usr/bin/cp", active_backup_path, active_path], capture_output=True)
        run_sudo(["/usr/bin/rm", "-f", active_backup_path], capture_output=True)
        logger.error(f"Failed to edit config {config_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/configs/nginx/{site_id}/toggle")
def toggle_nginx_site(
    site_id: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    require_permission(current_user, db, "system:config_write")

    config_id = f"nginx_site_{site_id}"
    meta = resolve_config(config_id)
    if meta["kind"] != "nginx_site":
        raise HTTPException(status_code=404, detail="Nginx site not found.")

    filename = meta["filename"]
    available_dir, enabled_dir = nginx_site_dirs()
    available_path = os.path.join(available_dir, filename)
    enabled_path = os.path.join(enabled_dir, filename)
    was_enabled = os.path.islink(enabled_path) or os.path.exists(enabled_path)
    target_enabled = not was_enabled
    is_prod = is_prod_environment()

    try:
        if is_prod:
            if target_enabled:
                run_sudo(["/usr/bin/ln", "-sf", available_path, enabled_path], check=True, timeout=5)
            else:
                run_sudo(["/usr/bin/rm", "-f", enabled_path], check=True, timeout=5)
            check_result = run_sudo(["/usr/sbin/nginx", "-t"], capture_output=True, text=True, timeout=10)
            if check_result.returncode != 0:
                if was_enabled:
                    run_sudo(["/usr/bin/ln", "-sf", available_path, enabled_path], capture_output=True, timeout=5)
                else:
                    run_sudo(["/usr/bin/rm", "-f", enabled_path], capture_output=True, timeout=5)
                error_output = check_result.stderr.strip() or check_result.stdout.strip()
                raise HTTPException(status_code=422, detail=f"Nginx validation failed. Toggle rolled back.\n{error_output}")
            reload_result = run_sudo(["/usr/bin/systemctl", "reload", "nginx"], capture_output=True, text=True, timeout=10)
            if reload_result.returncode != 0:
                if was_enabled:
                    run_sudo(["/usr/bin/ln", "-sf", available_path, enabled_path], capture_output=True, timeout=5)
                else:
                    run_sudo(["/usr/bin/rm", "-f", enabled_path], capture_output=True, timeout=5)
                error_output = reload_result.stderr.strip() or reload_result.stdout.strip()
                raise HTTPException(status_code=500, detail=f"Nginx reload failed. Toggle rolled back.\n{error_output}")
        else:
            os.makedirs(enabled_dir, exist_ok=True)
            if target_enabled:
                if os.path.lexists(enabled_path):
                    os.remove(enabled_path)
                os.symlink(os.path.abspath(available_path), enabled_path)
            elif os.path.lexists(enabled_path):
                os.remove(enabled_path)

        db.add(AdminLog(
            admin_email=current_user.username,
            action="NGINX_SITE_TOGGLE",
            target=filename,
            details=f"Nginx site {filename} {'enabled' if target_enabled else 'disabled'}."
        ))
        db.commit()
        return {"status": "success", "enabled": target_enabled, "message": f"Nginx site {filename} {'enabled' if target_enabled else 'disabled'}."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to toggle Nginx site {filename}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/logs", response_model=List[AdminLogResponse])
def get_audit_logs(
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    admin_email: Optional[str] = None,
    action: Optional[str] = None,
    target: Optional[str] = None,
    q: Optional[str] = None,
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    require_permission(current_user, db, "system:logs")
    query = db.query(AdminLog)
    if admin_email:
        query = query.filter(AdminLog.admin_email.ilike(f"%{admin_email}%"))
    if action:
        query = query.filter(AdminLog.action.ilike(f"%{action}%"))
    if target:
        query = query.filter(AdminLog.target.ilike(f"%{target}%"))
    if q:
        pattern = f"%{q}%"
        query = query.filter(or_(AdminLog.admin_email.ilike(pattern), AdminLog.action.ilike(pattern), AdminLog.target.ilike(pattern), AdminLog.details.ilike(pattern)))
    start = parse_date_boundary(from_date)
    end = parse_date_boundary(to_date, end_of_day=True)
    if start:
        query = query.filter(AdminLog.timestamp >= start)
    if end:
        query = query.filter(AdminLog.timestamp <= end)
    return query.order_by(AdminLog.timestamp.desc()).offset(offset).limit(limit).all()


@router.delete("/logs")
def purge_audit_logs(
    before: date = Query(..., description="Delete audit logs up to and including this date."),
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    require_permission(current_user, db, "system:logs_purge")
    cutoff = parse_date_boundary(before, end_of_day=True)
    deleted = db.query(AdminLog).filter(AdminLog.timestamp <= cutoff).delete(synchronize_session=False)
    db.add(AdminLog(
        admin_email=current_user.username,
        action="AUDIT_LOG_PURGE",
        target="core_adminlog",
        details=f"Purged {deleted} audit log entries through {before.isoformat()}"
    ))
    db.commit()
    return {"status": "success", "deleted": deleted, "before": before.isoformat()}


@router.get("/journal")
def query_journal_logs(
    service: str,
    limit: int = Query(default=100, le=1000),
    since: Optional[str] = None,
    until: Optional[str] = None,
    priority: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user)
):
    require_permission(current_user, db, "system:journal_query")
    if service not in SERVICES:
        raise HTTPException(status_code=400, detail=f"Service '{service}' is not in the allowed logging list.")

    is_prod = os.getenv("ENVIRONMENT", "development").lower() == "production"
    if not is_prod:
        now_str = datetime.now().strftime("%b %d %H:%M:%S")
        logs = [f"{now_str} localhost {service}[1200]: Mock journal entry {i} for query {q or '*'}" for i in range(1, 8)]
        return {"logs": logs}

    try:
        lines = []
        for cmd in journal_commands_for_service(service, limit, since, until, priority):
            lines.extend(run_log_command(cmd))
        lines = filter_log_lines(lines, q=q, priority=priority)

        file_lines = file_log_lines_for_service(service, limit, q=q, priority=priority)
        lines = unique_recent_lines(lines + file_lines, limit)
        return {"logs": lines, "sources": {"journal": True, "file_fallback": service in SERVICE_LOG_FILES}}
    except Exception as e:
        logger.error(f"Failed to query logs for service {service}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
