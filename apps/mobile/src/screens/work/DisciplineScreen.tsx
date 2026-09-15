import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormScrollView } from '../../components/FormScrollView';
import {
  Button,
  ErrorBanner,
  ListRow,
  LoadingBlock,
  Screen,
  SegmentedControl,
  DateField,
  Title,
} from '../../components/ui';
import { studentDisplayName, toYYYYMMDD } from '../../lib/format';
import { colors } from '../../theme/tokens';
import {
  createDeduction,
  createLateness,
  createMeasure,
  deleteDeduction,
  deleteLateness,
  deleteMeasure,
  getClasses,
  getStudents,
  listDeductions,
  listLatenesses,
  listMeasures,
  type ClassItem,
  type DeductionItem,
  type LatenessItem,
  type MeasureItem,
  type StudentListItem,
} from '../../services/api';
import type { WorkStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<WorkStackParamList, 'Discipline'>;
type TabId = 'appel' | 'retards' | 'points' | 'mesures';
type PickerKind = 'class' | 'student' | 'measureType' | null;

const MEASURE_TYPES = [
  { id: 'SOUS_SURVEILLANCE', label: 'Sous-surveillance' },
  { id: 'EN_RETENUE', label: 'En retenue' },
  { id: 'RENVOYE_TEMPORAIREMENT', label: 'Renvoyé temporairement' },
  { id: 'RENVOYE_DEFINITIVEMENT', label: 'Renvoyé définitivement' },
];

export function DisciplineScreen({ navigation }: Props) {
  const allowed = useCanAccess('discipline');
  const [tab, setTab] = useState<TabId>('appel');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [picker, setPicker] = useState<PickerKind>(null);

  const [classId, setClassId] = useState('');
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
        const list = await getClasses();
        if (!cancelled) setClasses(list);
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

  useEffect(() => {
    setStudentId('');
    if (!classId) {
      setStudents([]);
      return;
    }
    let cancelled = false;
    getStudents({ class_id: classId })
      .then((list) => {
        if (!cancelled) setStudents(list);
      })
      .catch(() => {
        if (!cancelled) setStudents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const refreshLists = useCallback(async () => {
    try {
      if (tab === 'retards') {
        setLatenesses(await listLatenesses({ class_id: classId || undefined, date: date || undefined }));
      } else if (tab === 'points') {
        setDeductions(await listDeductions(studentId || undefined));
      } else if (tab === 'mesures') {
        setMeasures(await listMeasures(studentId || undefined));
      }
    } catch {
      /* ignore list errors */
    }
  }, [tab, classId, date, studentId]);

  useEffect(() => {
    if (tab !== 'appel') void refreshLists();
  }, [tab, refreshLists]);

  const pickerItems = useMemo(() => {
    if (picker === 'class') return classes.map((c) => ({ id: c.id, label: c.name }));
    if (picker === 'student')
      return students.map((s) => ({
        id: s.id,
        label: [s.order_number, studentDisplayName(s)].filter(Boolean).join(' — '),
      }));
    if (picker === 'measureType') return MEASURE_TYPES.map((m) => ({ id: m.id, label: m.label }));
    return [];
  }, [picker, classes, students]);

  function onPick(id: string) {
    if (picker === 'class') setClassId(id);
    if (picker === 'student') setStudentId(id);
    if (picker === 'measureType') setMeasureType(id);
    setPicker(null);
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
        class_id: classId,
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

  const classLabel = classes.find((c) => c.id === classId)?.name || 'Classe';
  const studentLabel = students.find((s) => s.id === studentId)
    ? studentDisplayName(students.find((s) => s.id === studentId)!)
    : 'Élève';
  const measureLabel = MEASURE_TYPES.find((m) => m.id === measureType)?.label || measureType;

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <FormScrollView contentContainerStyle={styles.content}>
        <Title>Discipline</Title>

        <View style={{ marginTop: 12 }}>
          <SegmentedControl
            options={[
              { id: 'appel', label: 'Appel' },
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
        </View>

        <ErrorBanner message={error} />
        {success ? (
          <View style={styles.ok}>
            <Text style={styles.okText}>{success}</Text>
          </View>
        ) : null}

        {tab === 'appel' ? (
          <View style={styles.card}>
            <Button title="Ouvrir l’appel" onPress={() => navigation.navigate('Attendance')} />
          </View>
        ) : null}

        {tab === 'retards' ? (
          <View style={styles.card}>
            <Select label="Classe" value={classLabel} onPress={() => setPicker('class')} />
            <Select label="Élève" value={studentLabel} onPress={() => setPicker('student')} disabled={!classId} />
            <DateField label="Date" value={date} onChange={setDate} maximumDate={new Date()} />
            <Field label="Heure d’arrivée" value={arrival} onChange={setArrival} />
            <Button title={saving ? '…' : 'Enregistrer le retard'} onPress={() => void saveLateness()} disabled={saving} />
            {latenesses.map((l) => (
              <ListRow
                key={l.id}
                title={l.student_name || 'Élève'}
                subtitle={`${String(l.date || '').slice(0, 10)} · ${l.arrival_time || ''}`}
                onPress={() => confirmDelete('lateness', l.id)}
              />
            ))}
          </View>
        ) : null}

        {tab === 'points' ? (
          <View style={styles.card}>
            <Select label="Classe" value={classLabel} onPress={() => setPicker('class')} />
            <Select label="Élève" value={studentLabel} onPress={() => setPicker('student')} disabled={!classId} />
            <View style={styles.row}>
              <Pressable
                style={[styles.chip, action === 'RETIRER' && styles.chipOn]}
                onPress={() => setAction('RETIRER')}
              >
                <Text style={[styles.chipText, action === 'RETIRER' && styles.chipTextOn]}>Retirer</Text>
              </Pressable>
              <Pressable
                style={[styles.chip, action === 'AJOUTER' && styles.chipOn]}
                onPress={() => setAction('AJOUTER')}
              >
                <Text style={[styles.chipText, action === 'AJOUTER' && styles.chipTextOn]}>Ajouter</Text>
              </Pressable>
            </View>
            <Field label="Points (1–100)" value={points} onChange={setPoints} keyboardType="number-pad" />
            <Field label="Motif" value={reason} onChange={setReason} />
            <Button title={saving ? '…' : 'Enregistrer'} onPress={() => void saveDeduction()} disabled={saving} />
            {deductions.map((d) => (
              <ListRow
                key={d.id}
                title={`${d.student_name || 'Élève'} · ${d.points_deducted ?? 0} pts`}
                subtitle={d.reason || 'Sans motif'}
                onPress={() => confirmDelete('deduction', d.id)}
              />
            ))}
          </View>
        ) : null}

        {tab === 'mesures' ? (
          <View style={styles.card}>
            <Select label="Classe" value={classLabel} onPress={() => setPicker('class')} />
            <Select label="Élève" value={studentLabel} onPress={() => setPicker('student')} disabled={!classId} />
            <Select label="Type" value={measureLabel} onPress={() => setPicker('measureType')} />
            {measureType === 'RENVOYE_TEMPORAIREMENT' ? (
              <Field label="Durée (jours)" value={durationDays} onChange={setDurationDays} keyboardType="number-pad" />
            ) : null}
            <Field label="Motif" value={reason} onChange={setReason} />
            <Button title={saving ? '…' : 'Enregistrer la mesure'} onPress={() => void saveMeasure()} disabled={saving} />
            {measures.map((m) => (
              <ListRow
                key={m.id}
                title={m.student_name || 'Élève'}
                subtitle={`${MEASURE_TYPES.find((t) => t.id === m.measure_type)?.label || m.measure_type}${m.reason ? ` · ${m.reason}` : ''}`}
                onPress={() => confirmDelete('measure', m.id)}
              />
            ))}
          </View>
        ) : null}
      </FormScrollView>

      <Modal visible={!!picker} animationType="slide" transparent>
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Sélection</Text>
            <FlatList
              data={pickerItems}
              keyExtractor={(i) => i.id}
              renderItem={({ item }) => (
                <Pressable style={styles.sheetRow} onPress={() => onPick(item.id)}>
                  <Text style={styles.sheetRowText}>{item.label}</Text>
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

function Select({
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
    <Pressable onPress={onPress} disabled={disabled} style={[styles.select, disabled && { opacity: 0.45 }]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  card: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  ok: { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 10, marginBottom: 8 },
  okText: { color: '#15803D' },
  select: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    backgroundColor: colors.bg,
  },
  label: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  value: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  row: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontWeight: '700', color: colors.text },
  chipTextOn: { color: colors.surface },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,25,23,0.45)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 10, color: colors.text },
  sheetRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetRowText: { fontSize: 16, color: colors.text },
});
