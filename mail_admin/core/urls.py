from django.urls import path
from . import views

urlpatterns = [
    path('', views.login_view, name='login'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('logout/', views.logout_view, name='logout'),
    
    # HTMX Actions
    path('users/add/', views.add_user, name='add_user'),
    path('users/<str:email>/delete/', views.delete_user, name='delete_user'),
    path('users/<str:email>/reset-password/', views.reset_password, name='reset_password'),
    # Super Admin Actions
    path('domains/update/', views.update_domain, name='update_domain'),
    path('server-health/', views.server_health, name='server_health'),
    path('audit-logs/', views.audit_logs, name='audit_logs'),
    path('system-logs/', views.system_logs, name='system_logs'),
]
