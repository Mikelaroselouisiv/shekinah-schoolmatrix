import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNetwork } from '../context/NetworkContext';
import { useSchool } from '../context/SchoolContext';
import { colors } from '../theme/tokens';

/** Bandeau hors ligne / file d’attente — Accueil & Plus. */
export function OfflineBanner() {
  const { online, pendingCount, flushQueue, refreshing } = useNetwork();
  const { fromCache } = useSchool();

  if (online && pendingCount === 0 && !fromCache) return null;

  const title = !online
    ? 'Hors ligne'
    : pendingCount > 0
      ? `${pendingCount} action${pendingCount > 1 ? 's' : ''} en attente`
      : 'Données en cache';

  const canFlush = online && pendingCount > 0;

  return (
    <Pressable
      onPress={() => {
        if (canFlush) void flushQueue();
      }}
      disabled={!canFlush || refreshing}
      style={({ pressed }) => [
        styles.banner,
        !online ? styles.offline : pendingCount > 0 ? styles.pending : styles.cache,
        pressed && canFlush ? styles.pressed : null,
      ]}
    >
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
      </View>
      {refreshing ? (
        <ActivityIndicator color={colors.text} />
      ) : canFlush ? (
        <Text style={styles.action}>Sync</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  offline: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  pending: {
    backgroundColor: colors.flameTint,
    borderColor: colors.flameMuted,
  },
  cache: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.85 },
  textCol: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  action: { fontSize: 13, fontWeight: '700', color: colors.text },
});
