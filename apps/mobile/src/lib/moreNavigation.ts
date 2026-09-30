import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { MobileFamilyId } from '../../spec/productMap';

type Glyph = keyof typeof Ionicons.glyphMap;

export const FAMILY_ICONS: Record<MobileFamilyId, Glyph> = {
  life: 'school-outline',
  org: 'layers-outline',
  money: 'wallet-outline',
  insight: 'stats-chart-outline',
  admin: 'shield-checkmark-outline',
  account: 'person-circle-outline',
};

export const SCREEN_ICONS: Record<string, Glyph> = {
  students: 'person-add-outline',
  grades: 'create-outline',
  'teacher-hub': 'grid-outline',
  discipline: 'hand-left-outline',
  'formation-classe': 'people-outline',
  photography: 'camera-outline',
  'fiche-eleve': 'id-card-outline',
  'academic-years': 'calendar-outline',
  subjects: 'book-outline',
  classes: 'albums-outline',
  rooms: 'home-outline',
  teachers: 'people-circle-outline',
  schedule: 'time-outline',
  economat: 'cash-outline',
  depenses: 'receipt-outline',
  'stats-financieres': 'pie-chart-outline',
  'stats-academiques': 'bar-chart-outline',
  school: 'business-outline',
  users: 'key-outline',
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super administrateur',
  DIRECTEUR_GENERAL: 'Directeur général',
  DIRECTEUR_ADMINISTRATIF: 'Directeur administratif',
  ADMINISTRATEUR: 'Administrateur',
  SCHOOL_ADMIN: 'Administrateur',
  DIRECTEUR_PEDAGOGIQUE: 'Directeur pédagogique',
  DIRECTEUR_PEDAGOGIQUE_PRESCOLAIRE: 'Directeur pédagogique du préscolaire',
  DIRECTEUR_PEDAGOGIQUE_FONDAMENTAL: 'Directeur pédagogique du primaire',
  DIRECTEUR_PEDAGOGIQUE_FONDAMENTAL_2: 'Directeur pédagogique du primaire',
  DIRECTEUR_PEDAGOGIQUE_FONDAMENTAL_3: 'Directeur pédagogique du secondaire',
  DIRECTEUR_PEDAGOGIQUE_SECONDAIRE: 'Directeur pédagogique du secondaire',
  DIRECTEUR_PEDAGOGIQUE_FORMATION_SUPERIEURE:
    'Directeur pédagogique de la formation supérieure',
  ADMIN_PRESCOLAIRE: 'Directeur pédagogique du préscolaire',
  ADMIN_FONDAMENTAL: 'Directeur pédagogique du primaire',
  ADMIN_SECONDAIRE: 'Directeur pédagogique du secondaire',
  CENSEUR: 'Censeur',
  SECRETAIRE_GENERAL: 'Secrétaire général',
  SECRETAIRE_FORMATION_SUPERIEURE: 'Secrétaire de la formation supérieure',
  SURVEILLANT_GENERAL: 'Surveillant général',
  DISCIPLINE: 'Surveillant général',
  ECONOME: 'Économe',
  COMPTABLE: 'Comptable',
  STAFF: 'Personnel',
  TEACHER: 'Professeur',
  PROFESSEUR: 'Professeur',
  PROFESSEURE: 'Professeure',
  PROF: 'Professeur',
  ENSEIGNANT: 'Enseignant',
  ENSEIGNANTE: 'Enseignante',
  PARENT: 'Parent',
  PHOTOGRAPHER: 'Photographe',
};

export function formatRoleLabel(roleName: string | null | undefined): string {
  if (!roleName) return '—';
  const key = roleName.toUpperCase().trim();
  if (ROLE_LABELS[key]) return ROLE_LABELS[key];
  return roleName
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

type NavLike = {
  navigate: (name: string, params?: object) => void;
  getParent?: () => { navigate: (name: string, params?: object) => void } | undefined;
};

/** Ouvre un écran produit depuis le menu Plus. */
export function openProductScreen(
  navigation: NavLike | NavigationProp<ParamListBase>,
  screenId: string,
  label: string,
  phase?: string,
) {
  const parent = navigation.getParent?.() as
    | { navigate: (a: string, b?: object) => void }
    | undefined;

  const openTab = (tab: string, params?: object) => {
    if (params) parent?.navigate('Main', { screen: tab, params });
    else parent?.navigate('Main', { screen: tab });
  };

  switch (screenId) {
    case 'fiche-eleve':
      openTab('Students');
      return;
    case 'discipline':
      openTab('Work', { screen: 'Discipline', initial: false });
      return;
    case 'grades':
      openTab('Work', { screen: 'Grades', initial: false });
      return;
    case 'teacher-hub':
      openTab('Work', { screen: 'WorkMain', initial: false });
      return;
    case 'economat':
      openTab('Finance', { screen: 'Payments', initial: false });
      return;
    case 'depenses':
      openTab('Finance', { screen: 'Expenses', initial: false });
      return;
    case 'photography':
      openTab('Work', { screen: 'Photography', initial: false });
      return;
    case 'schedule':
      openTab('Work', { screen: 'Schedule', initial: false });
      return;
    case 'stats-academiques':
      navigation.navigate('AcademicStats');
      return;
    case 'formation-classe':
      navigation.navigate('FormationClasse');
      return;
    case 'students':
      openTab('Students', { screen: 'Enrollment', initial: false });
      return;
    case 'stats-financieres':
      openTab('Finance', { screen: 'FinancialMonitor', initial: false });
      return;
    case 'academic-years':
      navigation.navigate('OrgAcademicYears');
      return;
    case 'subjects':
      navigation.navigate('OrgSubjects');
      return;
    case 'classes':
    case 'rooms':
    case 'teachers':
      navigation.navigate('OrgClasses');
      return;
    case 'school':
      navigation.navigate('SchoolAdmin');
      return;
    case 'users':
      navigation.navigate('UsersAdmin');
      return;
    default:
      navigation.navigate('ComingSoon', {
        screenId,
        title: label,
        phase,
      });
  }
}
