/**
 * SchoolMatrix mobile — source de vérité navigation / IA produit.
 *
 * Aligné sur apps/desktop/src/renderer/lib/dashboardRoles.ts
 * et documenté dans apps/mobile/docs/{CARTOGRAPHIE,PLAN-UI-UX}.md
 *
 * À brancher plus tard sur React Navigation (Expo).
 */

export type DesktopBlock =
  | "configuration"
  | "management"
  | "finance"
  | "statistics"
  | "fiche"
  | "special"
  | "auth"
  | "home";

export type MobileFamilyId =
  | "life"
  | "org"
  | "money"
  | "insight"
  | "admin"
  | "account";

export type MobileTabId = "home" | "work" | "students" | "finance" | "more" | "children";

export type DeliveryPhase = "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "desktop-only";

export type ScreenTab = {
  id: string;
  label: string;
  /** Sous-écran admin-only (ex. services économat) */
  adminOnly?: boolean;
};

export type ProductScreen = {
  id: string;
  label: string;
  desktopPath: string | null;
  permissionKey: string;
  desktopBlock: DesktopBlock;
  mobileFamily: MobileFamilyId | null;
  /** Où ce module peut vivre hors catalogue Plus */
  mobileTabs?: MobileTabId[];
  tabs?: ScreenTab[];
  phase: DeliveryPhase;
  notes?: string;
};

export type MobileTabDef = {
  id: MobileTabId;
  label: string;
  purpose: string;
};

export type MobileFamilyDef = {
  id: MobileFamilyId;
  label: string;
  purpose: string;
};

/** Tab bar — sémantique (visibilité filtrée au runtime par rôle). */
export const MOBILE_TABS: MobileTabDef[] = [
  { id: "home", label: "Accueil", purpose: "Contexte, KPIs, raccourcis du jour" },
  { id: "work", label: "Tableau de bord", purpose: "Action principale selon persona" },
  {
    id: "children",
    label: "Mes enfants",
    purpose: "Remplace Travail pour PARENT — élèves liés",
  },
  { id: "students", label: "Élèves", purpose: "Recherche → Fiche élève" },
  { id: "finance", label: "Finance", purpose: "Paiements / dépenses / moniteur si droits" },
  { id: "more", label: "Menu", purpose: "Menu par familles + compte" },
];

/** Familles du hub Plus. */
export const MOBILE_FAMILIES: MobileFamilyDef[] = [
  { id: "life", label: "Vie scolaire", purpose: "Inscription, notes, discipline, formation, photos" },
  { id: "org", label: "Organisation", purpose: "Structure académique et horaires" },
  { id: "money", label: "Finance", purpose: "Économat, dépenses, stats financières" },
  { id: "insight", label: "Pilotage", purpose: "Statistiques académiques" },
  { id: "admin", label: "Administration", purpose: "Utilisateurs et établissement" },
  { id: "account", label: "Compte", purpose: "Session et à propos" },
];

/**
 * Persona → écran principal du tab Travail (ou Mes enfants).
 * Les permissionKey restent la source d’accès réelle.
 */
export const WORK_TAB_BY_ROLE: Record<string, { screenId: string; secondaryScreenIds?: string[] }> = {
  DISCIPLINE: { screenId: "discipline", secondaryScreenIds: ["discipline"] },
  TEACHER: { screenId: "grades" },
  ECONOME: { screenId: "economat", secondaryScreenIds: ["depenses"] },
  PHOTOGRAPHER: { screenId: "photography" },
  PARENT: { screenId: "fiche-eleve" },
  COMPTABLE: { screenId: "stats-financieres" },
  DIRECTEUR_PEDAGOGIQUE: { screenId: "grades", secondaryScreenIds: ["schedule", "stats-academiques"] },
  CENSEUR: { screenId: "grades", secondaryScreenIds: ["schedule", "stats-academiques"] },
  ADMIN_PRESCOLAIRE: { screenId: "schedule", secondaryScreenIds: ["fiche-eleve"] },
  ADMIN_FONDAMENTAL: { screenId: "schedule", secondaryScreenIds: ["fiche-eleve"] },
  ADMIN_SECONDAIRE: { screenId: "schedule", secondaryScreenIds: ["fiche-eleve"] },
  SUPER_ADMIN: { screenId: "home-operations" },
  DIRECTEUR_GENERAL: { screenId: "home-operations" },
  SCHOOL_ADMIN: { screenId: "home-operations" },
};

/** Sections de la Fiche élève (ordre d’affichage mobile). */
export const FICHE_ELEVE_SECTIONS: ScreenTab[] = [
  { id: "identite", label: "Identité & famille" },
  { id: "discipline", label: "Discipline" },
  { id: "paiements", label: "Paiements" },
  { id: "emploi-du-temps", label: "Emploi du temps" },
  { id: "carnet", label: "Carnet de notes" },
  { id: "actions", label: "Actions" },
];

/** Inventaire complet des écrans produit (desktop → mobile). */
export const PRODUCT_SCREENS: ProductScreen[] = [
  {
    id: "login",
    label: "Connexion",
    desktopPath: "/login",
    permissionKey: "public",
    desktopBlock: "auth",
    mobileFamily: null,
    phase: "P0",
  },
  {
    id: "signup",
    label: "Création premier admin",
    desktopPath: "/signup",
    permissionKey: "public",
    desktopBlock: "auth",
    mobileFamily: null,
    phase: "desktop-only",
    notes: "Setup rare — rester desktop sauf besoin explicite",
  },
  {
    id: "home",
    label: "Tableau de bord",
    desktopPath: "/dashboard",
    permissionKey: "dashboard",
    desktopBlock: "home",
    mobileFamily: null,
    mobileTabs: ["home"],
    phase: "P0",
  },
  {
    id: "home-operations",
    label: "Vue opérations",
    desktopPath: null,
    permissionKey: "dashboard",
    desktopBlock: "home",
    mobileFamily: null,
    mobileTabs: ["work"],
    phase: "P0",
    notes: "Raccourcis mobiles FULL : Inscription, Appel, Notes, Paiements",
  },
  {
    id: "subjects",
    label: "Matières",
    desktopPath: "/dashboard/subjects",
    permissionKey: "subjects",
    desktopBlock: "configuration",
    mobileFamily: "org",
    mobileTabs: ["more"],
    phase: "P4",
  },
  {
    id: "classes",
    label: "Classes",
    desktopPath: "/dashboard/classes",
    permissionKey: "classes",
    desktopBlock: "configuration",
    mobileFamily: "org",
    mobileTabs: ["more"],
    phase: "P4",
  },
  {
    id: "rooms",
    label: "Salles",
    desktopPath: "/dashboard/rooms",
    permissionKey: "rooms",
    desktopBlock: "configuration",
    mobileFamily: "org",
    mobileTabs: ["more"],
    phase: "P4",
  },
  {
    id: "academic-years",
    label: "Années et périodes",
    desktopPath: "/dashboard/academic-years",
    permissionKey: "academic-years",
    desktopBlock: "configuration",
    mobileFamily: "org",
    mobileTabs: ["more"],
    phase: "P4",
    notes: "Liste années → push périodes",
  },
  {
    id: "teachers",
    label: "Professeurs",
    desktopPath: "/dashboard/teachers",
    permissionKey: "teachers",
    desktopBlock: "configuration",
    mobileFamily: "org",
    mobileTabs: ["more"],
    phase: "P4",
  },
  {
    id: "schedule",
    label: "Horaires",
    desktopPath: "/dashboard/schedule",
    permissionKey: "schedule",
    desktopBlock: "configuration",
    mobileFamily: "org",
    mobileTabs: ["work", "more"],
    tabs: [
      { id: "cours", label: "Horaire des cours" },
      { id: "examens", label: "Horaire des examens" },
      { id: "parascolaire", label: "Activités parascolaires" },
    ],
    phase: "P2",
  },
  {
    id: "students",
    label: "Inscription",
    desktopPath: "/dashboard/students",
    permissionKey: "students",
    desktopBlock: "management",
    mobileFamily: "life",
    mobileTabs: ["more"],
    phase: "P3",
    notes: "Wizard : Identité → Scolarité → Famille → Photos",
  },
  {
    id: "students-import",
    label: "Inscription d'anciens élèves",
    desktopPath: "/dashboard/students/import",
    permissionKey: "students",
    desktopBlock: "management",
    mobileFamily: "life",
    mobileTabs: ["more"],
    phase: "desktop-only",
  },
  {
    id: "grades",
    label: "Saisie des notes",
    desktopPath: "/dashboard/grades",
    permissionKey: "grades",
    desktopBlock: "management",
    mobileFamily: "life",
    mobileTabs: ["work", "more"],
    phase: "P1",
  },
  {
    id: "discipline",
    label: "Discipline",
    desktopPath: "/dashboard/discipline",
    permissionKey: "discipline",
    desktopBlock: "management",
    mobileFamily: "life",
    mobileTabs: ["work", "more"],
    tabs: [
      { id: "appel", label: "Appel" },
      { id: "retards", label: "Retards" },
      { id: "points", label: "Points disciplinaires" },
      { id: "mesures", label: "Mesures" },
    ],
    phase: "P1",
    notes: "P1 = Appel ; reste P2",
  },
  {
    id: "formation-classe",
    label: "Formation de classe",
    desktopPath: "/dashboard/formation-classe",
    permissionKey: "formation-classe",
    desktopBlock: "management",
    mobileFamily: null,
    mobileTabs: [],
    phase: "desktop-only",
    notes: "Retiré du menu mobile — rester desktop",
  },
  {
    id: "economat",
    label: "Économat",
    desktopPath: "/dashboard/economat",
    permissionKey: "finance",
    desktopBlock: "finance",
    mobileFamily: "money",
    mobileTabs: ["finance", "work", "more"],
    tabs: [
      { id: "paiements", label: "Enregistrement des paiements" },
      { id: "services", label: "Services à payer par classe", adminOnly: true },
      { id: "exonerations", label: "Exonérations (bourses / demi-bourses)", adminOnly: true },
    ],
    phase: "P1",
  },
  {
    id: "depenses",
    label: "Dépenses",
    desktopPath: "/dashboard/depenses",
    permissionKey: "finance",
    desktopBlock: "finance",
    mobileFamily: "money",
    mobileTabs: ["finance", "more"],
    phase: "P2",
  },
  {
    id: "stats-academiques",
    label: "Stats académiques",
    desktopPath: "/dashboard/stats-academiques",
    permissionKey: "stats-academiques",
    desktopBlock: "statistics",
    mobileFamily: "insight",
    mobileTabs: ["more"],
    phase: "P3",
  },
  {
    id: "stats-financieres",
    label: "Stats financières",
    desktopPath: "/dashboard/stats-financieres",
    permissionKey: "stats-financieres",
    desktopBlock: "statistics",
    mobileFamily: "money",
    mobileTabs: ["finance", "work", "more"],
    tabs: [
      { id: "moniteur", label: "Moniteur" },
      { id: "banques", label: "Banques" },
      { id: "comptabilite", label: "Comptabilité" },
    ],
    phase: "P3",
    notes: "Banques / Comptabilité plutôt P4",
  },
  {
    id: "fiche-eleve",
    label: "Fiche élève",
    desktopPath: "/dashboard/fiche-eleve",
    permissionKey: "fiche-eleve",
    desktopBlock: "fiche",
    mobileFamily: "life",
    mobileTabs: ["students", "children", "home"],
    tabs: FICHE_ELEVE_SECTIONS,
    phase: "P0",
  },
  {
    id: "photography",
    label: "Photographie",
    desktopPath: "/dashboard/photography",
    permissionKey: "photography",
    desktopBlock: "fiche",
    mobileFamily: "life",
    mobileTabs: ["work", "more"],
    phase: "P2",
  },
  {
    id: "users",
    label: "Gestion Utilisateurs",
    desktopPath: "/dashboard/users",
    permissionKey: "users",
    desktopBlock: "special",
    mobileFamily: "admin",
    mobileTabs: ["more"],
    phase: "P4",
  },
  {
    id: "school",
    label: "Gestion établissement",
    desktopPath: "/dashboard/school",
    permissionKey: "school",
    desktopBlock: "special",
    mobileFamily: "admin",
    mobileTabs: ["more"],
    phase: "P4",
  },
];

/** Rôles seed backend (référence). */
export const SEEDED_ROLES = [
  "SUPER_ADMIN",
  "DIRECTEUR_GENERAL",
  "SCHOOL_ADMIN",
  "DIRECTEUR_PEDAGOGIQUE",
  "CENSEUR",
  "ADMIN_PRESCOLAIRE",
  "ADMIN_FONDAMENTAL",
  "ADMIN_SECONDAIRE",
  "ECONOME",
  "COMPTABLE",
  "DISCIPLINE",
  "STAFF",
  "TEACHER",
  "PARENT",
  "PHOTOGRAPHER",
] as const;

export type SeededRole = (typeof SEEDED_ROLES)[number];

export function screensForFamily(familyId: MobileFamilyId): ProductScreen[] {
  return PRODUCT_SCREENS.filter((s) => s.mobileFamily === familyId);
}

export function screensForPhase(phase: DeliveryPhase): ProductScreen[] {
  return PRODUCT_SCREENS.filter((s) => s.phase === phase);
}

export function getScreen(id: string): ProductScreen | undefined {
  return PRODUCT_SCREENS.find((s) => s.id === id);
}
