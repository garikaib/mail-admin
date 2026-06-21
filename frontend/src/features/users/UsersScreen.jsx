import useAuthStore from '../../store/useAuthStore';
import useUiStore from '../../store/useUiStore';
import { usePermissions } from '../../shared/lib/usePermissions';
import { UsersPanel } from './UsersPanel';

export default function UsersScreen() {
  const user = useAuthStore(state => state.user);
  const setConfirmModal = useUiStore(state => state.setConfirmModal);
  const { hasPermission } = usePermissions();

  return (
    <UsersPanel
      user={user}
      setConfirmModal={setConfirmModal}
      hasPermission={hasPermission}
    />
  );
}
