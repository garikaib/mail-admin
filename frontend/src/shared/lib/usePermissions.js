// src/shared/lib/usePermissions.js
import useAuthStore from '../../store/useAuthStore';

export function usePermissions() {
  const user = useAuthStore(state => state.user);
  
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_superuser) return true;
    if (!user.permissions) return false;
    if (permission.includes('||')) {
      return permission.split('||').some(p => user.permissions.includes(p.trim()));
    }
    return !!user.permissions.includes(permission);
  };

  return { hasPermission, user };
}
