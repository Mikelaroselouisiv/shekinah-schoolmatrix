import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/tokens';
import type { MobileUpdateManifest } from '../config/update-feed';
import {
  checkForUpdate,
  downloadAndInstallApk,
  isLikelyUnknownSourcesError,
  openUnknownSourcesSettings,
  resumePendingInstallerIfAny,
  subscribeAppActive,
} from '../services/app-update';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 8_000;
const SNOOZE_KEY = 'schoolmatrix.mobile.update.snooze';

type Phase = 'idle' | 'prompt' | 'downloading' | 'installing' | 'needPermission' | 'error';

async function readSnooze(): Promise<{ until: number; versionCode: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { until?: number; versionCode?: number };
    if (typeof parsed.until !== 'number' || typeof parsed.versionCode !== 'number') {
      return null;
    }
    return { until: parsed.until, versionCode: parsed.versionCode };
  } catch {
    return null;
  }
}

async function writeSnooze(versionCode: number) {
  await AsyncStorage.setItem(
    SNOOZE_KEY,
    JSON.stringify({ until: Date.now() + CHECK_INTERVAL_MS, versionCode }),
  );
}

/**
 * Modal MAJ Android in-app (téléchargement + installateur système).
 * Fichier plateforme : ne pas utiliser sur iOS.
 */
export function AndroidUpdatePrompt() {
  const [manifest, setManifest] = useState<MobileUpdateManifest | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const checking = useRef(false);
  const awaitingSources = useRef(false);

  const runCheck = useCallback(async () => {
    if (checking.current) return;
    if (phase === 'downloading' || phase === 'installing') return;
    checking.current = true;
    try {
      const remote = await checkForUpdate();
      if (!remote) {
        if (phase === 'prompt') {
          setManifest(null);
          setPhase('idle');
        }
        return;
      }
      const snooze = await readSnooze();
      if (
        !remote.mandatory &&
        snooze &&
        snooze.versionCode === remote.versionCode &&
        Date.now() < snooze.until
      ) {
        setManifest(remote);
        return;
      }
      setManifest(remote);
      setPhase((p) => (p === 'needPermission' || p === 'error' ? p : 'prompt'));
    } catch {
      // silencieux
    } finally {
      checking.current = false;
    }
  }, [phase]);

  useEffect(() => {
    const t = setTimeout(() => {
      void runCheck();
    }, FIRST_CHECK_MS);
    const interval = setInterval(() => {
      void runCheck();
    }, CHECK_INTERVAL_MS);
    const unsub = subscribeAppActive(() => {
      void (async () => {
        if (awaitingSources.current) {
          awaitingSources.current = false;
          try {
            const resumed = await resumePendingInstallerIfAny();
            if (resumed) {
              setPhase('installing');
              return;
            }
          } catch {
            // fall through to check
          }
        }
        void runCheck();
      })();
    });
    return () => {
      clearTimeout(t);
      clearInterval(interval);
      unsub();
    };
  }, [runCheck]);

  const dismiss = useCallback(() => {
    if (manifest?.mandatory) return;
    if (manifest) void writeSnooze(manifest.versionCode);
    setPhase('idle');
  }, [manifest]);

  const startUpdate = useCallback(async () => {
    if (!manifest) return;
    setErrorMsg('');
    setProgress(0);
    setPhase('downloading');
    try {
      await downloadAndInstallApk(manifest, (p) => {
        setProgress(p.ratio);
        if (p.ratio >= 0.99) setPhase('installing');
      });
      setPhase('installing');
    } catch (err) {
      if (isLikelyUnknownSourcesError(err)) {
        setPhase('needPermission');
        setErrorMsg(
          'Android doit autoriser Shekinah à installer des mises à jour.',
        );
      } else {
        setPhase('error');
        setErrorMsg(
          err instanceof Error ? err.message : 'Échec de la mise à jour.',
        );
      }
    }
  }, [manifest]);

  const allowInstall = useCallback(async () => {
    awaitingSources.current = true;
    try {
      await openUnknownSourcesSettings();
    } catch {
      awaitingSources.current = false;
      setPhase('error');
      setErrorMsg('Impossible d’ouvrir les réglages d’installation.');
    }
  }, []);

  const visible =
    !!manifest &&
    (phase === 'prompt' ||
      phase === 'downloading' ||
      phase === 'installing' ||
      phase === 'needPermission' ||
      phase === 'error');

  if (!visible || !manifest) return null;

  const pct = Math.round(Math.min(100, Math.max(0, progress * 100)));

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Mise à jour disponible</Text>
          <Text style={styles.version}>Version {manifest.version}</Text>
          <Text style={styles.notes}>
            {manifest.notes?.trim() ||
              'Une nouvelle version de Shekinah est prête à être installée.'}
          </Text>

          {phase === 'downloading' ? (
            <View style={styles.progressBlock}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.progressLabel}>Téléchargement… {pct}%</Text>
            </View>
          ) : null}

          {phase === 'installing' ? (
            <View style={styles.row}>
              <ActivityIndicator color={colors.ink} />
              <Text style={styles.progressLabel}>
                Ouverture de l’installateur Android…
              </Text>
            </View>
          ) : null}

          {phase === 'needPermission' || phase === 'error' ? (
            <Text style={styles.error}>{errorMsg}</Text>
          ) : null}

          {phase === 'prompt' ? (
            <View style={styles.actions}>
              {!manifest.mandatory ? (
                <Pressable onPress={dismiss} style={styles.laterBtn} hitSlop={8}>
                  <Text style={styles.later}>Plus tard</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable onPress={() => void startUpdate()} style={styles.primaryBtn}>
                <Text style={styles.primaryText}>Mettre à jour</Text>
              </Pressable>
            </View>
          ) : null}

          {phase === 'needPermission' ? (
            <View style={styles.actions}>
              {!manifest.mandatory ? (
                <Pressable onPress={dismiss} style={styles.laterBtn} hitSlop={8}>
                  <Text style={styles.later}>Plus tard</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable onPress={() => void allowInstall()} style={styles.primaryBtn}>
                <Text style={styles.primaryText}>Autoriser l’installation</Text>
              </Pressable>
            </View>
          ) : null}

          {phase === 'error' ? (
            <View style={styles.actions}>
              {!manifest.mandatory ? (
                <Pressable onPress={dismiss} style={styles.laterBtn} hitSlop={8}>
                  <Text style={styles.later}>Plus tard</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable onPress={() => void startUpdate()} style={styles.primaryBtn}>
                <Text style={styles.primaryText}>Réessayer</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 25, 23, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  version: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  notes: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  progressBlock: { gap: 8, marginTop: 4 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.ink,
    borderRadius: 4,
  },
  progressLabel: { fontSize: 13, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  error: { fontSize: 13, color: colors.danger, lineHeight: 18 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  laterBtn: { paddingVertical: 10, paddingHorizontal: 8 },
  later: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  primaryBtn: {
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  primaryText: { fontSize: 15, fontWeight: '700', color: colors.surface },
});
