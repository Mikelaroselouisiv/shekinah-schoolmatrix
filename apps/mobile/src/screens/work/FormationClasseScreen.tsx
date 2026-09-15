import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
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
import { useSchool } from '../../context/SchoolContext';
import { studentDisplayName } from '../../lib/format';
import { colors } from '../../theme/tokens';
import {
  computeFormationDecisions,
  getAcademicYears,
  getClasses,
  getFormationStudents,
  getRooms,
  moveFormationStudent,
  setFormationDecision,
  updateStudent,
  type AcademicYear,
  type ClassItem,
  type FormationStudent,
  type RoomItem,
} from '../../services/api';
import type { WorkStackParamList } from '../../navigation/types';
import type { MoreStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props =
  | NativeStackScreenProps<WorkStackParamList, 'FormationClasse'>
  | NativeStackScreenProps<MoreStackParamList, 'FormationClasse'>;

type PickerKind = 'year' | 'class' | 'decision' | 'room' | 'move-class' | null;

const DECISION_OPTIONS = [
  { id: 'ADMIS', label: 'Admis' },
  { id: 'ADMIS_AILLEURS', label: 'Admis ailleurs' },
  { id: 'REDOUBLER', label: 'Redoubler' },
  { id: 'AJOURNE', label: 'Ajourné' },
  { id: 'RENVOYE_DEFINITIVEMENT', label: 'Renvoyé définitivement' },
];

const DECISION_LABEL: Record<string, string> = Object.fromEntries(
  DECISION_OPTIONS.map((d) => [d.id, d.label]),
);

export function FormationClasseScreen({}: Props) {
  const allowed = useCanAccess('formation-classe');
  const { context } = useSchool();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<FormationStudent[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [yearId, setYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [boot, setBoot] = useState(true);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [picker, setPicker] = useState<PickerKind>(null);
  const [decisionTarget, setDecisionTarget] = useState<FormationStudent | null>(null);
  const [roomTarget, setRoomTarget] = useState<FormationStudent | null>(null);
  const [classMoveTarget, setClassMoveTarget] = useState<FormationStudent | null>(null);

  const selectedClass = classes.find((c) => c.id === classId);
  const isPreschool = !!selectedClass?.is_preschool;
  const yearLabel = years.find((y) => y.id === yearId)?.name || '—';
  const classLabel = selectedClass?.name || '—';

  const loadStudents = useCallback(async () => {
    if (!yearId || !classId) {
      setStudents([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setStudents(await getFormationStudents(yearId, classId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [yearId, classId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [y, c] = await Promise.all([getAcademicYears(), getClasses()]);
        if (cancelled) return;
        setYears(y);
        setClasses(c);
        const defaultYear =
          context?.academic_year?.id ||
          context?.current_academic_year_id ||
          y[0]?.id ||
          '';
        setYearId(defaultYear);
        setClassId(c[0]?.id || '');
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
    if (!boot) void loadStudents();
  }, [boot, loadStudents]);

  useEffect(() => {
    if (!classId) {
      setRooms([]);
      return;
    }
    let cancelled = false;
    void getRooms(classId)
      .then((list) => {
        if (!cancelled) setRooms(list.filter((r) => r.active !== false));
      })
      .catch(() => {
        if (!cancelled) setRooms([]);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  async function handleCompute() {
    if (!yearId || !classId || isPreschool) return;
    setComputing(true);
    setError('');
    setSuccess('');
    try {
      await computeFormationDecisions(yearId, classId);
      setSuccess('Décisions calculées.');
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calcul impossible');
    } finally {
      setComputing(false);
    }
  }

  async function applyDecision(decision: string) {
    if (!decisionTarget?.assignment_id) return;
    setSavingId(decisionTarget.assignment_id);
    setError('');
    try {
      await setFormationDecision(decisionTarget.assignment_id, decision);
      setPicker(null);
      setDecisionTarget(null);
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSavingId(null);
    }
  }

  async function applyRoom(roomId: string) {
    if (!roomTarget) return;
    const nextId = roomId === '__none__' ? null : roomId;
    if ((roomTarget.room_id ?? null) === nextId) {
      setPicker(null);
      setRoomTarget(null);
      return;
    }
    setSavingId(roomTarget.id);
    setError('');
    try {
      await updateStudent(roomTarget.id, { room_id: nextId });
      setPicker(null);
      setRoomTarget(null);
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attribution impossible');
    } finally {
      setSavingId(null);
    }
  }

  async function applyMoveClass(nextClassId: string) {
    if (!classMoveTarget || !yearId || !nextClassId || nextClassId === classId) {
      setPicker(null);
      setClassMoveTarget(null);
      return;
    }
    setSavingId(classMoveTarget.id);
    setError('');
    try {
      await moveFormationStudent(classMoveTarget.id, yearId, nextClassId);
      setPicker(null);
      setClassMoveTarget(null);
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Changement de classe impossible');
    } finally {
      setSavingId(null);
    }
  }

  const pickerItems = useMemo(() => {
    if (picker === 'year') return years.map((y) => ({ id: y.id, label: y.name }));
    if (picker === 'class' || picker === 'move-class') {
      return classes.map((c) => ({ id: c.id, label: c.name }));
    }
    if (picker === 'decision') return DECISION_OPTIONS;
    if (picker === 'room') {
      return [
        { id: '__none__', label: 'Sans salle' },
        ...rooms.map((r) => ({ id: r.id, label: r.name })),
      ];
    }
    return [];
  }, [picker, years, classes, rooms]);

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
        <Title>Formation de classe</Title>

        <View style={styles.filters}>
          <SelectChip label="Année" value={yearLabel} onPress={() => setPicker('year')} />
          <SelectChip label="Classe" value={classLabel} onPress={() => setPicker('class')} />
        </View>

        {!isPreschool ? (
          <Button
            title={computing ? 'Calcul…' : 'Calculer les décisions'}
            onPress={() => void handleCompute()}
            disabled={computing || !yearId || !classId}
          />
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
      ) : (
        <FlatList
          data={students}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="Aucun élève" />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {studentDisplayName(item)}
                {item.order_number ? ` · ${item.order_number}` : ''}
              </Text>
              <Muted>
                Salle {item.room_name || 'Sans salle'}
                {' · '}
                Moyenne{' '}
                {item.average != null
                  ? item.average.toLocaleString('fr-FR', {
                      maximumFractionDigits: 2,
                    })
                  : '—'}
                {' · '}
                {item.decision
                  ? DECISION_LABEL[item.decision] || item.decision
                  : 'Sans décision'}
              </Muted>
              {rooms.length > 0 ? (
                <Pressable
                  onPress={() => {
                    setRoomTarget(item);
                    setPicker('room');
                  }}
                  disabled={savingId === item.id}
                >
                  <Text style={styles.editLink}>
                    {savingId === item.id
                      ? '…'
                      : item.room_id
                        ? 'Changer de salle'
                        : 'Attribuer une salle'}
                  </Text>
                </Pressable>
              ) : null}
              {classes.length > 1 ? (
                <Pressable
                  onPress={() => {
                    setClassMoveTarget(item);
                    setPicker('move-class');
                  }}
                  disabled={savingId === item.id}
                >
                  <Text style={styles.editLink}>Changer de classe</Text>
                </Pressable>
              ) : null}
              {item.assignment_id ? (
                <Pressable
                  onPress={() => {
                    setDecisionTarget(item);
                    setPicker('decision');
                  }}
                  disabled={savingId === item.assignment_id}
                >
                  <Text style={styles.editLink}>
                    {savingId === item.assignment_id ? '…' : 'Modifier la décision'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}

      <Modal visible={!!picker} animationType="slide" transparent>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            setPicker(null);
            setDecisionTarget(null);
            setRoomTarget(null);
            setClassMoveTarget(null);
          }}
        >
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <FlatList
              data={pickerItems}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    if (picker === 'year') setYearId(item.id);
                    if (picker === 'class') setClassId(item.id);
                    if (picker === 'decision') void applyDecision(item.id);
                    if (picker === 'room') void applyRoom(item.id);
                    if (picker === 'move-class') void applyMoveClass(item.id);
                    else if (
                      picker !== 'decision' &&
                      picker !== 'room' &&
                      picker !== 'move-class'
                    ) {
                      setPicker(null);
                    }
                  }}
                >
                  <Text style={styles.cardTitle}>{item.label}</Text>
                </Pressable>
              )}
            />
            <Button
              title="Fermer"
              variant="ghost"
              onPress={() => {
                setPicker(null);
                setDecisionTarget(null);
                setRoomTarget(null);
                setClassMoveTarget(null);
              }}
            />
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
  editLink: { marginTop: 8, color: colors.primaryFallback, fontWeight: '700' },
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
  modalSheet: {
    maxHeight: '55%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  modalRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
