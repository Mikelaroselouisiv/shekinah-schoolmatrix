import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  SegmentedControl,
  DateField,
  TextField,
  Title,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { canAccessPermission } from '../../lib/permissions';
import { AccessDenied } from '../../lib/access';
import { toYYYYMMDD } from '../../lib/format';
import { colors } from '../../theme/tokens';
import {
  createExamSchedule,
  createExtracurricularActivity,
  createScheduleSlot,
  deleteExamSchedule,
  deleteExtracurricularActivity,
  deleteScheduleSlot,
  getAcademicYears,
  getClassSubjects,
  getClasses,
  getRooms,
  getTeachers,
  listExamSchedules,
  listExtracurricularActivities,
  listScheduleSlots,
  type AcademicYear,
  type ClassItem,
  type ExamScheduleItem,
  type ExtracurricularItem,
  type RoomItem,
  type ScheduleSlot,
  type SubjectItem,
  type TeacherItem,
} from '../../services/api';
import type { WorkStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<WorkStackParamList, 'Schedule'>;
type TabId = 'cours' | 'examens' | 'parascolaires';
type PickerKind =
  | 'year'
  | 'class'
  | 'room'
  | 'day'
  | 'subject'
  | 'teacher'
  | 'formClass'
  | 'formRoom'
  | 'formSubject'
  | 'formTeacher'
  | 'formDay'
  | 'formPeriod'
  | null;

const DAYS = [
  { id: '0', label: 'Dimanche' },
  { id: '1', label: 'Lundi' },
  { id: '2', label: 'Mardi' },
  { id: '3', label: 'Mercredi' },
  { id: '4', label: 'Jeudi' },
  { id: '5', label: 'Vendredi' },
  { id: '6', label: 'Samedi' },
];

const TABS: { id: TabId; label: string }[] = [
  { id: 'cours', label: 'Cours' },
  { id: 'examens', label: 'Examens' },
  { id: 'parascolaires', label: 'Parascolaire' },
];

function dayLabel(n?: number): string {
  if (n == null) return '—';
  return DAYS.find((d) => d.id === String(n))?.label || `Jour ${n}`;
}

function teacherLabel(t: TeacherItem): string {
  return [t.first_name, t.last_name].filter(Boolean).join(' ') || t.email || `#${t.id}`;
}

export function ScheduleScreen({}: Props) {
  const { roleName, rolePermissions } = useAuth();
  const { context } = useSchool();
  const canEdit = canAccessPermission(roleName, 'schedule', rolePermissions);
  const allowed = canEdit;

  const [tab, setTab] = useState<TabId>('cours');
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);

  const [yearId, setYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [dayFilter, setDayFilter] = useState('');

  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [exams, setExams] = useState<ExamScheduleItem[]>([]);
  const [activities, setActivities] = useState<ExtracurricularItem[]>([]);

  const [boot, setBoot] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [picker, setPicker] = useState<PickerKind>(null);
  const [showForm, setShowForm] = useState(false);

  const [formClassId, setFormClassId] = useState('');
  const [formSubjectId, setFormSubjectId] = useState('');
  const [formTeacherId, setFormTeacherId] = useState('');
  const [formRoomId, setFormRoomId] = useState('');
  const [formDay, setFormDay] = useState(1);
  const [formStart, setFormStart] = useState('08:00');
  const [formEnd, setFormEnd] = useState('09:00');
  const [formPeriod, setFormPeriod] = useState('');
  const [formDate, setFormDate] = useState(toYYYYMMDD());
  const [formOccasion, setFormOccasion] = useState('');
  const [formFee, setFormFee] = useState('');
  const [formDress, setFormDress] = useState('');

  const yearName = years.find((y) => y.id === yearId)?.name || '';
  const classLabel = classes.find((c) => c.id === classId)?.name || 'Toutes';
  const roomLabel = rooms.find((r) => r.id === roomId)?.name || 'Toutes';
  const dayFilterLabel =
    dayFilter === '' ? 'Tous' : dayLabel(Number(dayFilter));

  const loadLists = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'cours') {
        const list = await listScheduleSlots({
          academic_year: yearName || undefined,
          class_id: classId || undefined,
          room_id: roomId || undefined,
          day_of_week: dayFilter !== '' ? Number(dayFilter) : undefined,
        });
        setSlots(list);
      } else if (tab === 'examens') {
        setExams(await listExamSchedules({ class_id: classId || undefined }));
      } else {
        setActivities(
          await listExtracurricularActivities({
            academic_year_id: yearId || undefined,
            class_id: classId || undefined,
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [tab, yearName, yearId, classId, roomId, dayFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [y, c, r, t] = await Promise.all([
          getAcademicYears(),
          getClasses(),
          getRooms(),
          getTeachers(),
        ]);
        if (cancelled) return;
        setYears(y);
        setClasses(c);
        setRooms(r);
        setTeachers(t);
        const defaultYear =
          context?.academic_year?.id ||
          context?.current_academic_year_id ||
          y[0]?.id ||
          '';
        setYearId(defaultYear);
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
  }, [context?.academic_year?.id, context?.current_academic_year_id]);

  useEffect(() => {
    if (!boot) void loadLists();
  }, [boot, loadLists]);

  useEffect(() => {
    if (!formClassId) {
      setSubjects([]);
      setFormSubjectId('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await getClassSubjects(formClassId);
        if (cancelled) return;
        setSubjects(list);
        setFormSubjectId((prev) =>
          list.some((s) => s.id === prev) ? prev : list[0]?.id || '',
        );
      } catch {
        if (!cancelled) setSubjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formClassId]);

  const sortedSlots = useMemo(() => {
    return [...slots].sort((a, b) => {
      const d = (a.day_of_week ?? 0) - (b.day_of_week ?? 0);
      if (d !== 0) return d;
      return (a.start_time || '').localeCompare(b.start_time || '');
    });
  }, [slots]);

  function openCreate() {
    setSuccess('');
    setError('');
    setFormClassId(classId || classes[0]?.id || '');
    setFormRoomId(roomId || '');
    setFormTeacherId(teachers[0] ? String(teachers[0].id) : '');
    setFormDay(dayFilter !== '' ? Number(dayFilter) : 1);
    setFormStart('08:00');
    setFormEnd('09:00');
    setFormPeriod('');
    setFormDate(toYYYYMMDD());
    setFormOccasion('');
    setFormFee('');
    setFormDress('');
    setShowForm(true);
  }

  async function handleCreate() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (tab === 'cours') {
        if (!formClassId || !formSubjectId || !formTeacherId || !formRoomId) {
          throw new Error('Classe, matière, prof et salle requis.');
        }
        await createScheduleSlot({
          academic_year: yearName || undefined,
          class_id: formClassId,
          subject_id: formSubjectId,
          teacher_id: Number(formTeacherId),
          room_id: formRoomId,
          day_of_week: formDay,
          start_time: formStart,
          end_time: formEnd,
        });
        setSuccess('Créneau ajouté.');
      } else if (tab === 'examens') {
        if (!formClassId || !formSubjectId || !formPeriod.trim() || !formDate) {
          throw new Error('Classe, matière, période et date requis.');
        }
        await createExamSchedule({
          class_id: formClassId,
          subject_id: formSubjectId,
          period: formPeriod.trim(),
          exam_date: formDate,
          start_time: formStart,
          end_time: formEnd,
        });
        setSuccess('Examen ajouté.');
      } else {
        if (!yearId || !formClassId || !formOccasion.trim() || !formDate) {
          throw new Error('Année, classe, occasion et date requis.');
        }
        await createExtracurricularActivity({
          academic_year_id: yearId,
          activity_date: formDate,
          start_time: formStart,
          end_time: formEnd,
          class_ids: [formClassId],
          occasion: formOccasion.trim(),
          participation_fee: formFee.trim() || null,
          dress_code: formDress.trim() || null,
        });
        setSuccess('Activité ajoutée.');
      }
      setShowForm(false);
      await loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(kind: TabId, id: string) {
    Alert.alert('Supprimer', 'Confirmer la suppression ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              if (kind === 'cours') await deleteScheduleSlot(id);
              else if (kind === 'examens') await deleteExamSchedule(id);
              else await deleteExtracurricularActivity(id);
              await loadLists();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Suppression impossible');
            }
          })();
        },
      },
    ]);
  }

  const pickerItems = useMemo(() => {
    if (picker === 'year') return years.map((y) => ({ id: y.id, label: y.name }));
    if (picker === 'class' || picker === 'formClass') {
      const base =
        picker === 'class'
          ? [{ id: '', label: 'Toutes les classes' }]
          : [];
      return [...base, ...classes.map((c) => ({ id: c.id, label: c.name }))];
    }
    if (picker === 'room' || picker === 'formRoom') {
      const filtered = formClassId
        ? rooms.filter((r) => !r.class_id || r.class_id === formClassId || picker === 'room')
        : rooms;
      const list = picker === 'room' ? rooms : filtered.length ? filtered : rooms;
      const base = picker === 'room' ? [{ id: '', label: 'Toutes les salles' }] : [];
      return [...base, ...list.map((r) => ({ id: r.id, label: r.name }))];
    }
    if (picker === 'day' || picker === 'formDay') {
      const base = picker === 'day' ? [{ id: '', label: 'Tous les jours' }] : [];
      return [...base, ...DAYS];
    }
    if (picker === 'formSubject') {
      return subjects.map((s) => ({ id: s.id, label: s.name }));
    }
    if (picker === 'formTeacher') {
      return teachers.map((t) => ({ id: String(t.id), label: teacherLabel(t) }));
    }
    if (picker === 'formPeriod') {
      return [
        { id: '1er', label: '1er' },
        { id: '2e', label: '2e' },
        { id: '3e', label: '3e' },
        { id: '4e', label: '4e' },
        { id: 'Semestriel', label: 'Semestriel' },
        { id: 'Annuel', label: 'Annuel' },
      ];
    }
    return [];
  }, [picker, years, classes, rooms, subjects, teachers, formClassId]);

  function onPick(id: string) {
    switch (picker) {
      case 'year':
        setYearId(id);
        break;
      case 'class':
        setClassId(id);
        setRoomId('');
        break;
      case 'room':
        setRoomId(id);
        break;
      case 'day':
        setDayFilter(id);
        break;
      case 'formClass':
        setFormClassId(id);
        break;
      case 'formRoom':
        setFormRoomId(id);
        break;
      case 'formSubject':
        setFormSubjectId(id);
        break;
      case 'formTeacher':
        setFormTeacherId(id);
        break;
      case 'formDay':
        setFormDay(Number(id));
        break;
      case 'formPeriod':
        setFormPeriod(id);
        break;
      default:
        break;
    }
    setPicker(null);
  }

  if (!allowed) {
    return <AccessDenied />;
  }

  if (boot) {
    return (
      <Screen>
        <LoadingBlock label="Chargement des horaires…" />
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={styles.top}>
        <Title>Horaires</Title>

        <View style={{ marginTop: 12 }}>
          <SegmentedControl
            options={TABS}
            value={tab}
            onChange={(id) => setTab(id as TabId)}
          />
        </View>

        <View style={styles.filters}>
          <SelectChip
            label="Année"
            value={yearName || '—'}
            onPress={() => setPicker('year')}
          />
          <SelectChip label="Classe" value={classLabel} onPress={() => setPicker('class')} />
          {tab === 'cours' ? (
            <>
              <SelectChip label="Salle" value={roomLabel} onPress={() => setPicker('room')} />
              <SelectChip
                label="Jour"
                value={dayFilterLabel}
                onPress={() => setPicker('day')}
              />
            </>
          ) : null}
        </View>

        {canEdit ? (
          <Button title="Ajouter" onPress={openCreate} />
        ) : null}

        <ErrorBanner message={error} />
        {success ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <LoadingBlock />
      ) : tab === 'cours' ? (
        <FlatList
          data={sortedSlots}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="Aucun créneau" />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {item.subject_name || 'Matière'} · {dayLabel(item.day_of_week)}
              </Text>
              <Muted>
                {[item.start_time, item.end_time].filter(Boolean).join(' – ')}
                {item.class_name ? ` · ${item.class_name}` : ''}
                {item.room_name ? ` · ${item.room_name}` : ''}
              </Muted>
              {item.teacher_name ? <Muted>{item.teacher_name}</Muted> : null}
              {canEdit ? (
                <Pressable onPress={() => confirmDelete('cours', item.id)}>
                  <Text style={styles.deleteLink}>Supprimer</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      ) : tab === 'examens' ? (
        <FlatList
          data={exams}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="Aucun examen" />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {item.subject_name || 'Matière'} · {item.exam_date || '—'}
              </Text>
              <Muted>
                {[item.start_time, item.end_time].filter(Boolean).join(' – ')}
                {item.class_name ? ` · ${item.class_name}` : ''}
                {item.period ? ` · ${item.period}` : ''}
              </Muted>
              {canEdit ? (
                <Pressable onPress={() => confirmDelete('examens', item.id)}>
                  <Text style={styles.deleteLink}>Supprimer</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      ) : (
        <FlatList
          data={activities}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="Aucune activité" />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.occasion || 'Activité'}</Text>
              <Muted>
                {item.activity_date || '—'}
                {` · ${[item.start_time, item.end_time].filter(Boolean).join(' – ')}`}
                {item.class_name ? ` · ${item.class_name}` : ''}
              </Muted>
              {item.dress_code ? <Muted>Tenue · {item.dress_code}</Muted> : null}
              {canEdit ? (
                <Pressable onPress={() => confirmDelete('parascolaires', item.id)}>
                  <Text style={styles.deleteLink}>Supprimer</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}

      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.formSheet}>
            <ScrollView>
              <Text style={styles.formTitle}>
                {tab === 'cours'
                  ? 'Nouveau créneau'
                  : tab === 'examens'
                    ? 'Nouvel examen'
                    : 'Nouvelle activité'}
              </Text>
              <SelectChip
                label="Classe"
                value={classes.find((c) => c.id === formClassId)?.name || 'Choisir'}
                onPress={() => setPicker('formClass')}
              />
              {(tab === 'cours' || tab === 'examens') && (
                <SelectChip
                  label="Matière"
                  value={subjects.find((s) => s.id === formSubjectId)?.name || 'Choisir'}
                  onPress={() => setPicker('formSubject')}
                />
              )}
              {tab === 'cours' ? (
                <>
                  <SelectChip
                    label="Professeur"
                    value={
                      teachers.find((t) => String(t.id) === formTeacherId)
                        ? teacherLabel(
                            teachers.find((t) => String(t.id) === formTeacherId)!,
                          )
                        : 'Choisir'
                    }
                    onPress={() => setPicker('formTeacher')}
                  />
                  <SelectChip
                    label="Salle"
                    value={rooms.find((r) => r.id === formRoomId)?.name || 'Choisir'}
                    onPress={() => setPicker('formRoom')}
                  />
                  <SelectChip
                    label="Jour"
                    value={dayLabel(formDay)}
                    onPress={() => setPicker('formDay')}
                  />
                </>
              ) : null}
              {tab === 'examens' ? (
                <SelectChip
                  label="Période"
                  value={formPeriod || 'Choisir'}
                  onPress={() => setPicker('formPeriod')}
                />
              ) : null}
              {tab !== 'cours' ? (
                <DateField label="Date" value={formDate} onChange={setFormDate} />
              ) : null}
              {tab === 'parascolaires' ? (
                <>
                  <TextField
                    label="Occasion"
                    value={formOccasion}
                    onChangeText={setFormOccasion}
                  />
                  <TextField
                    label="Frais (optionnel)"
                    value={formFee}
                    onChangeText={setFormFee}
                    keyboardType="decimal-pad"
                  />
                  <TextField
                    label="Tenue (optionnel)"
                    value={formDress}
                    onChangeText={setFormDress}
                  />
                </>
              ) : null}
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.timeLabel}>Début</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={formStart}
                    onChangeText={setFormStart}
                    placeholder="08:00"
                    autoCapitalize="none"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.timeLabel}>Fin</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={formEnd}
                    onChangeText={setFormEnd}
                    placeholder="09:00"
                    autoCapitalize="none"
                  />
                </View>
              </View>
              <ErrorBanner message={error} />
              <View style={styles.formActions}>
                <Button
                  title={saving ? 'Enregistrement…' : 'Enregistrer'}
                  onPress={() => void handleCreate()}
                  disabled={saving}
                />
                <Button
                  title="Annuler"
                  variant="ghost"
                  onPress={() => setShowForm(false)}
                  disabled={saving}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!picker} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <FlatList
              data={pickerItems}
              keyExtractor={(item) => item.id || 'all'}
              renderItem={({ item }) => (
                <Pressable style={styles.modalRow} onPress={() => onPick(item.id)}>
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
  top: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: '46%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    marginBottom: 4,
  },
  chipLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  chipValue: { fontSize: 14, color: colors.text, fontWeight: '700', marginTop: 2 },
  list: { paddingHorizontal: 20, paddingBottom: 48 },
  card: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  deleteLink: { marginTop: 8, color: colors.danger, fontWeight: '600', fontSize: 13 },
  successBanner: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  successText: { color: '#065F46', fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  formSheet: {
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  pickerSheet: {
    maxHeight: '55%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 12,
  },
  formActions: { gap: 8, marginTop: 12, marginBottom: 24 },
  timeRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  timeLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 4 },
  timeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  modalRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
