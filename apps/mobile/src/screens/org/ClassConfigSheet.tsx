import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Button,
  ErrorBanner,
  PasswordField,
  TextField,
} from '../../components/ui';
import { colors } from '../../theme/tokens';
import { promptPickImage } from '../../lib/pickImage';
import {
  EDUCATION_LEVELS,
  educationLevelLabel,
  isHomeroomCycle,
  learnerNoun,
  learnerNounCap,
} from '../../lib/educationLevels';
import {
  addTeacherClassSubject,
  createClass,
  createRoom,
  createSubject,
  createTeacher,
  deleteRoom,
  getClassDetail,
  getImageUrl,
  getRooms,
  getStudents,
  getTeachers,
  listSubjects,
  listTeacherAssignments,
  promoteToTeacher,
  removeTeacherClassSubject,
  searchStaffTeachers,
  updateClass,
  updateRoom,
  uploadImage,
  type ClassOrg,
  type RoomItem,
  type StudentListItem,
  type SubjectOrg,
  type TeacherAssignment,
  type TeacherItem,
} from '../../services/api';

type TeacherSource = 'pick' | 'search' | 'create';

function personName(p: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string;
}): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || '—';
}

function Avatar({
  photo,
  name,
  size = 36,
  kind = 'teacher',
}: {
  photo?: string | null;
  name: string;
  size?: number;
  kind?: 'teacher' | 'student';
}) {
  const uri = getImageUrl(photo ?? undefined);
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const bg = kind === 'teacher' ? '#F0FDFA' : '#FFFBEB';
  const fg = kind === 'teacher' ? '#0F766E' : '#92400E';
  const ring = kind === 'teacher' ? '#0F766E' : '#F59E0B';
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: ring,
          backgroundColor: '#fff',
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        borderWidth: 2,
        borderColor: ring,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.32, fontWeight: '700', color: fg }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

function Chip({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Panel({
  kicker,
  title,
  tone = 'white',
  children,
}: {
  kicker?: string;
  title: string;
  tone?: 'white' | 'slate' | 'teal' | 'amber';
  children: ReactNode;
}) {
  const wrap =
    tone === 'slate'
      ? styles.panelSlate
      : tone === 'teal'
        ? styles.panelTeal
        : tone === 'amber'
          ? styles.panelAmber
          : styles.panelWhite;
  const kick =
    tone === 'teal' ? styles.kickerTeal : tone === 'amber' ? styles.kickerAmber : styles.kicker;
  return (
    <View style={[styles.panel, wrap]}>
      {kicker ? <Text style={kick}>{kicker}</Text> : null}
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function ClassConfigSheet({
  initial,
  onClose,
  onSaved,
}: {
  initial: ClassOrg | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = initial === 'new';
  const [classId, setClassId] = useState(isNew ? '' : initial.id);
  const [name, setName] = useState(isNew ? '' : initial.name);
  const [description, setDescription] = useState(isNew ? '' : initial.description ?? '');
  const [level, setLevel] = useState(isNew ? '' : initial.level ?? '');
  const [levelPicker, setLevelPicker] = useState(false);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<SubjectOrg[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [classStudents, setClassStudents] = useState<StudentListItem[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomStudents, setRoomStudents] = useState<StudentListItem[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [addingSubject, setAddingSubject] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomCapacity, setRoomCapacity] = useState('');
  const [addingRoom, setAddingRoom] = useState(false);
  const [editRoomName, setEditRoomName] = useState('');
  const [editRoomCapacity, setEditRoomCapacity] = useState('');
  const [savingRoom, setSavingRoom] = useState(false);
  const [teacherSource, setTeacherSource] = useState<TeacherSource | null>(null);
  const [pickedTeacherId, setPickedTeacherId] = useState('');
  const [staffQuery, setStaffQuery] = useState('');
  const [staffHits, setStaffHits] = useState<TeacherItem[]>([]);
  const [createFirst, setCreateFirst] = useState('');
  const [createLast, setCreateLast] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createPhoto, setCreatePhoto] = useState<string | null>(null);
  const [assignSubjectIds, setAssignSubjectIds] = useState<string[]>([]);
  const [editTeacherId, setEditTeacherId] = useState<number | null>(null);
  const [editSubjectIds, setEditSubjectIds] = useState<string[]>([]);
  const [savingTeacherSubjects, setSavingTeacherSubjects] = useState(false);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;
  const homeroom = isHomeroomCycle(level);
  const classSubjects = subjects.filter((s) => subjectIds.includes(s.id));

  const roomTeachers = useMemo(() => {
    const map = new Map<number, { teacher: TeacherItem; subjects: TeacherAssignment[] }>();
    for (const a of assignments) {
      if (!selectedRoomId || a.room_id !== selectedRoomId) continue;
      const existing = map.get(a.teacher_id);
      const stub: TeacherItem = {
        id: a.teacher_id,
        first_name: a.teacher_name,
        last_name: '',
        email: '',
        profile_photo_url: a.teacher_photo_url,
      };
      if (existing) existing.subjects.push(a);
      else map.set(a.teacher_id, { teacher: stub, subjects: [a] });
    }
    for (const t of teachers) {
      const row = map.get(t.id);
      if (row) row.teacher = t;
    }
    return [...map.values()];
  }, [assignments, selectedRoomId, teachers]);

  async function loadCatalog() {
    const [s, t] = await Promise.all([listSubjects(), getTeachers()]);
    setSubjects(s);
    setTeachers(t);
  }

  async function loadClass(id: string) {
    const [cls, r, a, st] = await Promise.all([
      getClassDetail(id),
      getRooms(id),
      listTeacherAssignments({ class_id: id }),
      getStudents({ class_id: id }),
    ]);
    if (cls) {
      setName(cls.name ?? '');
      setDescription(cls.description ?? '');
      setLevel(cls.level ?? '');
      setSubjectIds(cls.subject_ids ?? []);
    }
    setRooms(r);
    setAssignments(a);
    setClassStudents(st);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadCatalog();
        if (!isNew && !cancelled) await loadClass(initial.id);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur de chargement');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedRoom) return;
    setEditRoomName(selectedRoom.name);
    setEditRoomCapacity(selectedRoom.capacity != null ? String(selectedRoom.capacity) : '');
  }, [selectedRoom?.id, selectedRoom?.name, selectedRoom?.capacity]);

  useEffect(() => {
    setEditTeacherId(null);
    if (!selectedRoomId) {
      setRoomStudents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await getStudents({ room_id: selectedRoomId });
        if (!cancelled) setRoomStudents(list);
      } catch {
        if (!cancelled) setRoomStudents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRoomId]);

  useEffect(() => {
    if (teacherSource !== 'search') return;
    const t = setTimeout(() => {
      void (async () => {
        try {
          setStaffHits(await searchStaffTeachers(staffQuery));
        } catch {
          setStaffHits([]);
        }
      })();
    }, 250);
    return () => clearTimeout(t);
  }, [staffQuery, teacherSource]);

  useEffect(() => {
    if (!teacherSource || !selectedRoomId) return;
    const available = subjects.filter((s) => subjectIds.includes(s.id));
    setAssignSubjectIds(homeroom ? available.map((s) => s.id) : []);
  }, [teacherSource, selectedRoomId, homeroom, subjectIds, subjects]);

  async function persistSubjects(ids: string[]) {
    if (!classId) return;
    try {
      await updateClass(classId, {
        name: name.trim(),
        description: description.trim() || undefined,
        level: level || undefined,
        subject_ids: ids,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  function toggleSubject(id: string) {
    const next = subjectIds.includes(id) ? subjectIds.filter((x) => x !== id) : [...subjectIds, id];
    setSubjectIds(next);
    if (classId) void persistSubjects(next);
  }

  async function saveClass() {
    if (!name.trim() || !level) {
      setError('Nom et niveau requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        level: level || undefined,
        subject_ids: subjectIds,
      };
      if (classId) {
        await updateClass(classId, body);
      } else {
        const created = await createClass(body);
        setClassId(created.id);
        await loadClass(created.id);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function addSubject() {
    if (!newSubjectName.trim()) return;
    setAddingSubject(true);
    setError('');
    try {
      const created = await createSubject({ name: newSubjectName.trim() });
      setSubjects((prev) => [...prev, created]);
      const next = [...subjectIds, created.id];
      setSubjectIds(next);
      if (classId) await persistSubjects(next);
      setNewSubjectName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setAddingSubject(false);
    }
  }

  async function addRoom() {
    if (!classId) {
      setError('Enregistrez d’abord la classe avant d’ajouter une salle.');
      return;
    }
    if (!roomName.trim()) return;
    setAddingRoom(true);
    setError('');
    try {
      const created = await createRoom({
        name: roomName.trim(),
        class_id: classId,
        capacity: roomCapacity.trim() ? parseInt(roomCapacity.trim(), 10) : null,
      });
      setRoomName('');
      setRoomCapacity('');
      await loadClass(classId);
      if (created.id) setSelectedRoomId(created.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setAddingRoom(false);
    }
  }

  async function saveRoom() {
    if (!selectedRoom || !editRoomName.trim()) return;
    setSavingRoom(true);
    setError('');
    try {
      await updateRoom(selectedRoom.id, {
        name: editRoomName.trim(),
        class_id: classId,
        capacity: editRoomCapacity.trim() ? parseInt(editRoomCapacity.trim(), 10) : null,
      });
      await loadClass(classId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingRoom(false);
    }
  }

  function confirmDeleteRoom() {
    if (!selectedRoom) return;
    Alert.alert('Supprimer', 'Supprimer cette salle ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await deleteRoom(selectedRoom.id);
              setSelectedRoomId(null);
              await loadClass(classId);
              onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur');
            }
          })(),
      },
    ]);
  }

  async function resolveTeacherId(): Promise<number | null> {
    if (teacherSource === 'pick') {
      return pickedTeacherId ? Number(pickedTeacherId) : null;
    }
    if (teacherSource === 'search') {
      if (!pickedTeacherId) return null;
      const t = await promoteToTeacher(Number(pickedTeacherId));
      return t.id;
    }
    if (teacherSource === 'create') {
      if (!createEmail.trim() || !createPassword) return null;
      const t = await createTeacher({
        first_name: createFirst.trim() || undefined,
        last_name: createLast.trim() || undefined,
        email: createEmail.trim(),
        phone: createPhone.trim() || undefined,
        password: createPassword,
        profile_photo_url: createPhoto || undefined,
      });
      return t.id;
    }
    return null;
  }

  async function addTeacher() {
    if (!classId || !selectedRoomId || assignSubjectIds.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const teacherId = await resolveTeacherId();
      if (!teacherId) throw new Error('Choisissez ou créez un professeur.');
      await addTeacherClassSubject(teacherId, {
        class_id: classId,
        room_id: selectedRoomId,
        subject_ids: assignSubjectIds,
      });
      setTeacherSource(null);
      setPickedTeacherId('');
      setStaffQuery('');
      setCreateFirst('');
      setCreateLast('');
      setCreateEmail('');
      setCreatePhone('');
      setCreatePassword('');
      setCreatePhoto(null);
      await Promise.all([loadCatalog(), loadClass(classId)]);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function confirmRemoveTeacher(teacherId: number) {
    Alert.alert('Retirer', 'Retirer ce professeur de la salle ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              const toRemove = assignments.filter(
                (a) => a.teacher_id === teacherId && a.room_id === selectedRoomId,
              );
              for (const a of toRemove) {
                await removeTeacherClassSubject(teacherId, a.id);
              }
              if (editTeacherId === teacherId) setEditTeacherId(null);
              await loadClass(classId);
              onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur');
            }
          })(),
      },
    ]);
  }

  function startEditTeacher(teacherId: number, taught: TeacherAssignment[]) {
    setTeacherSource(null);
    setEditTeacherId(teacherId);
    setEditSubjectIds(taught.map((a) => a.subject_id));
  }

  async function saveTeacherSubjects() {
    if (!editTeacherId || !classId || !selectedRoomId || editSubjectIds.length === 0) return;
    const current = assignments.filter(
      (a) => a.teacher_id === editTeacherId && a.room_id === selectedRoomId,
    );
    const currentIds = current.map((a) => a.subject_id);
    const toAdd = editSubjectIds.filter((id) => !currentIds.includes(id));
    const toRemove = current.filter((a) => !editSubjectIds.includes(a.subject_id));
    setSavingTeacherSubjects(true);
    setError('');
    try {
      if (toAdd.length > 0) {
        await addTeacherClassSubject(editTeacherId, {
          class_id: classId,
          room_id: selectedRoomId,
          subject_ids: toAdd,
        });
      }
      for (const a of toRemove) {
        await removeTeacherClassSubject(editTeacherId, a.id);
      }
      setEditTeacherId(null);
      await loadClass(classId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingTeacherSubjects(false);
    }
  }

  function pickTeacherPhoto() {
    promptPickImage((img) => {
      void (async () => {
        try {
          const url = await uploadImage(img.uri, {
            mimeType: img.mimeType || undefined,
            fileName: img.fileName || undefined,
          });
          setCreatePhoto(url);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Upload impossible');
        }
      })();
    });
  }

  return (
    <View>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kickerTeal}>Fiche de classe</Text>
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {classId ? name || 'Classe' : 'Nouvelle classe'}
          </Text>
          {level ? <Text style={styles.muted}>{educationLevelLabel(level)}</Text> : null}
        </View>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.close}>Fermer</Text>
        </Pressable>
      </View>
      <ErrorBanner message={error} />

      <Panel kicker="Identité" title="La classe">
        <View style={styles.compact}>
          <TextField label="Nom *" value={name} onChangeText={setName} placeholder="ex. 1ère AF" />
        </View>
        <Pressable style={styles.select} onPress={() => setLevelPicker(true)}>
          <Text style={styles.selectLabel}>Niveau *</Text>
          <Text style={styles.selectValue}>{level ? educationLevelLabel(level) : 'Choisir…'}</Text>
        </Pressable>
        <View style={styles.compactWide}>
          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Optionnel"
          />
        </View>
        <Button
          title={saving ? '…' : classId ? 'Enregistrer' : 'Créer la classe'}
          onPress={() => void saveClass()}
          disabled={saving}
        />
      </Panel>

      <Panel kicker="Programme" title="Matières" tone="slate">
        {subjects.length > 0 ? (
          <Pressable
            onPress={() => {
              const next =
                subjectIds.length === subjects.length ? [] : subjects.map((s) => s.id);
              setSubjectIds(next);
              if (classId) void persistSubjects(next);
            }}
            style={styles.tout}
          >
            <Text style={styles.toutText}>
              {subjectIds.length === subjects.length ? 'Tout décocher' : 'Tout cocher'}
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.chipWrap}>
          {subjects.length === 0 ? (
            <Text style={styles.muted}>Aucune matière. Ajoutez-en ci-dessous.</Text>
          ) : (
            subjects.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                on={subjectIds.includes(s.id)}
                onPress={() => toggleSubject(s.id)}
              />
            ))
          )}
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Nouvelle matière"
              value={newSubjectName}
              onChangeText={setNewSubjectName}
            />
          </View>
          <Button
            title={addingSubject ? '…' : 'Ajouter'}
            variant="ghost"
            onPress={() => void addSubject()}
            disabled={addingSubject || !newSubjectName.trim()}
          />
        </View>
      </Panel>

      <Panel
        kicker="Organisation"
        title={classId ? `Salles · ${rooms.length}` : 'Salles'}
        tone="teal"
      >
        {!classId ? (
          <Text style={styles.muted}>Créez la classe, puis ajoutez des salles ici.</Text>
        ) : (
          <>
            {rooms.length === 0 ? (
              <Text style={[styles.muted, { marginBottom: 8 }]}>Aucune salle.</Text>
            ) : (
              rooms.map((room) => {
                const teacherPreviews = assignments
                  .filter((a) => a.room_id === room.id)
                  .reduce<{ key: string; name: string; photo?: string | null }[]>((acc, a) => {
                    if (!acc.some((x) => x.key === String(a.teacher_id))) {
                      acc.push({
                        key: String(a.teacher_id),
                        name: a.teacher_name,
                        photo: a.teacher_photo_url,
                      });
                    }
                    return acc;
                  }, []);
                const studentPreviews = classStudents
                  .filter((s) => s.room_id === room.id)
                  .map((s) => ({
                    key: s.id,
                    name: `${s.first_name} ${s.last_name}`,
                    photo: s.photo_identity_student,
                  }));
                const selected = selectedRoomId === room.id;
                return (
                  <Pressable
                    key={room.id}
                    onPress={() =>
                      setSelectedRoomId((id) => (id === room.id ? null : room.id))
                    }
                    style={[styles.roomCard, selected && styles.roomCardOn]}
                  >
                    <View style={styles.roomHead}>
                      <Text style={styles.roomTitle}>Salle {room.name}</Text>
                      <Text style={styles.muted}>
                        {room.capacity != null ? `max ${room.capacity}` : 'illimitée'}
                      </Text>
                    </View>
                    <View style={styles.previewTeal}>
                      <Text style={styles.previewTealLabel}>
                        Professeurs · {teacherPreviews.length}
                      </Text>
                      {teacherPreviews.length === 0 ? (
                        <Text style={styles.previewEmpty}>Aucun professeur</Text>
                      ) : (
                        <View style={styles.avatarRow}>
                          {teacherPreviews.slice(0, 5).map((p, i) => (
                            <View key={p.key} style={i > 0 ? { marginLeft: -8 } : undefined}>
                              <Avatar photo={p.photo} name={p.name} size={28} />
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    <View style={styles.previewAmber}>
                      <Text style={styles.previewAmberLabel}>
                        {learnerNounCap(level, true)} · {studentPreviews.length}
                      </Text>
                      {studentPreviews.length === 0 ? (
                        <Text style={styles.previewEmpty}>
                          Aucun {learnerNoun(level)}
                        </Text>
                      ) : (
                        <View style={styles.avatarRow}>
                          {studentPreviews.slice(0, 5).map((p, i) => (
                            <View key={p.key} style={i > 0 ? { marginLeft: -8 } : undefined}>
                              <Avatar
                                photo={p.photo}
                                name={p.name}
                                size={28}
                                kind="student"
                              />
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })
            )}
            <View style={styles.addRoom}>
              <View style={styles.compactSm}>
                <TextField label="Nom" value={roomName} onChangeText={setRoomName} placeholder="1" />
              </View>
              <View style={styles.compactCap}>
                <TextField
                  label="Limite"
                  value={roomCapacity}
                  onChangeText={setRoomCapacity}
                  keyboardType="number-pad"
                  placeholder="—"
                />
              </View>
              <Button
                title={addingRoom ? '…' : 'Ajouter'}
                onPress={() => void addRoom()}
                disabled={addingRoom || !roomName.trim()}
              />
            </View>
          </>
        )}
      </Panel>

      {selectedRoom ? (
        <Panel kicker="Salle sélectionnée" title={`Salle ${selectedRoom.name}`} tone="white">
          <View style={styles.actions}>
            <Pressable onPress={() => setSelectedRoomId(null)}>
              <Text style={styles.link}>Replier</Text>
            </Pressable>
            <Pressable onPress={confirmDeleteRoom}>
              <Text style={styles.danger}>Supprimer</Text>
            </Pressable>
          </View>
          <View style={styles.addRoom}>
            <View style={styles.compactSm}>
              <TextField label="Nom" value={editRoomName} onChangeText={setEditRoomName} />
            </View>
            <View style={styles.compactCap}>
              <TextField
                label="Limite"
                value={editRoomCapacity}
                onChangeText={setEditRoomCapacity}
                keyboardType="number-pad"
                placeholder="∞"
              />
            </View>
            <Button
              title={savingRoom ? '…' : 'Enregistrer'}
              onPress={() => void saveRoom()}
              disabled={savingRoom || !editRoomName.trim()}
            />
          </View>

          <View style={styles.blockTeal}>
            <View style={styles.blockHead}>
              <Text style={styles.blockTealTitle}>Professeurs</Text>
              {teacherSource == null && editTeacherId == null ? (
                <Pressable
                  onPress={() => {
                    setEditTeacherId(null);
                    setTeacherSource('pick');
                  }}
                >
                  <Text style={styles.link}>+ Ajouter</Text>
                </Pressable>
              ) : null}
            </View>
            {roomTeachers.length === 0 && teacherSource == null ? (
              <Text style={styles.muted}>Aucun professeur dans cette salle.</Text>
            ) : (
              roomTeachers.map(({ teacher, subjects: taught }) => {
                const editing = editTeacherId === teacher.id;
                const label =
                  personName(teacher) !== '—' ? personName(teacher) : taught[0]?.teacher_name;
                return (
                  <View key={teacher.id} style={styles.teacherCard}>
                    <Avatar
                      photo={teacher.profile_photo_url}
                      name={label || ''}
                      size={44}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.teacherName}>{label}</Text>
                      {teacher.email ? (
                        <Text style={styles.muted} numberOfLines={1}>
                          {teacher.email}
                        </Text>
                      ) : null}
                      {editing ? (
                        <View style={{ marginTop: 8 }}>
                          <View style={styles.chipWrap}>
                            {classSubjects.map((s) => (
                              <Chip
                                key={s.id}
                                label={s.name}
                                on={editSubjectIds.includes(s.id)}
                                onPress={() =>
                                  setEditSubjectIds((prev) =>
                                    prev.includes(s.id)
                                      ? prev.filter((x) => x !== s.id)
                                      : [...prev, s.id],
                                  )
                                }
                              />
                            ))}
                          </View>
                          <View style={styles.actions}>
                            <Pressable
                              onPress={() => void saveTeacherSubjects()}
                              disabled={savingTeacherSubjects || editSubjectIds.length === 0}
                            >
                              <Text style={styles.link}>
                                {savingTeacherSubjects ? '…' : 'Enregistrer'}
                              </Text>
                            </Pressable>
                            <Pressable onPress={() => setEditTeacherId(null)}>
                              <Text style={styles.muted}>Annuler</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : (
                        <View style={[styles.chipWrap, { marginTop: 6 }]}>
                          {taught.map((a) => (
                            <View key={a.id} style={styles.subjectPill}>
                              <Text style={styles.subjectPillText}>{a.subject_name}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      {!editing ? (
                        <Pressable onPress={() => startEditTeacher(teacher.id, taught)}>
                          <Text style={styles.link}>Modifier</Text>
                        </Pressable>
                      ) : null}
                      <Pressable onPress={() => confirmRemoveTeacher(teacher.id)}>
                        <Text style={styles.danger}>Retirer</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}

            {teacherSource ? (
              <View style={styles.addTeacher}>
                <View style={styles.seg}>
                  {(['pick', 'search', 'create'] as TeacherSource[]).map((src) => (
                    <Pressable
                      key={src}
                      onPress={() => {
                        setTeacherSource(src);
                        setPickedTeacherId('');
                      }}
                      style={[styles.segItem, teacherSource === src && styles.segOn]}
                    >
                      <Text style={[styles.segText, teacherSource === src && styles.segTextOn]}>
                        {src === 'pick' ? 'Professeurs' : src === 'search' ? 'Utilisateur' : 'Nouveau'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {teacherSource === 'pick'
                  ? teachers.map((t) => {
                      const on = pickedTeacherId === String(t.id);
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => setPickedTeacherId(String(t.id))}
                          style={[styles.pickRow, on && styles.pickRowOn]}
                        >
                          <Avatar photo={t.profile_photo_url} name={personName(t)} size={32} />
                          <Text style={styles.teacherName}>{personName(t)}</Text>
                        </Pressable>
                      );
                    })
                  : null}

                {teacherSource === 'search' ? (
                  <>
                    <TextField
                      label="Recherche"
                      value={staffQuery}
                      onChangeText={setStaffQuery}
                      placeholder="Nom, email, téléphone…"
                    />
                    {staffHits.map((u) => {
                      const on = pickedTeacherId === String(u.id);
                      return (
                        <Pressable
                          key={u.id}
                          onPress={() => setPickedTeacherId(String(u.id))}
                          style={[styles.pickRow, on && styles.pickRowOn]}
                        >
                          <Avatar photo={u.profile_photo_url} name={personName(u)} size={32} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.teacherName}>{personName(u)}</Text>
                            <Text style={styles.muted} numberOfLines={1}>
                              {u.email}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </>
                ) : null}

                {teacherSource === 'create' ? (
                  <>
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <TextField label="Prénom" value={createFirst} onChangeText={setCreateFirst} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <TextField label="Nom" value={createLast} onChangeText={setCreateLast} />
                      </View>
                    </View>
                    <TextField
                      label="Email *"
                      value={createEmail}
                      onChangeText={setCreateEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                    <TextField label="Téléphone" value={createPhone} onChangeText={setCreatePhone} />
                    <PasswordField
                      label="Mot de passe *"
                      value={createPassword}
                      onChangeText={setCreatePassword}
                    />
                    <Pressable onPress={pickTeacherPhoto} style={styles.photoBtn}>
                      {createPhoto ? (
                        <Image
                          source={{ uri: getImageUrl(createPhoto) || createPhoto }}
                          style={styles.photoPreview}
                        />
                      ) : null}
                      <Text style={styles.link}>
                        {createPhoto ? 'Changer la photo' : 'Photo du professeur'}
                      </Text>
                    </Pressable>
                  </>
                ) : null}

                <Text style={styles.subLabel}>Matières</Text>
                {classSubjects.length === 0 ? (
                  <Text style={styles.warn}>Cochez d’abord les matières de la classe.</Text>
                ) : (
                  <View style={styles.chipWrap}>
                    {classSubjects.map((s) => (
                      <Chip
                        key={s.id}
                        label={s.name}
                        on={assignSubjectIds.includes(s.id)}
                        onPress={() =>
                          setAssignSubjectIds((prev) =>
                            prev.includes(s.id)
                              ? prev.filter((x) => x !== s.id)
                              : [...prev, s.id],
                          )
                        }
                      />
                    ))}
                  </View>
                )}
                <Button
                  title={saving ? '…' : 'Ajouter à la salle'}
                  onPress={() => void addTeacher()}
                  disabled={saving || assignSubjectIds.length === 0}
                />
                <Button
                  title="Annuler"
                  variant="ghost"
                  onPress={() => {
                    setTeacherSource(null);
                    setPickedTeacherId('');
                  }}
                />
              </View>
            ) : null}
          </View>

          <View style={styles.blockAmber}>
            <Text style={styles.blockAmberTitle}>{learnerNounCap(level, true)}</Text>
            {roomStudents.length === 0 ? (
              <Text style={styles.muted}>
                Aucun {learnerNoun(level)} assigné à cette salle.
              </Text>
            ) : (
              roomStudents.map((s) => (
                <View key={s.id} style={styles.studentRow}>
                  <Avatar
                    photo={s.photo_identity_student}
                    name={`${s.first_name} ${s.last_name}`}
                    size={32}
                    kind="student"
                  />
                  <Text style={styles.teacherName} numberOfLines={1}>
                    {s.last_name} {s.first_name}
                  </Text>
                </View>
              ))
            )}
          </View>
        </Panel>
      ) : null}

      <Modal visible={levelPicker} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setLevelPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            {EDUCATION_LEVELS.map((l) => (
              <Pressable
                key={l.key}
                style={styles.pickRow}
                onPress={() => {
                  setLevel(l.key);
                  setLevelPicker(false);
                }}
              >
                <Text style={styles.teacherName}>{l.label}</Text>
              </Pressable>
            ))}
            <Button title="Fermer" variant="ghost" onPress={() => setLevelPicker(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  close: { color: colors.inkSoft, fontWeight: '700', marginTop: 4 },
  muted: { fontSize: 13, color: colors.textMuted },
  kicker: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 2,
  },
  kickerTeal: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: '#0F766E',
    marginBottom: 2,
  },
  kickerAmber: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: '#92400E',
    marginBottom: 2,
  },
  panel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 12,
  },
  panelWhite: { backgroundColor: '#fff', borderColor: colors.border },
  panelSlate: { backgroundColor: '#F8FAFC', borderColor: colors.border },
  panelTeal: { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' },
  panelAmber: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  panelTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 },
  compact: { alignSelf: 'flex-start', width: 176, maxWidth: '100%' },
  compactWide: { alignSelf: 'flex-start', width: 240, maxWidth: '100%' },
  compactSm: { width: 88 },
  compactCap: { width: 72 },
  select: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    alignSelf: 'flex-start',
    minWidth: 200,
    backgroundColor: '#fff',
  },
  selectLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  selectValue: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2 },
  tout: { alignSelf: 'flex-end', marginBottom: 8 },
  toutText: { fontSize: 12, fontWeight: '700', color: colors.inkSoft },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text },
  chipTextOn: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  roomCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roomCardOn: { borderColor: '#0F766E', borderWidth: 2 },
  roomHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  roomTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  previewTeal: {
    marginTop: 8,
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    padding: 8,
  },
  previewAmber: {
    marginTop: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 8,
  },
  previewTealLabel: { fontSize: 10, fontWeight: '700', color: '#0F766E', marginBottom: 4 },
  previewAmberLabel: { fontSize: 10, fontWeight: '700', color: '#92400E', marginBottom: 4 },
  previewEmpty: { fontSize: 12, color: colors.textMuted },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  addRoom: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  link: { color: '#0F766E', fontWeight: '700', fontSize: 13 },
  danger: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  blockTeal: {
    backgroundColor: '#F0FDFA',
    borderRadius: 14,
    padding: 10,
    marginTop: 8,
  },
  blockAmber: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 10,
    marginTop: 12,
  },
  blockHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  blockTealTitle: { fontSize: 14, fontWeight: '700', color: '#134E4A' },
  blockAmberTitle: { fontSize: 14, fontWeight: '700', color: '#78350F', marginBottom: 8 },
  teacherCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  teacherName: { fontSize: 15, fontWeight: '700', color: colors.text, flexShrink: 1 },
  subjectPill: {
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  subjectPillText: { fontSize: 11, color: colors.inkSoft },
  addTeacher: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    gap: 4,
  },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  segItem: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
  },
  segOn: { backgroundColor: '#0F766E' },
  segText: { fontSize: 12, fontWeight: '700', color: colors.text },
  segTextOn: { color: '#fff' },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickRowOn: { backgroundColor: '#F0FDFA' },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  photoPreview: { width: 48, height: 48, borderRadius: 24 },
  subLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginTop: 8, marginBottom: 4 },
  warn: { fontSize: 12, color: '#92400E', marginBottom: 8 },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#FDE68A',
  },
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
  },
});
