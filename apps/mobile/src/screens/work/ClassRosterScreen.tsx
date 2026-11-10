import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormModal } from '../../components/FormModal';
import { Button, EmptyState, ErrorBanner, LoadingBlock, Screen } from '../../components/ui';
import { AccessDenied } from '../../lib/access';
import { useAuth } from '../../context/AuthContext';
import { shiftYYYYMMDD, studentDisplayName, toYYYYMMDD } from '../../lib/format';
import { useLatestRequest } from '../../lib/latestRequest';
import { canManageRosters } from '../../lib/permissions';
import {
  archiveStudent,
  getAttendance,
  getClasses,
  getRooms,
  getStudents,
  updateStudent,
  type AttendanceStatus,
  type ClassItem,
  type RoomItem,
  type StudentListItem,
} from '../../services/api';
import { listBottomPadding } from '../../lib/layout';
import { colors } from '../../theme/tokens';
import type { WorkStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<WorkStackParamList, 'ClassRoster'>;

const STATUSES: {
  value: AttendanceStatus | 'UNSET';
  label: string;
  ink: string;
  wash: string;
}[] = [
  { value: 'PRESENT', label: 'Présent', ink: '#3F6212', wash: '#F3F7EA' },
  { value: 'ABSENT', label: 'Absent', ink: '#B91C1C', wash: '#FEF2F2' },
  { value: 'LATE', label: 'Retard', ink: '#C2410C', wash: '#FFF7ED' },
  { value: 'EXCUSED', label: 'Excusé', ink: '#57534E', wash: '#F5F5F4' },
  { value: 'UNSET', label: 'Non pointé', ink: '#57534E', wash: '#F5F5F4' },
];

type Row = StudentListItem & { status: AttendanceStatus | 'UNSET' };

function statusMeta(value: AttendanceStatus | 'UNSET') {
  return STATUSES.find((item) => item.value === value) ?? STATUSES[4];
}

function formatDayLong(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day, 15, 0, 0));
  const label = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'America/Port-au-Prince',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(instant);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function ClassRosterScreen({}: Props) {
  const { roleName, rolePermissions } = useAuth();
  const allowed = canManageRosters(roleName, rolePermissions);
  const latest = useLatestRequest();
  const today = toYYYYMMDD();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [classId, setClassId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [onlyPresent, setOnlyPresent] = useState(false);
  const [boot, setBoot] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Row | null>(null);
  const [targetClassId, setTargetClassId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [classList, roomList] = await Promise.all([getClasses(), getRooms()]);
        if (cancelled) return;
        const sorted = [...classList].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        setClasses(sorted);
        setRooms(roomList.filter((room) => room.active !== false));
        setClassId(sorted[0]?.id || '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement impossible');
      } finally {
        if (!cancelled) setBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const classRooms = useMemo(
    () =>
      rooms
        .filter((room) => room.class_id === classId)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [rooms, classId],
  );

  useEffect(() => {
    setRoomId((current) =>
      classRooms.some((room) => room.id === current) ? current : classRooms[0]?.id || '',
    );
  }, [classRooms]);

  const load = useCallback(async () => {
    if (!classId) {
      setRows([]);
      return;
    }
    if (roomId && !classRooms.some((room) => room.id === roomId)) {
      latest();
      return;
    }
    if (!roomId) {
      setRows([]);
      return;
    }
    const still = latest();
    const requestedClass = classId;
    setLoading(true);
    try {
      const [students, sheet] = await Promise.all([
        getStudents({ room_id: roomId }),
        getAttendance(requestedClass, date).catch(() => null),
      ]);
      if (!still()) return;
      const statusById = new Map(
        (sheet?.students || []).map((student) => [student.id, student.status]),
      );
      setRows(
        students
          .filter(
            (student) =>
              student.active !== false &&
              (!student.class_id || student.class_id === requestedClass),
          )
          .map((student) => {
            const raw = statusById.get(student.id);
            const status = (raw || 'UNSET') as AttendanceStatus | 'UNSET';
            return { ...student, status };
          })
          .sort(
            (a, b) =>
              a.last_name.localeCompare(b.last_name, 'fr') ||
              a.first_name.localeCompare(b.first_name, 'fr'),
          ),
      );
      setError('');
    } catch (err) {
      if (!still()) return;
      setError(err instanceof Error ? err.message : 'Chargement impossible');
    } finally {
      if (still()) setLoading(false);
    }
  }, [classId, classRooms, roomId, date, latest]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = onlyPresent ? rows.filter((row) => row.status === 'PRESENT') : rows;
  const presentCount = rows.filter((row) => row.status === 'PRESENT').length;
  const targetRooms = rooms
    .filter((room) => room.class_id === targetClassId)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  async function moveRoom(student: Row, nextRoomId: string) {
    setSaving(true);
    setError('');
    try {
      await updateStudent(student.id, { room_id: nextRoomId });
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Déplacement impossible');
    } finally {
      setSaving(false);
    }
  }

  async function moveClass(student: Row, nextClassId: string, nextRoomId: string) {
    setSaving(true);
    setError('');
    try {
      await updateStudent(student.id, { class_id: nextClassId, room_id: nextRoomId });
      setSelected(null);
      setTargetClassId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Changement de classe impossible');
    } finally {
      setSaving(false);
    }
  }

  function archive(student: Row) {
    Alert.alert(
      'Anciens élèves',
      `${studentDisplayName(student)} quitte la liste active. Le dossier reste parmi les anciens élèves.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                await archiveStudent(student.id);
                setSelected(null);
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Retrait impossible');
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ],
    );
  }

  if (!allowed) return <AccessDenied />;
  if (boot) return <LoadingBlock />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: listBottomPadding(24) }]} showsVerticalScrollIndicator={false}>
        {classes.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {classes.map((item) => {
              const on = item.id === classId;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setClassId(item.id)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{item.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : classes[0] ? (
          <Text style={styles.className}>{classes[0].name}</Text>
        ) : (
          <EmptyState title="Aucune classe" />
        )}

        {classId && classRooms.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {classRooms.map((room) => {
              const on = room.id === roomId;
              return (
                <Pressable
                  key={room.id}
                  onPress={() => setRoomId(room.id)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{room.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : classRooms[0] ? (
          <Text style={styles.className}>{classRooms[0].name}</Text>
        ) : classId ? (
          <Text style={styles.className}>Aucune salle dans cette classe</Text>
        ) : null}

        <View style={styles.dateCard}>
          <Pressable
            onPress={() => setDate((current) => shiftYYYYMMDD(current, -1))}
            hitSlop={10}
            style={styles.step}
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.dateCopy}>
            <Text style={styles.dateTitle}>{formatDayLong(date)}</Text>
            <Text style={styles.dateState}>
              {presentCount} présent{presentCount > 1 ? 's' : ''} · {rows.length} élève
              {rows.length > 1 ? 's' : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => setDate((current) => (current >= today ? current : shiftYYYYMMDD(current, 1)))}
            hitSlop={10}
            disabled={date >= today}
            style={styles.step}
          >
            <Ionicons
              name="chevron-forward"
              size={22}
              color={date >= today ? colors.border : colors.ink}
            />
          </Pressable>
        </View>

        <View style={styles.chips}>
          <Pressable
            onPress={() => setOnlyPresent(false)}
            style={[styles.chip, !onlyPresent && styles.chipOn]}
          >
            <Text style={[styles.chipText, !onlyPresent && styles.chipTextOn]}>Tous</Text>
          </Pressable>
          <Pressable
            onPress={() => setOnlyPresent(true)}
            style={[styles.chip, onlyPresent && styles.chipOn]}
          >
            <Text style={[styles.chipText, onlyPresent && styles.chipTextOn]}>Présents</Text>
          </Pressable>
        </View>

        {error ? <ErrorBanner message={error} /> : null}

        {loading ? (
          <LoadingBlock />
        ) : visible.length === 0 ? (
          <EmptyState title={onlyPresent ? 'Aucun élève présent' : 'Aucun élève dans cette salle'} />
        ) : (
          visible.map((row) => {
            const meta = statusMeta(row.status);
            return (
              <Pressable key={row.id} style={styles.card} onPress={() => {
                setTargetClassId('');
                setSelected(row);
              }}>
                <View style={[styles.bar, { backgroundColor: meta.ink }]} />
                <View style={styles.cardBody}>
                  <Text style={styles.name}>{studentDisplayName(row)}</Text>
                  <View style={[styles.badge, { backgroundColor: meta.wash }]}>
                    <Text style={[styles.badgeText, { color: meta.ink }]}>{meta.label}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <FormModal visible={!!selected} onRequestClose={() => setSelected(null)}>
        {selected ? (
          <>
            <Text style={styles.sheetTitle}>{studentDisplayName(selected)}</Text>
            <Text style={styles.sheetMeta}>{statusMeta(selected.status).label}</Text>
            <Text style={styles.section}>Salle de cette classe</Text>
            {classRooms.map((room) => (
              <Pressable
                key={room.id}
                disabled={saving || room.id === roomId}
                onPress={() => void moveRoom(selected, room.id)}
                style={[styles.choice, room.id === roomId && styles.choiceOn]}
              >
                <Text style={styles.choiceText}>
                  {room.name}
                  {room.id === roomId ? ' · actuelle' : ''}
                </Text>
              </Pressable>
            ))}
            <Text style={styles.section}>Autre classe</Text>
            {(targetClassId ? [] : classes.filter((item) => item.id !== classId)).map((item) => (
              <Pressable
                key={item.id}
                disabled={saving}
                onPress={() => setTargetClassId(item.id)}
                style={styles.choice}
              >
                <Text style={styles.choiceText}>{item.name}</Text>
              </Pressable>
            ))}
            {targetClassId ? (
              <>
                <Text style={styles.sheetMeta}>
                  {classes.find((item) => item.id === targetClassId)?.name} · choisir la salle
                </Text>
                {targetRooms.length === 0 ? (
                  <Button
                    title={saving ? '…' : 'Placer sans salle'}
                    variant="ghost"
                    disabled={saving}
                    onPress={() => void moveClass(selected, targetClassId, '')}
                  />
                ) : (
                  targetRooms.map((room) => (
                    <Pressable
                      key={room.id}
                      disabled={saving}
                      onPress={() => void moveClass(selected, targetClassId, room.id)}
                      style={styles.choice}
                    >
                      <Text style={styles.choiceText}>{room.name}</Text>
                    </Pressable>
                  ))
                )}
                <Button title="Retour aux classes" variant="ghost" onPress={() => setTargetClassId('')} />
              </>
            ) : null}
            <View style={{ marginTop: 16, gap: 8, marginBottom: 24 }}>
              <Button
                title="Retirer · anciens élèves"
                icon="archive-outline"
                variant="danger"
                disabled={saving}
                onPress={() => archive(selected)}
              />
              <Button title="Fermer" variant="ghost" onPress={() => setSelected(null)} />
            </View>
          </>
        ) : null}
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingBottom: 36, gap: 12 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.inkSoft, fontWeight: '600', fontSize: 13 },
  chipTextOn: { color: colors.surface },
  className: { fontSize: 15, fontWeight: '600', color: colors.ink },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  step: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dateCopy: { flex: 1, alignItems: 'center', gap: 2 },
  dateTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  dateState: { fontSize: 12, fontWeight: '600', color: colors.inkSoft },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  bar: { width: 5, alignSelf: 'stretch' },
  cardBody: { flex: 1, padding: 12, gap: 6 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  sheetMeta: { fontSize: 14, color: colors.textMuted, marginBottom: 8 },
  section: { marginTop: 12, marginBottom: 6, fontSize: 13, fontWeight: '700', color: colors.inkSoft },
  choice: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    marginBottom: 8,
  },
  choiceOn: { borderColor: colors.ink },
  choiceText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
