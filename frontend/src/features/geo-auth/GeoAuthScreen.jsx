import { useGeoAuthController } from './useGeoAuthController';
import { usePermissions } from '../../shared/lib/usePermissions';
import { GeoAuthPanel } from './GeoAuthPanel';

export default function GeoAuthScreen() {
  const controller = useGeoAuthController();
  const { hasPermission } = usePermissions();

  return (
    <GeoAuthPanel
      hasPermission={hasPermission}
      {...controller}
    />
  );
}
