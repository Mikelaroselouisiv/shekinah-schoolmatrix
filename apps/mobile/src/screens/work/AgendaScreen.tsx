import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmptyState, ErrorBanner, LoadingBlock, Screen } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { toYYYYMMDD } from '../../lib/format';
import { MORNING_WEEKDAYS, dutiesForTeacher, dutyDisplayTitle } from '../../lib/morningOpening';
import {
  getTeacherClasses,
  listExamPeriods,
  listExamSchedules,
  listExtracurricularActivities,
  listParentMeetings,
  listScheduleMoments,
  listScheduleSlots,
  listSchoolVacations,
  listSchoolWeekDuties,
  type ClassDayMoment,
  type ClassItem,
  type ExamPeriodItem,
  type ExamScheduleItem,
  type ExtracurricularItem,
  type ParentMeetingItem,
  type ScheduleSlot,
  type SchoolVacationItem,
  type SchoolWeekDuty,
} from '../../services/api';
import { colors } from '../../theme/tokens';
import type { WorkStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<WorkStackParamList, 'Agenda'>;

const HAITI = 'America/Port-au-Prince';

const KIND = {
  morning: { ink: '#B85A48', wash: '#F7EEEB', label: 'Début de journée' },
  course: { ink: '#2C2926', wash: '#F5F3F1', label: 'Cours' },
  moment: { ink: '#7C6A4F', wash: '#F6F1E8', label: 'Moment' },
  exam: { ink: '#C2410C', wash: '#FFF7ED', label: 'Examen' },
  period: { ink: '#9A3412', wash: '#FFF1E8', label: 'Période d’examens' },
  meeting: { ink: '#3F6212', wash: '#F3F7EA', label: 'Réunion' },
  activity: { ink: '#9F1239', wash: '#FFF1F2', label: 'Activité' },
  vacation: { ink: '#57534E', wash: '#F5F5F4', label: 'Vacances' },
} as const;

type KindKey = keyof typeof KIND;

type DatedItem = {
  id: string;
  kind: KindKey;
  date: string;
  end?: string | null;
  time?: string | null;
  title: string;
  detail?: string | null;
};

function haitiWeekday(): number {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: HAITI, weekday: 'short' }).format(new Date());
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[short] ?? 1;
}

function clock(value?: string | null): string {
  if (!value) return '';
  return value.slice(0, 5);
}

function range(start?: string | null, end?: string | null): string {
  const a = clock(start);
  const b = clock(end);
  if (a && b) return `${a} – ${b}`;
  return a || b;
}

function dayLabel(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return iso;
  const instant = new Date(Date.UTC(year, month - 1, day, 15, 0, 0));
  const label = new Intl.DateTimeFormat('fr-FR', {
    timeZone: HAITI,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(instant);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function settle<T>(task: Promise<T>, fallback: T): Promise<T> {
  try {
    return await task;
  } catch {
    return fallback;
  }
}

export function AgendaScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { context } = useSchool();
  const userId = user?.id ?? user?.userId ?? null;
  const today = toYYYYMMDD();
  const [day, setDay] = useState(() => {
    const index = haitiWeekday();
    return index >= 1 && index <= 5 ? index : 1;
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [moments, setMoments] = useState<ClassDayMoment[]>([]);
  const [duties, setDuties] = useState<SchoolWeekDuty[]>([]);
  const [exams, setExams] = useState<ExamScheduleItem[]>([]);
  const [periods, setPeriods] = useState<ExamPeriodItem[]>([]);
  const [meetings, setMeetings] = useState<ParentMeetingItem[]>([]);
  const [activities, setActivities] = useState<ExtracurricularItem[]>([]);
  const [vacations, setVacations] = useState<SchoolVacationItem[]>([]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Agenda' });
  }, [navigation]);

  const load = useCallback(async () => {
    const yearId = context?.academic_year?.id || context?.current_academic_year_id || undefined;
    const yearName = context?.academic_year?.name || context?.current_academic_year_name || undefined;
    try {
      const mine = await getTeacherClasses();
      setClasses(mine);
      const classIds = mine.map((item) => item.id);
      const [slotRows, momentGroups, dutyRows, examRows, periodRows, meetingRows, activityRows, vacationRows] =
        await Promise.all([
          userId ? listScheduleSlots({ teacher_id: userId, academic_year: yearName }) : Promise.resolve([]),
          Promise.all(
            classIds.map((id) =>
              settle(listScheduleMoments({ class_id: id, academic_year: yearName }), [] as ClassDayMoment[]),
            ),
          ),
          listSchoolWeekDuties({ academic_year: yearName }),
          settle(listExamSchedules(), [] as ExamScheduleItem[]),
          listExamPeriods(yearId ? { academic_year_id: yearId } : undefined),
          listParentMeetings(yearId ? { academic_year_id: yearId } : undefined),
          settle(
            listExtracurricularActivities(yearId ? { academic_year_id: yearId } : undefined),
            [] as ExtracurricularItem[],
          ),
          settle(listSchoolVacations(yearId ? { academic_year_id: yearId } : undefined), [] as SchoolVacationItem[]),
        ]);
      const allowed = new Set(classIds);
      setSlots(slotRows.filter((item) => !item.class_id || allowed.has(item.class_id)));
      setMoments(momentGroups.flat().filter((item) => allowed.has(item.class_id)));
      setDuties(dutiesForTeacher(dutyRows, userId, classIds) as SchoolWeekDuty[]);
      setExams(examRows.filter((item) => item.class_id && allowed.has(item.class_id)));
      setPeriods(periodRows.filter((item) => item.class_id && allowed.has(item.class_id)));
      setMeetings(meetingRows.filter((item) => item.class_id && allowed.has(item.class_id)));
      setActivities(activityRows.filter((item) => item.class_id && allowed.has(item.class_id)));
      setVacations(vacationRows);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agenda indisponible');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [context?.academic_year?.id, context?.academic_year?.name, context?.current_academic_year_id, context?.current_academic_year_name, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dayDuties = duties
    .filter((item) => item.day_of_week === day)
    .sort((a, b) => clock(a.start_time).localeCompare(clock(b.start_time)));
  const daySlots = slots
    .filter((item) => item.day_of_week === day)
    .sort((a, b) => clock(a.start_time).localeCompare(clock(b.start_time)));
  const dayMoments = moments
    .filter((item) => item.day_of_week === day)
    .sort((a, b) => clock(a.start_time).localeCompare(clock(b.start_time)));

  const upcoming = useMemo(() => {
    const items: DatedItem[] = [];
    for (const item of exams) {
      const date = item.exam_date?.slice(0, 10);
      if (!date || date < today) continue;
      items.push({
        id: `exam-${item.id}`,
        kind: 'exam',
        date,
        time: range(item.start_time, item.end_time),
        title: item.subject_name || 'Examen',
        detail: [item.class_name, item.period].filter(Boolean).join(' · '),
      });
    }
    for (const item of meetings) {
      const date = item.meeting_date?.slice(0, 10);
      if (!date || date < today) continue;
      items.push({
        id: `meet-${item.id}`,
        kind: 'meeting',
        date,
        time: clock(item.start_time),
        title: item.objective || 'Réunion de parents',
        detail: [item.class_name, item.location_label].filter(Boolean).join(' · '),
      });
    }
    for (const item of activities) {
      const date = item.activity_date?.slice(0, 10);
      if (!date || date < today) continue;
      items.push({
        id: `act-${item.id}`,
        kind: 'activity',
        date,
        time: range(item.start_time, item.end_time),
        title: item.occasion || 'Activité',
        detail: [item.class_name, item.location_label || item.location_text].filter(Boolean).join(' · '),
      });
    }
    for (const item of periods) {
      const date = item.start_date?.slice(0, 10);
      const end = item.end_date?.slice(0, 10);
      if (!date || (end && end < today)) continue;
      items.push({
        id: `period-${item.id}`,
        kind: 'period',
        date,
        end,
        title: item.period_name || 'Période d’examens',
        detail: item.class_name,
      });
    }
    for (const item of vacations) {
      const date = item.start_date?.slice(0, 10);
      const end = item.end_date?.slice(0, 10);
      if (!date || (end && end < today)) continue;
      if (end && date <= today && end >= today) continue;
      items.push({
        id: `vac-${item.id}`,
        kind: 'vacation',
        date,
        end,
        title: item.motif || 'Vacances',
        detail: end ? `Jusqu’au ${dayLabel(end)}` : null,
      });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  }, [activities, exams, meetings, periods, today, vacations]);

  const activeVacation = vacations.find((item) => {
    const start = item.start_date?.slice(0, 10);
    const end = item.end_date?.slice(0, 10);
    return !!start && !!end && start <= today && end >= today;
  });
  const todayIndex = haitiWeekday();
  const dayName = MORNING_WEEKDAYS.find((item) => item.index === day)?.label ?? 'Jour';
  const dayEmpty = dayDuties.length + daySlots.length + dayMoments.length === 0;

  if (loading) return <LoadingBlock />;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.pad}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.ink} />
        }
      >
        <Text style={styles.kicker}>Votre semaine</Text>
        <Text style={styles.title}>Agenda</Text>
        <Text style={styles.lead}>
          {classes.length
            ? classes.map((item) => item.name).join(' · ')
            : 'Horaires, début de journée et rendez-vous qui vous concernent.'}
        </Text>

        <View style={styles.week}>
          {MORNING_WEEKDAYS.map((item) => {
            const on = item.index === day;
            const isToday = item.index === todayIndex;
            return (
              <Pressable key={item.index} onPress={() => setDay(item.index)} style={[styles.weekDay, on && styles.weekDayOn]}>
                <Text style={[styles.weekLabel, on && styles.weekLabelOn]}>{item.label.slice(0, 3)}</Text>
                {isToday ? <View style={[styles.todayDot, on && styles.todayDotOn]} /> : <View style={styles.todaySpacer} />}
              </Pressable>
            );
          })}
        </View>

        {error ? <ErrorBanner message={error} /> : null}

        {activeVacation ? (
          <EventCard
            kind="vacation"
            time="En cours"
            title={activeVacation.motif || 'Vacances'}
            detail={`${dayLabel(activeVacation.start_date || today)} – ${dayLabel(activeVacation.end_date || today)}`}
          />
        ) : null}

        <Text style={styles.section}>
          {dayName}
          {day === todayIndex ? ' · aujourd’hui' : ''}
        </Text>
        {dayEmpty ? <EmptyState title="Rien de prévu ce jour-là" /> : null}
        {dayDuties.map((item) => (
          <EventCard
            key={item.id}
            kind="morning"
            time={range(item.start_time, item.end_time)}
            title={item.kind === 'FLAG' ? 'Montée du drapeau' : dutyDisplayTitle(item)}
            detail={[item.class_name, item.cycle === 'PRESCOLAIRE' ? 'Préscolaire' : item.cycle === 'PRIMAIRE' ? 'Fondamental' : null]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
        {daySlots.map((item) => (
          <EventCard
            key={item.id}
            kind="course"
            time={range(item.start_time, item.end_time)}
            title={item.subject_name || item.title || 'Cours'}
            detail={[item.class_name, item.room_name].filter(Boolean).join(' · ')}
          />
        ))}
        {dayMoments.map((item) => (
          <EventCard
            key={item.id}
            kind="moment"
            time={range(item.start_time, item.end_time)}
            title={item.label || item.title || 'Moment'}
            detail={item.class_name}
          />
        ))}

        <Text style={styles.section}>À venir</Text>
        {upcoming.length === 0 ? <EmptyState title="Aucun rendez-vous à venir" /> : null}
        {upcoming.map((item) => (
          <EventCard
            key={item.id}
            kind={item.kind}
            time={item.time || dayLabel(item.date)}
            title={item.title}
            detail={[item.time ? dayLabel(item.date) : null, item.end ? `jusqu’au ${dayLabel(item.end)}` : null, item.detail]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

function EventCard({
  kind,
  time,
  title,
  detail,
}: {
  kind: KindKey;
  time?: string | null;
  title: string;
  detail?: string | null;
}) {
  const tone = KIND[kind];
  return (
    <View style={styles.card}>
      <View style={[styles.cardBar, { backgroundColor: tone.ink }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={[styles.tag, { backgroundColor: tone.wash }]}>
            <View style={[styles.tagDot, { backgroundColor: tone.ink }]} />
            <Text style={[styles.tagText, { color: tone.ink }]}>{tone.label}</Text>
          </View>
          {time ? <Text style={styles.time}>{time}</Text> : null}
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
        {detail ? <Text style={styles.cardDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingBottom: 40, gap: 10 },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  title: { fontSize: 28, fontWeight: '700', color: colors.ink, marginTop: -4 },
  lead: { color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  week: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6,
    gap: 4,
  },
  weekDay: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14, gap: 6 },
  weekDayOn: { backgroundColor: colors.ink },
  weekLabel: { fontSize: 12, fontWeight: '700', color: colors.inkSoft },
  weekLabelOn: { color: colors.surface },
  todayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#B85A48' },
  todayDotOn: { backgroundColor: '#F7EEEB' },
  todaySpacer: { width: 5, height: 5 },
  section: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardBar: { width: 5 },
  cardBody: { flex: 1, padding: 12, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagText: { fontSize: 11, fontWeight: '700' },
  time: { fontSize: 12, fontWeight: '700', color: colors.ink },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cardDetail: { fontSize: 13, color: colors.inkSoft, lineHeight: 18 },
});
