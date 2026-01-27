import logging
from django.contrib.auth.backends import BaseBackend
from django.contrib.auth.models import User
from .models import MailUser
from passlib.hash import sha512_crypt

logger = logging.getLogger(__name__)

class CheckMailServerBackend(BaseBackend):
    def authenticate(self, request, username=None, password=None):
        if not username or not password:
            return None
        
        try:
            # Query the *mail_data* database
            mail_user = MailUser.objects.using('mail_data').get(email=username)
            stored_hash = mail_user.password
            
            # Extract hash logic: standard crypt output or with {SHA512-CRYPT} prefix?
            if stored_hash.startswith('{SHA512-CRYPT}'):
                stored_hash = stored_hash.replace('{SHA512-CRYPT}', '', 1)
            
            if sha512_crypt.verify(password, stored_hash):
                # Success!
                user, created = User.objects.get_or_create(username=username)
                
                # Check if super admin
                if username == 'admin@zimprices.co.zw':
                    user.is_staff = True
                    user.is_superuser = True
                
                user.save()
                return user
                
        except MailUser.DoesNotExist:
            return None
        except Exception as e:
            return None
            
        return None

    def get_user(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
