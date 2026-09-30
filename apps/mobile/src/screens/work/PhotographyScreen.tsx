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
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Screen,
  SearchBar,
  Title,
} from '../../components/ui';
import { studentDisplayName } from '../../lib/format';
import { promptPickImage } from '../../lib/pickImage';
import { colors } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { isTeacherRole } from '../../lib/permissions';
import {
  addStudentPhoto,
  deleteStudentPhoto,
  getClasses,
  getImageUrl,
  getRooms,
  getStudents,
  getTeacherClasses,
  listStudentPhotos,
  listStudentsInTeacherRoom,
  uploadImage,
  type ClassItem,
  type RoomItem,
  type StudentListItem,
  type StudentPhoto,
} from '../../services/api';
import type { WorkStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';
import { listBottomPadding } from '../../lib/layout';

type Props = NativeStackScreenProps<WorkStackParamList, 'Photography'>;
type PickerKind = 'class' | 'room' | null;

const PHOTO_KINDS: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'profile', label: 'Profil', icon: 'person-outline' },
  { id: 'identity', label: 'Identité', icon: 'card-outline' },
  { id: 'souvenir', label: 'Souvenir', icon: 'images-outline' },
  { id: 'promotion', label: 'Promo', icon: 'ribbon-outline' },
  { id: 'other', label: 'Autre', icon: 'ellipsis-horizontal' },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  PHOTO_KINDS.map((k) => [k.id, k.label]),
);

function foldName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function placeLine(student: { class_name?: string | null; room_name?: string | null }) {
  return [student.class_name, student.room_name].filter(Boolean).join(' · ');
}

export function PhotographyScreen({}: Props) {
  const { roleName, user } = useAuth();
  const teacher = isTeacherRole(roleName);
  const teacherId = user?.id ?? user?.userId ?? null;
  const allowed = useCanAccess('photography') || teacher;
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
      if (teacher) {
        if (!teacherId) {
          setStudents([]);
          return;
        }
        const mine = await getTeacherClasses();
        const groups = await Promise.all(
          mine.map((item) => listStudentsInTeacherRoom(item.id, teacherId)),
        );
        const byId = new Map<string, StudentListItem>();
        for (const student of groups.flat()) byId.set(student.id, student);
        setStudents(
          [...byId.values()].sort(
            (a, b) =>
              a.last_name.localeCompare(b.last_name, 'fr', { sensitivity: 'base' }) ||
              a.first_name.localeCompare(b.first_name, 'fr', { sensitivity: 'base' }),
          ),
        );
        return;
      }
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
  }, [teacher, teacherId, classId, roomId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (teacher) {
          await loadStudents();
          return;
        }
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
    if (!boot && !teacher) void loadStudents();
  }, [boot, teacher, loadStudents]);

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
    const q = foldName(query.trim());
    if (!q) return students;
    return students.filter((student) =>
      foldName(`${student.first_name} ${student.last_name}`).includes(q),
    );
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

  const selectedPlace = selected ? placeLine(selected) : '';
  const selectedThumb = selected ? getImageUrl(selected.photo_identity_student) : null;

  return (
    <Screen style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={styles.top}>
        <Title>{teacher ? 'Photos' : 'Photographie'}</Title>

        {teacher ? null : (
          <View style={styles.filters}>
            <SelectChip label="Classe" value={classLabel} onPress={() => setPicker('class')} />
            <SelectChip label="Salle" value={roomLabel} onPress={() => setPicker('room')} />
          </View>
        )}

        <SearchBar value={query} onChangeText={setQuery} placeholder="Nom" />
        <ErrorBanner message={error} />
        {success ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#3F6212" />
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}
      </View>

      {selected ? (
        <ScrollView contentContainerStyle={styles.detail}>
          <Pressable onPress={() => setSelected(null)} style={styles.backRow} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
            <Text style={styles.backText}>Liste</Text>
          </Pressable>

          <View style={styles.hero}>
            {selectedThumb ? (
              <Image source={{ uri: selectedThumb }} style={styles.heroAvatar} />
            ) : (
              <View style={[styles.heroAvatar, styles.avatarEmpty]}>
                <Text style={styles.heroInitial}>
                  {(selected.first_name?.[0] || '?').toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.studentName}>{studentDisplayName(selected)}</Text>
              {selectedPlace ? <Text style={styles.placeLine}>{selectedPlace}</Text> : null}
            </View>
          </View>

          <Text style={styles.sectionLabel}>Type</Text>
          <View style={styles.kindRow}>
            {PHOTO_KINDS.map((item) => {
              const on = kind === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setKind(item.id)}
                  style={[
                    styles.kindChip,
                    on && { borderColor: theme.accent, backgroundColor: theme.accentTint },
                  ]}
                >
                  <Ionicons name={item.icon} size={16} color={on ? theme.accent : colors.inkSoft} />
                  <Text style={[styles.kindLabel, on && { color: theme.accent }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Button
            title={saving ? 'Envoi…' : 'Ajouter une photo'}
            icon="camera-outline"
            onPress={startAddPhoto}
            disabled={saving}
            style={styles.addBtn}
          />

          <Text style={styles.sectionLabel}>
            {photos.length === 0 ? 'Photos' : `Photos · ${photos.length}`}
          </Text>
          {loadingPhotos ? (
            <LoadingBlock label="Photos…" />
          ) : photos.length === 0 ? (
            <EmptyState title="Aucune photo" />
          ) : (
            <View style={styles.photoGrid}>
              {photos.map((photo) => {
                const uri = getImageUrl(photo.url);
                return (
                  <View key={photo.id} style={styles.photoCard}>
                    {uri ? (
                      <Image source={{ uri }} style={styles.photo} />
                    ) : (
                      <View style={[styles.photo, styles.photoPlaceholder]}>
                        <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={styles.photoFoot}>
                      <Text style={styles.photoKind}>{KIND_LABEL[photo.kind] || photo.kind}</Text>
                      <Pressable
                        onPress={() => confirmDelete(photo.id)}
                        hitSlop={8}
                        accessibilityLabel="Supprimer"
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      </Pressable>
                    </View>
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
            <EmptyState title={teacher ? 'Aucun élève dans votre salle' : 'Aucun élève'} />
          }
          renderItem={({ item }) => {
            const thumb = getImageUrl(item.photo_identity_student);
            const place = placeLine(item);
            return (
              <Pressable style={styles.studentCard} onPress={() => setSelected(item)}>
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
                  {place ? <Text style={styles.placeLine}>{place}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
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
              <Text style={styles.modalTitle}>{picker === 'class' ? 'Classe' : 'Salle'}</Text>
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
  top: { paddingHorizontal: 20, paddingBottom: 8, gap: 10 },
  filters: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  chipLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  chipValue: { fontSize: 15, color: colors.text, fontWeight: '700', marginTop: 2 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: listBottomPadding(16), gap: 10 },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatar: { width: 56, height: 56, borderRadius: 18 },
  avatarEmpty: {
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontWeight: '700', fontSize: 18, color: colors.inkSoft },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  placeLine: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  detail: { paddingHorizontal: 20, paddingBottom: listBottomPadding(24), gap: 4 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    marginBottom: 12,
    marginLeft: -4,
  },
  backText: { fontWeight: '600', fontSize: 16, color: colors.ink },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  heroAvatar: { width: 72, height: 72, borderRadius: 22 },
  heroInitial: { fontWeight: '700', fontSize: 26, color: colors.inkSoft },
  studentName: { fontSize: 22, fontWeight: '800', color: colors.text },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kindChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  kindLabel: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  addBtn: { marginTop: 16 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: colors.bg,
  },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  photoFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  photoKind: { fontWeight: '700', color: colors.text, fontSize: 14 },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#F3F7EA',
  },
  successText: { color: '#3F6212', fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(28,25,23,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '55%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
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
