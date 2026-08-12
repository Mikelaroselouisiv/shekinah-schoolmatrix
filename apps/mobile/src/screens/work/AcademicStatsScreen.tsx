import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
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
import { colors } from '../../theme/tokens';
import {
  getAcademicStats,
  getAcademicYears,
  getPeriods,
  type AcademicStats,
  type AcademicYear,
  type PeriodItem,
} from '../../services/api';
import type { WorkStackParamList } from '../../navigation/types';
import type { MoreStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props =
  | NativeStackScreenProps<WorkStackParamList, 'AcademicStats'>
  | NativeStackScreenProps<MoreStackParamList, 'AcademicStats'>;

type PickerKind = 'year' | 'period' | null;

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('fr-FR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('fr-FR');
}

export function AcademicStatsScreen({}: Props) {
  const allowed = useCanAccess('stats-academiques');
  const { context } = useSchool();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [periods, setPeriods] = useState<PeriodItem[]>([]);
  const [yearId, setYearId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [stats, setStats] = useState<AcademicStats | null>(null);
  const [boot, setBoot] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState<PickerKind>(null);

  const yearLabel = years.find((y) => y.id === yearId)?.name || '—';
  const periodLabel =
    periodId === ''
      ? 'Toutes'
      : periods.find((p) => p.id === periodId)?.name || '—';

  const loadStats = useCallback(async () => {
    if (!yearId) return;
    setLoading(true);
    setError('');
    try {
      setStats(
        await getAcademicStats({
          academic_year_id: yearId,
          period_id: periodId || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [yearId, periodId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getAcademicYears();
        if (cancelled) return;
        setYears(list);
        const current =
          context?.academic_year?.id ||
          context?.current_academic_year_id ||
          list[0]?.id ||
          '';
        setYearId(current);
        if (context?.period?.id || context?.current_period_id) {
          setPeriodId(context.period?.id || context.current_period_id || '');
        }
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
  }, [
    context?.academic_year?.id,
    context?.current_academic_year_id,
    context?.period?.id,
    context?.current_period_id,
  ]);

  useEffect(() => {
    if (!yearId) {
      setPeriods([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await getPeriods(yearId);
        if (cancelled) return;
        setPeriods(list);
        setPeriodId((prev) => (prev && list.some((p) => p.id === prev) ? prev : ''));
      } catch {
        if (!cancelled) setPeriods([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [yearId]);

  useEffect(() => {
    if (!boot && yearId) void loadStats();
  }, [boot, yearId, loadStats]);

  const dist = stats?.distribution;
  const distTotal = dist
    ? (dist.insuffisant || 0) +
      (dist.passable || 0) +
      (dist.bien || 0) +
      (dist.excellent || 0)
    : 0;

  const pickerItems = useMemo(() => {
    if (picker === 'year') return years.map((y) => ({ id: y.id, label: y.name }));
    if (picker === 'period') {
      return [
        { id: '', label: 'Toutes périodes' },
        ...periods.map((p) => ({ id: p.id, label: p.name })),
      ];
    }
    return [];
  }, [picker, years, periods]);

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
      <ScrollView contentContainerStyle={styles.content}>
        <Title>Stats académiques</Title>

        <View style={styles.filters}>
          <SelectChip label="Année" value={yearLabel} onPress={() => setPicker('year')} />
          <SelectChip label="Période" value={periodLabel} onPress={() => setPicker('period')} />
        </View>

        <ErrorBanner message={error} />

        {loading ? (
          <LoadingBlock />
        ) : !stats ? (
          <EmptyState title="Aucune donnée" />
        ) : (
          <>
            <View style={styles.kpiGrid}>
              <Kpi
                label="Moyenne école"
                value={fmt(stats.overview?.school_average)}
              />
              <Kpi
                label="Réussite"
                value={
                  stats.overview?.success_rate != null
                    ? `${fmt(stats.overview.success_rate, 1)} %`
                    : '—'
                }
              />
              <Kpi label="Élèves notés" value={fmtInt(stats.overview?.graded_students)} />
              <Kpi label="Notes" value={fmtInt(stats.overview?.grades)} />
              <Kpi label="Classes" value={fmtInt(stats.overview?.classes)} />
              <Kpi label="Profs" value={fmtInt(stats.overview?.teachers)} />
            </View>

            {dist && distTotal > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Répartition</Text>
                <View style={styles.bar}>
                  {(
                    [
                      { n: dist.insuffisant || 0, c: '#B91C1C' },
                      { n: dist.passable || 0, c: '#D97706' },
                      { n: dist.bien || 0, c: '#78716C' },
                      { n: dist.excellent || 0, c: '#3F6212' },
                    ] as const
                  ).map((b, i) =>
                    b.n > 0 ? (
                      <View
                        key={i}
                        style={{
                          flex: b.n,
                          backgroundColor: b.c,
                          height: 10,
                        }}
                      />
                    ) : null,
                  )}
                </View>
                <Muted>
                  Insuf. {dist.insuffisant || 0} · Pass. {dist.passable || 0} · Bien{' '}
                  {dist.bien || 0} · Exc. {dist.excellent || 0}
                </Muted>
              </View>
            ) : null}

            {stats.discipline ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Discipline</Text>
                <Muted>
                  Absences {fmtInt(stats.discipline.absences)} · Présents{' '}
                  {fmtInt(stats.discipline.presents)} · Retards{' '}
                  {fmtInt(stats.discipline.latenesses)}
                </Muted>
                <Muted>
                  Points déduits {fmtInt(stats.discipline.deductions_points)} (
                  {fmtInt(stats.discipline.deductions_count)} mesures)
                </Muted>
              </View>
            ) : null}

            <SectionList
              title="Par classe"
              rows={(stats.by_class || []).map((c) => ({
                id: c.class_id,
                title: c.class_name,
                subtitle: `Moy. ${fmt(c.average)} · Réussite ${
                  c.success_rate != null ? `${fmt(c.success_rate, 1)} %` : '—'
                } · ${fmtInt(c.graded_students)}/${fmtInt(c.students)} notés`,
              }))}
            />

            <SectionList
              title="Par matière"
              rows={(stats.by_subject || []).map((s) => ({
                id: s.subject_id,
                title: s.subject_name,
                subtitle: `Moy. ${fmt(s.average)} · ${fmtInt(s.grades_count)} notes`,
              }))}
            />

            <SectionList
              title="Meilleurs élèves"
              rows={(stats.top_students || []).map((s) => ({
                id: s.id,
                title: s.name,
                subtitle: `${s.class_name || '—'} · ${fmt(s.average)}`,
              }))}
            />

            <SectionList
              title="À surveiller"
              rows={(stats.bottom_students || []).map((s) => ({
                id: s.id,
                title: s.name,
                subtitle: `${s.class_name || '—'} · ${fmt(s.average)}`,
              }))}
            />
          </>
        )}
      </ScrollView>

      <Modal visible={!!picker} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <FlatList
              data={pickerItems}
              keyExtractor={(item) => item.id || 'all'}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    if (picker === 'year') {
                      setYearId(item.id);
                      setPeriodId('');
                    }
                    if (picker === 'period') setPeriodId(item.id);
                    setPicker(null);
                  }}
                >
                  <Text style={styles.rowTitle}>{item.label}</Text>
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function SectionList({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; title: string; subtitle: string }[];
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      {rows.map((r) => (
        <View key={r.id} style={styles.row}>
          <Text style={styles.rowTitle}>{r.title}</Text>
          <Text style={styles.rowSub}>{r.subtitle}</Text>
        </View>
      ))}
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
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 8 },
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
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  kpi: {
    width: '47%',
    flexGrow: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  kpiLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  kpiValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  block: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  bar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.bg,
    marginBottom: 8,
  },
  row: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
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
