/**
 * Port mobile de apps/desktop/.../dashboardRoles.ts
 * + helpers tabs (productMap).
 */

import {
  MOBILE_FAMILIES,
  PRODUCT_SCREENS,
  type MobileFamilyId,
  type MobileTabId,
  type ProductScreen,
} from '../../spec/productMap';

export const ROLES_FULL: string[] = [
  'SUPER_ADMIN',
  'DIRECTEUR_GENERAL',
  'SCHOOL_ADMIN',
];

/** Direction / coordinateurs — peuvent modifier une fiche élève (pas prof, économe, comptable, parent). */
export const ROLES_STUDENT_EDIT: string[] = [
  ...ROLES_FULL,
  'DIRECTEUR_PEDAGOGIQUE',
  'CENSEUR',
  'ADMIN_PRESCOLAIRE',
  'ADMIN_FONDAMENTAL',
  'ADMIN_SECONDAIRE',
];

const ROLES_HORAIRES_ET_NOTES = ['DIRECTEUR_PEDAGOGIQUE', 'CENSEUR'];
const ROLES_HORAIRES_SEUL = [
  'ADMIN_PRESCOLAIRE',
  'ADMIN_FONDAMENTAL',
  'ADMIN_SECONDAIRE',
];
const ROLES_ECONOME = ['ECONOME'];
const ROLES_COMPTABLE = ['COMPTABLE'];
const ROLES_DISCIPLINE = ['DISCIPLINE'];
const ROLES_PHOTOGRAPHY = ['PHOTOGRAPHER'];

type NavItem = {
  permissionKey: string;
  allowedRoles: string[];
};

const DESKTOP_NAV: NavItem[] = [
  { permissionKey: 'subjects', allowedRoles: [...ROLES_FULL] },
  { permissionKey: 'classes', allowedRoles: [...ROLES_FULL] },
  { permissionKey: 'rooms', allowedRoles: [...ROLES_FULL] },
  { permissionKey: 'academic-years', allowedRoles: [...ROLES_FULL] },
  { permissionKey: 'teachers', allowedRoles: [...ROLES_FULL] },
  {
    permissionKey: 'schedule',
    allowedRoles: [...ROLES_FULL, ...ROLES_HORAIRES_ET_NOTES, ...ROLES_HORAIRES_SEUL],
  },
  { permissionKey: 'students', allowedRoles: [...ROLES_FULL] },
  {
    permissionKey: 'grades',
    allowedRoles: [...ROLES_FULL, ...ROLES_HORAIRES_ET_NOTES, 'TEACHER'],
  },
  { permissionKey: 'discipline', allowedRoles: [...ROLES_FULL, ...ROLES_DISCIPLINE] },
  { permissionKey: 'formation-classe', allowedRoles: [...ROLES_FULL] },
  { permissionKey: 'finance', allowedRoles: [...ROLES_FULL, ...ROLES_ECONOME] },
  {
    permissionKey: 'stats-academiques',
    allowedRoles: [...ROLES_FULL, ...ROLES_HORAIRES_ET_NOTES],
  },
  {
    permissionKey: 'stats-financieres',
    allowedRoles: [...ROLES_FULL, ...ROLES_COMPTABLE],
  },
  {
    permissionKey: 'fiche-eleve',
    allowedRoles: [
      ...ROLES_FULL,
      ...ROLES_HORAIRES_ET_NOTES,
      ...ROLES_HORAIRES_SEUL,
      ...ROLES_ECONOME,
      'PARENT',
    ],
  },
  { permissionKey: 'photography', allowedRoles: [...ROLES_FULL, ...ROLES_PHOTOGRAPHY] },
  { permissionKey: 'school', allowedRoles: [...ROLES_FULL] },
  { permissionKey: 'users', allowedRoles: [...ROLES_FULL] },
];

function canSeeByPermissions(permissionKey: string, rolePermissions: string[]): boolean {
  if (rolePermissions.includes('full_access')) return true;
  if (permissionKey === 'dashboard' || permissionKey === 'public') return true;
  if (permissionKey === 'finance') {
    return rolePermissions.includes('finance') || rolePermissions.includes('economat');
  }
  if (permissionKey === 'stats-financieres') {
    return (
      rolePermissions.includes('stats-financieres') ||
      rolePermissions.includes('finance') ||
      rolePermissions.includes('comptabilite')
    );
  }
  if (permissionKey === 'rooms') {
    return rolePermissions.includes('rooms') || rolePermissions.includes('classes');
  }
  if (permissionKey === 'stats-academiques') {
    return (
      rolePermissions.includes('stats-academiques') ||
      rolePermissions.includes('grades') ||
      rolePermissions.includes('classes')
    );
  }
  return rolePermissions.includes(permissionKey);
}

export function canAccessPermission(
  roleName: string,
  permissionKey: string,
  rolePermissions?: string[],
): boolean {
  if (permissionKey === 'dashboard' || permissionKey === 'public') return true;
  if (rolePermissions && rolePermissions.length > 0) {
    return canSeeByPermissions(permissionKey, rolePermissions);
  }
  if (ROLES_FULL.includes(roleName)) return true;
  const item = DESKTOP_NAV.find((n) => n.permissionKey === permissionKey);
  if (!item) return false;
  return item.allowedRoles.includes(roleName);
}

export function canSeeSensitiveDashboardStats(
  roleName: string,
  rolePermissions?: string[],
): boolean {
  if (rolePermissions?.includes('full_access')) return true;
  return ROLES_FULL.includes(roleName);
}

/** Modification fiche / inscription — direction & coordinateurs uniquement. */
export function canEditStudent(
  roleName: string,
  rolePermissions?: string[],
): boolean {
  if (rolePermissions?.includes('full_access')) return true;
  if (rolePermissions?.includes('students')) return true;
  return ROLES_STUDENT_EDIT.includes(roleName);
}

export function canSeeFinanceTab(
  roleName: string,
  rolePermissions?: string[],
): boolean {
  return (
    canAccessPermission(roleName, 'finance', rolePermissions) ||
    canAccessPermission(roleName, 'stats-financieres', rolePermissions)
  );
}

export function getVisibleTabIds(
  roleName: string,
  rolePermissions?: string[],
  options?: { hasLinkedChildren?: boolean },
): MobileTabId[] {
  const tabs: MobileTabId[] = ['home'];
  const hasKids = roleName === 'PARENT' || !!options?.hasLinkedChildren;

  if (roleName === 'PARENT') {
    // Parent : Enfants (N fiches liées), pas de Tableau de bord ops.
    tabs.push('children');
  } else {
    tabs.push('work');
    // Staff aussi parent : Work + Mes enfants (liés uniquement).
    if (hasKids) tabs.push('children');
  }

  // Annuaire professionnel — pas Discipline / Photo / Parent.
  if (
    roleName !== 'PARENT' &&
    (canAccessPermission(roleName, 'fiche-eleve', rolePermissions) ||
      canAccessPermission(roleName, 'students', rolePermissions) ||
      ROLES_FULL.includes(roleName))
  ) {
    tabs.push('students');
  }

  if (canSeeFinanceTab(roleName, rolePermissions)) {
    tabs.push('finance');
  }

  tabs.push('more');
  return tabs;
}

export function getVisibleFamilies(
  roleName: string,
  rolePermissions?: string[],
): typeof MOBILE_FAMILIES {
  return MOBILE_FAMILIES.filter((family) => {
    if (family.id === 'account') return true;
    return screensForFamilyVisible(family.id, roleName, rolePermissions).length > 0;
  });
}

export function screensForFamilyVisible(
  familyId: MobileFamilyId,
  roleName: string,
  rolePermissions?: string[],
): ProductScreen[] {
  return PRODUCT_SCREENS.filter((s) => {
    if (s.mobileFamily !== familyId) return false;
    if (s.phase === 'desktop-only') return false;
    // Parent : fiches via onglet Enfants, pas via Menu.
    if (roleName === 'PARENT' && s.id === 'fiche-eleve') return false;
    return canAccessPermission(roleName, s.permissionKey, rolePermissions);
  });
}

export function getHomeShortcuts(
  roleName: string,
  rolePermissions?: string[],
): ProductScreen[] {
  return PRODUCT_SCREENS.filter(
    (s) =>
      s.desktopPath &&
      s.desktopPath !== '/dashboard' &&
      s.phase !== 'desktop-only' &&
      s.id !== 'login' &&
      s.id !== 'signup' &&
      canAccessPermission(roleName, s.permissionKey, rolePermissions),
  ).slice(0, 6);
}
