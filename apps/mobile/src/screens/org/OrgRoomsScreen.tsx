import { useCallback, useEffect, useMemo, useState } from 'react';
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
  createRoom,
  deleteRoom,
  getClasses,
  getRooms,
  updateRoom,
  type ClassItem,
  type RoomItem,
} from '../../services/api';
import type { MoreStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<MoreStackParamList, 'OrgRooms'>;

export function OrgRoomsScreen({}: Props) {
  const allowed = useCanAccess('rooms');
  const [items, setItems] = useState<RoomItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [classPicker, setClassPicker] = useState(false);
  const [editing, setEditing] = useState<RoomItem | null>(null);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [classId, setClassId] = useState('');

  const classLabel = useMemo(
    () => classes.find((c) => c.id === classId)?.name || 'Aucune',
    [classes, classId],
  );

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([getRooms(), getClasses()]);
    setItems(r);
    setClasses(c);
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

  function open(r?: RoomItem) {
    setEditing(r || null);
    setName(r?.name || '');
    setCapacity(r && (r as RoomItem & { capacity?: number }).capacity != null
      ? String((r as RoomItem & { capacity?: number }).capacity)
      : '');
    setClassId(r?.class_id || '');
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
      const cap = capacity.trim() ? Number(capacity) : null;
      const body = {
        name: name.trim(),
        capacity: Number.isFinite(cap as number) ? cap : null,
        class_id: classId || null,
      };
      if (editing) await updateRoom(editing.id, body);
      else await createRoom(body);
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(id: string) {
    Alert.alert('Supprimer', 'Supprimer cette salle ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await deleteRoom(id);
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
        <Title>Salles</Title>
        <Button title="Ajouter" onPress={() => open()} />
        <ErrorBanner message={error} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState title="Aucune salle" />}
        renderItem={({ item }) => {
          const cls = classes.find((c) => c.id === item.class_id)?.name;
          const cap = (item as RoomItem & { capacity?: number | null }).capacity;
          return (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Muted>
                {[cls, cap != null ? `Capacité ${cap}` : null, item.active === false ? 'Inactive' : null]
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
          );
        }}
      />

      <Modal visible={formOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{editing ? 'Modifier' : 'Nouvelle salle'}</Text>
            <TextField label="Nom *" value={name} onChangeText={setName} />
            <TextField
              label="Capacité"
              value={capacity}
              onChangeText={setCapacity}
              keyboardType="number-pad"
            />
            <Pressable style={styles.chip} onPress={() => setClassPicker(true)}>
              <Text style={styles.chipLabel}>Classe</Text>
              <Text style={styles.chipValue}>{classLabel}</Text>
            </Pressable>
            <Button
              title={saving ? '…' : 'Enregistrer'}
              onPress={() => void save()}
              disabled={saving}
            />
            <Button title="Annuler" variant="ghost" onPress={() => setFormOpen(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={classPicker} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setClassPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <FlatList
              data={[{ id: '', name: 'Aucune' }, ...classes]}
              keyExtractor={(i) => i.id || 'none'}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.pickRow}
                  onPress={() => {
                    setClassId(item.id);
                    setClassPicker(false);
                  }}
                >
                  <Text style={styles.cardTitle}>{item.name}</Text>
                </Pressable>
              )}
            />
            <Button title="Fermer" variant="ghost" onPress={() => setClassPicker(false)} />
          </Pressable>
        </Pressable>
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
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4, color: colors.text },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 4,
  },
  chipLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  chipValue: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2 },
  pickRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
