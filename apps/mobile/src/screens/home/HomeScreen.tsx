import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LoadingBlock, Screen } from '../../components/ui';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { useNetwork } from '../../context/NetworkContext';
import { canSeeSensitiveDashboardStats, isTeacherRole } from '../../lib/permissions';
import { formatTodayLong, studentDisplayName } from '../../lib/format';
import {
  getDashboardStats,
  getImageUrl,
  getUpcomingBirthdays,
  type DashboardStats,
  type LinkedStudent,
  type UpcomingBirthday,
} from '../../services/api';
import { colors, softTint } from '../../theme/tokens';
import { WORK_TAB_BY_ROLE, getScreen } from '../../../spec/productMap';
import type { AppTabParamList, HomeStackParamList } from '../../navigation/types';
import { listBottomPadding } from '../../lib/layout';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>,
  BottomTabNavigationProp<AppTabParamList>
>;

export function HomeScreen({ navigation }: { navigation: Nav }) {
  const { user, roleName, rolePermissions, linkedStudents, refreshLinkedStudents } = useAuth();
  const { home, context, theme, refetch } = useSchool();
  const { flushQueue } = useNetwork();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [birthdays, setBirthdays] = useState<UpcomingBirthday[]>([]);

  const firstName = user?.first_name || user?.email || 'utilisateur';
  const schoolName = context?.school?.name || home?.name || 'Shekinah';
  const yearName = context?.academic_year?.name;
  const showStats = canSeeSensitiveDashboardStats(roleName, rolePermissions);
  const logoUri = getImageUrl(context?.school?.logo_url || home?.logo_url);
  const work = WORK_TAB_BY_ROLE[roleName];
  const workScreen = work ? getScreen(work.screenId) : null;
  const pageBg = useMemo(() => softTint(theme.primary, 0.94), [theme.primary]);
  const linked = linkedStudents;

  const loadExtras = useCallback(async () => {
    await refreshLinkedStudents();
    if (isTeacherRole(roleName)) {
      try {
        const data = await getUpcomingBirthdays();
        setBirthdays(data.birthdays);
      } catch {
        setBirthdays([]);
      }
    } else {
      setBirthdays([]);
    }
    if (!showStats) return;
    setLoadingStats(true);
    try {
      setStats(await getDashboardStats());
    } finally {
      setLoadingStats(false);
    }
  }, [showStats, refreshLinkedStudents, roleName]);

  useEffect(() => {
    void loadExtras();
  }, [loadExtras]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: '',
      headerShadowVisible: false,
      headerStyle: { backgroundColor: pageBg },
    });
  }, [navigation, pageBg]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refetch();
      await flushQueue();
      await loadExtras();
    } finally {
      setRefreshing(false);
    }
  }

  function goWork() {
    if (roleName === 'PARENT') {
      navigation.navigate('Children');
      return;
    }
    navigation.navigate('Work');
  }

  function openStudent(s: LinkedStudent) {
    // Toujours via Mes enfants (liés) — multi-enfants Parent ou staff-parent.
    navigation.navigate('Children', {
      screen: 'StudentFiche',
      params: { studentId: s.id, studentName: studentDisplayName(s) },
    } as never);
  }

  return (
    <Screen style={{ paddingHorizontal: 0, backgroundColor: pageBg }}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={theme.primary}
          />
        }
      >
        <View style={styles.top}>
          <OfflineBanner />

          <View style={styles.brand}>
            <Image
              source={logoUri ? { uri: logoUri } : require('../../../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={[styles.schoolName, { color: theme.primary }]} numberOfLines={2}>
              {schoolName}
            </Text>
            <Text style={styles.greeting}>Bonjour, {firstName}</Text>
            <Text style={styles.date}>{formatTodayLong()}</Text>
            {yearName ? <Text style={styles.year}>{yearName}</Text> : null}
          </View>
        </View>

        <View style={styles.body}>
          {birthdays.length > 0 ? (
            <View style={styles.birthdayCard}>
              <Text style={styles.birthdayTitle}>Anniversaires</Text>
              {birthdays.map((b) => (
                <Text key={b.student_id} style={styles.birthdayLine}>
                  {b.when === 'tomorrow' ? 'Demain' : 'Aujourd’hui'} — {b.first_name} {b.last_name}
                  {b.room_name ? ` · ${b.room_name}` : ''}
                  {b.turning_age != null ? ` (${b.turning_age} ans)` : ''}
                </Text>
              ))}
            </View>
          ) : null}
          {showStats ? (
            <View style={styles.block}>
              {loadingStats && !stats ? (
                <LoadingBlock label="Stats…" />
              ) : (
                <View style={styles.kpiRow}>
                  <Kpi label="Classes" value={stats?.classesCount} />
                  <Kpi label="Élèves" value={stats?.studentsCount} />
                </View>
              )}
            </View>
          ) : null}

          {workScreen || roleName === 'PARENT' ? (
            <Pressable
              onPress={goWork}
              style={({ pressed }) => [
                styles.dashboardCard,
                pressed && { opacity: 0.88 },
              ]}
            >
              <Text style={styles.dashboardTitle}>Tableau de bord</Text>
              <View
                style={[
                  styles.dashboardRingOuter,
                  { borderColor: theme.accent, backgroundColor: theme.accentTint },
                ]}
              >
                <View
                  style={[
                    styles.dashboardRingInner,
                    { borderColor: theme.accent, backgroundColor: colors.surface },
                  ]}
                >
                  <Ionicons name="stats-chart-outline" size={34} color={theme.accent} />
                </View>
              </View>
            </Pressable>
          ) : null}

          {linked.length > 0 ? (
            <View style={styles.block}>
              <Text style={styles.blockLabel}>Mes enfants</Text>
              {linked.slice(0, 6).map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => openStudent(s)}
                  style={({ pressed }) => [
                    styles.linkedRow,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkedName}>{studentDisplayName(s)}</Text>
                    <Text style={styles.linkedMeta}>
                      {s.class_name || s.order_number || '—'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Kpi({ label, value }: { label: string; value?: number }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiValue}>{value ?? '—'}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingBottom: listBottomPadding(24),
  },
  top: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  brand: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 28,
  },
  logo: {
    width: 168,
    height: 168,
    marginBottom: 20,
  },
  schoolName: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  greeting: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  date: {
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'capitalize',
  },
  year: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: 20,
    gap: 14,
  },
  birthdayCard: {
    backgroundColor: colors.flameTint,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  birthdayTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  birthdayLine: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  block: {
    gap: 8,
  },
  blockLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpi: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  kpiLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  dashboardCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 12,
  },
  dashboardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  dashboardRingOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  dashboardRingInner: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  linkedName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  linkedMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
});
