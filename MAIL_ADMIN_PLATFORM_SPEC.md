# Mail Admin Platform Specification (Django Edition)

This document provides a complete technical specification and implementation guide for the **Mail Admin Platform**, a self-service tool for domain administrators to manage their users and aliases.

## 1. Overview
The platform allows `admin@domain.tld` users to:
- Manage users (Add/Edit/Delete/Password Reset) for their specific domain.
- Manage email forwarding (Aliases) without affecting system-level aliases.
- Super Admins (`admin@zimprices.co.zw`) can also add new domains to the system.

## 2. Backend Book (Technical Architecture)

### Hosting Environment
- **Server**: `51.77.222.232` (Remote Mail Server).
- **Hosting**: The app runs **LOCALLY** on the same server to access MariaDB via `localhost` and the filesystem (`/var/vmail`).
- **Web App Domain**: `admin.zimprices.co.zw`.
- **Reverse Proxy**: Nginx acting as a proxy to the Django application (Gunicorn/Uvicorn).

### Tech Stack
- **Framework**: **Django 5.x** (Standard, robust, batteries-included).
- **Security**: Django's built-in session management, CSRF protection, and authentication system.
- **Frontend**: **Tailwind CSS** (via **Tailwind CLI** for tree-shaking/performance) + **HTMX**.
    - **Theme**: **SOGo-Inspired**. The UI must match the visual language of the SOGo Webmail interface to feel like a native extension.
    - **Key Elements**: Sidebar navigation, clean white/gray backgrounds, specific SOGo green/blue accents, and Material Design-style icons.
- **Database**: 
  - **Default**: Django's own SQLite/Postgres DB for admin sessions/logs (or use the existing MariaDB).
  - **Legacy**: MariaDB (`mailserver` DB) accessed via Django Models with `managed = False`.
- **Hashing**: SHA512-CRYPT (verified via `passlib`).
- **Maildir**: `/var/vmail/{domain}/{user}/` (Local filesystem access).

### Database Model Strategy
We will use **Multiple Databases** in Django or a router, but simplest is to define Models that point to the `mailserver` tables.

#### Legacy Models (in `mail_app/models.py`)
```python
class MailUser(models.Model):
    # Map to 'users' table
    email = models.CharField(max_length=255, primary_key=True, db_column='mail')
    password = models.CharField(max_length=255, db_column='c_password')
    name = models.CharField(max_length=128, db_column='c_cn')  # Display Name
    domain = models.ForeignKey('MailDomain', on_delete=models.DO_NOTHING, db_column='domain_id')
    
    class Meta:
        managed = False
        db_table = 'users'

class MailDomain(models.Model):
    name = models.CharField(max_length=255)
    
    class Meta:
        managed = False
        db_table = 'domains'

class MailAlias(models.Model):
    source = models.CharField(max_length=255)
    destination = models.TextField()
    domain = models.ForeignKey('MailDomain', on_delete=models.DO_NOTHING, db_column='domain_id')
    managed_by_platform = models.BooleanField(default=False)

    class Meta:
        managed = False
        db_table = 'aliases'
```

### Required Schema Updates
```sql
-- 1. Support for Display Name in SOGo
ALTER TABLE mailserver.users ADD COLUMN IF NOT EXISTS name VARCHAR(128);

-- 2. Track platform-managed aliases
ALTER TABLE mailserver.aliases ADD COLUMN IF NOT EXISTS managed_by_platform BOOLEAN DEFAULT FALSE;

-- 3. Audit Logging (Can be a native Django model in the 'default' DB)
-- No SQL needed here; Django migrations will create this table in its own DB.
```

## 3. Implementation Logic

### Authentication (Custom Backend)
We will NOT replicate users into Django's auth table. Instead:
1.  **Custom Backend**: `CheckMailServerBackend`.
2.  **Authenticate**: verification against `mailserver.users` using `passlib.hash.sha512_crypt`.
3.  **On Success**: Create/Get a Django User object (using the email as username) to handle the session.
    -   *Why?* Enables standard `request.user.is_authenticated`, `@login_required`, and session handling without reinventing the wheel.
4.  **Super Admin**: If email == `admin@zimprices.co.zw`, set `is_staff=True` / `is_superuser=True`.

### View Logic (HTMX)
- **Table Rows**: Use HTMX to replace rows on Edit/Delete (e.g., `hx-target="closest tr"`, `hx-swap="outerHTML"`).
- **Modals**: Use HTMX to load form content into a generic modal container.
- **Search**: Active search input (`hx-trigger="keyup changed delay:500ms"`).

### Domain Isolation
- **Middleware/Mixin**: Ensure `request.user.email` domain matches the data being queried.
- `MailUser.objects.filter(domain__name=request.user.email.split('@')[1])`.

### User Management Operations
- **Add User**:
  - `MailUser.objects.create(...)`
  - Python `os` module to create `/var/vmail/...`.
  - `shutil.chown(path, user='vmail', group='vmail')`.

---

## 4. Comprehensive Prompt for New Conversation

**Instruction**: Copy the text below and start a new conversation.

***

**Role**: Senior Django Engineer & Systems Architect.
**Objective**: Build the **Mail Admin Platform** using **Django, Tailwind CSS, and HTMX**.

**Infrastructure Details**:
- **OS**: Ubuntu 22.04 LTS.
- **Existing Data**: MariaDB (`mailserver` DB) with Postfix/Dovecot schema.
- **Web Server**: Django (Gunicorn) + Nginx.
- **Location**: Runs on the same server (`51.77.222.232`).

**Tech Stack**:
- **Django**: Latest 5.x version.
- **Authentication**: Custom Authentication Backend (validates against external MariaDB, creates Django session).
- **Frontend**: Tailwind CSS (Use **standalone CLI** for production builds) + HTMX.
- **UI/UX**: **SOGo-Inspired Theme**.
  - The application MUST look and feel like part of the SOGo suite.
  - Use SOGo's color palette (muted grays, specific green/blue highlights).
  - Layout: Left sidebar for navigation (Users/Aliases/Domains), main content area on right.
  - Icons: Use a library that matches SOGo's aesthetic (e.g., Material Design Icons or FontAwesome looking similar).
- **Database**:
  - `default`: SQLite (transactional Django data like sessions/admin logs).
  - `mail_data`: Connection to existing MariaDB `mailserver` DB.

**Must-Have Features**:
1. **Multi-tenant Login**:
   - Authenticate admins using their EMAIL and PASSWORD from the `mailserver.users` table.
   - Use `passlib` to verify SHA512-CRYPT hashes.
   - leverage standard Django `login()` and Session framework.
2. **User Management**:
   - CRUD for `mailserver.users`.
   - **Important**: When creating a user, creating the physical Maildir (`/var/vmail/{domain}/{user}`) and set permissions (`vmail:vmail`).
   - SOGo "Display Name" support (map to `c_cn` or new `name` column).
3. **Alias Management**:
   - CRUD for `mailserver.aliases`.
   - **Protection**: Only CRUD aliases where `managed_by_platform=1`. Hide or read-only others.
4. **Super Admin (admin@zimprices.co.zw)**:
   - "Add Domain" feature (creates `domains` entry + admin account).
5. **Audit Logs**:
   - Use a standard Django Model (`AdminLog`) stored in the `default` DB to track who did what.

**Deliverables**:
1.  **Django Project Structure**: Standard layout.
2.  **`models.py`**: using `managed = False` for legacy tables interactions.
3.  **`auth_backend.py`**: The custom authentication logic.
4.  **`views.py` & Templates**: HTMX-driven UI (SOGo-inspired theme, seamless integration).
5.  **`deploy.sh`**: Setup script for systemd/nginx.

**Start by analyzing the requirements and proposing the `models.py` and `auth_backend.py` logic.**
