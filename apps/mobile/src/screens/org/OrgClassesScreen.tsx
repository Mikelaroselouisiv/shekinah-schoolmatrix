import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
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
  createClass,
  deleteClass,
  getClassDetail,
  listClassesOrg,
  listSubjects,
  updateClass,
  type ClassOrg,
  type SubjectOrg,
} from '../../services/api';
import type { MoreStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<MoreStackParamList, 'OrgClasses'>;

export function OrgClassesScreen({}: Props) {
  const allowed = useCanAccess('classes');
  const [items, setItems] = useState<ClassOrg[]>([]);
  const [subjects, setSubjects] = useState<SubjectOrg[]>([]);
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClassOrg | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState('');
  const [subjectIds, setSubjectIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([listClassesOrg(), listSubjects()]);
    setItems(c);
    setSubjects(s);
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

  async function open(c?: ClassOrg) {
    setEditing(c || null);
    setName(c?.name || '');
    setDescription(c?.description || '');
    setLevel(c?.level || '');
    setSubjectIds([]);
    setFormOpen(true);
    if (c) {
      try {
        const detail = await getClassDetail(c.id);
        setSubjectIds(detail?.subject_ids || []);
      } catch {
        setSubjectIds([]);
      }
    }
  }

  function toggleSubject(id: string) {
    setSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save() {
    if (!name.trim()) {
      setError('Nom requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        level: level.trim() || undefined,
        subject_ids: subjectIds,
      };
      if (editing) await updateClass(editing.id, body);
      else await createClass(body);
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(id: string) {
    Alert.alert('Supprimer', 'Supprimer cette classe ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await deleteClass(id);
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
        <Title>Classes</Title>
        <Button title="Ajouter" onPress={() => void open()} />
        <ErrorBanner message={error} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState title="Aucune classe" />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {item.name}
              {item.is_preschool ? ' · préscolaire' : ''}
            </Text>
            <Muted>
              {[
                item.level,
                item.student_count != null ? `${item.student_count} élèves` : null,
                item.room_count != null ? `${item.room_count} salles` : null,
              ]
                .filter(Boolean)
                .join(' · ') || '—'}
            </Muted>
            <View style={styles.actions}>
              <Pressable onPress={() => void open(item)}>
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
            <ScrollView>
              <Text style={styles.sheetTitle}>
                {editing ? 'Modifier la classe' : 'Nouvelle classe'}
              </Text>
              <TextField label="Nom *" value={name} onChangeText={setName} />
              <TextField label="Niveau" value={level} onChangeText={setLevel} />
              <TextField
                label="Description"
                value={description}
                onChangeText={setDescription}
              />
              <Text style={styles.subHead}>Matières</Text>
              {subjects.map((s) => {
                const on = subjectIds.includes(s.id);
                return (
                  <Pressable
                    key={s.id}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => toggleSubject(s.id)}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.name}</Text>
                  </Pressable>
                );
              })}
              <View style={{ gap: 8, marginTop: 12, marginBottom: 24 }}>
                <Button
                  title={saving ? '…' : 'Enregistrer'}
                  onPress={() => void save()}
                  disabled={saving}
                />
                <Button title="Annuler" variant="ghost" onPress={() => setFormOpen(false)} />
              </View>
            </ScrollView>
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
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8, color: colors.text },
  subHead: {
    marginTop: 10,
    marginBottom: 6,
    fontWeight: '700',
    color: colors.textMuted,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  },
  chipOn: { backgroundColor: colors.primaryFallback, borderColor: colors.primaryFallback },
  chipText: { color: colors.text, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
});
