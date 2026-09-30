import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, EmptyState, ErrorBanner } from '../../components/ui';
import { useNetwork } from '../../context/NetworkContext';
import { shiftYYYYMMDD, toYYYYMMDD } from '../../lib/format';
import { saveAttendanceWithQueue } from '../../lib/mutationQueue';
import {
  getAttendance,
  getClasses,
  getRooms,
  getStudents,
  listStudentsInTeacherRoom,
  saveAttendanceBulk,
  type AttendanceStatus,
  type AttendanceStudent,
  type ClassItem,
  type RoomItem,
} from '../../services/api';
import { colors } from '../../theme/tokens';

const STATUSES: {
  value: AttendanceStatus;
  label: string;
  short: string;
  ink: string;
  wash: string;
}[] = [
  { value: 'PRESENT', label: 'Présent', short: 'P', ink: '#3F6212', wash: '#F3F7EA' },
  { value: 'ABSENT', label: 'Absent', short: 'A', ink: '#B91C1C', wash: '#FEF2F2' },
  { value: 'LATE', label: 'Retard', short: 'R', ink: '#C2410C', wash: '#FFF7ED' },
  { value: 'EXCUSED', label: 'Excusé', short: 'E', ink: '#57534E', wash: '#F5F5F4' },
];

function statusMeta(value: string | null | undefined) {
  return STATUSES.find((item) => item.value === value) ?? STATUSES[0];
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

type BoardStudent = AttendanceStudent & { class_id?: string };

function byLastName(a: AttendanceStudent, b: AttendanceStudent) {
  return (
    a.last_name.localeCompare(b.last_name, 'fr', { sensitivity: 'base' }) ||
    a.first_name.localeCompare(b.first_name, 'fr', { sensitivity: 'base' })
  );
}

export function AttendanceBoard({
  classes = [],
  classId = '',
  onClassId,
  teacherId = null,
  mode = 'teacher',
}: {
  classes?: ClassItem[];
  classId?: string;
  onClassId?: (id: string) => void;
  teacherId?: number | null;
  /** teacher : salles du professeur. room : toutes les salles, au choix. */
  mode?: 'teacher' | 'room';
}) {
  const roomMode = mode === 'room';
  const { online } = useNetwork();
  const today = toYYYYMMDD();
  const activeId = classes.some((item) => item.id === classId) ? classId : classes[0]?.id || '';
  const activeClass = classes.find((item) => item.id === activeId);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<ClassItem[]>([]);
  const [pickedClassId, setPickedClassId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [roomsLoading, setRoomsLoading] = useState(roomMode);
  const [date, setDate] = useState(today);
  const [students, setStudents] = useState<BoardStudent[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const locked = date < today;
  const classRooms = rooms
    .filter((room) => room.class_id === pickedClassId)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const activeRoom = classRooms.find((room) => room.id === roomId) ?? classRooms[0];
  const pickedClass = schoolClasses.find((item) => item.id === pickedClassId);

  useEffect(() => {
    if (!roomMode) return;
    let cancelled = false;
    (async () => {
      try {
        const [roomList, classList] = await Promise.all([getRooms(), getClasses()]);
        if (cancelled) return;
        const sortedClasses = [...classList].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        const active = roomList.filter((room) => room.active !== false);
        const firstClass = sortedClasses[0]?.id || '';
        setSchoolClasses(sortedClasses);
        setRooms(active);
        setPickedClassId((current) =>
          sortedClasses.some((item) => item.id === current) ? current : firstClass,
        );
        setRoomId((current) => {
          const classId = sortedClasses.some((item) => item.id === pickedClassId)
            ? pickedClassId
            : firstClass;
          const inClass = active.filter((room) => room.class_id === classId);
          if (inClass.some((room) => room.id === current)) return current;
          return inClass[0]?.id || '';
        });
        setError('');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement des salles impossible');
      } finally {
        if (!cancelled) setRoomsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomMode]);

  useEffect(() => {
    if (!roomMode || !pickedClassId) return;
    setRoomId((current) => {
      const inClass = rooms.filter((room) => room.class_id === pickedClassId);
      if (inClass.some((room) => room.id === current)) return current;
      return [...inClass].sort((a, b) => a.name.localeCompare(b.name, 'fr'))[0]?.id || '';
    });
  }, [roomMode, pickedClassId, rooms]);

  const load = useCallback(async () => {
    if (roomMode) {
      if (!roomId) {
        setStudents([]);
        return;
      }
      try {
        const roomStudents = (await getStudents({ room_id: roomId })).filter(
          (student) => student.active !== false,
        );
        const classIds = [
          ...new Set(roomStudents.map((student) => student.class_id).filter(Boolean)),
        ] as string[];
        const sheets = await Promise.all(classIds.map((id) => getAttendance(id, date)));
        const statusById = new Map<string, string | null>();
        for (const sheet of sheets) {
          for (const student of sheet.students || []) statusById.set(student.id, student.status);
        }
        setStudents(
          roomStudents
            .map((student) => ({
              id: student.id,
              first_name: student.first_name,
              last_name: student.last_name,
              class_id: student.class_id,
              status: statusById.get(student.id) ?? null,
            }))
            .sort(byLastName),
        );
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chargement appel impossible');
      }
      return;
    }
    if (!activeId || !teacherId) {
      setStudents([]);
      return;
    }
    try {
      const [data, mine] = await Promise.all([
        getAttendance(activeId, date),
        listStudentsInTeacherRoom(activeId, teacherId),
      ]);
      const allowed = new Set(mine.map((student) => student.id));
      setStudents(
        (data.students || []).filter((student) => allowed.has(student.id)).sort(byLastName),
      );
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement appel impossible');
    }
  }, [roomMode, roomId, activeId, date, teacherId]);

  useEffect(() => {
    setSaved(false);
    void load();
  }, [load]);

  function step(delta: number) {
    const next = shiftYYYYMMDD(date, delta);
    if (next > today) return;
    setDate(next);
  }

  function setStatus(id: string, status: AttendanceStatus) {
    if (locked) return;
    setSaved(false);
    setStudents((prev) => prev.map((student) => (student.id === id ? { ...student, status } : student)));
  }

  const counts = STATUSES.map((status) => ({
    ...status,
    count: students.filter((student) => (student.status || 'PRESENT') === status.value).length,
  }));

  if (!roomMode && classes.length === 0) {
    return (
      <EmptyState title="Appel réservé au préscolaire et aux 1er / 2e cycles fondamentaux" />
    );
  }

  if (roomMode && roomsLoading) {
    return <ActivityIndicator color={colors.ink} style={{ marginTop: 24 }} />;
  }

  if (roomMode && schoolClasses.length === 0) {
    return <EmptyState title="Aucune classe" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
      {roomMode ? (
        <View style={styles.filters}>
          {schoolClasses.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classRow}>
              {schoolClasses.map((item) => {
                const on = item.id === pickedClassId;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setPickedClassId(item.id)}
                    style={[styles.classChip, on && styles.classChipOn]}
                  >
                    <Text style={[styles.classChipText, on && styles.classChipTextOn]}>{item.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : pickedClass ? (
            <Text style={styles.className}>{pickedClass.name}</Text>
          ) : null}
          {classRooms.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classRow}>
              {classRooms.map((room) => {
                const on = room.id === (activeRoom?.id || '');
                return (
                  <Pressable
                    key={room.id}
                    onPress={() => setRoomId(room.id)}
                    style={[styles.classChip, on && styles.classChipOn]}
                  >
                    <Text style={[styles.classChipText, on && styles.classChipTextOn]}>{room.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : activeRoom ? (
            <Text style={styles.className}>{activeRoom.name}</Text>
          ) : (
            <Text style={styles.className}>Aucune salle dans cette classe</Text>
          )}
        </View>
      ) : classes.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classRow}>
          {classes.map((item) => {
            const on = item.id === activeId;
            return (
              <Pressable
                key={item.id}
                onPress={() => onClassId?.(item.id)}
                style={[styles.classChip, on && styles.classChipOn]}
              >
                <Text style={[styles.classChipText, on && styles.classChipTextOn]}>{item.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : activeClass ? (
        <Text style={styles.className}>{activeClass.name}</Text>
      ) : null}

      <View style={styles.dateCard}>
        <Pressable onPress={() => step(-1)} hitSlop={10} style={styles.step}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.dateCopy}>
          <Text style={styles.dateTitle}>{formatDayLong(date)}</Text>
          <Text style={[styles.dateState, locked ? styles.dateStateLock : styles.dateStateOpen]}>
            {date === today ? 'Aujourd’hui · modifiable' : 'Journée passée · lecture seule'}
          </Text>
        </View>
        <Pressable onPress={() => step(1)} hitSlop={10} disabled={date >= today} style={styles.step}>
          <Ionicons name="chevron-forward" size={22} color={date >= today ? colors.border : colors.ink} />
        </Pressable>
      </View>

      <View style={styles.summary}>
        {counts.map((status) => (
          <View key={status.value} style={[styles.summaryItem, { backgroundColor: status.wash }]}>
            <View style={[styles.dot, { backgroundColor: status.ink }]} />
            <Text style={[styles.summaryCount, { color: status.ink }]}>{status.count}</Text>
            <Text style={styles.summaryLabel}>{status.label}</Text>
          </View>
        ))}
      </View>

      {error ? <ErrorBanner message={error} /> : null}
      {saved ? <Text style={styles.saved}>Appel enregistré</Text> : null}

      {students.length === 0 ? (
        <EmptyState title={roomMode ? 'Aucun élève dans cette salle' : 'Aucun élève'} />
      ) : (
        students.map((student) => {
          const current = student.status || 'PRESENT';
          const meta = statusMeta(current);
          return (
            <View key={student.id} style={styles.card}>
              <View style={[styles.bar, { backgroundColor: meta.ink }]} />
              <View style={styles.cardBody}>
                <View style={styles.cardHead}>
                  <View style={[styles.initial, { backgroundColor: meta.wash }]}>
                    <Text style={[styles.initialText, { color: meta.ink }]}>
                      {(student.last_name || '?').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.name}>
                    {student.last_name} {student.first_name}
                  </Text>
                </View>
                <View style={styles.codes}>
                  {STATUSES.map((status) => {
                    const on = current === status.value;
                    if (locked && !on) return null;
                    return (
                      <Pressable
                        key={status.value}
                        disabled={locked}
                        onPress={() => setStatus(student.id, status.value)}
                        style={[
                          styles.code,
                          on && { backgroundColor: status.ink, borderColor: status.ink },
                        ]}
                      >
                        <View style={[styles.codeDot, { backgroundColor: on ? colors.surface : status.ink }]} />
                        <Text style={[styles.codeText, on && styles.codeTextOn]}>{status.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          );
        })
      )}

      {locked ? null : (
        <Button
          title={saving ? 'Enregistrement…' : 'Enregistrer l’appel'}
          disabled={saving || students.length === 0}
          onPress={async () => {
            setSaving(true);
            setSaved(false);
            try {
              const recordsOf = (rows: BoardStudent[]) =>
                rows.map((student) => ({
                  student_id: student.id,
                  status: (student.status as string) || 'PRESENT',
                }));
              if (roomMode) {
                const groups = new Map<string, BoardStudent[]>();
                for (const student of students) {
                  if (!student.class_id) continue;
                  const list = groups.get(student.class_id) ?? [];
                  list.push(student);
                  groups.set(student.class_id, list);
                }
                if (groups.size === 0) throw new Error('Classe introuvable pour cette salle');
                for (const [id, rows] of groups) {
                  const records = recordsOf(rows);
                  if (online) await saveAttendanceBulk(id, date, records);
                  else await saveAttendanceWithQueue(id, date, records);
                }
              } else {
                const records = recordsOf(students);
                if (online) await saveAttendanceBulk(activeId, date, records);
                else await saveAttendanceWithQueue(activeId, date, records);
              }
              await load();
              setSaved(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Enregistrement impossible');
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingBottom: 36, gap: 12 },
  filters: { gap: 8 },
  className: { fontSize: 15, fontWeight: '600', color: colors.ink },
  classRow: { gap: 8, paddingVertical: 2 },
  classChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  classChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  classChipText: { color: colors.inkSoft, fontWeight: '600', fontSize: 13 },
  classChipTextOn: { color: colors.surface },
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
  dateState: { fontSize: 12, fontWeight: '600' },
  dateStateOpen: { color: '#3F6212' },
  dateStateLock: { color: colors.inkSoft },
  summary: { flexDirection: 'row', gap: 8 },
  summaryItem: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  summaryCount: { fontSize: 16, fontWeight: '700' },
  summaryLabel: { fontSize: 10, color: colors.inkSoft, fontWeight: '600' },
  saved: { color: '#3F6212', fontWeight: '600', textAlign: 'center' },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  bar: { width: 5 },
  cardBody: { flex: 1, padding: 12, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  initial: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  initialText: { fontWeight: '700', fontSize: 14 },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  codes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bg,
  },
  codeDot: { width: 7, height: 7, borderRadius: 4 },
  codeText: { fontSize: 12, fontWeight: '600', color: colors.inkSoft },
  codeTextOn: { color: colors.surface },
});
