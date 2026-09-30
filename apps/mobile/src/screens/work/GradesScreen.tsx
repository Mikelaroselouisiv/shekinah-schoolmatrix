import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  setSubjectPreschoolEval,
  type AcademicYear,
  type ClassItem,
  type GradeFormRow,
  type PeriodItem,
  type PreschoolGradeRow,
  type SubjectItem,
} from '../../services/api';
import type { WorkStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';
import { isTeacherRole } from '../../lib/permissions';
import {
  PRESCHOOL_EVAL_FREQUENCY,
  PRESCHOOL_EVAL_LEVEL,
  PRESCHOOL_FREQUENCIES,
  PRESCHOOL_LEVELS,
  YEAR_END_DECISIONS,
} from '../../lib/preschoolScale';
import { periodScopeFromLevel } from '../../lib/educationLevels';

type Props = NativeStackScreenProps<WorkStackParamList, 'Grades'>;

type PickerKind = 'year' | 'class' | 'subject' | 'period' | null;

const TONE: Record<string, { ink: string; wash: string }> = {
  EXCELLENT: { ink: '#3F6212', wash: '#F3F7EA' },
  TRES_BIEN: { ink: '#3F6212', wash: '#F3F7EA' },
  BIEN: { ink: '#57534E', wash: '#F5F5F4' },
  ASSEZ_BIEN: { ink: '#C2410C', wash: '#FFF7ED' },
  TOUJOURS: { ink: '#3F6212', wash: '#F3F7EA' },
  SOUVENT: { ink: '#57534E', wash: '#F5F5F4' },
  PARFOIS: { ink: '#C2410C', wash: '#FFF7ED' },
  JAMAIS: { ink: '#B91C1C', wash: '#FEF2F2' },
  ADMIS: { ink: '#3F6212', wash: '#F3F7EA' },
  ADMIS_AILLEURS: { ink: '#57534E', wash: '#F5F5F4' },
  REDOUBLER: { ink: '#C2410C', wash: '#FFF7ED' },
  AJOURNE: { ink: '#C2410C', wash: '#FFF7ED' },
  RENVOYE_DEFINITIVEMENT: { ink: '#B91C1C', wash: '#FEF2F2' },
};

function toneOf(value: string) {
  return TONE[value] ?? { ink: colors.inkSoft, wash: colors.bg };
}

function initialOf(name: string) {
  const letter = name.trim().charAt(0);
  return letter ? letter.toUpperCase() : '?';
}

export function GradesScreen({}: Props) {
  const allowed = useCanAccess('grades');
  const { roleName } = useAuth();
  const { context, theme } = useSchool();
  const insets = useSafeAreaInsets();
  const isTeacher = isTeacherRole(roleName);

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
  const [evalMode, setEvalMode] = useState<'LEVEL' | 'FREQUENCY'>('LEVEL');
  const [isLastPeriod, setIsLastPeriod] = useState(false);
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
        if (isTeacher && c.length > 0) {
          setClassId((prev) => (prev && c.some((item) => item.id === prev) ? prev : c[0].id));
        }
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
        const all = await getPeriods(yearId);
        const scope =
          selectedClass?.is_preschool || periodScopeFromLevel(selectedClass?.level) === 'PRESCOLAIRE'
            ? 'PRESCOLAIRE'
            : 'ECOLE';
        const scoped = all.filter((p) => (p.scope || 'ECOLE') === scope);
        const list = (scoped.length ? scoped : all).sort(
          (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
        );
        if (cancelled) return;
        setPeriods(list);
        const preferred =
          periodScopeFromLevel(selectedClass?.level) === 'PRESCOLAIRE'
            ? context?.current_preschool_period_id
            : context?.current_period_id;
        setPeriodId((prev) =>
          list.some((p) => p.id === prev)
            ? prev
            : preferred && list.some((p) => p.id === preferred)
              ? preferred
              : list[0]?.id || '',
        );
      } catch {
        if (!cancelled) setPeriods([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [yearId, classId, selectedClass?.level, selectedClass?.is_preschool, context?.current_period_id, context?.current_preschool_period_id]);

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
      setEvalMode(data.eval_mode === 'FREQUENCY' ? 'FREQUENCY' : 'LEVEL');
      setIsLastPeriod(!!data.is_last_period);
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
            level: evalMode === 'LEVEL' ? r.level?.trim() || undefined : undefined,
            frequency: evalMode === 'FREQUENCY' ? r.frequency?.trim() || undefined : undefined,
            observation: r.observation?.trim() || undefined,
          })),
          ...(isLastPeriod
            ? {
                decisions: preschoolRows
                  .filter((r) => r.assignment_id)
                  .map((r) => ({
                    assignment_id: r.assignment_id as string,
                    decision: r.decision || null,
                  })),
              }
            : {}),
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
  const periodLabel = periods.find((p) => p.id === periodId)?.name || 'Contrôle';

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

  const notedCount = isPreschool
    ? preschoolRows.filter((row) => (evalMode === 'LEVEL' ? row.level : row.frequency)).length
    : rows.filter((row) => row.grade_value != null).length;
  const emptyTitle = !classId
    ? 'Choisissez une classe'
    : !subjectId
      ? 'Choisissez une matière'
      : !periodId
        ? 'Choisissez une période'
        : 'Choisissez une année';
  const selectedPickerId =
    picker === 'year' ? yearId : picker === 'class' ? classId : picker === 'subject' ? subjectId : periodId;

  return (
    <Screen style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={styles.top}>
        <Title>Saisie des notes</Title>

        {isTeacher ? (
          <View style={styles.teacherHead}>
            {classes.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                {classes.map((item) => {
                  const on = item.id === classId;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setClassId(item.id)}
                      style={[styles.pill, on && styles.pillOn]}
                    >
                      <Text style={[styles.pillText, on && styles.pillTextOn]}>{item.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : selectedClass ? (
              <Text style={styles.classTitle}>{selectedClass.name}</Text>
            ) : null}

            <View style={styles.filters}>
              <SelectChip label="Année" value={yearLabel} onPress={() => setPicker('year')} />
              <SelectChip
                label="Contrôle"
                value={periodLabel}
                onPress={() => setPicker('period')}
                disabled={periods.length === 0}
              />
            </View>

            {subjects.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                {subjects.map((item) => {
                  const on = item.id === subjectId;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setSubjectId(item.id)}
                      style={[styles.pill, on && { backgroundColor: theme.accentTint, borderColor: theme.accent }]}
                    >
                      <Text style={[styles.pillText, on && { color: theme.accent }]}>{item.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : subjectId ? (
              <Text style={styles.subjectTitle}>{subjectLabel}</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.filters}>
            <SelectChip label="Année" value={yearLabel} onPress={() => setPicker('year')} />
            <SelectChip label="Classe" value={classLabel} onPress={() => setPicker('class')} />
            <SelectChip
              label="Matière"
              value={subjectLabel}
              onPress={() => setPicker('subject')}
              disabled={!classId}
            />
            <SelectChip label="Contrôle" value={periodLabel} onPress={() => setPicker('period')} />
          </View>
        )}

        {teacherName && !isTeacher ? (
          <View style={styles.teacherLine}>
            <Ionicons name="person-outline" size={14} color={colors.inkSoft} />
            <Text style={styles.teacherText}>{teacherName}</Text>
          </View>
        ) : null}

        {isPreschool ? (
          <View style={styles.modeWrap}>
            <Pressable
              onPress={() => {
                setEvalMode(PRESCHOOL_EVAL_LEVEL);
                if (subjectId) void setSubjectPreschoolEval(subjectId, PRESCHOOL_EVAL_LEVEL);
              }}
              style={[
                styles.modeChip,
                evalMode === 'LEVEL' && { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}
            >
              <Text style={[styles.modeText, evalMode === 'LEVEL' && styles.modeTextOn]}>Niveau</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setEvalMode(PRESCHOOL_EVAL_FREQUENCY);
                if (subjectId) void setSubjectPreschoolEval(subjectId, PRESCHOOL_EVAL_FREQUENCY);
              }}
              style={[
                styles.modeChip,
                evalMode === 'FREQUENCY' && { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}
            >
              <Text style={[styles.modeText, evalMode === 'FREQUENCY' && styles.modeTextOn]}>
                Fréquence
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!canEdit && ready ? (
          <View style={styles.lockBanner}>
            <Ionicons name="lock-closed" size={14} color="#C2410C" />
            <Text style={styles.lockText}>Déjà enregistrées. Seule la direction peut modifier.</Text>
          </View>
        ) : null}

        <ErrorBanner message={error} />
        {success ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#3F6212" />
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}
      </View>

      {!ready ? (
        <EmptyState
          title={
            isTeacher && classes.length === 0
              ? 'Aucune classe'
              : !yearId
                ? 'Choisissez une année'
                : !periodId
                  ? 'Choisissez un contrôle'
                  : emptyTitle
          }
        />
      ) : formLoading ? (
        <View style={styles.loadingList}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={listData as { student_id: string }[]}
          keyExtractor={(item) => item.student_id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.list, { paddingBottom: 120 + insets.bottom }]}
          ListEmptyComponent={<EmptyState title="Aucun élève" />}
          renderItem={({ item }) =>
            isPreschool ? (
              <PreschoolRow
                row={item as PreschoolGradeRow}
                editable={canEdit}
                evalMode={evalMode}
                showDecision={isLastPeriod}
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
          <Text style={styles.stickyMeta}>
            {notedCount} / {listData.length}
          </Text>
          <Button
            title={saving ? 'Enregistrement…' : 'Enregistrer'}
            icon="checkmark"
            onPress={() => void handleSave()}
            disabled={saving}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}

      <Modal visible={!!picker} animationType="slide" transparent onRequestClose={() => setPicker(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicker(null)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {picker === 'year'
                  ? 'Année'
                  : picker === 'class'
                    ? 'Classe'
                    : picker === 'subject'
                      ? 'Matière'
                      : 'Contrôle'}
              </Text>
              <Pressable onPress={() => setPicker(null)} hitSlop={12}>
                <Text style={styles.modalClose}>Fermer</Text>
              </Pressable>
            </View>
            <FlatList
              data={pickerItems}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const on = item.id === selectedPickerId;
                return (
                  <Pressable style={styles.modalRow} onPress={() => onPick(item.id)}>
                    <Text style={[styles.modalRowText, on && styles.modalRowOn]}>{item.label}</Text>
                    {on ? <Ionicons name="checkmark" size={18} color={theme.accent} /> : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Muted>Aucune option</Muted>}
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
      <View style={{ flex: 1 }}>
        <Text style={styles.chipLabel}>{label}</Text>
        <Text style={styles.chipValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Ionicons name="chevron-down" size={16} color={colors.inkSoft} />
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
  const filled = row.grade_value != null;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.initial, filled && styles.initialOn]}>
          <Text style={[styles.initialText, filled && styles.initialTextOn]}>
            {initialOf(row.student_name)}
          </Text>
        </View>
        <Text style={styles.studentName}>{row.student_name}</Text>
      </View>
      <View style={styles.fieldsRow}>
        <View style={styles.noteBox}>
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
            style={styles.noteInput}
          />
        </View>
        <View style={styles.coefBox}>
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
            style={styles.coefInput}
          />
        </View>
      </View>
      <TextInput
        editable={editable}
        value={row.detail || ''}
        onChangeText={(detail) => onChange({ ...row, detail })}
        placeholder="Détail"
        placeholderTextColor={colors.textMuted}
        style={styles.detailInput}
      />
    </View>
  );
}

function ChoiceRow({
  options,
  value,
  editable,
  onChange,
}: {
  options: readonly { value: string; label: string }[];
  value: string | null | undefined;
  editable: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <View style={styles.choiceWrap}>
      {options.map((option) => {
        const on = value === option.value;
        const tone = toneOf(option.value);
        return (
          <Pressable
            key={option.value}
            disabled={!editable}
            onPress={() => onChange(on ? null : option.value)}
            style={[
              styles.choice,
              {
                backgroundColor: on ? tone.ink : tone.wash,
                borderColor: on ? tone.ink : 'transparent',
              },
              !editable && { opacity: 0.55 },
            ]}
          >
            <Text style={[styles.choiceText, { color: on ? colors.surface : tone.ink }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PreschoolRow({
  row,
  editable,
  evalMode,
  showDecision,
  onChange,
}: {
  row: PreschoolGradeRow;
  editable: boolean;
  evalMode: 'LEVEL' | 'FREQUENCY';
  showDecision: boolean;
  onChange: (row: PreschoolGradeRow) => void;
}) {
  const filled = evalMode === PRESCHOOL_EVAL_LEVEL ? !!row.level : !!row.frequency;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.initial, filled && styles.initialOn]}>
          <Text style={[styles.initialText, filled && styles.initialTextOn]}>
            {initialOf(row.student_name)}
          </Text>
        </View>
        <Text style={styles.studentName}>{row.student_name}</Text>
      </View>
      {evalMode === PRESCHOOL_EVAL_LEVEL ? (
        <>
          <Text style={styles.fieldLabel}>Niveau</Text>
          <ChoiceRow
            options={PRESCHOOL_LEVELS}
            value={row.level}
            editable={editable}
            onChange={(level) => onChange({ ...row, level })}
          />
        </>
      ) : (
        <>
          <Text style={styles.fieldLabel}>Fréquence</Text>
          <ChoiceRow
            options={PRESCHOOL_FREQUENCIES}
            value={row.frequency}
            editable={editable}
            onChange={(frequency) => onChange({ ...row, frequency })}
          />
        </>
      )}
      <TextInput
        editable={editable}
        value={row.observation || ''}
        onChangeText={(observation) => onChange({ ...row, observation })}
        placeholder="Observation"
        placeholderTextColor={colors.textMuted}
        style={styles.detailInput}
      />
      {showDecision ? (
        <>
          <Text style={styles.fieldLabel}>Décision</Text>
          <ChoiceRow
            options={YEAR_END_DECISIONS}
            value={row.decision}
            editable={editable}
            onChange={(decision) => onChange({ ...row, decision })}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20, paddingBottom: 8, gap: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  chipValue: { fontSize: 15, color: colors.text, fontWeight: '700', marginTop: 2 },
  teacherHead: { gap: 10 },
  classTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  subjectTitle: { fontSize: 15, fontWeight: '600', color: colors.inkSoft },
  pillRow: { gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillText: { color: colors.inkSoft, fontWeight: '600', fontSize: 13 },
  pillTextOn: { color: colors.surface },
  teacherLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teacherText: { fontSize: 13, color: colors.inkSoft, fontWeight: '600' },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  lockText: { flex: 1, color: '#C2410C', fontSize: 13, fontWeight: '600' },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3F7EA',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  successText: { color: '#3F6212', fontSize: 14, fontWeight: '600' },
  list: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
  loadingList: { paddingVertical: 40, alignItems: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  initial: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  initialOn: { backgroundColor: '#F3F7EA' },
  initialText: { fontWeight: '700', fontSize: 15, color: colors.inkSoft },
  initialTextOn: { color: '#3F6212' },
  studentName: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceText: { fontSize: 13, fontWeight: '600' },
  modeWrap: { flexDirection: 'row', gap: 8 },
  modeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  modeText: { fontSize: 13, fontWeight: '700', color: colors.inkSoft },
  modeTextOn: { color: colors.surface },
  fieldsRow: { flexDirection: 'row', gap: 10 },
  noteBox: { flex: 1, gap: 6 },
  coefBox: { width: 88, gap: 6 },
  fieldLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  coefInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
    textAlign: 'center',
  },
  detailInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stickyMeta: { fontSize: 15, fontWeight: '700', color: colors.ink, minWidth: 52 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(28,25,23,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingBottom: 24,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalRowText: { fontSize: 16, color: colors.text, fontWeight: '600' },
  modalRowOn: { color: colors.ink },
});
