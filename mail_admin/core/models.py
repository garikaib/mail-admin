from django.db import models

class MailDomain(models.Model):
    name = models.CharField(max_length=255, unique=True)
    max_users = models.IntegerField(default=50)
    max_aliases = models.IntegerField(default=100)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        managed = False  # Created by Postfix/MariaDB external setup
        db_table = 'domains'
        app_label = 'core'

    def __str__(self):
        return self.name


class MailUser(models.Model):
    uid = models.CharField(max_length=128, db_column='c_uid', primary_key=True)
    email = models.CharField(max_length=255, db_column='mail', unique=True)
    password = models.CharField(max_length=255, db_column='c_password')
    name = models.CharField(max_length=128, db_column='c_cn', null=True, blank=True) # Display Name
    domain = models.ForeignKey(MailDomain, on_delete=models.DO_NOTHING, db_column='domain_id')
    quota_kb = models.IntegerField(default=1048576)
    
    class Meta:
        managed = False
        db_table = 'users'
        app_label = 'core'
        
    def __str__(self):
        return self.email


class MailAlias(models.Model):
    domain = models.ForeignKey(MailDomain, on_delete=models.DO_NOTHING, db_column='domain_id')
    source = models.CharField(max_length=255)
    destination = models.TextField()
    managed_by_platform = models.BooleanField(default=False)

    class Meta:
        managed = False
        db_table = 'aliases'
        app_label = 'core'
        
    def __str__(self):
        return f"{self.source} -> {self.destination}"

# Audit Log Model (Stored in SQLite/Default DB)
class AdminLog(models.Model):
    admin_email = models.EmailField()
    action = models.CharField(max_length=50) # CREATE, UPDATE, DELETE
    target = models.CharField(max_length=255) # The user/alias being modified
    details = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.admin_email} - {self.action} - {self.target}"

class DomainStats(models.Model):
    domain_name = models.CharField(max_length=255, unique=True)
    sent_count = models.IntegerField(default=0)
    received_count = models.IntegerField(default=0)
    top_sender = models.CharField(max_length=255, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'domain_stats'
        app_label = 'core'

class ServerHealth(models.Model):
    cpu_usage = models.FloatField()
    ram_usage = models.FloatField()
    disk_usage = models.FloatField()
    uptime = models.CharField(max_length=50)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'server_health'
        app_label = 'core'
