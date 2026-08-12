import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { colors } from '../../theme/tokens';
import {
  getAcademicYears,
  getClassSubjects,
  getClasses,
  getGradesFormData,
  getPeriods,
  getTeacherClasses,
  getTeacherSubjectsInClass,
  saveGrades,
  type AcademicYear,
  type ClassItem,
  type GradeFormRow,
  type PeriodItem,
  type PreschoolGradeRow,
  type SubjectItem,
} from '../../services/api';
import type { WorkStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<WorkStackParamList, 'Grades'>;

type PickerKind = 'year' | 'class' | 'subject' | 'period' | null;

export function GradesScreen({}: Props) {
  const allowed = useCanAccess('grades');
  const { roleName } = useAuth();
  const { context, theme } = useSchool();
  const insets = useSafeAreaInsets();
  const isTeacher = roleName === 'TEACHER';

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [periods, setPeriods] = useState<PeriodItem[]>([]);

  const [yearId, setYearId] = useState(context?.academic_year?.id || '');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [periodId, setPeriodId] = useState('');

  const [rows, setRows] = useState<GradeFormRow[]>([]);
  const [preschoolRows, setPreschoolRows] = useState<PreschoolGradeRow[]>([]);
  const [defaultCoef, setDefaultCoef] = useState<number | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const [teacherName, setTeacherName] = useState<string | null>(null);

  const [bootLoading, setBootLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [picker, setPicker] = useState<PickerKind>(null);

  const selectedClass = classes.find((c) => c.id === classId) || null;
  const isPreschool = !!selectedClass?.is_preschool;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError('');
      try {
        const [y, c] = await Promise.all([
          getAcademicYears(),
          isTeacher ? getTeacherClasses() : getClasses(),
        ]);
        if (cancelled) return;
        setYears(y);
        setClasses(c);
        const preferredYear =
          context?.academic_year?.id && y.some((yy) => yy.id === context.academic_year?.id)
            ? context.academic_year.id
            : y[0]?.id || '';
        setYearId((prev) => prev || preferredYear);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Chargement impossible');
        }
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTeacher, context?.academic_year?.id]);

  useEffect(() => {
    if (!yearId) {
      setPeriods([]);
      setPeriodId('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await getPeriods(yearId);
        if (cancelled) return;
        setPeriods(list);
        setPeriodId((prev) => (list.some((p) => p.id === prev) ? prev : list[0]?.id || ''));
      } catch {
        if (!cancelled) setPeriods([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  useEffect(() => {
    setSubjectId('');
    setSubjects([]);
    if (!classId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = isTeacher
          ? await getTeacherSubjectsInClass(classId)
          : await getClassSubjects(classId);
        if (cancelled) return;
        setSubjects(list);
        setSubjectId(list[0]?.id || '');
      } catch {
        if (!cancelled) setSubjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, isTeacher]);

  const loadForm = useCallback(async () => {
    if (!yearId || !classId || !subjectId || !periodId) {
      setRows([]);
      setPreschoolRows([]);
      return;
    }
    setFormLoading(true);
    setError('');
    setSuccess('');
    try {
      const data = await getGradesFormData({
        academic_year_id: yearId,
        class_id: classId,
        subject_id: subjectId,
        period_id: periodId,
        preschool: isPreschool,
      });
      setCanEdit(data.can_edit);
      setTeacherName(data.teacher?.name || null);
      setDefaultCoef(data.default_coefficient ?? null);
      if (isPreschool) {
        setPreschoolRows(data.rows as PreschoolGradeRow[]);
        setRows([]);
      } else {
        setRows(
          (data.rows as GradeFormRow[]).map((r) => ({
            ...r,
            coefficient: r.coefficient ?? data.default_coefficient ?? 1,
            grade_value: r.grade_value ?? null,
          })),
        );
        setPreschoolRows([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur formulaire notes');
      setRows([]);
      setPreschoolRows([]);
    } finally {
      setFormLoading(false);
    }
  }, [yearId, classId, subjectId, periodId, isPreschool]);

  useEffect(() => {
    void loadForm();
  }, [loadForm]);

  async function handleSave() {
    if (!canEdit || !yearId || !classId || !subjectId || !periodId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (isPreschool) {
        await saveGrades({
          academic_year_id: yearId,
          class_id: classId,
          subject_id: subjectId,
          period_id: periodId,
          preschool: true,
          grades: preschoolRows.map((r) => ({
            student_id: r.student_id,
            level: r.level?.trim() || undefined,
            frequency: r.frequency?.trim() || undefined,
            observation: r.observation?.trim() || undefined,
          })),
        });
      } else {
        await saveGrades({
          academic_year_id: yearId,
          class_id: classId,
          subject_id: subjectId,
          period_id: periodId,
          grades: rows.map((r) => ({
            student_id: r.student_id,
            coefficient: r.coefficient ?? defaultCoef ?? 1,
            grade_value: r.grade_value,
            detail: r.detail?.trim() || undefined,
          })),
        });
      }
      setSuccess('Notes enregistrées.');
      await loadForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec enregistrement');
    } finally {
      setSaving(false);
    }
  }

  const yearLabel = years.find((y) => y.id === yearId)?.name || 'Année';
  const classLabel = selectedClass?.name || 'Classe';
  const subjectLabel = subjects.find((s) => s.id === subjectId)?.name || 'Matière';
  const periodLabel = periods.find((p) => p.id === periodId)?.name || 'Période';

  const pickerItems = useMemo(() => {
    if (picker === 'year') return years.map((y) => ({ id: y.id, label: y.name }));
    if (picker === 'class')
      return classes.map((c) => ({
        id: c.id,
        label: c.is_preschool ? `${c.name} (préscolaire)` : c.name,
      }));
    if (picker === 'subject') return subjects.map((s) => ({ id: s.id, label: s.name }));
    if (picker === 'period') return periods.map((p) => ({ id: p.id, label: p.name }));
    return [];
  }, [picker, years, classes, subjects, periods]);

  function onPick(id: string) {
    if (picker === 'year') setYearId(id);
    if (picker === 'class') setClassId(id);
    if (picker === 'subject') setSubjectId(id);
    if (picker === 'period') setPeriodId(id);
    setPicker(null);
  }

  if (bootLoading) {
    return (
      <Screen>
        <LoadingBlock label="Chargement…" />
      </Screen>
    );
  }

  const listData = isPreschool ? preschoolRows : rows;
  const ready = !!(yearId && classId && subjectId && periodId);

  if (!allowed) {
    return <AccessDenied />;
  }

  return (
    <Screen style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={styles.top}>
        <Title>Saisie des notes</Title>

        <View style={styles.filters}>
          <SelectChip label="Année" value={yearLabel} onPress={() => setPicker('year')} />
          <SelectChip label="Classe" value={classLabel} onPress={() => setPicker('class')} />
          <SelectChip
            label="Matière"
            value={subjectLabel}
            onPress={() => setPicker('subject')}
            disabled={!classId}
          />
          <SelectChip label="Période" value={periodLabel} onPress={() => setPicker('period')} />
        </View>

        {teacherName ? <Muted>Professeur · {teacherName}</Muted> : null}
        {!canEdit ? (
          <View style={styles.lockBanner}>
            <Text style={styles.lockText}>
              Notes déjà enregistrées — modification réservée à la direction.
            </Text>
          </View>
        ) : null}

        <ErrorBanner message={error} />
        {success ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}
      </View>

      {!ready ? (
        <EmptyState title="Complétez les filtres" />
      ) : formLoading ? (
        <View style={styles.loadingList}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={listData as { student_id: string }[]}
          keyExtractor={(item) => item.student_id}
          contentContainerStyle={[styles.list, { paddingBottom: 110 + insets.bottom }]}
          ListEmptyComponent={<EmptyState title="Aucun élève" />}
          renderItem={({ item }) =>
            isPreschool ? (
              <PreschoolRow
                row={item as PreschoolGradeRow}
                editable={canEdit}
                onChange={(next) =>
                  setPreschoolRows((prev) =>
                    prev.map((r) => (r.student_id === next.student_id ? next : r)),
                  )
                }
              />
            ) : (
              <StandardRow
                row={item as GradeFormRow}
                editable={canEdit}
                defaultCoef={defaultCoef}
                onChange={(next) =>
                  setRows((prev) => prev.map((r) => (r.student_id === next.student_id ? next : r)))
                }
              />
            )
          }
        />
      )}

      {ready && listData.length > 0 && canEdit ? (
        <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button
            title={saving ? 'Enregistrement…' : 'Enregistrer les notes'}
            onPress={() => void handleSave()}
            disabled={saving}
          />
        </View>
      ) : null}

      <Modal visible={!!picker} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Sélection</Text>
            <FlatList
              data={pickerItems}
              keyExtractor={(i) => i.id}
              renderItem={({ item }) => (
                <Pressable style={styles.modalRow} onPress={() => onPick(item.id)}>
                  <Text style={styles.modalRowText}>{item.label}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Muted>Aucune option</Muted>}
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
  disabled,
}: {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, disabled && { opacity: 0.45 }]}
    >
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

function StandardRow({
  row,
  editable,
  defaultCoef,
  onChange,
}: {
  row: GradeFormRow;
  editable: boolean;
  defaultCoef: number | null;
  onChange: (row: GradeFormRow) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.studentName}>{row.student_name}</Text>
      <View style={styles.fieldsRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Note</Text>
          <TextInput
            editable={editable}
            keyboardType="decimal-pad"
            value={row.grade_value == null ? '' : String(row.grade_value)}
            onChangeText={(t) => {
              const cleaned = t.replace(',', '.');
              const num = cleaned.trim() === '' ? null : Number(cleaned);
              onChange({
                ...row,
                grade_value: num != null && !Number.isNaN(num) ? num : null,
              });
            }}
            placeholder="—"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </View>
        <View style={{ width: 90 }}>
          <Text style={styles.fieldLabel}>Coef.</Text>
          <TextInput
            editable={editable}
            keyboardType="decimal-pad"
            value={String(row.coefficient ?? defaultCoef ?? 1)}
            onChangeText={(t) => {
              const num = Number(t.replace(',', '.'));
              onChange({
                ...row,
                coefficient: Number.isNaN(num) ? defaultCoef ?? 1 : num,
              });
            }}
            style={styles.input}
          />
        </View>
      </View>
      <Text style={styles.fieldLabel}>Détail</Text>
      <TextInput
        editable={editable}
        value={row.detail || ''}
        onChangeText={(detail) => onChange({ ...row, detail })}
        placeholder="Optionnel"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
    </View>
  );
}

function PreschoolRow({
  row,
  editable,
  onChange,
}: {
  row: PreschoolGradeRow;
  editable: boolean;
  onChange: (row: PreschoolGradeRow) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.studentName}>{row.student_name}</Text>
      <Text style={styles.fieldLabel}>Niveau</Text>
      <TextInput
        editable={editable}
        value={row.level || ''}
        onChangeText={(level) => onChange({ ...row, level })}
        style={styles.input}
      />
      <Text style={styles.fieldLabel}>Fréquence</Text>
      <TextInput
        editable={editable}
        value={row.frequency || ''}
        onChangeText={(frequency) => onChange({ ...row, frequency })}
        style={styles.input}
      />
      <Text style={styles.fieldLabel}>Observation</Text>
      <TextInput
        editable={editable}
        value={row.observation || ''}
        onChangeText={(observation) => onChange({ ...row, observation })}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20, paddingBottom: 8 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 8 },
  chip: {
    width: '48%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  chipValue: { fontSize: 14, color: colors.text, fontWeight: '700', marginTop: 2 },
  lockBanner: {
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  lockText: { color: '#C2410C', fontSize: 13 },
  successBanner: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  successText: { color: '#15803D', fontSize: 14 },
  list: { paddingHorizontal: 20 },
  loadingList: { paddingVertical: 40, alignItems: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  studentName: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 10 },
  fieldsRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  fieldLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bg,
    marginBottom: 8,
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12 },
  modalRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalRowText: { fontSize: 16, color: colors.text },
});
