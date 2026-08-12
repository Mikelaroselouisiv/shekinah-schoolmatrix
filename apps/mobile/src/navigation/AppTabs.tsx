import type { ComponentType } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useSchool } from '../context/SchoolContext';
import { getVisibleTabIds } from '../lib/permissions';
import { colors } from '../theme/tokens';
import { HomeScreen } from '../screens/home/HomeScreen';
import { WorkScreen } from '../screens/work/WorkScreen';
import { WorkModuleScreen } from '../screens/work/WorkModuleScreen';
import { AttendanceScreen } from '../screens/work/AttendanceScreen';
import { GradesScreen } from '../screens/work/GradesScreen';
import { DisciplineScreen } from '../screens/work/DisciplineScreen';
import { PhotographyScreen } from '../screens/work/PhotographyScreen';
import { ScheduleScreen } from '../screens/work/ScheduleScreen';
import { AcademicStatsScreen } from '../screens/work/AcademicStatsScreen';
import { FormationClasseScreen } from '../screens/work/FormationClasseScreen';
import { StudentsScreen } from '../screens/students/StudentsScreen';
import { StudentFicheScreen } from '../screens/students/StudentFicheScreen';
import { EnrollmentScreen } from '../screens/students/EnrollmentScreen';
import { ChildrenScreen } from '../screens/children/ChildrenScreen';
import { FinanceScreen } from '../screens/finance/FinanceScreen';
import { FinanceModuleScreen } from '../screens/finance/FinanceModuleScreen';
import { PaymentsScreen } from '../screens/finance/PaymentsScreen';
import { ExpensesScreen } from '../screens/finance/ExpensesScreen';
import { FinancialMonitorScreen } from '../screens/finance/FinancialMonitorScreen';
import { MoreScreen } from '../screens/more/MoreScreen';
import { FamilyScreensScreen } from '../screens/more/FamilyScreensScreen';
import { ComingSoonScreen } from '../screens/more/ComingSoonScreen';
import { OrganisationHubScreen } from '../screens/org/OrganisationHubScreen';
import { OrgAcademicYearsScreen } from '../screens/org/OrgAcademicYearsScreen';
import { OrgSubjectsScreen } from '../screens/org/OrgSubjectsScreen';
import { OrgClassesScreen } from '../screens/org/OrgClassesScreen';
import { OrgRoomsScreen } from '../screens/org/OrgRoomsScreen';
import { OrgTeachersScreen } from '../screens/org/OrgTeachersScreen';
import { SchoolAdminScreen } from '../screens/admin/SchoolAdminScreen';
import { UsersAdminScreen } from '../screens/admin/UsersAdminScreen';
import type { MobileTabId } from '../../spec/productMap';
import type {
  AppTabParamList,
  ChildrenStackParamList,
  FinanceStackParamList,
  HomeStackParamList,
  MoreStackParamList,
  StudentsStackParamList,
  WorkStackParamList,
} from './types';
import { stackScreenOptions } from './stackOptions';

const Tab = createBottomTabNavigator<AppTabParamList>();
const HomeStackNav = createNativeStackNavigator<HomeStackParamList>();
const WorkStackNav = createNativeStackNavigator<WorkStackParamList>();
const ChildrenStackNav = createNativeStackNavigator<ChildrenStackParamList>();
const StudentsStackNav = createNativeStackNavigator<StudentsStackParamList>();
const FinanceStackNav = createNativeStackNavigator<FinanceStackParamList>();
const MoreStackNav = createNativeStackNavigator<MoreStackParamList>();

function HomeStack() {
  return (
    <HomeStackNav.Navigator screenOptions={stackScreenOptions('HomeMain')}>
      <HomeStackNav.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ title: 'Accueil' }}
      />
    </HomeStackNav.Navigator>
  );
}

function WorkStack() {
  return (
    <WorkStackNav.Navigator screenOptions={stackScreenOptions('WorkMain')}>
      <WorkStackNav.Screen name="WorkMain" component={WorkScreen} options={{ title: 'Tableau de bord' }} />
      <WorkStackNav.Screen name="WorkModule" component={WorkModuleScreen} options={{ title: 'Module' }} />
      <WorkStackNav.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Appel' }} />
      <WorkStackNav.Screen name="Grades" component={GradesScreen} options={{ title: 'Notes' }} />
      <WorkStackNav.Screen
        name="Discipline"
        component={DisciplineScreen}
        options={{ title: 'Discipline' }}
      />
      <WorkStackNav.Screen
        name="Photography"
        component={PhotographyScreen}
        options={{ title: 'Photographie' }}
      />
      <WorkStackNav.Screen name="Schedule" component={ScheduleScreen} options={{ title: 'Horaires' }} />
      <WorkStackNav.Screen
        name="AcademicStats"
        component={AcademicStatsScreen}
        options={{ title: 'Stats académiques' }}
      />
      <WorkStackNav.Screen
        name="FormationClasse"
        component={FormationClasseScreen}
        options={{ title: 'Formation de classe' }}
      />
    </WorkStackNav.Navigator>
  );
}

function ChildrenStack() {
  return (
    <ChildrenStackNav.Navigator screenOptions={stackScreenOptions('ChildrenMain')}>
      <ChildrenStackNav.Screen
        name="ChildrenMain"
        component={ChildrenScreen}
        options={{ title: 'Mes enfants' }}
      />
      <ChildrenStackNav.Screen
        name="StudentFiche"
        component={StudentFicheScreen as never}
        options={{ title: 'Fiche élève' }}
      />
    </ChildrenStackNav.Navigator>
  );
}

function StudentsStack() {
  return (
    <StudentsStackNav.Navigator screenOptions={stackScreenOptions('StudentsMain')}>
      <StudentsStackNav.Screen
        name="StudentsMain"
        component={StudentsScreen}
        options={{ title: 'Élèves' }}
      />
      <StudentsStackNav.Screen
        name="StudentFiche"
        component={StudentFicheScreen}
        options={{ title: 'Fiche élève' }}
      />
      <StudentsStackNav.Screen
        name="Enrollment"
        component={EnrollmentScreen}
        options={{ title: 'Inscription' }}
      />
    </StudentsStackNav.Navigator>
  );
}

function FinanceStack() {
  return (
    <FinanceStackNav.Navigator screenOptions={stackScreenOptions('FinanceMain')}>
      <FinanceStackNav.Screen
        name="FinanceMain"
        component={FinanceScreen}
        options={{ title: 'Finance' }}
      />
      <FinanceStackNav.Screen
        name="FinanceModule"
        component={FinanceModuleScreen}
        options={{ title: 'Finance' }}
      />
      <FinanceStackNav.Screen
        name="Payments"
        component={PaymentsScreen}
        options={{ title: 'Paiements' }}
      />
      <FinanceStackNav.Screen
        name="Expenses"
        component={ExpensesScreen}
        options={{ title: 'Dépenses' }}
      />
      <FinanceStackNav.Screen
        name="FinancialMonitor"
        component={FinancialMonitorScreen}
        options={{ title: 'Moniteur' }}
      />
    </FinanceStackNav.Navigator>
  );
}

function MoreStack() {
  return (
    <MoreStackNav.Navigator screenOptions={stackScreenOptions('MoreMain')}>
      <MoreStackNav.Screen name="MoreMain" component={MoreScreen} options={{ title: 'Menu' }} />
      <MoreStackNav.Screen
        name="FamilyScreens"
        component={FamilyScreensScreen}
        options={{ title: 'Famille' }}
      />
      <MoreStackNav.Screen
        name="ComingSoon"
        component={ComingSoonScreen}
        options={{ title: 'Bientôt' }}
      />
      <MoreStackNav.Screen
        name="AcademicStats"
        component={AcademicStatsScreen}
        options={{ title: 'Stats académiques' }}
      />
      <MoreStackNav.Screen
        name="FormationClasse"
        component={FormationClasseScreen}
        options={{ title: 'Formation de classe' }}
      />
      <MoreStackNav.Screen
        name="OrganisationHub"
        component={OrganisationHubScreen}
        options={{ title: 'Organisation' }}
      />
      <MoreStackNav.Screen
        name="OrgAcademicYears"
        component={OrgAcademicYearsScreen}
        options={{ title: 'Années et périodes' }}
      />
      <MoreStackNav.Screen
        name="OrgSubjects"
        component={OrgSubjectsScreen}
        options={{ title: 'Matières' }}
      />
      <MoreStackNav.Screen
        name="OrgClasses"
        component={OrgClassesScreen}
        options={{ title: 'Classes' }}
      />
      <MoreStackNav.Screen
        name="OrgRooms"
        component={OrgRoomsScreen}
        options={{ title: 'Salles' }}
      />
      <MoreStackNav.Screen
        name="OrgTeachers"
        component={OrgTeachersScreen}
        options={{ title: 'Professeurs' }}
      />
      <MoreStackNav.Screen
        name="SchoolAdmin"
        component={SchoolAdminScreen}
        options={{ title: 'Établissement' }}
      />
      <MoreStackNav.Screen
        name="UsersAdmin"
        component={UsersAdminScreen}
        options={{ title: 'Utilisateurs' }}
      />
    </MoreStackNav.Navigator>
  );
}

const TAB_CONFIG: Record<
  MobileTabId,
  {
    name: keyof AppTabParamList;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    component: ComponentType;
  }
> = {
  home: { name: 'Home', label: 'Accueil', icon: 'home-outline', component: HomeStack },
  work: { name: 'Work', label: 'Tableau de bord', icon: 'grid-outline', component: WorkStack },
  children: {
    name: 'Children',
    label: 'Enfants',
    icon: 'people-outline',
    component: ChildrenStack,
  },
  students: {
    name: 'Students',
    label: 'Élèves',
    icon: 'school-outline',
    component: StudentsStack,
  },
  finance: {
    name: 'Finance',
    label: 'Finance',
    icon: 'cash-outline',
    component: FinanceStack,
  },
  more: { name: 'More', label: 'Menu', icon: 'menu-outline', component: MoreStack },
};

export function AppTabs() {
  const { roleName, rolePermissions, hasLinkedChildren } = useAuth();
  const { theme } = useSchool();
  const visible = getVisibleTabIds(roleName, rolePermissions, { hasLinkedChildren });

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { paddingTop: 4 },
        tabBarIcon: ({ color, size }) => {
          const conf = Object.values(TAB_CONFIG).find((t) => t.name === route.name);
          return <Ionicons name={conf?.icon || 'ellipse-outline'} size={size} color={color} />;
        },
      })}
    >
      {visible.map((id) => {
        const conf = TAB_CONFIG[id];
        return (
          <Tab.Screen
            key={conf.name}
            name={conf.name}
            component={conf.component}
            options={{
              title: conf.label,
              tabBarLabel: conf.label,
            }}
          />
        );
      })}
    </Tab.Navigator>
  );
}
