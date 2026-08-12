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
  SegmentedControl,
  DateField,
} from '../../components/ui';
import { useSchool } from '../../context/SchoolContext';
import { formatMoney, toYYYYMMDD } from '../../lib/format';
import { colors } from '../../theme/tokens';
import {
  getAcademicYears,
  getFinancialStats,
  type AcademicYear,
  type FinancialStats,
} from '../../services/api';
import type { FinanceStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';
import { BanksPanel } from './BanksPanel';
import { AccountingPanel } from './AccountingPanel';

type Props = NativeStackScreenProps<FinanceStackParamList, 'FinancialMonitor'>;
type SubTab = 'moniteur' | 'banques' | 'comptabilite';
type PickerKind = 'year' | null;

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

function healthSummary(stats: FinancialStats): string {
  const rate = stats.overview?.collection_rate;
  const solde = stats.cashflow?.solde ?? 0;
  const banque = stats.banks?.total_balance ?? 0;
  const reste = stats.overview?.balance ?? 0;
  const parts: string[] = [];

  if (rate == null) {
    parts.push('Taux de recouvrement non calculable sur la période.');
  } else if (rate >= 80) {
    parts.push(`Bonne encaissement (~${pct(rate)} du dû payé).`);
  } else if (rate >= 50) {
    parts.push(`Recouvrement moyen (${pct(rate)}).`);
  } else {
    parts.push(`Recouvrement faible (${pct(rate)}).`);
  }

  if (solde >= 0) {
    parts.push(`Plus d’encaissements que de dépenses (solde ${formatMoney(solde)}).`);
  } else {
    parts.push(`Sorties > entrées (solde ${formatMoney(solde)}).`);
  }

  if (banque > 0) {
    parts.push(`Banques : ${formatMoney(banque)}.`);
  }

  if (reste > 0) {
    parts.push(`${formatMoney(reste)} à recouvrer.`);
  }

  return parts.join(' ');
}

export function FinancialMonitorScreen({}: Props) {
  const allowed = useCanAccess('stats-financieres');
  const { context } = useSchool();
  const [sub, setSub] = useState<SubTab>('moniteur');
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearName, setYearName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stats, setStats] = useState<FinancialStats | null>(null);
  const [boot, setBoot] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState<PickerKind>(null);

  const loadStats = useCallback(async () => {
    if (!yearName || !dateFrom || !dateTo) return;
    setLoading(true);
    setError('');
    try {
      setStats(
        await getFinancialStats({
          academic_year: yearName,
          date_from: dateFrom,
          date_to: dateTo,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [yearName, dateFrom, dateTo]);

  useEffect(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    setDateFrom(`${y}-${m}-01`);
    setDateTo(toYYYYMMDD(d));

    let cancelled = false;
    (async () => {
      try {
        const list = await getAcademicYears();
        if (cancelled) return;
        setYears(list);
        setYearName(
          context?.academic_year?.name ||
            context?.current_academic_year_name ||
            list[0]?.name ||
            '',
        );
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
    context?.academic_year?.name,
    context?.current_academic_year_name,
  ]);

  useEffect(() => {
    if (!boot && sub === 'moniteur') void loadStats();
  }, [boot, sub, loadStats]);

  const summary = useMemo(() => (stats ? healthSummary(stats) : ''), [stats]);
  const maxMonth = stats?.by_month?.reduce((m, x) => Math.max(m, x.amount), 0) ?? 0;

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
        <View style={{ marginTop: 4 }}>
          <SegmentedControl
            options={[
              { id: 'moniteur', label: 'Moniteur' },
              { id: 'banques', label: 'Banques' },
              { id: 'comptabilite', label: 'Compta' },
            ]}
            value={sub}
            onChange={(id) => setSub(id as SubTab)}
          />
        </View>

        {sub === 'banques' ? (
          <BanksPanel />
        ) : sub === 'comptabilite' ? (
          <AccountingPanel />
        ) : (
          <>
            <View style={styles.filters}>
              <SelectChip
                label="Année"
                value={yearName || '—'}
                onPress={() => setPicker('year')}
              />
            </View>
            <DateField label="Du" value={dateFrom} onChange={setDateFrom} />
            <DateField label="Au" value={dateTo} onChange={setDateTo} />
            <Button title="Actualiser" onPress={() => void loadStats()} disabled={loading} />

            <ErrorBanner message={error} />

            {loading ? (
              <LoadingBlock />
            ) : !stats ? (
              <EmptyState title="Aucune donnée" />
            ) : (
              <>
                {summary ? (
                  <View style={styles.summary}>
                    <Text style={styles.summaryText}>{summary}</Text>
                  </View>
                ) : null}

                <View style={styles.kpiGrid}>
                  <Kpi
                    label="Recouvrement"
                    value={pct(stats.overview?.collection_rate)}
                  />
                  <Kpi
                    label="Payé"
                    value={formatMoney(stats.overview?.amount_paid)}
                  />
                  <Kpi label="Dû" value={formatMoney(stats.overview?.amount_due)} />
                  <Kpi
                    label="Reste"
                    value={formatMoney(stats.overview?.balance)}
                  />
                  <Kpi
                    label="Entrées"
                    value={formatMoney(stats.cashflow?.total_entrees)}
                  />
                  <Kpi
                    label="Sorties"
                    value={formatMoney(stats.cashflow?.total_sorties)}
                  />
                  <Kpi
                    label="Solde cash"
                    value={formatMoney(stats.cashflow?.solde)}
                  />
                  <Kpi
                    label="Banques"
                    value={formatMoney(stats.banks?.total_balance)}
                  />
                </View>

                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Élèves</Text>
                  <Muted>
                    Total {stats.overview?.students_total ?? '—'} · À jour{' '}
                    {stats.overview?.students_fully_paid ?? '—'} · Avec solde{' '}
                    {stats.overview?.students_with_balance ?? '—'} · Tx{' '}
                    {stats.overview?.transactions_count ?? '—'}
                  </Muted>
                </View>

                {(stats.by_month || []).length > 0 ? (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>Encaissements / mois</Text>
                    {(stats.by_month || []).map((m) => (
                      <View key={m.month} style={styles.monthRow}>
                        <Text style={styles.rowTitle}>{m.month}</Text>
                        <View style={styles.monthBarTrack}>
                          <View
                            style={[
                              styles.monthBar,
                              {
                                width: `${maxMonth > 0 ? (m.amount / maxMonth) * 100 : 0}%`,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.rowSub}>{formatMoney(m.amount)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <SectionList
                  title="Par classe"
                  rows={(stats.by_class || []).map((c) => ({
                    id: c.class_id,
                    title: c.class_name,
                    subtitle: `Payé ${formatMoney(c.amount_paid)} / ${formatMoney(
                      c.amount_due,
                    )} · Reste ${formatMoney(c.balance)} · ${pct(c.collection_rate)}`,
                  }))}
                />

                <SectionList
                  title="Par service"
                  rows={(stats.by_service || []).map((s) => ({
                    id: s.service_id,
                    title: s.service_name,
                    subtitle: `Payé ${formatMoney(s.amount_paid)} · Reste ${formatMoney(
                      s.balance,
                    )} · ${pct(s.collection_rate)}`,
                  }))}
                />

                <SectionList
                  title="Plus gros soldes"
                  rows={(stats.top_debtors || []).map((d) => ({
                    id: d.student_id,
                    title: d.student_name,
                    subtitle: `${d.class_name || '—'} · ${formatMoney(d.balance)}`,
                  }))}
                />

                {(stats.banks?.accounts || []).length > 0 ? (
                  <SectionList
                    title="Comptes bancaires (aperçu)"
                    rows={(stats.banks?.accounts || []).map((a) => ({
                      id: a.id,
                      title: `${a.bank_name} · ${a.account_name}`,
                      subtitle: `Solde ${formatMoney(a.balance)}`,
                    }))}
                  />
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={!!picker} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <FlatList
              data={years.map((y) => ({ id: y.name, label: y.name }))}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setYearName(item.id);
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
  if (rows.length === 0) return null;
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
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 4 },
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
  summary: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.flameTint,
  },
  summaryText: { color: colors.ink, fontSize: 14, lineHeight: 20 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
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
  kpiValue: { fontSize: 18, fontWeight: '800', color: colors.text },
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
  row: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  monthRow: { marginBottom: 10 },
  monthBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.bg,
    marginVertical: 4,
    overflow: 'hidden',
  },
  monthBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.primaryFallback,
  },
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
