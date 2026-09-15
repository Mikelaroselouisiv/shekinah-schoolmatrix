import { useEffect, useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmptyState, Screen } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { canAccessPermission, ROLES_FULL } from '../../lib/permissions';
import { getImageUrl } from '../../services/api';
import { colors } from '../../theme/tokens';
import type { FinanceStackParamList, FinanceFocus } from '../../navigation/types';

type Props = NativeStackScreenProps<FinanceStackParamList, 'FinanceMain'>;

const MODULES: {
  id: FinanceFocus;
  title: string;
  permission: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: 'paiements',
    title: 'Paiements',
    permission: 'finance',
    icon: 'wallet-outline',
  },
  {
    id: 'depenses',
    title: 'Dépenses',
    permission: 'finance',
    icon: 'card-outline',
  },
  {
    id: 'moniteur',
    title: 'Moniteur',
    permission: 'stats-financieres',
    icon: 'stats-chart-outline',
  },
];

export function FinanceScreen({ navigation, route }: Props) {
  const { roleName, rolePermissions } = useAuth();
  const { home, context, theme } = useSchool();
  const isFull = ROLES_FULL.includes(roleName) || rolePermissions.includes('full_access');
  const logoUri = getImageUrl(context?.school?.logo_url || home?.logo_url);

  const available = useMemo(
    () =>
      MODULES.filter(
        (m) => isFull || canAccessPermission(roleName, m.permission, rolePermissions),
      ),
    [isFull, roleName, rolePermissions],
  );

  function goHome() {
    const parent = navigation.getParent() as
      | { navigate: (name: string) => void }
      | undefined;
    parent?.navigate('Home');
  }

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
          {available.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => openModule(m.id)}
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
                <Ionicons name={m.icon} size={30} color={theme.accent} />
              </View>
              <Text style={styles.tileLabel}>{m.title}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    width: 96,
    height: 96,
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
});
