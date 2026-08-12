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

export function formatRoleLabel(roleName: string | null | undefined): string {
  if (!roleName) return '—';
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

  switch (screenId) {
    case 'fiche-eleve':
      parent?.navigate('Students');
      return;
    case 'discipline':
      parent?.navigate('Work', { screen: 'Discipline', initial: false });
      return;
    case 'grades':
      parent?.navigate('Work', { screen: 'Grades', initial: false });
      return;
    case 'economat':
      parent?.navigate('Finance', { screen: 'Payments', initial: false });
      return;
    case 'depenses':
      parent?.navigate('Finance', { screen: 'Expenses', initial: false });
      return;
    case 'photography':
      parent?.navigate('Work', { screen: 'Photography', initial: false });
      return;
    case 'schedule':
      parent?.navigate('Work', { screen: 'Schedule', initial: false });
      return;
    case 'stats-academiques':
      navigation.navigate('AcademicStats');
      return;
    case 'formation-classe':
      navigation.navigate('FormationClasse');
      return;
    case 'students':
      parent?.navigate('Students', { screen: 'Enrollment', initial: false });
      return;
    case 'stats-financieres':
      parent?.navigate('Finance', { screen: 'FinancialMonitor', initial: false });
      return;
    case 'academic-years':
      navigation.navigate('OrgAcademicYears');
      return;
    case 'subjects':
      navigation.navigate('OrgSubjects');
      return;
    case 'classes':
      navigation.navigate('OrgClasses');
      return;
    case 'rooms':
      navigation.navigate('OrgRooms');
      return;
    case 'teachers':
      navigation.navigate('OrgTeachers');
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
