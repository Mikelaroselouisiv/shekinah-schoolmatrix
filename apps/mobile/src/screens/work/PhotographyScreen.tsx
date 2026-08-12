import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
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
  Screen,
  SearchBar,
  SegmentedControl,
  Title,
} from '../../components/ui';
import { studentDisplayName } from '../../lib/format';
import { promptPickImage } from '../../lib/pickImage';
import { colors } from '../../theme/tokens';
import { useSchool } from '../../context/SchoolContext';
import {
  addStudentPhoto,
  deleteStudentPhoto,
  getClasses,
  getImageUrl,
  getRooms,
  getStudents,
  listStudentPhotos,
  uploadImage,
  type ClassItem,
  type RoomItem,
  type StudentListItem,
  type StudentPhoto,
} from '../../services/api';
import type { WorkStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<WorkStackParamList, 'Photography'>;
type PickerKind = 'class' | 'room' | null;

const PHOTO_KINDS: { id: string; label: string }[] = [
  { id: 'profile', label: 'Profil' },
  { id: 'identity', label: 'Identité' },
  { id: 'souvenir', label: 'Souvenir' },
  { id: 'promotion', label: 'Promo' },
  { id: 'other', label: 'Autre' },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  PHOTO_KINDS.map((k) => [k.id, k.label]),
);

export function PhotographyScreen({}: Props) {
  const allowed = useCanAccess('photography');
  const { theme } = useSchool();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [photos, setPhotos] = useState<StudentPhoto[]>([]);
  const [selected, setSelected] = useState<StudentListItem | null>(null);
  const [classId, setClassId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('profile');
  const [boot, setBoot] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [picker, setPicker] = useState<PickerKind>(null);

  const roomsForFilter = useMemo(
    () => (classId ? rooms.filter((r) => r.class_id === classId) : rooms),
    [rooms, classId],
  );

  const classLabel = classes.find((c) => c.id === classId)?.name || 'Toutes';
  const roomLabel = rooms.find((r) => r.id === roomId)?.name || 'Toutes';

  const loadStudents = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const list = await getStudents({
        class_id: classId || undefined,
        room_id: roomId || undefined,
      });
      setStudents(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible');
      setStudents([]);
    } finally {
      setLoadingList(false);
    }
  }, [classId, roomId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, r] = await Promise.all([getClasses(), getRooms()]);
        if (cancelled) return;
        setClasses(c);
        setRooms(r);
        await loadStudents();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Chargement impossible');
        }
      } finally {
        if (!cancelled) setBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once
  }, []);

  useEffect(() => {
    if (!boot) void loadStudents();
  }, [boot, loadStudents]);

  useEffect(() => {
    if (!selected) {
      setPhotos([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingPhotos(true);
      try {
        const list = await listStudentPhotos(selected.id);
        if (!cancelled) setPhotos(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Photos indisponibles');
          setPhotos([]);
        }
      } finally {
        if (!cancelled) setLoadingPhotos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const full = `${s.first_name} ${s.last_name} ${s.order_number ?? ''}`.toLowerCase();
      return full.includes(q);
    });
  }, [students, query]);

  async function uploadPicked(image: {
    uri: string;
    mimeType?: string | null;
    fileName?: string | null;
  }) {
    if (!selected) return;
    setError('');
    setSuccess('');
    try {
      setSaving(true);
      const url = await uploadImage(image.uri, {
        mimeType: image.mimeType || 'image/jpeg',
        fileName: image.fileName || undefined,
      });
      await addStudentPhoto(selected.id, { kind, url });
      setSuccess('Photo enregistrée.');
      setPhotos(await listStudentPhotos(selected.id));
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur upload');
    } finally {
      setSaving(false);
    }
  }

  function startAddPhoto() {
    if (!selected || saving) return;
    setError('');
    setSuccess('');
    promptPickImage((image) => {
      void uploadPicked(image);
    });
  }

  function confirmDelete(photoId: string) {
    if (!selected) return;
    Alert.alert('Supprimer', 'Supprimer cette photo ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteStudentPhoto(selected.id, photoId);
              setPhotos(await listStudentPhotos(selected.id));
              setSuccess('Photo supprimée.');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Suppression impossible');
            }
          })();
        },
      },
    ]);
  }

  const pickerItems = useMemo(() => {
    if (picker === 'class') {
      return [
        { id: '', label: 'Toutes les classes' },
        ...classes.map((c) => ({ id: c.id, label: c.name })),
      ];
    }
    if (picker === 'room') {
      return [
        { id: '', label: 'Toutes les salles' },
        ...roomsForFilter.map((r) => ({ id: r.id, label: r.name })),
      ];
    }
    return [];
  }, [picker, classes, roomsForFilter]);

  if (!allowed) {
    return <AccessDenied />;
  }

  if (boot) {
    return (
      <Screen>
        <LoadingBlock label="Chargement…" />
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={styles.top}>
        <Title>Photographie</Title>

        <View style={styles.filters}>
          <SelectChip label="Classe" value={classLabel} onPress={() => setPicker('class')} />
          <SelectChip label="Salle" value={roomLabel} onPress={() => setPicker('room')} />
        </View>

        <SearchBar value={query} onChangeText={setQuery} placeholder="Nom ou NISU…" />
        <ErrorBanner message={error} />
        {success ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}
      </View>

      {selected ? (
        <ScrollView contentContainerStyle={styles.detail}>
          <Pressable onPress={() => setSelected(null)} style={styles.backRow}>
            <Text style={[styles.backText, { color: theme.primary }]}>‹ Liste élèves</Text>
          </Pressable>
          <Text style={styles.studentName}>{studentDisplayName(selected)}</Text>
          <Text style={styles.metaLine}>
            {[selected.order_number, selected.class_name, selected.room_name]
              .filter(Boolean)
              .join(' · ')}
          </Text>

          <Text style={styles.sectionLabel}>Type</Text>
          <SegmentedControl options={PHOTO_KINDS} value={kind} onChange={setKind} />

          <View style={styles.actions}>
            <Button
              title={saving ? 'Envoi…' : 'Ajouter une photo'}
              onPress={startAddPhoto}
              disabled={saving}
            />
          </View>

          <Text style={styles.sectionLabel}>Photos ({photos.length})</Text>
          {loadingPhotos ? (
            <LoadingBlock label="Photos…" />
          ) : photos.length === 0 ? (
            <EmptyState title="Aucune photo" />
          ) : (
            <View style={styles.photoGrid}>
              {photos.map((p) => {
                const uri = getImageUrl(p.url);
                return (
                  <View key={p.id} style={styles.photoCard}>
                    {uri ? (
                      <Image source={{ uri }} style={styles.photo} />
                    ) : (
                      <View style={[styles.photo, styles.photoPlaceholder]}>
                        <Text style={styles.mutedSmall}>—</Text>
                      </View>
                    )}
                    <Text style={styles.photoKind}>{KIND_LABEL[p.kind] || p.kind}</Text>
                    <Pressable onPress={() => confirmDelete(p.id)}>
                      <Text style={styles.deleteLink}>Supprimer</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      ) : loadingList ? (
        <LoadingBlock label="Élèves…" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState title="Aucun élève" />
          }
          renderItem={({ item }) => {
            const thumb = getImageUrl(item.photo_identity_student);
            return (
              <Pressable style={styles.studentRow} onPress={() => setSelected(item)}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarEmpty]}>
                    <Text style={styles.avatarInitial}>
                      {(item.first_name?.[0] || '?').toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{studentDisplayName(item)}</Text>
                  <Text style={styles.mutedSmall}>
                    {[item.order_number, item.class_name, item.room_name]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          }}
        />
      )}

      <Modal
        visible={!!picker}
        animationType="slide"
        transparent
        onRequestClose={() => setPicker(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicker(null)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {picker === 'class' ? 'Classe' : 'Salle'}
              </Text>
              <Pressable onPress={() => setPicker(null)} hitSlop={12}>
                <Text style={styles.modalClose}>Fermer</Text>
              </Pressable>
            </View>
            <FlatList
              data={pickerItems}
              keyExtractor={(item, index) => item.id || `all-${index}`}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    if (picker === 'class') {
                      setClassId(item.id);
                      setRoomId('');
                    }
                    if (picker === 'room') setRoomId(item.id);
                    setPicker(null);
                  }}
                >
                  <Text style={styles.rowTitle}>{item.label}</Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function SelectChip({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20, paddingBottom: 8 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 10 },
  chip: {
    minWidth: '46%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  chipLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  chipValue: { fontSize: 14, color: colors.text, fontWeight: '700', marginTop: 2 },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarEmpty: {
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontWeight: '800', color: colors.textMuted },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  mutedSmall: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textMuted },
  detail: { paddingHorizontal: 20, paddingBottom: 48 },
  backRow: { marginBottom: 8 },
  backText: { fontWeight: '700', fontSize: 15 },
  studentName: { fontSize: 22, fontWeight: '800', color: colors.text },
  metaLine: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 8 },
  sectionLabel: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  actions: { gap: 8, marginTop: 12 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoCard: { width: '46%', flexGrow: 1 },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 10,
    backgroundColor: colors.bg,
  },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  photoKind: { marginTop: 6, fontWeight: '700', color: colors.text },
  deleteLink: { marginTop: 4, color: colors.danger, fontWeight: '600', fontSize: 13 },
  successBanner: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  successText: { color: '#065F46', fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(28,25,23,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '55%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  modalClose: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  modalRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
