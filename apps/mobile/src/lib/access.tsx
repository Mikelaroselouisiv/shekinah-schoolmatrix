import { Screen, EmptyState } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import {
  canAccessPermission,
  canEditStudent,
  ROLES_FULL,
} from './permissions';

/** Écran simple « accès refusé ». */
export function AccessDenied({ title = 'Accès non autorisé' }: { title?: string }) {
  return (
    <Screen>
      <EmptyState title={title} />
    </Screen>
  );
}

/** true si le rôle / les permissions couvrent la clé. */
export function useCanAccess(permissionKey: string): boolean {
  const { roleName, rolePermissions } = useAuth();
  if (ROLES_FULL.includes(roleName) || rolePermissions.includes('full_access')) {
    return true;
  }
  return canAccessPermission(roleName, permissionKey, rolePermissions);
}

/** Inscription / édition élève. */
export function useCanEditStudent(): boolean {
  const { roleName, rolePermissions } = useAuth();
  return canEditStudent(roleName, rolePermissions);
}

/** Annuaire / fiche élèves (hors Parent qui passe par Enfants). */
export function useCanBrowseStudents(): boolean {
  const { roleName, rolePermissions } = useAuth();
  if (roleName === 'PARENT') return false;
  if (ROLES_FULL.includes(roleName) || rolePermissions.includes('full_access')) {
    return true;
  }
  return (
    canAccessPermission(roleName, 'fiche-eleve', rolePermissions) ||
    canAccessPermission(roleName, 'students', rolePermissions)
  );
}
