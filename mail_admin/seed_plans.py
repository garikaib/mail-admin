import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import MailPlan

def create_plans():
    plans = [
        {
            'name': 'Standard',
            'max_users': 10,
            'max_aliases': 20,
            'quota_mb': 500,
            'is_default': True
        },
        {
            'name': 'Premium',
            'max_users': 10,
            'max_aliases': 20,
            'quota_mb': 10240, # 10GB
            'is_default': False
        },
        {
            'name': 'Ultra',
            'max_users': 20,
            'max_aliases': 40,
            'quota_mb': 1024, # 1GB
            'is_default': False
        }
    ]

    for p in plans:
        plan, created = MailPlan.objects.get_or_create(
            name=p['name'],
            defaults={
                'max_users': p['max_users'],
                'max_aliases': p['max_aliases'],
                'quota_mb': p['quota_mb'],
                'is_default': p['is_default']
            }
        )
        if created:
            print(f"Created Plan: {plan}")
        else:
            print(f"Plan exists: {plan}")
            # Optional: Update existing plans to match spec if needed
            # plan.max_users = p['max_users']
            # plan.quota_mb = p['quota_mb']
            # plan.save()

if __name__ == '__main__':
    create_plans()
