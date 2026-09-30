import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmptyState, Screen } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { canAccessPermission, ROLES_FULL } from '../../lib/permissions';
import { colors, softTint } from '../../theme/tokens';
import { listBottomPadding } from '../../lib/layout';
import type { FinanceFocus, FinanceStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<FinanceStackParamList, 'FinanceMain'>;

const MODULES: {
  id: FinanceFocus;
  title: string;
  hint: string;
  permission: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: 'paiements',
    title: 'Paiements',
    hint: 'Encaisser un élève et voir l’historique',
    permission: 'finance',
    icon: 'wallet-outline',
  },
  {
    id: 'depenses',
    title: 'Dépenses',
    hint: 'Brouillons, validation et caisse',
    permission: 'finance',
    icon: 'card-outline',
  },
  {
    id: 'moniteur',
    title: 'Moniteur',
    hint: 'Suivi des recettes et des dépenses',
    permission: 'stats-financieres',
    icon: 'stats-chart-outline',
  },
];

export function FinanceScreen({ navigation, route }: Props) {
  const { roleName, rolePermissions } = useAuth();
  const { theme } = useSchool();
  const isFull = ROLES_FULL.includes(roleName) || rolePermissions.includes('full_access');
  const wash = softTint(theme.accent, 0.78);
  const washSoft = softTint(theme.accent, 0.9);

  const available = useMemo(
    () =>
      MODULES.filter(
        (m) => isFull || canAccessPermission(roleName, m.permission, rolePermissions),
      ),
    [isFull, roleName, rolePermissions],
  );

  function openModule(id: FinanceFocus) {
    if (!available.some((m) => m.id === id)) return;
    if (id === 'paiements') {
      navigation.navigate('Payments');
      return;
    }
    if (id === 'depenses') {
      navigation.navigate('Expenses');
      return;
    }
    if (id === 'moniteur') {
      navigation.navigate('FinancialMonitor');
    }
  }

  useEffect(() => {
    const focus = route.params?.focus;
    if (!focus) return;
    if (!available.some((m) => m.id === focus)) return;
    openModule(focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate once on focus param
  }, [route.params?.focus, available]);

  if (available.length === 0) {
    return (
      <Screen>
        <EmptyState title="Aucun module finance" />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.orb, styles.orbTop, { backgroundColor: washSoft }]} />
        <View style={[styles.orb, styles.orbMid, { backgroundColor: wash }]} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Text style={styles.kicker}>Finance</Text>
          <Text style={styles.title}>Tableau de bord</Text>
        </View>
        <View style={styles.list}>
          {available.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => openModule(item.id)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            >
              <View style={[styles.actionIcon, { backgroundColor: theme.accentTint }]}>
                <Ionicons name={item.icon} size={22} color={theme.accent} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={styles.actionTitle}>{item.title}</Text>
                <Text style={styles.actionHint}>{item.hint}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
            </Pressable>
          ))}
        </View>
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
  orb: { position: 'absolute', borderRadius: 999 },
  orbTop: { width: 260, height: 260, top: -120, right: -80 },
  orbMid: { width: 180, height: 180, top: 280, left: -80, opacity: 0.5 },
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: listBottomPadding(24), gap: 22 },
  head: { gap: 4, paddingTop: 4 },
  kicker: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  title: { fontSize: 32, fontWeight: '600', letterSpacing: -0.6, color: colors.text },
  list: { gap: 12 },
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
  },
  actionPressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: { flex: 1, gap: 2 },
  actionTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: colors.text },
  actionHint: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
});
