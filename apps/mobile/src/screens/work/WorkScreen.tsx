import { useLayoutEffect, useMemo, useState } from 'react';
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
import { ROLES_FULL, canAccessPermission, isEconomeRole, isSupervisorRole, isTeacherRole } from '../../lib/permissions';
import { getImageUrl } from '../../services/api';
import { WORK_TAB_BY_ROLE, getScreen } from '../../../spec/productMap';
import { colors, softTint } from '../../theme/tokens';
import type { WorkStackParamList } from '../../navigation/types';
import { listBottomPadding } from '../../lib/layout';

type Props = NativeStackScreenProps<WorkStackParamList, 'WorkMain'>;

const TEACHER_OPS: {
  id: 'agenda' | 'travaux' | 'appel' | 'photos' | 'grades';
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: 'agenda',
    label: 'Agenda',
    hint: 'Horaires, début de journée et rendez-vous',
    icon: 'calendar-outline',
  },
  {
    id: 'travaux',
    label: 'Devoirs et leçons',
    hint: 'Devoirs, leçons et travaux',
    icon: 'book-outline',
  },
  {
    id: 'appel',
    label: 'Appel',
    hint: 'Présences, absences et retards',
    icon: 'checkmark-done-outline',
  },
  {
    id: 'photos',
    label: 'Photos',
    hint: 'Profil et photos de la classe',
    icon: 'camera-outline',
  },
  {
    id: 'grades',
    label: 'Saisie des notes',
    hint: 'Enregistrer les résultats',
    icon: 'create-outline',
  },
];

const SUPERVISOR_OPS: {
  id: 'appel' | 'retards' | 'points' | 'mesures';
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: 'appel',
    label: 'Appel',
    hint: 'Choisir la classe, puis la salle',
    icon: 'checkmark-done-outline',
  },
  {
    id: 'retards',
    label: 'Retards',
    hint: 'Heure d’arrivée d’un élève',
    icon: 'time-outline',
  },
  {
    id: 'points',
    label: 'Points',
    hint: 'Retirer ou ajouter des points',
    icon: 'remove-circle-outline',
  },
  {
    id: 'mesures',
    label: 'Mesures',
    hint: 'Surveillance, retenue et renvoi',
    icon: 'shield-checkmark-outline',
  },
];

const ECONOME_OPS: {
  id: 'paiements' | 'depenses';
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: 'paiements',
    label: 'Paiements',
    hint: 'Encaisser un élève et voir l’historique',
    icon: 'wallet-outline',
  },
  {
    id: 'depenses',
    label: 'Dépenses',
    hint: 'Brouillons, validation et caisse',
    icon: 'card-outline',
  },
];

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
  const supervisor = isSupervisorRole(roleName);
  const econome = isEconomeRole(roleName);
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
  const wash = softTint(theme.accent, 0.78);
  const washSoft = softTint(theme.accent, 0.9);
  const todayLabel = formatDay(new Date());

  useLayoutEffect(() => {
    if (!isTeacherRole(roleName) && !supervisor && !econome) return;
    navigation.setOptions({
      title: '',
      headerShadowVisible: false,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation, roleName, supervisor, econome]);

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

  if (isTeacherRole(roleName)) {
    return (
      <Screen style={styles.teacherScreen}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.teacherOrb, styles.teacherOrbTop, { backgroundColor: washSoft }]} />
          <View style={[styles.teacherOrb, styles.teacherOrbMid, { backgroundColor: wash }]} />
        </View>
        <ScrollView
          contentContainerStyle={[styles.teacherContent, { paddingBottom: listBottomPadding(24) }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.teacherHead}>
            <Text style={styles.teacherKicker}>Aujourd’hui</Text>
            <Text style={styles.teacherTitle}>Tableau de bord</Text>
            <Text style={styles.teacherDate}>{todayLabel}</Text>
          </View>
          <View style={styles.teacherList}>
            {TEACHER_OPS.map((op) => (
              <Pressable
                key={op.id}
                onPress={() => {
                  if (op.id === 'grades') navigation.navigate('Grades');
                  else if (op.id === 'agenda') navigation.navigate('Agenda');
                  else if (op.id === 'photos') navigation.navigate('Photography');
                  else navigation.navigate('TeacherHub', { tab: op.id });
                }}
                accessibilityRole="button"
                accessibilityLabel={op.label}
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              >
                <View style={[styles.actionIcon, { backgroundColor: theme.accentTint }]}>
                  <Ionicons name={op.icon} size={22} color={theme.accent} />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>{op.label}</Text>
                  <Text style={styles.actionHint}>{op.hint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (supervisor) {
    return (
      <Screen style={styles.teacherScreen}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.teacherOrb, styles.teacherOrbTop, { backgroundColor: washSoft }]} />
          <View style={[styles.teacherOrb, styles.teacherOrbMid, { backgroundColor: wash }]} />
        </View>
        <ScrollView
          contentContainerStyle={[styles.teacherContent, { paddingBottom: listBottomPadding(24) }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.teacherHead}>
            <Text style={styles.teacherKicker}>Aujourd’hui</Text>
            <Text style={styles.teacherTitle}>Tableau de bord</Text>
            <Text style={styles.teacherDate}>{todayLabel}</Text>
          </View>
          <View style={styles.teacherList}>
            {SUPERVISOR_OPS.map((op) => (
              <Pressable
                key={op.id}
                onPress={() => {
                  if (op.id === 'appel') navigation.navigate('Attendance');
                  else navigation.navigate('Discipline', { tab: op.id });
                }}
                accessibilityRole="button"
                accessibilityLabel={op.label}
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              >
                <View style={[styles.actionIcon, { backgroundColor: theme.accentTint }]}>
                  <Ionicons name={op.icon} size={22} color={theme.accent} />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>{op.label}</Text>
                  <Text style={styles.actionHint}>{op.hint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (econome) {
    return (
      <Screen style={styles.teacherScreen}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.teacherOrb, styles.teacherOrbTop, { backgroundColor: washSoft }]} />
          <View style={[styles.teacherOrb, styles.teacherOrbMid, { backgroundColor: wash }]} />
        </View>
        <ScrollView
          contentContainerStyle={[styles.teacherContent, { paddingBottom: listBottomPadding(24) }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.teacherHead}>
            <Text style={styles.teacherKicker}>Aujourd’hui</Text>
            <Text style={styles.teacherTitle}>Tableau de bord</Text>
            <Text style={styles.teacherDate}>{todayLabel}</Text>
          </View>
          <View style={styles.teacherList}>
            {ECONOME_OPS.map((op) => (
              <Pressable
                key={op.id}
                onPress={() =>
                  tabNavigate(navigation, 'Finance', {
                    screen: op.id === 'paiements' ? 'Payments' : 'Expenses',
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={op.label}
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              >
                <View style={[styles.actionIcon, { backgroundColor: theme.accentTint }]}>
                  <Ionicons name={op.icon} size={22} color={theme.accent} />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>{op.label}</Text>
                  <Text style={styles.actionHint}>{op.hint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </Screen>
    );
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

function formatDay(d: Date): string {
  const label = d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
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
  content: { paddingHorizontal: 20, paddingBottom: listBottomPadding(16), paddingTop: 4 },
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
  teacherScreen: {
    paddingHorizontal: 0,
    paddingTop: 0,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  teacherOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  teacherOrbTop: {
    width: 260,
    height: 260,
    top: -120,
    right: -80,
  },
  teacherOrbMid: {
    width: 180,
    height: 180,
    top: 280,
    left: -80,
    opacity: 0.5,
  },
  teacherContent: {
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 48,
    gap: 22,
  },
  teacherHead: {
    gap: 4,
    paddingTop: 4,
  },
  teacherKicker: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  teacherTitle: {
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: -0.6,
    color: colors.text,
  },
  teacherDate: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '500',
    color: colors.inkSoft,
  },
  teacherList: {
    gap: 12,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 16,
    shadowColor: '#1C1917',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 1,
  },
  actionPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.text,
  },
  actionHint: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
});
