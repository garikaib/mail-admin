import { useServerHealthController } from './useServerHealthController';
import { usePermissions } from '../../shared/lib/usePermissions';
import { ServerHealthPanel } from './ServerHealthPanel';

export default function ServerHealthScreen() {
  const controller = useServerHealthController();
  const { hasPermission } = usePermissions();

  if (!controller.systemHealth) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm">Loading system health data...</div>
      </div>
    );
  }

  return (
    <ServerHealthPanel
      hasPermission={hasPermission}
      {...controller}
    />
  );
}
