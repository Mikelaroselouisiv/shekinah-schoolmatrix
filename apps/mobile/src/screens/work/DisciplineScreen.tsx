import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormScrollView } from '../../components/FormScrollView';
import {
  Button,
  DateField,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Screen,
  SearchBar,
  SegmentedControl,
  TextField,
} from '../../components/ui';
import { studentDisplayName, toYYYYMMDD, yyyymmddToJJMMAAAA } from '../../lib/format';
import { listBottomPadding } from '../../lib/layout';
import { colors } from '../../theme/tokens';
import {
  createDeduction,
  createLateness,
  createMeasure,
  deleteDeduction,
  deleteLateness,
  deleteMeasure,
  getClasses,
  getRooms,
  getStudents,
  listDeductions,
  listLatenesses,
  listMeasures,
  type ClassItem,
  type DeductionItem,
  type LatenessItem,
  type MeasureItem,
  type RoomItem,
  type StudentListItem,
} from '../../services/api';
import type { WorkStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<WorkStackParamList, 'Discipline'>;
type TabId = 'retards' | 'points' | 'mesures';

const MEASURE_TYPES = [
  { id: 'SOUS_SURVEILLANCE', label: 'Sous-surveillance' },
  { id: 'EN_RETENUE', label: 'En retenue' },
  { id: 'RENVOYE_TEMPORAIREMENT', label: 'Renvoyé temporairement' },
  { id: 'RENVOYE_DEFINITIVEMENT', label: 'Renvoyé définitivement' },
];

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
}

function byStudent(a: StudentListItem, b: StudentListItem) {
  return (
    (a.last_name || '').localeCompare(b.last_name || '', 'fr', { sensitivity: 'base' }) ||
    (a.first_name || '').localeCompare(b.first_name || '', 'fr', { sensitivity: 'base' })
  );
}

function studentMeta(student: StudentListItem): string {
  return [student.management_code, student.room_name || student.class_name].filter(Boolean).join(' · ');
}

export function DisciplineScreen({ route }: Props) {
  const allowed = useCanAccess('discipline');
  const [tab, setTab] = useState<TabId>(route.params?.tab ?? 'retards');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [boot, setBoot] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [query, setQuery] = useState('');

  const [classId, setClassId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [date, setDate] = useState(toYYYYMMDD());
  const [arrival, setArrival] = useState('08:00');
  const [points, setPoints] = useState('5');
  const [action, setAction] = useState<'RETIRER' | 'AJOUTER'>('RETIRER');
  const [reason, setReason] = useState('');
  const [measureType, setMeasureType] = useState('SOUS_SURVEILLANCE');
  const [durationDays, setDurationDays] = useState('3');

  const [latenesses, setLatenesses] = useState<LatenessItem[]>([]);
  const [deductions, setDeductions] = useState<DeductionItem[]>([]);
  const [measures, setMeasures] = useState<MeasureItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [classList, roomList] = await Promise.all([getClasses(), getRooms()]);
        if (cancelled) return;
        const sorted = [...classList].sort(byName);
        setClasses(sorted);
        setRooms(roomList.filter((room) => room.active !== false).sort(byName));
        if (sorted.length === 1) setClassId(sorted[0].id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur classes');
      } finally {
        if (!cancelled) setBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const classRooms = useMemo(
    () => rooms.filter((room) => room.class_id === classId).sort(byName),
    [rooms, classId],
  );

  useEffect(() => {
    setStudentId('');
    setQuery('');
    if (!classId) {
      setStudents([]);
      return;
    }
    let cancelled = false;
    setStudentsLoading(true);
    getStudents(roomId ? { room_id: roomId } : { class_id: classId })
      .then((list) => {
        if (cancelled) return;
        setStudents(
          list
            .filter(
              (student) =>
                student.active !== false &&
                (!student.class_id || student.class_id === classId),
            )
            .sort(byStudent),
        );
      })
      .catch(() => {
        if (!cancelled) setStudents([]);
      })
      .finally(() => {
        if (!cancelled) setStudentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, roomId]);

  const refreshLists = useCallback(async () => {
    try {
      if (tab === 'retards') {
        setLatenesses(await listLatenesses({ class_id: classId || undefined, date: date || undefined }));
      } else if (tab === 'points') {
        setDeductions(await listDeductions(studentId || undefined));
      } else {
        setMeasures(await listMeasures(studentId || undefined));
      }
    } catch {
      /* la liste déjà affichée reste en place */
    }
  }, [tab, classId, date, studentId]);

  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.tab]);

  useEffect(() => {
    void refreshLists();
  }, [refreshLists]);

  const selectedClass = classes.find((item) => item.id === classId);
  const selectedStudent = students.find((item) => item.id === studentId);
  const visibleStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((student) => {
      const blob = [studentDisplayName(student), student.last_name, student.first_name, student.management_code, student.room_name, student.class_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [students, query]);

  function pickClass(id: string) {
    setClassId(id);
    setRoomId('');
    setStudentId('');
    setError('');
    setSuccess('');
  }

  function pickRoom(id: string) {
    setRoomId(id);
    setStudentId('');
    setError('');
    setSuccess('');
  }

  async function saveLateness() {
    if (!classId || !studentId || !date || !arrival) {
      setError('Classe, élève, date et heure requis.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await createLateness({
        student_id: studentId,
        class_id: selectedStudent?.class_id || classId,
        date,
        arrival_time: arrival,
      });
      setSuccess('Retard enregistré.');
      setStudentId('');
      await refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function saveDeduction() {
    const n = parseInt(points, 10);
    if (!studentId || Number.isNaN(n) || n < 1 || n > 100) {
      setError('Élève et points (1–100) requis.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await createDeduction({
        student_id: studentId,
        points_deducted: action === 'RETIRER' ? n : -n,
        reason: reason.trim() || undefined,
      });
      setSuccess('Points enregistrés.');
      setReason('');
      await refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function saveMeasure() {
    if (!studentId || !measureType) {
      setError('Élève et type de mesure requis.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const days = parseInt(durationDays, 10);
      await createMeasure({
        student_id: studentId,
        measure_type: measureType,
        reason: reason.trim() || undefined,
        duration_days:
          measureType === 'RENVOYE_TEMPORAIREMENT' && !Number.isNaN(days) ? days : undefined,
      });
      setSuccess('Mesure enregistrée.');
      setReason('');
      await refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(kind: 'lateness' | 'deduction' | 'measure', id: string) {
    Alert.alert('Confirmer', 'Supprimer cet élément ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              if (kind === 'lateness') await deleteLateness(id);
              if (kind === 'deduction') await deleteDeduction(id);
              if (kind === 'measure') await deleteMeasure(id);
              await refreshLists();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Suppression impossible');
            }
          })();
        },
      },
    ]);
  }

  if (!allowed) return <AccessDenied />;
  if (boot) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    );
  }

  const recordCount =
    tab === 'retards' ? latenesses.length : tab === 'points' ? deductions.length : measures.length;

  return (
    <Screen>
      <FormScrollView contentContainerStyle={styles.content}>
        <SegmentedControl
          options={[
            { id: 'retards', label: 'Retards' },
            { id: 'points', label: 'Points' },
            { id: 'mesures', label: 'Mesures' },
          ]}
          value={tab}
          onChange={(id) => {
            setTab(id as TabId);
            setError('');
            setSuccess('');
          }}
        />

        <ErrorBanner message={error} />
        {success ? <Text style={styles.saved}>{success}</Text> : null}

        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>Classes</Text>
            <Text style={styles.panelCount}>{classes.length}</Text>
          </View>
          {classes.length === 0 ? (
            <EmptyState title="Aucune classe" />
          ) : (
            classes.map((item) => {
              const count = rooms.filter((room) => room.class_id === item.id).length;
              const meta = [
                count ? `${count} salle${count > 1 ? 's' : ''}` : 'Aucune salle',
                item.student_count != null ? `${item.student_count} élèves` : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <Choice
                  key={item.id}
                  title={item.name}
                  meta={meta}
                  selected={item.id === classId}
                  onPress={() => pickClass(item.id)}
                />
              );
            })
          )}
        </View>

        {selectedClass ? (
          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Salles · {selectedClass.name}</Text>
              <Text style={styles.panelCount}>{classRooms.length}</Text>
            </View>
            <Choice
              title="Toute la classe"
              meta="Tous les élèves, toutes les salles"
              selected={roomId === ''}
              onPress={() => pickRoom('')}
            />
            {classRooms.map((room) => (
              <Choice
                key={room.id}
                title={room.name}
                meta={
                  room.student_count != null
                    ? `${room.student_count} élève${room.student_count > 1 ? 's' : ''}`
                    : undefined
                }
                selected={room.id === roomId}
                onPress={() => pickRoom(room.id)}
              />
            ))}
          </View>
        ) : null}

        {selectedClass ? (
          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>
                Élèves
                {roomId ? ` · ${classRooms.find((room) => room.id === roomId)?.name || 'Salle'}` : ''}
              </Text>
              <Text style={styles.panelCount}>{visibleStudents.length}</Text>
            </View>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="Nom, prénom ou numéro"
            />
            {studentsLoading ? (
              <ActivityIndicator color={colors.ink} style={{ marginVertical: 12 }} />
            ) : visibleStudents.length === 0 ? (
              <EmptyState
                title={query ? 'Aucun élève pour cette recherche' : 'Aucun élève'}
                subtitle={roomId ? 'Cette salle est vide.' : 'Cette classe n’a pas d’élève actif.'}
              />
            ) : (
              visibleStudents.map((student) => {
                const on = student.id === studentId;
                const initial = (student.last_name || student.first_name || '?').slice(0, 1).toUpperCase();
                return (
                  <Pressable
                    key={student.id}
                    onPress={() => setStudentId(student.id)}
                    style={[styles.student, on && styles.studentOn]}
                  >
                    <View style={[styles.initial, on && styles.initialOn]}>
                      <Text style={[styles.initialText, on && styles.initialTextOn]}>{initial}</Text>
                    </View>
                    <View style={styles.choiceCopy}>
                      <Text style={[styles.choiceTitle, on && styles.choiceTitleOn]}>
                        {student.last_name} {student.first_name}
                      </Text>
                      {studentMeta(student) ? (
                        <Text style={[styles.choiceMeta, on && styles.choiceMetaOn]}>{studentMeta(student)}</Text>
                      ) : null}
                    </View>
                    {on ? <Ionicons name="checkmark" size={18} color={colors.surface} /> : null}
                  </Pressable>
                );
              })
            )}
          </View>
        ) : (
          <Text style={styles.hint}>Choisissez une classe pour voir ses salles et tous ses élèves.</Text>
        )}

        {selectedStudent ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>
              {tab === 'retards' ? 'Enregistrer le retard' : tab === 'points' ? 'Enregistrer les points' : 'Enregistrer la mesure'}
            </Text>
            <Text style={styles.choiceMeta}>
              {selectedStudent.last_name} {selectedStudent.first_name}
              {studentMeta(selectedStudent) ? ` · ${studentMeta(selectedStudent)}` : ''}
            </Text>

            {tab === 'retards' ? (
              <>
                <DateField label="Date" value={date} onChange={setDate} maximumDate={new Date()} />
                <TextField label="Heure d’arrivée" value={arrival} onChangeText={setArrival} placeholder="08:00" />
                <Button
                  title={saving ? 'Enregistrement…' : 'Enregistrer le retard'}
                  onPress={() => void saveLateness()}
                  disabled={saving}
                />
              </>
            ) : null}

            {tab === 'points' ? (
              <>
                <View style={styles.pair}>
                  <Choice fill title="Retirer" selected={action === 'RETIRER'} onPress={() => setAction('RETIRER')} />
                  <Choice fill title="Ajouter" selected={action === 'AJOUTER'} onPress={() => setAction('AJOUTER')} />
                </View>
                <TextField
                  label="Points (1–100)"
                  value={points}
                  onChangeText={setPoints}
                  keyboardType="number-pad"
                />
                <TextField label="Motif" value={reason} onChangeText={setReason} />
                <Button
                  title={saving ? 'Enregistrement…' : 'Enregistrer'}
                  onPress={() => void saveDeduction()}
                  disabled={saving}
                />
              </>
            ) : null}

            {tab === 'mesures' ? (
              <>
                {MEASURE_TYPES.map((item) => (
                  <Choice
                    key={item.id}
                    title={item.label}
                    selected={measureType === item.id}
                    onPress={() => setMeasureType(item.id)}
                  />
                ))}
                {measureType === 'RENVOYE_TEMPORAIREMENT' ? (
                  <TextField
                    label="Durée (jours)"
                    value={durationDays}
                    onChangeText={setDurationDays}
                    keyboardType="number-pad"
                  />
                ) : null}
                <TextField label="Motif" value={reason} onChangeText={setReason} />
                <Button
                  title={saving ? 'Enregistrement…' : 'Enregistrer la mesure'}
                  onPress={() => void saveMeasure()}
                  disabled={saving}
                />
              </>
            ) : null}
          </View>
        ) : null}

        {selectedClass ? (
          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>
                {tab === 'retards' ? 'Retards du jour' : tab === 'points' ? 'Points' : 'Mesures'}
              </Text>
              <Text style={styles.panelCount}>{recordCount}</Text>
            </View>
            {tab === 'retards' && latenesses.length === 0 ? (
              <Text style={styles.choiceMeta}>Aucun retard pour cette classe le {yyyymmddToJJMMAAAA(date)}.</Text>
            ) : null}
            {tab === 'points' && deductions.length === 0 ? (
              <Text style={styles.choiceMeta}>
                {studentId ? 'Aucun point pour cet élève.' : 'Choisissez un élève pour voir ses points.'}
              </Text>
            ) : null}
            {tab === 'mesures' && measures.length === 0 ? (
              <Text style={styles.choiceMeta}>
                {studentId ? 'Aucune mesure pour cet élève.' : 'Choisissez un élève pour voir ses mesures.'}
              </Text>
            ) : null}
            {tab === 'retards'
              ? latenesses.map((item) => (
                  <RecordRow
                    key={item.id}
                    title={item.student_name || 'Élève'}
                    meta={`${yyyymmddToJJMMAAAA(String(item.date || '').slice(0, 10))} · ${item.arrival_time || ''}`}
                    onDelete={() => confirmDelete('lateness', item.id)}
                  />
                ))
              : null}
            {tab === 'points'
              ? deductions.map((item) => (
                  <RecordRow
                    key={item.id}
                    title={`${item.student_name || 'Élève'} · ${item.points_deducted ?? 0} pts`}
                    meta={item.reason || 'Sans motif'}
                    onDelete={() => confirmDelete('deduction', item.id)}
                  />
                ))
              : null}
            {tab === 'mesures'
              ? measures.map((item) => (
                  <RecordRow
                    key={item.id}
                    title={item.student_name || 'Élève'}
                    meta={`${MEASURE_TYPES.find((type) => type.id === item.measure_type)?.label || item.measure_type || 'Mesure'}${item.reason ? ` · ${item.reason}` : ''}`}
                    onDelete={() => confirmDelete('measure', item.id)}
                  />
                ))
              : null}
          </View>
        ) : null}
      </FormScrollView>
    </Screen>
  );
}

function Choice({
  title,
  meta,
  selected,
  fill,
  onPress,
}: {
  title: string;
  meta?: string;
  selected?: boolean;
  fill?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, fill && styles.choiceFill, selected && styles.choiceOn]}>
      <View style={styles.choiceCopy}>
        <Text style={[styles.choiceTitle, fill && styles.choiceTitleFill, selected && styles.choiceTitleOn]}>{title}</Text>
        {meta ? <Text style={[styles.choiceMeta, selected && styles.choiceMetaOn]}>{meta}</Text> : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={18} color={colors.surface} /> : null}
    </Pressable>
  );
}

function RecordRow({ title, meta, onDelete }: { title: string; meta?: string; onDelete: () => void }) {
  return (
    <View style={styles.record}>
      <View style={styles.choiceCopy}>
        <Text style={styles.choiceTitle}>{title}</Text>
        {meta ? <Text style={styles.choiceMeta}>{meta}</Text> : null}
      </View>
      <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel="Supprimer">
        <Ionicons name="trash-outline" size={18} color={colors.danger} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: listBottomPadding(24),
    gap: 14,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  panelTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  panelCount: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    backgroundColor: colors.bg,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  saved: {
    color: '#3F6212',
    fontWeight: '600',
    textAlign: 'center',
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  choiceOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  choiceFill: { flex: 1, justifyContent: 'center' },
  choiceTitleFill: { textAlign: 'center' },
  choiceCopy: { flex: 1, gap: 2 },
  choiceTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  choiceTitleOn: { color: colors.surface },
  choiceMeta: { fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  choiceMetaOn: { color: 'rgba(255,255,255,0.78)' },
  student: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  studentOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  initial: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  initialOn: { backgroundColor: 'rgba(255,255,255,0.16)' },
  initialText: { fontWeight: '700', fontSize: 14, color: colors.ink },
  initialTextOn: { color: colors.surface },
  pair: { flexDirection: 'row', gap: 8 },
  record: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
