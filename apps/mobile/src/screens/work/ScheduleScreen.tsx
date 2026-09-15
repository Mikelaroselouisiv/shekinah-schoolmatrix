import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  SectionList,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormModal } from '../../components/FormModal';
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
import {
  emptyWeekProgram,
  emptyDayProgram,
  emptyClassDayLists,
  classDayListsFromApi,
  mergeMaterialCatalog,
  toggleMaterialLabel,
  ensureMaterialLabel,
  isListScheduleLevel,
  MORNING_PRIMAIRE_LEVELS,
  MORNING_WEEKDAYS,
  programFromDuties,
  uniqueTeachersFromAssignments,
  type DayMorningProgram,
} from '../../lib/morningOpening';
import { colors } from '../../theme/tokens';
import {
  createExamSchedule,
  createExtracurricularActivity,
  createScheduleSlot,
  createScheduleMoments,
  deleteExamSchedule,
  deleteExtracurricularActivity,
  deleteScheduleSlot,
  deleteScheduleMoment,
  getAcademicYears,
  getClassSubjects,
  getClasses,
  getRooms,
  getTeachers,
  listExamSchedules,
  listExtracurricularActivities,
  listScheduleSlots,
  listScheduleMoments,
  getSchoolOpeningProgram,
  listSchoolWeekStaff,
  listTeacherAssignments,
  upsertSchoolWeekDuties,
  listClassDayLists,
  replaceClassDayLists,
  updateExtracurricularActivity,
  type AcademicYear,
  type ClassDayMoment,
  type ClassItem,
  type ExamScheduleItem,
  type ExtracurricularItem,
  type RoomItem,
  type ScheduleSlot,
  type SubjectItem,
  type TeacherAssignment,
  type TeacherItem,
} from '../../services/api';
import type { WorkStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<WorkStackParamList, 'Schedule'>;
type TabId = 'cours' | 'examens' | 'parascolaires';
type FormKind = 'slot' | 'moment';
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
  | 'formMomentKind'
  | 'flagClass'
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

const MOMENT_KINDS = [
  { id: 'ENTRY', label: 'Rentrée' },
  { id: 'RECESS', label: 'Récréation' },
  { id: 'CLOSING', label: 'Prière de fin' },
];

const WEEKDAYS = DAYS.filter((d) => d.id !== '0' && d.id !== '6');

function dayLabel(n?: number): string {
  if (n == null) return '—';
  return DAYS.find((d) => d.id === String(n))?.label || `Jour ${n}`;
}

function teacherLabel(t: TeacherItem): string {
  return [t.first_name, t.last_name].filter(Boolean).join(' ') || t.email || `#${t.id}`;
}

function toggleNum(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

function toggleStr(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
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
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [classListSubjects, setClassListSubjects] = useState<SubjectItem[]>([]);

  const [yearId, setYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [dayFilter, setDayFilter] = useState('');

  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [moments, setMoments] = useState<ClassDayMoment[]>([]);
  const [exams, setExams] = useState<ExamScheduleItem[]>([]);
  const [activities, setActivities] = useState<ExtracurricularItem[]>([]);

  const [boot, setBoot] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [picker, setPicker] = useState<PickerKind>(null);
  const [showForm, setShowForm] = useState(false);
  const [formKind, setFormKind] = useState<FormKind>('slot');
  const [formMomentKind, setFormMomentKind] = useState('RECESS');
  const [formMomentDays, setFormMomentDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [formMomentLabel, setFormMomentLabel] = useState('');
  const [morningByDay, setMorningByDay] = useState<Record<number, DayMorningProgram>>(emptyWeekProgram);
  const [preschoolInstructions, setPreschoolInstructions] = useState<string[]>([]);
  const [primaryInstructions, setPrimaryInstructions] = useState<string[]>([]);
  const [staffPeople, setStaffPeople] = useState<{ id: number; name: string }[]>([]);
  const [flagDayTarget, setFlagDayTarget] = useState(1);
  const [savingMorning, setSavingMorning] = useState(false);
  const [dayLists, setDayLists] = useState(emptyClassDayLists);
  const [materialCatalog, setMaterialCatalog] = useState<string[]>([]);
  const [savingBring, setSavingBring] = useState(false);

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
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);

  const yearName = years.find((y) => y.id === yearId)?.name || '';
  const classLabel = classes.find((c) => c.id === classId)?.name || 'Toutes';
  const selectedClass = classes.find((c) => c.id === classId);
  const listMode = isListScheduleLevel(selectedClass?.level);
  const classSubjectOptions = useMemo(() => {
    if (!classId) return [];
    if (classListSubjects.length > 0) {
      return [...classListSubjects].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    }
    const map = new Map<string, string>();
    for (const a of assignments) {
      if (a.class_id !== classId || !a.subject_id || !a.subject_name) continue;
      if (!map.has(a.subject_id)) map.set(a.subject_id, a.subject_name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [assignments, classId, classListSubjects]);
  const roomLabel = rooms.find((r) => r.id === roomId)?.name || 'Toutes';
  const preschoolTeachers = useMemo(
    () =>
      uniqueTeachersFromAssignments(
        assignments,
        new Set(classes.filter((c) => c.level === 'PRESCOLAIRE').map((c) => c.id)),
      ),
    [assignments, classes],
  );
  const primaryTeachers = useMemo(
    () =>
      uniqueTeachersFromAssignments(
        assignments,
        new Set(
          classes
            .filter((c) => (MORNING_PRIMAIRE_LEVELS as readonly string[]).includes(c.level ?? ''))
            .map((c) => c.id),
        ),
      ),
    [assignments, classes],
  );

  const dayFilterLabel =
    dayFilter === '' ? 'Tous' : dayLabel(Number(dayFilter));

  const loadLists = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'cours') {
        const [list, momentList] = await Promise.all([
          listScheduleSlots({
            academic_year: yearName || undefined,
            class_id: classId || undefined,
            room_id: roomId || undefined,
            day_of_week: dayFilter !== '' ? Number(dayFilter) : undefined,
          }),
          listScheduleMoments({
            academic_year: yearName || undefined,
            class_id: classId || undefined,
          }),
        ]);
          const opening = await getSchoolOpeningProgram(yearName || undefined);
          setSlots(list);
          setMoments(momentList);
          setMorningByDay(programFromDuties(opening.school_week_duties));
          setPreschoolInstructions(opening.preschool_instructions);
          setPrimaryInstructions(opening.primary_instructions);
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

  async function handleSaveMorning() {
    if (!yearName) {
      setError('Choisissez une année scolaire.');
      return;
    }
    setSavingMorning(true);
    setError('');
    setSuccess('');
    try {
      await upsertSchoolWeekDuties({
        academic_year: yearName,
        days: MORNING_WEEKDAYS.map((d) => {
          const slot = morningByDay[d.index] ?? emptyWeekProgram()[d.index];
          return {
            day_of_week: d.index,
            preschool: {
              accueil_ids: slot.preschoolAccueilIds,
              flag_ids: slot.preschoolFlagIds,
              animation_ids: slot.preschoolAnimationIds,
              service_names: slot.preschoolServiceNames,
            },
            primary: {
              accueil_ids: slot.primaryAccueilIds,
              devotion_ids: slot.primaryDevotionIds,
              flag_class_id: slot.primaryFlagClassId || null,
              defi_ids: slot.primaryDefiIds,
              prayer_names: slot.primaryPrayerNames,
            },
          };
        }),
        preschool_instructions: preschoolInstructions,
        primary_instructions: primaryInstructions,
      });
      setSuccess('Début de journée enregistré.');
      await loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingMorning(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [y, c, r, t, a, staff] = await Promise.all([
          getAcademicYears(),
          getClasses(),
          getRooms(),
          getTeachers(),
          listTeacherAssignments(),
          listSchoolWeekStaff(),
        ]);
        if (cancelled) return;
        setYears(y);
        setClasses(c);
        setRooms(r);
        setTeachers(t);
        setAssignments(a);
        setStaffPeople(staff.map((s) => ({ id: s.id, name: s.name })));
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
    if (!listMode || !classId) {
      setDayLists(emptyClassDayLists());
      return;
    }
    void listClassDayLists(classId, yearName || undefined).then(({ days, catalog }) => {
      const next = classDayListsFromApi(days);
      setDayLists(next);
      setMaterialCatalog(mergeMaterialCatalog(catalog, ...Object.values(next).map((s) => s.materials)));
    });
  }, [listMode, classId, yearName]);

  useEffect(() => {
    if (!classId) {
      setClassListSubjects([]);
      return;
    }
    let cancelled = false;
    void getClassSubjects(classId)
      .then((list) => {
        if (!cancelled) setClassListSubjects(list);
      })
      .catch(() => {
        if (!cancelled) setClassListSubjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

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

  const slotSections = useMemo(() => {
    if (listMode) return [];
    const by = new Map<number, ScheduleSlot[]>();
    for (const s of sortedSlots) {
      const k = s.day_of_week ?? 0;
      const list = by.get(k) ?? [];
      list.push(s);
      by.set(k, list);
    }
    return [1, 2, 3, 4, 5]
      .filter((d) => by.has(d))
      .map((d) => ({ title: dayLabel(d), data: by.get(d)! }));
  }, [sortedSlots, listMode]);

  function openCreate(kind: FormKind = 'slot') {
    setSuccess('');
    setError('');
    setEditingActivityId(null);
    setFormKind(kind);
    setFormClassId(classId || classes[0]?.id || '');
    setFormRoomId(roomId || '');
    setFormTeacherId(teachers[0] ? String(teachers[0].id) : '');
    setFormDay(dayFilter !== '' ? Number(dayFilter) : 1);
    setFormStart(kind === 'moment' ? '10:00' : '08:00');
    setFormEnd(kind === 'moment' ? '10:15' : '09:00');
    setFormPeriod('');
    setFormDate(toYYYYMMDD());
    setFormOccasion('');
    setFormFee('');
    setFormDress('');
    setFormMomentKind('RECESS');
    setFormMomentDays([1, 2, 3, 4, 5]);
    setFormMomentLabel('');
    setShowForm(true);
  }

  function openEditActivity(item: ExtracurricularItem) {
    setSuccess('');
    setError('');
    setEditingActivityId(item.id);
    setFormClassId(item.class_id || classId || '');
    setFormDate((item.activity_date || '').slice(0, 10) || toYYYYMMDD());
    setFormStart(item.start_time || '14:00');
    setFormEnd(item.end_time || '16:00');
    setFormOccasion(item.occasion || '');
    setFormFee(item.participation_fee || '');
    setFormDress(item.dress_code || '');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingActivityId(null);
  }

  async function handleCreate() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (tab === 'cours' && formKind === 'moment') {
        if (!formClassId) throw new Error('Classe requise.');
        if (!formMomentDays.length) throw new Error('Choisissez au moins un jour.');
        await createScheduleMoments({
          academic_year: yearName || undefined,
          class_id: formClassId,
          kind: formMomentKind,
          days: formMomentDays,
          start_time: formStart,
          end_time: formEnd,
          label: formMomentLabel.trim() || null,
        });
        setSuccess('Moment calé sur l’horaire.');
      } else if (tab === 'cours') {
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
        const payload = {
          academic_year_id: yearId,
          activity_date: formDate,
          start_time: formStart,
          end_time: formEnd,
          occasion: formOccasion.trim(),
          participation_fee: formFee.trim() || null,
          dress_code: formDress.trim() || null,
        };
        if (editingActivityId) {
          await updateExtracurricularActivity(editingActivityId, {
            ...payload,
            class_id: formClassId,
          });
          setSuccess('Activité mise à jour.');
        } else {
          await createExtracurricularActivity({
            ...payload,
            class_ids: [formClassId],
          });
          setSuccess('Activité ajoutée.');
        }
      }
      closeForm();
      await loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteMoment(id: string) {
    Alert.alert('Supprimer', 'Confirmer la suppression ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteScheduleMoment(id);
              await loadLists();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Suppression impossible');
            }
          })();
        },
      },
    ]);
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
    if (picker === 'formMomentKind') {
      return MOMENT_KINDS;
    }
    if (picker === 'flagClass') {
      return [
        { id: '', label: '— Classe —' },
        ...classes
          .filter((c) => (MORNING_PRIMAIRE_LEVELS as readonly string[]).includes(c.level ?? ''))
          .map((c) => ({ id: c.id, label: c.name })),
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
      case 'flagClass':
        setMorningByDay((prev) => {
          const slot = prev[flagDayTarget] ?? emptyWeekProgram()[flagDayTarget];
          return { ...prev, [flagDayTarget]: { ...slot, primaryFlagClassId: id } };
        });
        break;
      case 'formMomentKind':
        setFormMomentKind(id);
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
        <Text style={styles.kicker}>Organisation</Text>
        <Title>Horaires</Title>

        <View style={{ marginTop: 12 }}>
          <SegmentedControl
            options={TABS}
            value={tab}
            onChange={(id) => setTab(id as TabId)}
          />
        </View>

        <View style={styles.filterCard}>
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
          tab === 'cours' ? (
            <View style={{ gap: 8 }}>
              {listMode ? null : (
                <Button title="Ajouter un cours" onPress={() => openCreate('slot')} />
              )}
              <Button
                title="Moment spécial (récré, rentrée…)"
                variant="ghost"
                onPress={() => openCreate('moment')}
              />
            </View>
          ) : (
            <Button title="Ajouter" onPress={() => openCreate('slot')} />
          )
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
        <SectionList
          sections={slotSections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled
          extraData={slots}
          ListHeaderComponent={
            <View style={{ marginBottom: 8, gap: 10 }}>
              <View style={styles.panelAmber}>
                <Text style={styles.kickerAmber}>Préscolaire</Text>
                <Text style={styles.panelTitle}>Rentrée</Text>
                {MORNING_WEEKDAYS.map((d) => {
                  const slot = morningByDay[d.index] ?? emptyDayProgram();
                  return (
                    <View key={`pre-${d.index}`} style={{ marginTop: 8, gap: 6 }}>
                      <Text style={styles.cardTitle}>{d.label}</Text>
                      <Text style={styles.chipLabel}>Accueil</Text>
                      <DutyChips
                        people={preschoolTeachers}
                        selected={slot.preschoolAccueilIds}
                        editable={canEdit}
                        onToggle={(id) =>
                          setMorningByDay((prev) => {
                            const cur = prev[d.index] ?? emptyDayProgram();
                            return {
                              ...prev,
                              [d.index]: {
                                ...cur,
                                preschoolAccueilIds: toggleNum(cur.preschoolAccueilIds, id),
                              },
                            };
                          })
                        }
                      />
                      <Text style={styles.chipLabel}>Montée du drapeau</Text>
                      <DutyChips
                        people={preschoolTeachers}
                        selected={slot.preschoolFlagIds}
                        editable={canEdit}
                        onToggle={(id) =>
                          setMorningByDay((prev) => {
                            const cur = prev[d.index] ?? emptyDayProgram();
                            return {
                              ...prev,
                              [d.index]: {
                                ...cur,
                                preschoolFlagIds: toggleNum(cur.preschoolFlagIds, id),
                              },
                            };
                          })
                        }
                      />
                      <Text style={styles.chipLabel}>Animation</Text>
                      <DutyChips
                        people={preschoolTeachers}
                        selected={slot.preschoolAnimationIds}
                        editable={canEdit}
                        onToggle={(id) =>
                          setMorningByDay((prev) => {
                            const cur = prev[d.index] ?? emptyDayProgram();
                            return {
                              ...prev,
                              [d.index]: {
                                ...cur,
                                preschoolAnimationIds: toggleNum(cur.preschoolAnimationIds, id),
                              },
                            };
                          })
                        }
                      />
                      <Text style={styles.chipLabel}>Dames de service</Text>
                      <NameLines
                        values={slot.preschoolServiceNames}
                        editable={canEdit}
                        onChange={(names) =>
                          setMorningByDay((prev) => {
                            const cur = prev[d.index] ?? emptyDayProgram();
                            return { ...prev, [d.index]: { ...cur, preschoolServiceNames: names } };
                          })
                        }
                      />
                    </View>
                  );
                })}
                <Text style={[styles.chipLabel, { marginTop: 8 }]}>Consignes</Text>
                <NameLines
                  values={preschoolInstructions}
                  editable={canEdit}
                  onChange={setPreschoolInstructions}
                />
                {canEdit ? (
                  <Button
                    title={savingMorning ? 'Enregistrement…' : 'Enregistrer'}
                    onPress={() => void handleSaveMorning()}
                    disabled={savingMorning || !yearName}
                  />
                ) : null}
              </View>
              <View style={styles.panelAmber}>
                <Text style={styles.kickerAmber}>Primaire</Text>
                <Text style={styles.panelTitle}>Rentrée</Text>
                {MORNING_WEEKDAYS.map((d) => {
                  const slot = morningByDay[d.index] ?? emptyDayProgram();
                  const flagName =
                    classes.find((c) => c.id === slot.primaryFlagClassId)?.name || '— Classe —';
                  return (
                    <View key={`pri-${d.index}`} style={{ marginTop: 8, gap: 6 }}>
                      <Text style={styles.cardTitle}>{d.label}</Text>
                      <Text style={styles.chipLabel}>Accueil</Text>
                      <DutyChips
                        people={primaryTeachers}
                        selected={slot.primaryAccueilIds}
                        editable={canEdit}
                        onToggle={(id) =>
                          setMorningByDay((prev) => {
                            const cur = prev[d.index] ?? emptyDayProgram();
                            return {
                              ...prev,
                              [d.index]: {
                                ...cur,
                                primaryAccueilIds: toggleNum(cur.primaryAccueilIds, id),
                              },
                            };
                          })
                        }
                      />
                      <Text style={styles.chipLabel}>Dévotion</Text>
                      <DutyChips
                        people={primaryTeachers}
                        selected={slot.primaryDevotionIds}
                        editable={canEdit}
                        onToggle={(id) =>
                          setMorningByDay((prev) => {
                            const cur = prev[d.index] ?? emptyDayProgram();
                            return {
                              ...prev,
                              [d.index]: {
                                ...cur,
                                primaryDevotionIds: toggleNum(cur.primaryDevotionIds, id),
                              },
                            };
                          })
                        }
                      />
                      {canEdit ? (
                        <SelectChip
                          label="Montée du drapeau"
                          value={flagName}
                          onPress={() => {
                            setFlagDayTarget(d.index);
                            setPicker('flagClass');
                          }}
                        />
                      ) : (
                        <Muted>Drapeau · {flagName}</Muted>
                      )}
                      <Text style={styles.chipLabel}>Défi des 5 phrases</Text>
                      <DutyChips
                        people={staffPeople}
                        selected={slot.primaryDefiIds}
                        editable={canEdit}
                        onToggle={(id) =>
                          setMorningByDay((prev) => {
                            const cur = prev[d.index] ?? emptyDayProgram();
                            return {
                              ...prev,
                              [d.index]: {
                                ...cur,
                                primaryDefiIds: toggleNum(cur.primaryDefiIds, id),
                              },
                            };
                          })
                        }
                      />
                      <Text style={styles.chipLabel}>Prière de midi</Text>
                      <NameLines
                        values={slot.primaryPrayerNames}
                        editable={canEdit}
                        onChange={(names) =>
                          setMorningByDay((prev) => {
                            const cur = prev[d.index] ?? emptyDayProgram();
                            return { ...prev, [d.index]: { ...cur, primaryPrayerNames: names } };
                          })
                        }
                      />
                    </View>
                  );
                })}
                <Text style={[styles.chipLabel, { marginTop: 8 }]}>Consignes</Text>
                <NameLines
                  values={primaryInstructions}
                  editable={canEdit}
                  onChange={setPrimaryInstructions}
                />
                {canEdit ? (
                  <Button
                    title={savingMorning ? 'Enregistrement…' : 'Enregistrer'}
                    onPress={() => void handleSaveMorning()}
                    disabled={savingMorning || !yearName}
                  />
                ) : null}
              </View>
              {listMode && classId ? (
                <View style={styles.panelTeal}>
                  <Text style={styles.kickerTeal}>Liste</Text>
                  <Text style={styles.panelTitle}>{classLabel}</Text>
                  {MORNING_WEEKDAYS.map((d) => {
                    const slot = dayLists[d.index] ?? { subjectIds: [], materials: [] };
                    return (
                      <View key={d.index} style={{ marginTop: 8, gap: 6 }}>
                        <Text style={styles.cardTitle}>{d.label}</Text>
                        <Text style={styles.chipLabel}>Matières</Text>
                        <OptionChips
                          options={classSubjectOptions}
                          selected={slot.subjectIds}
                          editable={canEdit}
                          onToggle={(id) =>
                            setDayLists((prev) => {
                              const cur = prev[d.index] ?? { subjectIds: [], materials: [] };
                              return {
                                ...prev,
                                [d.index]: {
                                  ...cur,
                                  subjectIds: toggleStr(cur.subjectIds, id),
                                },
                              };
                            })
                          }
                        />
                        <Text style={styles.chipLabel}>Matériel à apporter</Text>
                        <MaterialCatalogField
                          catalog={mergeMaterialCatalog(
                            materialCatalog,
                            ...Object.values(dayLists).map((s) => s.materials),
                          )}
                          selected={slot.materials}
                          editable={canEdit}
                          onToggle={(label) =>
                            setDayLists((prev) => {
                              const cur = prev[d.index] ?? { subjectIds: [], materials: [] };
                              return {
                                ...prev,
                                [d.index]: {
                                  ...cur,
                                  materials: toggleMaterialLabel(cur.materials, label),
                                },
                              };
                            })
                          }
                          onCreate={(label) => {
                            setMaterialCatalog((prev) => mergeMaterialCatalog(prev, [label]));
                            setDayLists((prev) => {
                              const cur = prev[d.index] ?? { subjectIds: [], materials: [] };
                              return {
                                ...prev,
                                [d.index]: {
                                  ...cur,
                                  materials: ensureMaterialLabel(cur.materials, label),
                                },
                              };
                            });
                          }}
                        />
                      </View>
                    );
                  })}
                  {canEdit ? (
                    <Button
                      title={savingBring ? 'Enregistrement…' : 'Enregistrer'}
                      onPress={() => {
                        setSavingBring(true);
                        void replaceClassDayLists({
                          class_id: classId,
                          academic_year: yearName || null,
                          days: MORNING_WEEKDAYS.map((d) => ({
                            day_of_week: d.index,
                            subject_ids: dayLists[d.index]?.subjectIds ?? [],
                            materials: dayLists[d.index]?.materials ?? [],
                          })),
                        })
                          .then(({ days, catalog }) => {
                            const next = classDayListsFromApi(days);
                            setDayLists(next);
                            setMaterialCatalog(
                              mergeMaterialCatalog(catalog, ...Object.values(next).map((s) => s.materials)),
                            );
                          })
                          .finally(() => setSavingBring(false));
                      }}
                      disabled={savingBring || !yearName}
                    />
                  ) : null}
                </View>
              ) : null}
              {moments.length > 0 ? (
                <View style={styles.panelTeal}>
                  <Text style={styles.kickerTeal}>Classe</Text>
                  <Text style={styles.panelTitle}>Moments spéciaux</Text>
                  {moments
                    .slice()
                    .sort(
                      (a, b) =>
                        a.day_of_week - b.day_of_week ||
                        a.start_time.localeCompare(b.start_time),
                    )
                    .map((m) => (
                      <View key={m.id} style={styles.momentRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle}>{m.title}</Text>
                          <Muted>
                            {dayLabel(m.day_of_week)} {m.start_time}–{m.end_time}
                            {m.class_name ? ` · ${m.class_name}` : ''}
                          </Muted>
                        </View>
                        {canEdit ? (
                          <Pressable onPress={() => confirmDeleteMoment(m.id)}>
                            <Text style={styles.deleteLink}>Supprimer</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={<EmptyState title="Aucun créneau" />}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionLine} />
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.eventCard}>
              <View style={styles.accentTeal} />
              <View style={styles.eventBody}>
                <Text style={styles.timeBadge}>
                  {[item.start_time, item.end_time].filter(Boolean).join(' – ')}
                </Text>
                <Text style={styles.cardTitle}>{item.subject_name || 'Matière'}</Text>
                <Muted>
                  {[item.class_name, item.room_name, item.teacher_name].filter(Boolean).join(' · ')}
                </Muted>
                {canEdit ? (
                  <Pressable onPress={() => confirmDelete('cours', item.id)}>
                    <Text style={styles.deleteLink}>Supprimer</Text>
                  </Pressable>
                ) : null}
              </View>
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
            <View style={styles.eventCard}>
              <View style={styles.accentAmber} />
              <View style={styles.eventBody}>
                <Text style={styles.timeBadgeAmber}>
                  {item.exam_date || '—'}
                  {` · ${[item.start_time, item.end_time].filter(Boolean).join(' – ')}`}
                </Text>
                <Text style={styles.cardTitle}>{item.subject_name || 'Matière'}</Text>
                <Muted>
                  {[item.class_name, item.period].filter(Boolean).join(' · ')}
                </Muted>
                {canEdit ? (
                  <Pressable onPress={() => confirmDelete('examens', item.id)}>
                    <Text style={styles.deleteLink}>Supprimer</Text>
                  </Pressable>
                ) : null}
              </View>
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
            <View style={styles.eventCard}>
              <View style={styles.accentAmber} />
              <View style={styles.eventBody}>
                <Text style={styles.timeBadgeAmber}>
                  {item.activity_date || '—'}
                  {` · ${[item.start_time, item.end_time].filter(Boolean).join(' – ')}`}
                </Text>
                <Text style={styles.cardTitle}>{item.occasion || 'Activité'}</Text>
                <Muted>{item.class_name || ''}</Muted>
                {item.dress_code ? <Muted>Tenue · {item.dress_code}</Muted> : null}
                {canEdit ? (
                  <View style={styles.cardActions}>
                    <Pressable onPress={() => openEditActivity(item)}>
                      <Text style={styles.editLink}>Modifier</Text>
                    </Pressable>
                    <Pressable onPress={() => confirmDelete('parascolaires', item.id)}>
                      <Text style={[styles.deleteLink, { marginTop: 0 }]}>Supprimer</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          )}
        />
      )}

      <FormModal visible={showForm} onRequestClose={closeForm}>
        <Text style={styles.formTitle}>
          {tab === 'cours' && formKind === 'moment'
            ? 'Moment spécial'
            : tab === 'cours'
              ? 'Nouveau créneau'
              : tab === 'examens'
                ? 'Nouvel examen'
                : editingActivityId
                  ? 'Modifier'
                  : 'Nouvelle activité'}
        </Text>
        <SelectChip
          label="Classe"
          value={classes.find((c) => c.id === formClassId)?.name || 'Choisir'}
          onPress={() => setPicker('formClass')}
        />
        {tab === 'cours' && formKind === 'moment' ? (
          <>
            <SelectChip
              label="Type"
              value={MOMENT_KINDS.find((k) => k.id === formMomentKind)?.label || 'Choisir'}
              onPress={() => setPicker('formMomentKind')}
            />
            <TextField
              label="Libellé (optionnel)"
              value={formMomentLabel}
              onChangeText={setFormMomentLabel}
            />
            <View style={styles.filters}>
              {WEEKDAYS.map((d) => {
                const day = Number(d.id);
                const on = formMomentDays.includes(day);
                return (
                  <Pressable
                    key={d.id}
                    onPress={() =>
                      setFormMomentDays((prev) =>
                        prev.includes(day)
                          ? prev.filter((x) => x !== day)
                          : [...prev, day].sort(),
                      )
                    }
                    style={[styles.chip, on ? styles.chipOn : null]}
                  >
                    <Text style={styles.chipValue}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
        {(tab === 'cours' && formKind === 'slot') || tab === 'examens' ? (
          <SelectChip
            label="Matière"
            value={subjects.find((s) => s.id === formSubjectId)?.name || 'Choisir'}
            onPress={() => setPicker('formSubject')}
          />
        ) : null}
        {tab === 'cours' && formKind === 'slot' ? (
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
            onPress={closeForm}
            disabled={saving}
          />
        </View>
      </FormModal>

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

function DutyChips({
  people,
  selected,
  onToggle,
  editable,
}: {
  people: { id: number; name: string }[];
  selected: number[];
  onToggle: (id: number) => void;
  editable: boolean;
}) {
  if (!people.length) return <Muted>—</Muted>;
  if (!editable) {
    const names = people.filter((p) => selected.includes(p.id)).map((p) => p.name);
    return <Muted>{names.length ? names.join(', ') : '—'}</Muted>;
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {people.map((t) => {
        const on = selected.includes(t.id);
        return (
          <Pressable
            key={t.id}
            onPress={() => onToggle(t.id)}
            style={[styles.chip, on ? styles.chipOn : null, { minWidth: 0, flexGrow: 0 }]}
          >
            <Text style={styles.chipValue}>{t.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function OptionChips({
  options,
  selected,
  onToggle,
  editable,
}: {
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  editable: boolean;
}) {
  if (!options.length) return <Muted>—</Muted>;
  if (!editable) {
    const names = options.filter((p) => selected.includes(p.id)).map((p) => p.name);
    return <Muted>{names.length ? names.join(', ') : '—'}</Muted>;
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((t) => {
        const on = selected.includes(t.id);
        return (
          <Pressable
            key={t.id}
            onPress={() => onToggle(t.id)}
            style={[styles.chip, on ? styles.chipOn : null, { minWidth: 0, flexGrow: 0 }]}
          >
            <Text style={styles.chipValue}>{t.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MaterialCatalogField({
  catalog,
  selected,
  onToggle,
  onCreate,
  editable,
}: {
  catalog: string[];
  selected: string[];
  onToggle: (label: string) => void;
  onCreate: (label: string) => void;
  editable: boolean;
}) {
  const [draft, setDraft] = useState('');
  function add() {
    const name = draft.trim().replace(/\s+/g, ' ');
    if (!name) return;
    onCreate(name);
    setDraft('');
  }
  if (!editable) {
    return <Muted>{selected.length ? selected.join(', ') : '—'}</Muted>;
  }
  return (
    <View style={{ gap: 6 }}>
      {catalog.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {catalog.map((label) => {
            const on = selected.some((x) => x.toLowerCase() === label.toLowerCase());
            return (
              <Pressable
                key={label}
                onPress={() => onToggle(label)}
                style={[styles.chip, on ? styles.chipOn : null, { minWidth: 0, flexGrow: 0 }]}
              >
                <Text style={styles.chipValue}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          returnKeyType="done"
          style={[styles.timeInput, { flex: 1 }]}
        />
        <Button title="Ajouter" onPress={add} />
      </View>
    </View>
  );
}

function NameLines({
  values,
  onChange,
  editable,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  editable: boolean;
}) {
  const [draft, setDraft] = useState('');
  function add() {
    const name = draft.trim();
    if (!name) return;
    if (values.some((v) => v.toLowerCase() === name.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...values, name]);
    setDraft('');
  }
  return (
    <View style={{ gap: 6 }}>
      {editable ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            returnKeyType="done"
            style={[styles.timeInput, { flex: 1 }]}
          />
          <Button title="Ajouter" onPress={add} />
        </View>
      ) : null}
      {values.length === 0 ? (
        <Muted>—</Muted>
      ) : (
        values.map((name) => (
          <Pressable
            key={name}
            onPress={() => {
              if (!editable) return;
              onChange(values.filter((v) => v !== name));
            }}
            style={styles.momentRow}
          >
            <Text style={styles.cardTitle}>{name}</Text>
            {editable ? <Text style={styles.deleteLink}>Retirer</Text> : null}
          </Pressable>
        ))
      )}
    </View>
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
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#0F766E',
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
  filterCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: '46%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  chipLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  chipValue: { fontSize: 14, color: colors.text, fontWeight: '700', marginTop: 2 },
  chipOn: { borderColor: '#0F766E', backgroundColor: '#F0FDFA' },
  list: { paddingHorizontal: 20, paddingBottom: 48 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 8,
    backgroundColor: colors.bg,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  panelTeal: {
    backgroundColor: '#F0FDFA',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#99F6E4',
    padding: 12,
  },
  panelAmber: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    gap: 4,
  },
  panelTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 6 },
  pillAmber: {
    fontSize: 13,
    color: '#78350F',
    fontWeight: '600',
    marginTop: 2,
  },
  momentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginTop: 6,
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 10,
  },
  accentTeal: { width: 6, backgroundColor: '#0F766E' },
  accentAmber: { width: 6, backgroundColor: '#F59E0B' },
  eventBody: { flex: 1, padding: 12 },
  timeBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
    marginBottom: 4,
  },
  timeBadgeAmber: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  card: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardActions: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 16 },
  editLink: { color: colors.ink, fontWeight: '600', fontSize: 13 },
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
