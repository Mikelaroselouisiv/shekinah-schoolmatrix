import { ScrollView, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ListRow, Screen, Title } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { canAccessPermission, ROLES_FULL } from '../../lib/permissions';
import type { MoreStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MoreStackParamList, 'OrganisationHub'>;

const MODULES: {
  screen: keyof MoreStackParamList;
  title: string;
  permission: string;
}[] = [
  {
    screen: 'OrgAcademicYears',
    title: 'Années et périodes',
    permission: 'academic-years',
  },
  {
    screen: 'OrgSubjects',
    title: 'Matières',
    permission: 'subjects',
  },
  {
    screen: 'OrgClasses',
    title: 'Classes',
    permission: 'classes',
  },
  {
    screen: 'OrgRooms',
    title: 'Salles',
    permission: 'rooms',
  },
  {
    screen: 'OrgTeachers',
    title: 'Professeurs',
    permission: 'teachers',
  },
];

export function OrganisationHubScreen({ navigation }: Props) {
  const { roleName, rolePermissions } = useAuth();
  const isFull = ROLES_FULL.includes(roleName) || rolePermissions.includes('full_access');

  const visible = MODULES.filter(
    (m) => isFull || canAccessPermission(roleName, m.permission, rolePermissions),
  );

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>Organisation</Title>
        {visible.map((m) => (
          <ListRow
            key={m.screen}
            title={m.title}
            onPress={() => navigation.navigate(m.screen as never)}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 40 },
});
