import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Muted,
  Screen,
  TextField,
  Title,
} from '../../components/ui';
import { colors } from '../../theme/tokens';
import {
  createSubject,
  deleteSubject,
  listSubjects,
  updateSubject,
  type SubjectOrg,
} from '../../services/api';
import type { MoreStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<MoreStackParamList, 'OrgSubjects'>;

export function OrgSubjectsScreen({}: Props) {
  const allowed = useCanAccess('subjects');
  const [items, setItems] = useState<SubjectOrg[]>([]);
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectOrg | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    setItems(await listSubjects());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur');
      } finally {
        if (!cancelled) setBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  function open(s?: SubjectOrg) {
    setEditing(s || null);
    setName(s?.name || '');
    setCode(s?.code || '');
    setFormOpen(true);
  }

  async function save() {
    if (!name.trim()) {
      setError('Nom requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updateSubject(editing.id, {
          name: name.trim(),
          code: code.trim() || undefined,
        });
      } else {
        await createSubject({ name: name.trim(), code: code.trim() || undefined });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(id: string) {
    Alert.alert('Supprimer', 'Supprimer cette matière ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await deleteSubject(id);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur');
            }
          })(),
      },
    ]);
  }

  if (!allowed) {
    return <AccessDenied />;
  }

  if (boot) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={styles.top}>
        <Title>Matières</Title>
        <Button title="Ajouter" onPress={() => open()} />
        <ErrorBanner message={error} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState title="Aucune matière" />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Muted>
              {[item.code, item.active === false ? 'Inactive' : null]
                .filter(Boolean)
                .join(' · ') || '—'}
            </Muted>
            <View style={styles.actions}>
              <Pressable onPress={() => open(item)}>
                <Text style={styles.link}>Modifier</Text>
              </Pressable>
              <Pressable onPress={() => confirmDelete(item.id)}>
                <Text style={styles.danger}>Supprimer</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <Modal visible={formOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {editing ? 'Modifier' : 'Nouvelle matière'}
            </Text>
            <TextField label="Nom *" value={name} onChangeText={setName} />
            <TextField label="Code" value={code} onChangeText={setCode} />
            <Button
              title={saving ? '…' : 'Enregistrer'}
              onPress={() => void save()}
              disabled={saving}
            />
            <Button title="Annuler" variant="ghost" onPress={() => setFormOpen(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 48 },
  card: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  actions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  link: { color: colors.primaryFallback, fontWeight: '700' },
  danger: { color: colors.danger, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4, color: colors.text },
});
