class MailRouter:
    """
    A router to control all database operations on models in the
    core application, targeting the 'mail_data' database for legacy tables.
    """
    
    route_app_labels = {'core'}
    # Helper: we only want to route the *legacy* models to mail_data.
    # AdminLog is in core but should be in default DB.
    legacy_models = {'mailuser', 'maildomain', 'mailalias'}

    def db_for_read(self, model, **hints):
        if model._meta.model_name in self.legacy_models:
            return 'mail_data'
        return 'default'

    def db_for_write(self, model, **hints):
        if model._meta.model_name in self.legacy_models:
            return 'mail_data'
        return 'default'

    def allow_relation(self, obj1, obj2, **hints):
        # Allow relations if both are allowed
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        # Ensure legacy models are NOT migrated (managed=False takes care of schema, but we ensure DBs match)
        if model_name in self.legacy_models:
            return False
        return True
