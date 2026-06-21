import useDomainsStore from '../../store/useDomainsStore';
import useUiStore from '../../store/useUiStore';
import { usePermissions } from '../../shared/lib/usePermissions';
import { PlansPanel } from './PlansPanel';

export default function PlansScreen() {
  const setPlans = useDomainsStore(state => state.setPlans);
  const setConfirmModal = useUiStore(state => state.setConfirmModal);
  const { hasPermission } = usePermissions();

  return (
    <PlansPanel
      hasPermission={hasPermission}
      setConfirmModal={setConfirmModal}
      onPlansChange={setPlans}
    />
  );
}
