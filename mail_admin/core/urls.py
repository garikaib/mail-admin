from django.urls import path
from . import views

urlpatterns = [
    path('', views.login_view, name='login'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('domain/<int:domain_id>/manage/', views.manage_domain, name='manage_domain'),
    path('logout/', views.logout_view, name='logout'),
    
    # HTMX Actions
    path('users/add/<int:domain_id>/', views.add_user, name='add_user'),
    path('users/<str:email>/delete/', views.delete_user, name='delete_user'),
    path('users/<str:email>/reset-password/', views.reset_password, name='reset_password'),
    path('users/list/<int:domain_id>/', views.user_list, name='user_list'), # New list endpoint
    
    path('aliases/add/<int:domain_id>/', views.add_alias, name='add_alias'),
    path('aliases/<int:alias_id>/delete/', views.delete_alias, name='delete_alias'),
    path('aliases/<int:alias_id>/edit/', views.edit_alias, name='edit_alias'),
    path('aliases/<int:alias_id>/edit-form/', views.edit_alias_form, name='edit_alias_form'),
    path('aliases/list/<int:domain_id>/', views.alias_list, name='alias_list'),
    
    # Super Admin Actions
    path('domains/update/', views.update_domain, name='update_domain'),
    path('server-health/', views.server_health, name='server_health'),
    path('audit-logs/', views.audit_logs, name='audit_logs'),
    path('system-logs/', views.system_logs, name='system_logs'),
    path('plans/', views.manage_plans, name='manage_plans'),
    path('plans/delete/<int:plan_id>/', views.delete_plan, name='delete_plan'),
    path('admins/', views.manage_admins, name='manage_admins'),
    path('domain/<int:domain_id>/monitor/', views.monitor_domain, name='monitor_domain'),
]
