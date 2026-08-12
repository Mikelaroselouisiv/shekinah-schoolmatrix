import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Screen,
  SegmentedControl,
  Button,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { canEditStudent, canAccessPermission } from '../../lib/permissions';
import { AccessDenied } from '../../lib/access';
import {
  formatDateJJMMAAAA,
  formatMoney,
  studentDisplayName,
} from '../../lib/format';
import {
  getDisciplineSummary,
  getExamResults,
  getImageUrl,
  getPaymentStatus,
  getScheduleSlots,
  getStudent,
  type DisciplineSummary,
  type ExamResults,
  type PaymentStatus,
  type ScheduleSlot,
  type StudentListItem,
} from '../../services/api';
import {
  cacheStudentFiche,
  readCachedStudentFiche,
} from '../../lib/offlineCache';
import { colors } from '../../theme/tokens';
import type { StudentsStackParamList } from '../../navigation/types';

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

type Props = NativeStackScreenProps<StudentsStackParamList, 'StudentFiche'>;
type DetailTab = 'carnet' | 'infos' | 'famille';

export function StudentFicheScreen({ navigation, route }: Props) {
  const { studentId, studentName } = route.params;
  const { context, theme } = useSchool();
  const { roleName, rolePermissions, linkedStudents } = useAuth();
  const canEdit = canEditStudent(roleName, rolePermissions);
  const isLinkedChild = linkedStudents.some((s) => s.id === studentId);
  const canView =
    isLinkedChild ||
    canAccessPermission(roleName, 'fiche-eleve', rolePermissions) ||
    canAccessPermission(roleName, 'students', rolePermissions) ||
    canEdit;
  const yearId = context?.academic_year?.id;
  const yearName = context?.academic_year?.name;

  const [student, setStudent] = useState<StudentListItem | null>(null);
  const [discipline, setDiscipline] = useState<DisciplineSummary | null>(null);
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [grades, setGrades] = useState<ExamResults | null>(null);
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('carnet');

  useLayoutEffect(() => {
    navigation.setOptions({
      title: studentName || 'Fiche élève',
    });
  }, [navigation, studentName]);

  const load = useCallback(async () => {
    setError('');
    try {
      const s = await getStudent(studentId);
      setStudent(s);
      if (s) {
        navigation.setOptions({ title: studentDisplayName(s) });
        await cacheStudentFiche(s);
      }
      const [d, p, g] = await Promise.all([
        getDisciplineSummary(studentId),
        getPaymentStatus(studentId, yearName),
        getExamResults(studentId, yearId),
      ]);
      setDiscipline(d);
      setPayment(p);
      setGrades(g);
      if (s?.class_id) {
        setSchedule(await getScheduleSlots(s.class_id));
      } else {
        setSchedule([]);
      }
    } catch (err) {
      const cached = await readCachedStudentFiche(studentId);
      if (cached) {
        setStudent(cached);
        navigation.setOptions({ title: studentDisplayName(cached) });
        setError('Hors ligne');
      } else {
        setError(err instanceof Error ? err.message : 'Impossible de charger la fiche');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId, yearId, yearName, navigation]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedSchedule = useMemo(
    () =>
      schedule
        .slice()
        .sort(
          (a, b) =>
            (a.day_of_week ?? 0) - (b.day_of_week ?? 0) ||
            String(a.start_time).localeCompare(String(b.start_time)),
        ),
    [schedule],
  );

  const paymentTotals = useMemo(() => {
    const services = payment?.by_service || [];
    const due = services.reduce((s, x) => s + (x.amount_due || 0), 0);
    const paid = services.reduce((s, x) => s + (x.total_paid || 0), 0);
    const balance = services.reduce((s, x) => s + (x.balance || 0), 0);
    return { due, paid, balance, count: services.length };
  }, [payment]);

  if (!canView) {
    return <AccessDenied />;
  }

  if (loading) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    );
  }

  if (!student) {
    return (
      <Screen>
        <ErrorBanner message={error || 'Élève introuvable'} />
        <EmptyState title="Fiche indisponible" />
      </Screen>
    );
  }

  const photo = getImageUrl(student.photo_identity_student);
  const points = discipline?.disciplinary_points ?? 0;
  const disciplineTone = toneForPoints(points);
  const paymentTone = toneForBalance(paymentTotals.balance, paymentTotals.count > 0);

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        <ErrorBanner message={error} />

        <View style={styles.hero}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoFallback, { backgroundColor: theme.primary }]}>
              <Text style={styles.photoInitials}>
                {(student.first_name?.[0] || '') + (student.last_name?.[0] || '')}
              </Text>
            </View>
          )}
          <Text style={styles.name}>{studentDisplayName(student)}</Text>
          <Text style={styles.meta}>
            {[student.order_number, student.class_name, student.room_name]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {canEdit ? (
            <View style={styles.editWrap}>
              <Button
                title="Modifier"
                variant="ghost"
                onPress={() =>
                  navigation.navigate('Enrollment', { studentId: student.id })
                }
                style={styles.editBtn}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.monitorRow}>
          <MonitorCard
            title="Discipline"
            tone={disciplineTone}
            primary={`${points} / 100`}
            lines={[
              disciplineStatusLabel(points),
              `${discipline?.lateness_count ?? 0} retards`,
              `${discipline?.absence_count ?? 0} absences`,
              discipline?.latest_measure?.label || 'Aucune mesure',
            ]}
          />
          <MonitorCard
            title="Économat"
            tone={paymentTone}
            primary={
              paymentTotals.count
                ? formatMoney(paymentTotals.balance)
                : '—'
            }
            lines={[
              paymentTotals.count
                ? `Dû ${formatMoney(paymentTotals.due)}`
                : 'Pas de situation',
              paymentTotals.count
                ? `Payé ${formatMoney(paymentTotals.paid)}`
                : '',
              paymentTotals.count
                ? paymentTone === 'ok'
                  ? 'À jour'
                  : paymentTone === 'warn'
                    ? 'Solde restant'
                    : 'Impayé'
                : '',
            ]}
          />
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Emploi du temps</Text>
          {sortedSchedule.length === 0 ? (
            <Text style={styles.emptyLine}>—</Text>
          ) : (
            sortedSchedule.map((slot) => (
              <View key={slot.id} style={styles.scheduleRow}>
                <View style={styles.scheduleDay}>
                  <Text style={styles.scheduleDayText}>
                    {(DAYS[slot.day_of_week ?? 0] || '—').slice(0, 3)}
                  </Text>
                  <Text style={styles.scheduleTime}>
                    {slot.start_time}–{slot.end_time}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scheduleSubject}>
                    {slot.subject_name || 'Cours'}
                  </Text>
                  <Text style={styles.scheduleMeta}>
                    {[slot.teacher_name, slot.room_name].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.block}>
          <SegmentedControl
            options={[
              { id: 'carnet', label: 'Carnet' },
              { id: 'infos', label: 'Infos' },
              { id: 'famille', label: 'Famille' },
            ]}
            value={detailTab}
            onChange={(id) => setDetailTab(id as DetailTab)}
          />

          {detailTab === 'carnet' ? (
            grades?.subjects?.length ? (
              grades.subjects.map((sub) => (
                <View key={sub.subject_id} style={styles.detailRow}>
                  <Text style={styles.detailTitle}>{sub.subject_name}</Text>
                  <Text style={styles.detailMeta}>
                    {sub.periods
                      .map((p) => `${p.period_name}: ${p.grade_value}`)
                      .join(' · ')}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyLine}>—</Text>
            )
          ) : null}

          {detailTab === 'infos' ? (
            <>
              <Info label="Genre" value={student.gender} />
              <Info label="Naissance" value={formatDateJJMMAAAA(student.birth_date)} />
              <Info label="Lieu" value={student.birth_place} />
              <Info label="Téléphone" value={student.phone} />
              <Info label="Email" value={student.email} />
              <Info label="Adresse" value={student.address} />
            </>
          ) : null}

          {detailTab === 'famille' ? (
            <>
              <Info
                label="Mère"
                value={[student.mother_name, student.mother_phone].filter(Boolean).join(' · ')}
              />
              <Info
                label="Père"
                value={[student.father_name, student.father_phone].filter(Boolean).join(' · ')}
              />
              <Info
                label="Responsable"
                value={[student.responsible_name, student.responsible_phone]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

/** Points disciplinaires = reste / 100 (100 = excellent, bas = critique). */
function toneForPoints(points: number): Tone {
  if (points >= 80) return 'ok';
  if (points >= 60) return 'neutral';
  if (points >= 40) return 'warn';
  return 'bad';
}

function disciplineStatusLabel(points: number): string {
  if (points >= 80) return 'Très bien';
  if (points >= 60) return 'Correct';
  if (points >= 40) return 'Attention';
  return 'Critique';
}

function toneForBalance(balance: number, hasData: boolean): Tone {
  if (!hasData) return 'neutral';
  if (balance > 0) return balance >= 5000 ? 'bad' : 'warn';
  return 'ok';
}

function toneColors(tone: Tone): { bg: string; border: string; accent: string } {
  switch (tone) {
    case 'ok':
      return { bg: '#F4F7F2', border: '#D8E3D4', accent: colors.success };
    case 'warn':
      return { bg: '#FAF6F0', border: '#E8DCC8', accent: '#B45309' };
    case 'bad':
      return { bg: '#FAF4F3', border: '#E8D4D1', accent: colors.danger };
    default:
      return { bg: colors.surface, border: colors.border, accent: colors.text };
  }
}

function MonitorCard({
  title,
  tone,
  primary,
  lines,
}: {
  title: string;
  tone: Tone;
  primary: string;
  lines: string[];
}) {
  const c = toneColors(tone);
  return (
    <View style={[styles.monitorCard, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={styles.monitorLabel}>{title}</Text>
      <Text style={[styles.monitorPrimary, { color: c.accent }]}>{primary}</Text>
      {lines
        .filter((line) => line.trim().length > 0)
        .map((line, index) => (
          <Text key={`${title}-${index}`} style={styles.monitorLine} numberOfLines={1}>
            {line}
          </Text>
        ))}
    </View>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  hero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 20,
  },
  photo: {
    width: 128,
    height: 128,
    borderRadius: 64,
    marginBottom: 14,
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitials: {
    color: colors.surface,
    fontSize: 36,
    fontWeight: '700',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  meta: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  editWrap: { marginTop: 12, width: '100%', maxWidth: 200 },
  editBtn: { marginTop: 0 },
  monitorRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  monitorCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    minHeight: 120,
  },
  monitorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 6,
  },
  monitorPrimary: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  monitorLine: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  block: {
    marginBottom: 18,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  emptyLine: {
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: 4,
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  scheduleDay: { width: 72 },
  scheduleDayText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  scheduleTime: {
    marginTop: 2,
    fontSize: 11,
    color: colors.textMuted,
  },
  scheduleSubject: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  scheduleMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
  detailRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  detailTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  detailMeta: {
    marginTop: 3,
    fontSize: 12,
    color: colors.textMuted,
  },
  info: { marginBottom: 10 },
  infoLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  infoValue: { fontSize: 15, color: colors.text, marginTop: 2 },
});
