import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Screen,
  DateField,
  Title,
} from '../../components/ui';
import { useSchool } from '../../context/SchoolContext';
import {
  studentDisplayName,
  toYYYYMMDD,
  shiftYYYYMMDD,
} from '../../lib/format';
import {
  getAttendance,
  getClasses,
  type AttendanceStatus,
  type AttendanceStudent,
  type ClassItem,
} from '../../services/api';
import { saveAttendanceWithQueue } from '../../lib/mutationQueue';
import { useNetwork } from '../../context/NetworkContext';
import { colors } from '../../theme/tokens';
import type { WorkStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<WorkStackParamList, 'Attendance'>;

const STATUSES: { value: AttendanceStatus; label: string; short: string }[] = [
  { value: 'PRESENT', label: 'Présent', short: 'P' },
  { value: 'ABSENT', label: 'Absent', short: 'A' },
  { value: 'LATE', label: 'Retard', short: 'R' },
  { value: 'EXCUSED', label: 'Excusé', short: 'E' },
];

export function AttendanceScreen({}: Props) {
  const allowed = useCanAccess('discipline');
  const { theme } = useSchool();
  const { online, refreshStatus } = useNetwork();
  const insets = useSafeAreaInsets();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(toYYYYMMDD());
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getClasses();
        if (!cancelled) setClasses(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Impossible de charger les classes');
        }
      } finally {
        if (!cancelled) setLoadingClasses(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAttendance = useCallback(async () => {
    if (!classId || !date) {
      setStudents([]);
      return;
    }
    setLoadingList(true);
    setError('');
    setSuccess('');
    try {
      const data = await getAttendance(classId, date);
      setStudents(
        (data.students || []).map((s) => ({
          ...s,
          status: (s.status as AttendanceStatus) || 'PRESENT',
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur chargement appel');
      setStudents([]);
    } finally {
      setLoadingList(false);
    }
  }, [classId, date]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  function setStatus(studentId: string, status: AttendanceStatus) {
    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, status } : s)));
    setSuccess('');
  }

  async function handleSave() {
    if (!classId || !date || students.length === 0) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await saveAttendanceWithQueue(
        classId,
        date,
        students.map((s) => ({
          student_id: s.id,
          status: s.status || 'PRESENT',
        })),
      );
      if (result.queued) {
        setSuccess(
          online
            ? 'Réseau instable — appel mis en file d’attente.'
            : 'Hors ligne — appel mis en file d’attente.',
        );
        await refreshStatus();
      } else {
        setSuccess('Appel enregistré.');
        await loadAttendance();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’enregistrement');
    } finally {
      setSaving(false);
    }
  }

  const selectedClass = classes.find((c) => c.id === classId);
  const presentCount = students.filter((s) => s.status === 'PRESENT').length;
  const absentCount = students.filter((s) => s.status === 'ABSENT').length;

  if (loadingClasses) {
    return (
      <Screen>
        <LoadingBlock label="Chargement des classes…" />
      </Screen>
    );
  }

  if (!allowed) {
    return <AccessDenied />;
  }

  return (
    <Screen style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={styles.top}>
        <Title>Appel</Title>

        <Pressable style={styles.select} onPress={() => setPickerOpen(true)}>
          <Text style={styles.selectLabel}>Classe</Text>
          <Text style={styles.selectValue}>
            {selectedClass?.name || 'Sélectionner une classe'}
          </Text>
        </Pressable>

        <View style={styles.dateRow}>
          <Pressable
            style={styles.dateBtn}
            onPress={() => setDate((d) => shiftYYYYMMDD(d, -1))}
          >
            <Text style={styles.dateBtnText}>‹</Text>
          </Pressable>
          <View style={styles.dateCenter}>
            <DateField value={date} onChange={setDate} maximumDate={new Date()} />
            <Pressable onPress={() => setDate(toYYYYMMDD())}>
              <Text style={[styles.todayLink, { color: theme.primary }]}>Aujourd’hui</Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.dateBtn}
            onPress={() => setDate((d) => shiftYYYYMMDD(d, 1))}
          >
            <Text style={styles.dateBtnText}>›</Text>
          </Pressable>
        </View>

        <ErrorBanner message={error} />
        {success ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}

        {classId && students.length > 0 ? (
          <Text style={styles.summary}>
            {students.length} élèves · {presentCount} présents · {absentCount} absents
          </Text>
        ) : null}
      </View>

      {!classId ? (
        <EmptyState title="Choisissez une classe" />
      ) : loadingList ? (
        <View style={styles.loadingList}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={(item) => item.id}
          initialNumToRender={20}
          windowSize={8}
          maxToRenderPerBatch={16}
          removeClippedSubviews
          contentContainerStyle={[styles.list, { paddingBottom: 100 + insets.bottom }]}
          ListEmptyComponent={
            <EmptyState title="Aucun élève" />
          }
          renderItem={({ item }) => (
            <View style={styles.studentRow}>
              <Text style={styles.studentName}>{studentDisplayName(item)}</Text>
              <View style={styles.statusRow}>
                {STATUSES.map((st) => {
                  const active = (item.status || 'PRESENT') === st.value;
                  return (
                    <Pressable
                      key={st.value}
                      onPress={() => setStatus(item.id, st.value)}
                      style={[
                        styles.statusChip,
                        active && {
                          backgroundColor: statusColor(st.value, theme.primary),
                          borderColor: statusColor(st.value, theme.primary),
                        },
                      ]}
                    >
                      <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                        {st.short}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.statusHint}>
                {STATUSES.find((s) => s.value === (item.status || 'PRESENT'))?.label}
              </Text>
            </View>
          )}
        />
      )}

      {classId && students.length > 0 ? (
        <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button
            title={saving ? 'Enregistrement…' : 'Enregistrer l’appel'}
            onPress={() => void handleSave()}
            disabled={saving}
          />
        </View>
      ) : null}

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Choisir une classe</Text>
            <FlatList
              data={classes}
              keyExtractor={(c) => c.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setClassId(item.id);
                    setPickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalRowText,
                      item.id === classId && { color: theme.primary, fontWeight: '700' },
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              )}
            />
            <Button title="Fermer" variant="ghost" onPress={() => setPickerOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function statusColor(status: AttendanceStatus, primary: string): string {
  switch (status) {
    case 'PRESENT':
      return '#15803D';
    case 'ABSENT':
      return '#DC2626';
    case 'LATE':
      return '#D97706';
    case 'EXCUSED':
      return primary;
    default:
      return primary;
  }
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20, paddingBottom: 8 },
  select: {
    marginTop: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  selectValue: { fontSize: 16, color: colors.text, marginTop: 2, fontWeight: '600' },
  dateRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBtnText: { fontSize: 24, color: colors.text },
  dateCenter: { flex: 1, alignItems: 'stretch' },
  dateValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  todayLink: { marginTop: 2, fontSize: 13, fontWeight: '600' },
  summary: {
    marginTop: 10,
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
  },
  successBanner: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  successText: { color: '#15803D', fontSize: 14 },
  list: { paddingHorizontal: 20 },
  loadingList: { paddingVertical: 40, alignItems: 'center' },
  studentRow: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  studentName: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 10 },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  statusChipText: { fontSize: 16, fontWeight: '800', color: colors.textMuted },
  statusChipTextActive: { color: '#fff' },
  statusHint: { marginTop: 8, fontSize: 12, color: colors.textMuted },
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
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  modalRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalRowText: { fontSize: 16, color: colors.text },
});
