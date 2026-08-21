/**
 * Autorisations au tableau de bord : gérées uniquement côté frontend.
 * Chaque rôle voit uniquement les entrées de menu auxquelles il a accès.
 * Le backend accepte tout utilisateur authentifié sur les mêmes API.
 *
 * Règles :
 * - SUPER_ADMIN, DIRECTEUR_GENERAL, SCHOOL_ADMIN : accès total à tout.
 * - Directeur pédagogique : Horaires, Saisie des notes.
 * - Censeur : Horaires, Saisie des notes (identique au directeur pédagogique).
 * - Admin préscolaire / fondamental / secondaire : Horaires uniquement.
 * - Économe : Tableau de bord, Économat et Dépenses (pas Stats financières).
 * - Comptable : Stats financières (Moniteur / Banques / Comptabilité).
 * - Responsable discipline : Tableau de bord et Discipline (appel, retard, points).
 * - Enseignant, Parent : Tableau de bord uniquement (vue moniteur / profil).
 */

/** Rôles qui voient tout (administration, économat, gestion établissement). */
export const ROLES_FULL: string[] = [
  "SUPER_ADMIN",
  "DIRECTEUR_GENERAL",
  "SCHOOL_ADMIN",
];

/**
 * Une école peut renommer le rôle TEACHER (ex. « PROFESSEUR ») : le role_id
 * reste le même, seul le libellé change. Reconnaître les alias.
 */
export const TEACHER_ROLE_NAMES: string[] = [
  "TEACHER",
  "PROFESSEUR",
  "PROFESSEURE",
  "PROF",
  "ENSEIGNANT",
  "ENSEIGNANTE",
];

export function isTeacherRole(role?: string | null): boolean {
  return TEACHER_ROLE_NAMES.includes((role ?? "").toUpperCase().trim());
}

/** Rôles qui voient Horaires et Saisie des notes. */
const ROLES_HORAIRES_ET_NOTES: string[] = ["DIRECTEUR_PEDAGOGIQUE", "CENSEUR"];

/** Rôles qui voient uniquement Horaires. */
const ROLES_HORAIRES_SEUL: string[] = [
  "ADMIN_PRESCOLAIRE",
  "ADMIN_FONDAMENTAL",
  "ADMIN_SECONDAIRE",
];

/** Rôles qui voient uniquement l’économat (en plus du tableau de bord). */
const ROLES_ECONOME: string[] = ["ECONOME"];

/** Comptable : Stats financières (moniteur, banques, comptabilité). */
const ROLES_COMPTABLE: string[] = ["COMPTABLE"];

/** Rôles qui voient Discipline (appel, retard, points disciplinaires). */
const ROLES_DISCIPLINE: string[] = ["DISCIPLINE"];

/** Rôles photographe (photos élèves uniquement via onglet Photographie). */
const ROLES_PHOTOGRAPHY: string[] = ["PHOTOGRAPHER"];

function canSeeNavItem(roleName: string, allowedRoles: string[]): boolean {
  if (allowedRoles.length === 0) return true;
  return allowedRoles.includes(roleName);
}

function canSeeByPermissions(permissionKey: string, rolePermissions: string[]): boolean {
  if (rolePermissions.includes("full_access")) return true;
  if (permissionKey === "dashboard") return true;
  // Économat / Dépenses : finance ou economat (pas stats financières)
  if (permissionKey === "finance") {
    return rolePermissions.includes("finance") || rolePermissions.includes("economat");
  }
  // Stats financières (moniteur / banques / comptabilité) : pas l’économe seul
  if (permissionKey === "stats-financieres") {
    return (
      rolePermissions.includes("stats-financieres") ||
      rolePermissions.includes("finance") ||
      rolePermissions.includes("comptabilite")
    );
  }
  if (permissionKey === "rooms") return rolePermissions.includes("rooms") || rolePermissions.includes("classes");
  if (permissionKey === "stats-academiques") {
    return (
      rolePermissions.includes("stats-academiques") ||
      rolePermissions.includes("grades") ||
      rolePermissions.includes("classes")
    );
  }
  return rolePermissions.includes(permissionKey);
}

export type NavBlock = "configuration" | "management" | "finance" | "statistics" | "fiche" | "special";

export type NavItem = {
  href: string;
  label: string;
  allowedRoles: string[];
  permissionKey: string;
  block: NavBlock;
};

/** Entrées du menu dashboard avec les rôles autorisés et le bloc d'affichage. */
export const DASHBOARD_NAV: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", allowedRoles: [], permissionKey: "dashboard", block: "configuration" },
  // Bloc Configuration : Matières, Classes, puis Salles (sections), Années, Professeurs, Horaires
  { href: "/dashboard/subjects", label: "Matières", allowedRoles: [...ROLES_FULL], permissionKey: "subjects", block: "configuration" },
  { href: "/dashboard/classes", label: "Classes", allowedRoles: [...ROLES_FULL], permissionKey: "classes", block: "configuration" },
  { href: "/dashboard/rooms", label: "Salles", allowedRoles: [...ROLES_FULL], permissionKey: "rooms", block: "configuration" },
  { href: "/dashboard/academic-years", label: "Années et périodes", allowedRoles: [...ROLES_FULL], permissionKey: "academic-years", block: "configuration" },
  { href: "/dashboard/teachers", label: "Professeurs", allowedRoles: [...ROLES_FULL], permissionKey: "teachers", block: "configuration" },
  { href: "/dashboard/schedule", label: "Horaires", allowedRoles: [...ROLES_FULL, ...ROLES_HORAIRES_ET_NOTES, ...ROLES_HORAIRES_SEUL], permissionKey: "schedule", block: "configuration" },
  // Bloc Management (vie étudiante) : Inscription, Saisie de notes, Discipline, Formation de classe
  { href: "/dashboard/students", label: "Inscription", allowedRoles: [...ROLES_FULL], permissionKey: "students", block: "management" },
  { href: "/dashboard/grades", label: "Saisie des notes", allowedRoles: [...ROLES_FULL, ...ROLES_HORAIRES_ET_NOTES, ...TEACHER_ROLE_NAMES], permissionKey: "grades", block: "management" },
  { href: "/dashboard/discipline", label: "Discipline", allowedRoles: [...ROLES_FULL, ...ROLES_DISCIPLINE], permissionKey: "discipline", block: "management" },
  { href: "/dashboard/formation-classe", label: "Formation de classe", allowedRoles: [...ROLES_FULL], permissionKey: "formation-classe", block: "management" },
  // Bloc Finance opérationnel : Économat + Dépenses (économe)
  { href: "/dashboard/economat", label: "Économat", allowedRoles: [...ROLES_FULL, ...ROLES_ECONOME], permissionKey: "finance", block: "finance" },
  { href: "/dashboard/depenses", label: "Dépenses", allowedRoles: [...ROLES_FULL, ...ROLES_ECONOME], permissionKey: "finance", block: "finance" },
  // Bloc Statistiques — Stats financières = Moniteur + Banques + Comptabilité
  { href: "/dashboard/stats-academiques", label: "Stats académiques", allowedRoles: [...ROLES_FULL, ...ROLES_HORAIRES_ET_NOTES], permissionKey: "stats-academiques", block: "statistics" },
  {
    href: "/dashboard/stats-financieres",
    label: "Stats financières",
    allowedRoles: [...ROLES_FULL, ...ROLES_COMPTABLE],
    permissionKey: "stats-financieres",
    block: "statistics",
  },
  // Bloc Fiche élève + Photographie
  {
    href: "/dashboard/fiche-eleve",
    label: "Fiche élève",
    allowedRoles: [...ROLES_FULL, ...ROLES_HORAIRES_ET_NOTES, ...ROLES_HORAIRES_SEUL, ...ROLES_ECONOME, "PARENT"],
    permissionKey: "fiche-eleve",
    block: "fiche",
  },
  {
    href: "/dashboard/photography",
    label: "Photographie",
    allowedRoles: [...ROLES_FULL, ...ROLES_PHOTOGRAPHY],
    permissionKey: "photography",
    block: "fiche",
  },
];

export const SCHOOL_NAV = { href: "/dashboard/school", label: "Gestion établissement", permissionKey: "school", block: "special" as const };
export const USERS_NAV = { href: "/dashboard/users", label: "Gestion Utilisateurs", permissionKey: "users", block: "special" as const };

/** Vérifie si un rôle peut accéder à un chemin (pour redirection si accès interdit). */
export function canAccessPath(roleName: string, path: string, rolePermissions?: string[]): boolean {
  if (path === "/dashboard") return true;
  if (rolePermissions && rolePermissions.length > 0) {
    if (rolePermissions.includes("full_access")) return true;
    if (path === SCHOOL_NAV.href || path.startsWith(SCHOOL_NAV.href + "/")) {
      return canSeeByPermissions("school", rolePermissions);
    }
    if (path === USERS_NAV.href || path.startsWith(USERS_NAV.href + "/")) {
      return canSeeByPermissions("users", rolePermissions);
    }
    const item = DASHBOARD_NAV.find(
      (n) => n.href !== "/dashboard" && (n.href === path || path.startsWith(n.href + "/"))
    );
    if (!item) return false;
    return canSeeByPermissions(item.permissionKey, rolePermissions);
  }
  if (ROLES_FULL.includes(roleName)) return true;
  if (path === SCHOOL_NAV.href || path.startsWith(SCHOOL_NAV.href + "/")) {
    return canSeeNavItem(roleName, ROLES_FULL);
  }
  if (path === USERS_NAV.href || path.startsWith(USERS_NAV.href + "/")) {
    return canSeeNavItem(roleName, ROLES_FULL);
  }
  const item = DASHBOARD_NAV.find(
    (n) => n.href !== "/dashboard" && (n.href === path || path.startsWith(n.href + "/"))
  );
  if (!item) return false;
  return canSeeNavItem(roleName, item.allowedRoles);
}

const BLOCK_ORDER: NavBlock[] = ["configuration", "management", "finance", "statistics", "fiche", "special"];

/** Retourne les entrées de menu visibles pour un rôle, ordonnées par bloc (pour les raccourcis). */
export function getNavItemsForRole(
  roleName: string,
  rolePermissions?: string[]
): { href: string; label: string; block?: NavBlock }[] {
  const items: { href: string; label: string; block?: NavBlock }[] = [];
  const usePermissions = rolePermissions && rolePermissions.length > 0;

  for (const block of BLOCK_ORDER) {
    for (const item of DASHBOARD_NAV) {
      if (item.href === "/dashboard") continue;
      if (item.block !== block) continue;
      const canSee = usePermissions
        ? canSeeByPermissions(item.permissionKey, rolePermissions)
        : canSeeNavItem(roleName, item.allowedRoles);
      if (canSee) {
        items.push({ href: item.href, label: item.label, block });
      }
    }
    if (block === "special") {
      const canSeeUsers = usePermissions
        ? canSeeByPermissions("users", rolePermissions)
        : canSeeNavItem(roleName, ROLES_FULL);
      const canSeeSchool = usePermissions
        ? canSeeByPermissions("school", rolePermissions)
        : canAccessSchoolProfile(roleName);
      if (canSeeUsers) items.push(USERS_NAV);
      if (canSeeSchool) items.push(SCHOOL_NAV);
    }
  }
  return items;
}

/** Vérifie si un rôle peut accéder à la page Gestion établissement. */
export function canAccessSchoolProfile(roleName: string): boolean {
  return ROLES_FULL.includes(roleName);
}

/** Statistiques sensibles (nombre d'élèves, classes, professeurs) : uniquement directeurs et superadmin. */
export function canSeeSensitiveDashboardStats(
  roleName: string,
  rolePermissions?: string[]
): boolean {
  if (rolePermissions?.length && rolePermissions.includes("full_access")) return true;
  return ROLES_FULL.includes(roleName);
}

/**
 * Rôles "moniteur" : uniquement le tableau de bord avec bloc Profil / Moniteur
 * (pas d’accès aux menus de gestion : classes, élèves, professeurs, etc.).
 * Enseignant et Parent voient seulement cette vue.
 */
export function isMonitorOnlyRole(roleName: string): boolean {
  return roleName === "PARENT";
}
