import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Title,
} from '../../components/ui';
import { colors } from '../../theme/tokens';
import {
  addTeacherClassSubject,
  getClassSubjects,
  getClasses,
  getRooms,
  getTeacherDetail,
  getTeachers,
  listSubjects,
  listUsers,
  removeTeacherClassSubject,
  setUserRole,
  type ClassItem,
  type OrgUser,
  type RoomItem,
  type SubjectOrg,
  type TeacherDetail,
  type TeacherItem,
} from '../../services/api';
import type { MoreStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<MoreStackParamList, 'OrgTeachers'>;
type PickerKind = 'promote' | 'class' | 'subject' | 'room' | null;

function teacherName(t: TeacherItem | TeacherDetail | OrgUser): string {
  return [t.first_name, t.last_name].filter(Boolean).join(' ') || t.email || `#${t.id}`;
}

export function OrgTeachersScreen({}: Props) {
  const allowed = useCanAccess('teachers');
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectOrg[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [selected, setSelected] = useState<TeacherDetail | null>(null);
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [promoteUserId, setPromoteUserId] = useState('');
  const [aClassId, setAClassId] = useState('');
  const [aSubjectId, setASubjectId] = useState('');
  const [aRoomId, setARoomId] = useState('');
  const [classSubjects, setClassSubjects] = useState<SubjectOrg[]>([]);

  const nonTeachers = useMemo(
    () => users.filter((u) => (u.role || '').toUpperCase() !== 'TEACHER'),
    [users],
  );

  const load = useCallback(async () => {
    const [t, c, s, r, u] = await Promise.all([
      getTeachers(),
      getClasses(),
      listSubjects(),
      getRooms(),
      listUsers(),
    ]);
    setTeachers(t);
    setClasses(c);
    setSubjects(s);
    setRooms(r);
    setUsers(u);
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    setSelected(await getTeacherDetail(id));
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

  useEffect(() => {
    if (!aClassId) {
      setClassSubjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await getClassSubjects(aClassId);
        if (!cancelled) setClassSubjects(list as SubjectOrg[]);
      } catch {
        if (!cancelled) setClassSubjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aClassId]);

  async function promote() {
    if (!promoteUserId) return;
    setSaving(true);
    setError('');
    try {
      await setUserRole(Number(promoteUserId), 'TEACHER');
      setPromoteOpen(false);
      setPromoteUserId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignment() {
    if (!selected || !aClassId || !aSubjectId || !aRoomId) {
      setError('Classe, matière et salle requises.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addTeacherClassSubject(selected.id, {
        class_id: aClassId,
        subject_id: aSubjectId,
        room_id: aRoomId,
      });
      setAssignOpen(false);
      setAClassId('');
      setASubjectId('');
      setARoomId('');
      await loadDetail(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function confirmRemove(assignmentId: string) {
    if (!selected) return;
    Alert.alert('Supprimer', 'Retirer cette assignation ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await removeTeacherClassSubject(selected.id, assignmentId);
              await loadDetail(selected.id);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur');
            }
          })(),
      },
    ]);
  }

  const pickerItems = useMemo(() => {
    if (picker === 'promote') {
      return nonTeachers.map((u) => ({ id: String(u.id), label: teacherName(u) }));
    }
    if (picker === 'class') return classes.map((c) => ({ id: c.id, label: c.name }));
    if (picker === 'subject') {
      const src = classSubjects.length ? classSubjects : subjects;
      return src.map((s) => ({ id: s.id, label: s.name }));
    }
    if (picker === 'room') {
      const filtered = aClassId
        ? rooms.filter((r) => !r.class_id || r.class_id === aClassId)
        : rooms;
      return (filtered.length ? filtered : rooms).map((r) => ({ id: r.id, label: r.name }));
    }
    return [];
  }, [picker, nonTeachers, classes, classSubjects, subjects, rooms, aClassId]);

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
      {selected ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable onPress={() => setSelected(null)}>
            <Text style={styles.back}>‹ Liste professeurs</Text>
          </Pressable>
          <Title>{teacherName(selected)}</Title>
          <Muted>{selected.email}</Muted>
          <ErrorBanner message={error} />

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Assignations</Text>
            <Button
              title="Ajouter"
              variant="ghost"
              onPress={() => {
                setAClassId('');
                setASubjectId('');
                setARoomId('');
                setAssignOpen(true);
              }}
            />
          </View>
          {(selected.class_subjects || []).length === 0 ? (
            <EmptyState title="Aucune assignation" />
          ) : (
            (selected.class_subjects || []).map((a) => (
              <View key={a.id} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {a.subject_name || 'Matière'} · {a.class_name || 'Classe'}
                </Text>
                <Muted>{a.room_name || 'Salle'}</Muted>
                <Pressable onPress={() => confirmRemove(a.id)}>
                  <Text style={styles.danger}>Retirer</Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <>
          <View style={styles.top}>
            <Title>Professeurs</Title>
            <Button title="Promouvoir un utilisateur" onPress={() => setPromoteOpen(true)} />
            <ErrorBanner message={error} />
          </View>
          <FlatList
            data={teachers}
            keyExtractor={(i) => String(i.id)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<EmptyState title="Aucun professeur" />}
            renderItem={({ item }) => (
              <Pressable
                style={styles.card}
                onPress={() => void loadDetail(item.id).then(() => undefined)}
              >
                <Text style={styles.cardTitle}>{teacherName(item)}</Text>
                <Muted>{item.email}</Muted>
              </Pressable>
            )}
          />
        </>
      )}

      <Modal visible={promoteOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Promouvoir en TEACHER</Text>
            <Pressable style={styles.chip} onPress={() => setPicker('promote')}>
              <Text style={styles.chipLabel}>Utilisateur</Text>
              <Text style={styles.chipValue}>
                {promoteUserId
                  ? teacherName(
                      nonTeachers.find((u) => String(u.id) === promoteUserId) || {
                        id: 0,
                        email: promoteUserId,
                      },
                    )
                  : 'Choisir'}
              </Text>
            </Pressable>
            <Button
              title={saving ? '…' : 'Promouvoir'}
              onPress={() => void promote()}
              disabled={saving || !promoteUserId}
            />
            <Button title="Annuler" variant="ghost" onPress={() => setPromoteOpen(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={assignOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Nouvelle assignation</Text>
            <Pressable style={styles.chip} onPress={() => setPicker('class')}>
              <Text style={styles.chipLabel}>Classe</Text>
              <Text style={styles.chipValue}>
                {classes.find((c) => c.id === aClassId)?.name || 'Choisir'}
              </Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => setPicker('subject')}>
              <Text style={styles.chipLabel}>Matière</Text>
              <Text style={styles.chipValue}>
                {(classSubjects.length ? classSubjects : subjects).find(
                  (s) => s.id === aSubjectId,
                )?.name || 'Choisir'}
              </Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => setPicker('room')}>
              <Text style={styles.chipLabel}>Salle</Text>
              <Text style={styles.chipValue}>
                {rooms.find((r) => r.id === aRoomId)?.name || 'Choisir'}
              </Text>
            </Pressable>
            <ErrorBanner message={error} />
            <Button
              title={saving ? '…' : 'Enregistrer'}
              onPress={() => void saveAssignment()}
              disabled={saving}
            />
            <Button title="Annuler" variant="ghost" onPress={() => setAssignOpen(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!picker} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <FlatList
              data={pickerItems}
              keyExtractor={(i) => i.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.pickRow}
                  onPress={() => {
                    if (picker === 'promote') setPromoteUserId(item.id);
                    if (picker === 'class') {
                      setAClassId(item.id);
                      setASubjectId('');
                    }
                    if (picker === 'subject') setASubjectId(item.id);
                    if (picker === 'room') setARoomId(item.id);
                    setPicker(null);
                  }}
                >
                  <Text style={styles.cardTitle}>{item.label}</Text>
                </Pressable>
              )}
            />
            <Button title="Fermer" variant="ghost" onPress={() => setPicker(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  list: { paddingHorizontal: 20, paddingBottom: 48 },
  back: { color: colors.primaryFallback, fontWeight: '700', marginBottom: 8 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  card: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  danger: { marginTop: 8, color: colors.danger, fontWeight: '700' },
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
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
  },
  chipLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  chipValue: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2 },
  pickRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
