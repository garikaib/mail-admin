import { useEffect } from 'react';
import useCredentialsStore from '../../store/useCredentialsStore';
import useAuthStore from '../../store/useAuthStore';
import { usePermissions } from '../../shared/lib/usePermissions';
import { RegistrationsPanel } from './RegistrationsPanel';

export default function RegistrationsScreen() {
  const token = useAuthStore(state => state.token);
  const credentials = useCredentialsStore(state => state.credentials);
  const setCredentials = useCredentialsStore(state => state.setCredentials);
  const { hasPermission } = usePermissions();

  useEffect(() => {
    if (token && credentials.length === 0) {
      // Lazy fetch credentials for registration selection
      fetch('/api/credentials', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.ok ? res.json() : [])
        .then(data => setCredentials(data))
        .catch(err => console.error(err));
    }
  }, [token, credentials.length, setCredentials]);

  return (
    <RegistrationsPanel
      credentials={credentials}
      hasPermission={hasPermission}
    />
  );
}
