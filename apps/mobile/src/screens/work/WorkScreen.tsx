import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  EmptyState,
  ListRow,
  Screen,
  SegmentedControl,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { ROLES_FULL, canAccessPermission } from '../../lib/permissions';
import { getImageUrl } from '../../services/api';
import { WORK_TAB_BY_ROLE, getScreen } from '../../../spec/productMap';
import { colors } from '../../theme/tokens';
import type { WorkStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<WorkStackParamList, 'WorkMain'>;

const FULL_OPS: {
  screenId: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tab?: 'Students' | 'Finance' | 'Work';
}[] = [
  { screenId: 'students', label: 'Inscription', icon: 'person-add-outline', tab: 'Students' },
  { screenId: 'discipline', label: 'Discipline', icon: 'shield-checkmark-outline' },
  { screenId: 'grades', label: 'Notes', icon: 'create-outline' },
  { screenId: 'economat', label: 'Paiements', icon: 'wallet-outline', tab: 'Finance' },
];

export function WorkScreen({ navigation }: Props) {
  const { roleName, rolePermissions } = useAuth();
  const { home, context, theme } = useSchool();
  const mapping = WORK_TAB_BY_ROLE[roleName];
  const isFull = ROLES_FULL.includes(roleName) || rolePermissions.includes('full_access');
  const primary = mapping ? getScreen(mapping.screenId) : null;
  const logoUri = getImageUrl(context?.school?.logo_url || home?.logo_url);

  const secondaryOptions = useMemo(() => {
    const ids = mapping?.secondaryScreenIds || [];
    const unique = [...new Set([mapping?.screenId, ...ids].filter(Boolean))] as string[];
    return unique
      .map((id) => {
        const s = getScreen(id);
        if (!s) return null;
        if (
          s.permissionKey !== 'dashboard' &&
          s.permissionKey !== 'public' &&
          !canAccessPermission(roleName, s.permissionKey, rolePermissions) &&
          !isFull
        ) {
          return null;
        }
        return { id, label: shortLabel(s.label) };
      })
      .filter(Boolean) as { id: string; label: string }[];
  }, [mapping, roleName, rolePermissions, isFull]);

  const [selected, setSelected] = useState(mapping?.screenId || secondaryOptions[0]?.id || '');

  function goHome() {
    tabNavigate(navigation, 'Home');
  }

  function openModule(screenId: string) {
    const s = getScreen(screenId);
    if (
      s &&
      s.permissionKey !== 'dashboard' &&
      s.permissionKey !== 'public' &&
      !isFull &&
      !canAccessPermission(roleName, s.permissionKey, rolePermissions)
    ) {
      return;
    }
    if (screenId === 'students' && !canAccessPermission(roleName, 'students', rolePermissions) && !isFull) {
      return;
    }
    if (screenId === 'fiche-eleve') {
      tabNavigate(navigation, 'Students');
      return;
    }
    if (screenId === 'students') {
      tabNavigate(navigation, 'Students', { screen: 'Enrollment' });
      return;
    }
    if (screenId === 'formation-classe') {
      navigation.navigate('FormationClasse');
      return;
    }
    if (screenId === 'discipline') {
      navigation.navigate('Discipline');
      return;
    }
    if (screenId === 'grades') {
      navigation.navigate('Grades');
      return;
    }
    if (screenId === 'teacher-hub') {
      navigation.navigate('TeacherHub');
      return;
    }
    if (screenId === 'photography') {
      navigation.navigate('Photography');
      return;
    }
    if (screenId === 'schedule') {
      navigation.navigate('Schedule');
      return;
    }
    if (screenId === 'stats-academiques') {
      navigation.navigate('AcademicStats');
      return;
    }
    if (screenId === 'economat' || screenId === 'depenses' || screenId === 'stats-financieres') {
      const focus =
        screenId === 'depenses'
          ? 'depenses'
          : screenId === 'stats-financieres'
            ? 'moniteur'
            : 'paiements';
      tabNavigate(navigation, 'Finance', {
        screen: screenId === 'stats-financieres' ? 'FinancialMonitor' : 'FinanceMain',
        params: screenId === 'stats-financieres' ? undefined : { focus },
      });
      return;
    }
    navigation.navigate('WorkModule', {
      screenId,
      title: s?.label,
    });
  }

  if (isFull && mapping?.screenId === 'home-operations') {
    return (
      <Screen style={{ paddingHorizontal: 0 }}>
        <ScrollView
          contentContainerStyle={styles.centeredContent}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={goHome}
            accessibilityRole="button"
            accessibilityLabel="Retour à l’accueil"
            style={({ pressed }) => [styles.logoWrap, pressed && { opacity: 0.85 }]}
          >
            <Image
              source={logoUri ? { uri: logoUri } : require('../../../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </Pressable>

          <View style={styles.grid}>
            {FULL_OPS.map((op) => (
              <Pressable
                key={op.screenId}
                onPress={() => {
                  if (op.tab === 'Students') {
                    if (op.screenId === 'students') {
                      tabNavigate(navigation, 'Students', { screen: 'Enrollment' });
                      return;
                    }
                    tabNavigate(navigation, 'Students');
                    return;
                  }
                  if (op.tab === 'Finance') {
                    tabNavigate(navigation, 'Finance', {
                      screen: 'FinanceMain',
                      params: { focus: 'paiements' },
                    });
                    return;
                  }
                  if (op.screenId === 'discipline') {
                    navigation.navigate('Discipline');
                    return;
                  }
                  if (op.screenId === 'grades') {
                    navigation.navigate('Grades');
                    return;
                  }
                  openModule(op.screenId);
                }}
                style={({ pressed }) => [
                  styles.tile,
                  pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                ]}
              >
                <View
                  style={[
                    styles.iconRing,
                    {
                      borderColor: theme.accent,
                      backgroundColor: theme.accentTint,
                    },
                  ]}
                >
                  <Ionicons name={op.icon} size={30} color={theme.accent} />
                </View>
                <Text style={styles.tileLabel}>{op.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (!primary && secondaryOptions.length === 0) {
    return (
      <Screen>
        <EmptyState title="Aucune action principale" />
      </Screen>
    );
  }

  const activeId = selected || primary?.id || '';
  const active = getScreen(activeId);

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <ScrollView contentContainerStyle={styles.content}>
        {secondaryOptions.length > 1 ? (
          <View style={{ marginTop: 4 }}>
            <SegmentedControl
              options={secondaryOptions}
              value={activeId}
              onChange={setSelected}
            />
          </View>
        ) : null}

        <View style={[styles.card, { borderColor: theme.primary }]}>
          <Text style={styles.cardTitle}>{active?.label || primary?.label}</Text>
          <ListRow
            title={`Ouvrir · ${active?.label || 'module'}`}
            onPress={() => openModule(activeId)}
          />
        </View>

        {mapping?.secondaryScreenIds
          ?.filter((id) => id !== activeId)
          .map((id) => {
            const s = getScreen(id);
            if (!s) return null;
            if (
              s.permissionKey !== 'dashboard' &&
              s.permissionKey !== 'public' &&
              !canAccessPermission(roleName, s.permissionKey, rolePermissions) &&
              !isFull
            ) {
              return null;
            }
            return (
              <ListRow
                key={id}
                title={s.label}
                onPress={() => openModule(id)}
              />
            );
          })}
      </ScrollView>
    </Screen>
  );
}

function shortLabel(label: string): string {
  if (label.length <= 16) return label;
  return label.replace('Enregistrement des ', '').replace('Saisie des ', '');
}

function tabNavigate(
  navigation: { getParent: () => unknown },
  tab: string,
  params?: object,
) {
  const parent = navigation.getParent() as
    | { navigate: (name: string, params?: object) => void }
    | undefined;
  parent?.navigate(tab, params);
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 },
  centeredContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  logoWrap: {
    alignSelf: 'center',
    marginBottom: 28,
  },
  logo: {
    width: 120,
    height: 120,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
  },
  tile: {
    width: '47%',
    flexGrow: 1,
    minWidth: '42%',
    aspectRatio: 1,
    maxHeight: 180,
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 16,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  card: {
    marginTop: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
});
