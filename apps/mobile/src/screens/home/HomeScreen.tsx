import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
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
import { Screen } from '../../components/ui';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { useNetwork } from '../../context/NetworkContext';
import { isTeacherRole } from '../../lib/permissions';
import { getImageUrl, getUpcomingBirthdays, type UpcomingBirthday } from '../../services/api';
import { colors, softTint } from '../../theme/tokens';
import { WORK_TAB_BY_ROLE, getScreen } from '../../../spec/productMap';
import type { AppTabParamList, HomeStackParamList } from '../../navigation/types';
import { listBottomPadding } from '../../lib/layout';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>,
  BottomTabNavigationProp<AppTabParamList>
>;

function formatClock(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function HomeScreen({ navigation }: { navigation: Nav }) {
  const { user, roleName } = useAuth();
  const { home, context, theme, refetch } = useSchool();
  const { flushQueue } = useNetwork();
  const [refreshing, setRefreshing] = useState(false);
  const [birthdays, setBirthdays] = useState<UpcomingBirthday[]>([]);
  const [now, setNow] = useState(() => new Date());

  const firstName = user?.first_name || user?.email || 'utilisateur';
  const schoolName = context?.school?.name || home?.name || 'Shekinah';
  const yearName = context?.academic_year?.name;
  const logoUri = getImageUrl(context?.school?.logo_url || home?.logo_url);
  const work = WORK_TAB_BY_ROLE[roleName];
  const workScreen = work ? getScreen(work.screenId) : null;
  const wash = softTint(theme.accent, 0.78);
  const washSoft = softTint(theme.accent, 0.9);
  const cardEdge = softTint(theme.accent, 0.72);

  const loadExtras = useCallback(async () => {
    if (!isTeacherRole(roleName)) {
      setBirthdays([]);
      return;
    }
    try {
      const data = await getUpcomingBirthdays();
      setBirthdays(data.birthdays);
    } catch {
      setBirthdays([]);
    }
  }, [roleName]);

  useEffect(() => {
    void loadExtras();
  }, [loadExtras]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: '',
      headerShadowVisible: false,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation]);

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

  return (
    <Screen style={styles.screen}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.orb, styles.orbTop, { backgroundColor: washSoft }]} />
        <View style={[styles.orb, styles.orbMid, { backgroundColor: wash }]} />
        <View style={[styles.orb, styles.orbBottom, { backgroundColor: washSoft }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={theme.accent}
          />
        }
      >
        <OfflineBanner />

        <View style={styles.brand}>
          <Image
            source={logoUri ? { uri: logoUri } : require('../../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.schoolName} numberOfLines={2}>
            {schoolName}
          </Text>
          <Text style={styles.greeting}>Bonjour, {firstName}</Text>
        </View>

        <View style={[styles.clockCard, { borderColor: cardEdge }]}>
          <Text style={styles.time}>{formatClock(now)}</Text>
          <View style={[styles.timeRule, { backgroundColor: theme.accent }]} />
          <Text style={styles.date}>{formatDateLong(now)}</Text>
          {yearName ? <Text style={styles.year}>{yearName}</Text> : null}
        </View>

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

        {workScreen || roleName === 'PARENT' ? (
          <Pressable
            onPress={goWork}
            style={({ pressed }) => [
              styles.dashboardCard,
              { borderColor: cardEdge, backgroundColor: washSoft },
              pressed && styles.dashboardPressed,
            ]}
          >
            <Text style={styles.dashboardTitle}>Tableau de bord</Text>
            <View
              style={[
                styles.dashboardRingOuter,
                { borderColor: theme.accent, backgroundColor: colors.surface },
              ]}
            >
              <View style={[styles.dashboardRingInner, { backgroundColor: theme.accentTint }]}>
                <Ionicons name="stats-chart-outline" size={30} color={theme.accent} />
              </View>
            </View>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
    paddingTop: 0,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbTop: {
    width: 280,
    height: 280,
    top: -110,
    right: -90,
  },
  orbMid: {
    width: 180,
    height: 180,
    top: 220,
    left: -70,
    opacity: 0.55,
  },
  orbBottom: {
    width: 320,
    height: 320,
    bottom: -140,
    right: -120,
    opacity: 0.7,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: listBottomPadding(24),
    gap: 18,
  },
  brand: {
    alignItems: 'center',
    paddingTop: 8,
  },
  logo: {
    width: 148,
    height: 148,
    marginBottom: 16,
  },
  schoolName: {
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: -0.4,
    textAlign: 'center',
    color: colors.text,
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  greeting: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 0.1,
  },
  clockCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    shadowColor: '#1C1917',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  time: {
    fontSize: 64,
    fontWeight: '300',
    letterSpacing: -2,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  timeRule: {
    width: 36,
    height: 2,
    borderRadius: 2,
    marginTop: 10,
    marginBottom: 14,
    opacity: 0.85,
  },
  date: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
    textTransform: 'capitalize',
    letterSpacing: 0.2,
  },
  year: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  birthdayCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  birthdayTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: colors.textMuted,
  },
  birthdayLine: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  dashboardCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 26,
    gap: 16,
    shadowColor: '#1C1917',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  dashboardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  dashboardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  dashboardRingOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 7,
  },
  dashboardRingInner: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
