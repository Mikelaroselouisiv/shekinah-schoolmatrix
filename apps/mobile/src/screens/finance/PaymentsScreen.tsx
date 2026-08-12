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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Muted,
  Screen,
  DateField,
} from '../../components/ui';
import { useSchool } from '../../context/SchoolContext';
import { formatMoney, studentDisplayName, toYYYYMMDD } from '../../lib/format';
import { colors } from '../../theme/tokens';
import {
  getAcademicYears,
  getBankAccounts,
  getClasses,
  getEconomatBalance,
  getFeeServices,
  getPaymentStatus,
  getPaymentTransactions,
  getStudents,
  type AcademicYear,
  type BankAccountOption,
  type ClassItem,
  type EconomatBalance,
  type FeeService,
  type PaymentByService,
  type PaymentTransaction,
  type StudentListItem,
} from '../../services/api';
import { recordPaymentWithQueue } from '../../lib/mutationQueue';
import { useNetwork } from '../../context/NetworkContext';
import type { FinanceStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<FinanceStackParamList, 'Payments'>;

type PickerKind =
  | 'year'
  | 'class'
  | 'student'
  | 'service'
  | 'account'
  | 'filterYear'
  | 'filterClass'
  | null;

export function PaymentsScreen({}: Props) {
  const allowed = useCanAccess('finance');
  const { context } = useSchool();
  const { online, refreshStatus } = useNetwork();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [services, setServices] = useState<FeeService[]>([]);
  const [accounts, setAccounts] = useState<BankAccountOption[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);

  const [academicYearName, setAcademicYearName] = useState(
    context?.academic_year?.name || '',
  );
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(toYYYYMMDD());
  const [bankAccountId, setBankAccountId] = useState('');

  const [dues, setDues] = useState<PaymentByService[]>([]);
  const [balance, setBalance] = useState<EconomatBalance | null>(null);
  const [duesLoading, setDuesLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [filterYear, setFilterYear] = useState('');
  const [filterClass, setFilterClass] = useState('');

  const [bootLoading, setBootLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [picker, setPicker] = useState<PickerKind>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [y, c, s, a] = await Promise.all([
          getAcademicYears(),
          getClasses(),
          getFeeServices(),
          getBankAccounts(),
        ]);
        if (cancelled) return;
        setYears(y);
        setClasses(c);
        setServices(s);
        setAccounts(a);
        const yearName =
          context?.academic_year?.name ||
          y.find((yy) => yy.id === context?.academic_year?.id)?.name ||
          y[0]?.name ||
          '';
        setAcademicYearName((prev) => prev || yearName);
        setFilterYear((prev) => prev || yearName);
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
  }, [context?.academic_year?.id, context?.academic_year?.name]);

  useEffect(() => {
    setStudentId('');
    setServiceId('');
    setAmount('');
    setDues([]);
    setBalance(null);
    if (!classId) {
      setStudents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await getStudents({ class_id: classId });
        if (!cancelled) setStudents(list);
      } catch {
        if (!cancelled) setStudents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  /** Liste des services dus dès qu’élève + année sont choisis. */
  useEffect(() => {
    setServiceId('');
    setAmount('');
    setBalance(null);
    setDues([]);
    if (!studentId || !academicYearName) return;
    let cancelled = false;
    (async () => {
      setDuesLoading(true);
      try {
        const status = await getPaymentStatus(studentId, academicYearName);
        if (cancelled) return;
        setDues(status?.by_service || []);
      } catch {
        if (!cancelled) setDues([]);
      } finally {
        if (!cancelled) setDuesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, academicYearName]);

  /** Solde + préremplissage montant quand le service est choisi. */
  useEffect(() => {
    if (!studentId || !academicYearName || !serviceId) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setBalanceLoading(true);
      try {
        const b = await getEconomatBalance({
          student_id: studentId,
          academic_year: academicYearName,
          service_id: serviceId,
        });
        if (cancelled) return;
        setBalance(b);
        const reste = Math.max(0, Number(b.balance) || 0);
        setAmount(reste > 0 ? String(reste) : '');
      } catch {
        if (!cancelled) {
          const fromStatus = dues.find((d) => d.service_id === serviceId);
          if (fromStatus) {
            setBalance({
              amount_due: fromStatus.amount_due,
              total_paid: fromStatus.total_paid,
              balance: fromStatus.balance,
            });
            const reste = Math.max(0, Number(fromStatus.balance) || 0);
            setAmount(reste > 0 ? String(reste) : '');
          } else {
            setBalance(null);
          }
        }
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // dues only as fallback — avoid re-fetch loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, academicYearName, serviceId]);

  const loadTransactions = useCallback(async () => {
    try {
      const list = await getPaymentTransactions({
        academic_year: filterYear || undefined,
        class_id: filterClass || undefined,
      });
      setTransactions(list);
    } catch {
      setTransactions([]);
    }
  }, [filterYear, filterClass]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  async function handleSave() {
    setError('');
    setSuccess('');
    if (!studentId || !classId || !academicYearName || !serviceId || !amount || !paymentDate) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    const amountPaid = Number(amount.replace(',', '.'));
    if (Number.isNaN(amountPaid) || amountPaid <= 0) {
      setError('Montant invalide.');
      return;
    }
    setSaving(true);
    try {
      const result = await recordPaymentWithQueue({
        student_id: studentId,
        class_id: classId,
        academic_year: academicYearName,
        service_id: serviceId,
        amount_paid: amountPaid,
        payment_date: paymentDate,
        bank_account_id: bankAccountId || null,
      });
      if (result.queued) {
        setSuccess(
          online
            ? 'Réseau instable — paiement mis en file d’attente.'
            : 'Hors ligne — paiement mis en file d’attente.',
        );
        await refreshStatus();
      } else {
        setSuccess('Paiement enregistré.');
        await loadTransactions();
      }
      setAmount('');
      setServiceId('');
      setBalance(null);
      setBankAccountId('');
      // rafraîchir les dus du même élève
      try {
        const status = await getPaymentStatus(studentId, academicYearName);
        setDues(status?.by_service || []);
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec enregistrement');
    } finally {
      setSaving(false);
    }
  }

  function selectDueService(row: PaymentByService) {
    setServiceId(row.service_id);
  }

  const pickerItems = useMemo(() => {
    if (picker === 'year' || picker === 'filterYear') {
      return [
        ...(picker === 'filterYear' ? [{ id: '', label: 'Toutes les années' }] : []),
        ...years.map((y) => ({ id: y.name, label: y.name })),
      ];
    }
    if (picker === 'class' || picker === 'filterClass') {
      return [
        ...(picker === 'filterClass' ? [{ id: '', label: 'Toutes les classes' }] : []),
        ...classes.map((c) => ({ id: c.id, label: c.name })),
      ];
    }
    if (picker === 'student') {
      return students.map((s) => ({
        id: s.id,
        label: [s.order_number, studentDisplayName(s)].filter(Boolean).join(' — '),
      }));
    }
    if (picker === 'service') {
      if (dues.length > 0) {
        return dues.map((d) => ({
          id: d.service_id,
          label: `${d.service_name} · reste ${formatMoney(d.balance)}`,
        }));
      }
      return services.map((s) => ({ id: s.id, label: s.name }));
    }
    if (picker === 'account') {
      return [
        { id: '', label: 'Caisse' },
        ...accounts.map((a) => ({ id: a.id, label: a.label })),
      ];
    }
    return [];
  }, [picker, years, classes, students, services, accounts, dues]);

  function onPick(id: string) {
    if (picker === 'year') setAcademicYearName(id);
    if (picker === 'class') setClassId(id);
    if (picker === 'student') setStudentId(id);
    if (picker === 'service') setServiceId(id);
    if (picker === 'account') setBankAccountId(id);
    if (picker === 'filterYear') setFilterYear(id);
    if (picker === 'filterClass') setFilterClass(id);
    setPicker(null);
  }

  const studentLabel =
    students.find((s) => s.id === studentId)
      ? studentDisplayName(students.find((s) => s.id === studentId)!)
      : 'Sélectionner';
  const classLabel = classes.find((c) => c.id === classId)?.name || 'Sélectionner';
  const serviceLabel = services.find((s) => s.id === serviceId)?.name
    || dues.find((d) => d.service_id === serviceId)?.service_name
    || 'Sélectionner';
  const accountLabel =
    accounts.find((a) => a.id === bankAccountId)?.label || (bankAccountId ? 'Compte' : 'Caisse');

  const openDues = useMemo(
    () => dues.filter((d) => Number(d.balance) > 0.009),
    [dues],
  );

  if (bootLoading) {
    return (
      <Screen>
        <LoadingBlock label="Chargement économat…" />
      </Screen>
    );
  }

  if (!allowed) {
    return <AccessDenied />;
  }

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.form}>
          <SelectRow
            label="Année scolaire"
            value={academicYearName || 'Sélectionner'}
            onPress={() => setPicker('year')}
          />
          <SelectRow label="Classe" value={classLabel} onPress={() => setPicker('class')} />
          <SelectRow
            label="Élève"
            value={studentLabel}
            onPress={() => setPicker('student')}
            disabled={!classId}
          />

          {studentId && academicYearName ? (
            <View style={styles.duesBox}>
              <Text style={styles.duesTitle}>À payer</Text>
              {duesLoading ? (
                <ActivityIndicator color={colors.ink} style={{ marginVertical: 12 }} />
              ) : openDues.length === 0 ? (
                <Muted>
                  {dues.length === 0
                    ? 'Aucun service facturé pour cet élève / année'
                    : 'Tous les services sont à jour'}
                </Muted>
              ) : (
                openDues.map((d) => {
                  const active = d.service_id === serviceId;
                  return (
                    <Pressable
                      key={d.service_id}
                      onPress={() => selectDueService(d)}
                      style={[styles.dueRow, active && styles.dueRowActive]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dueName}>{d.service_name}</Text>
                        <Muted>
                          Dû {formatMoney(d.amount_due)} · Payé {formatMoney(d.total_paid)}
                          {d.payment_modality ? ` · ${d.payment_modality}` : ''}
                        </Muted>
                      </View>
                      <Text style={styles.dueBalance}>{formatMoney(d.balance)}</Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          ) : null}

          <SelectRow label="Service" value={serviceLabel} onPress={() => setPicker('service')} />

          {balanceLoading ? (
            <Muted>Calcul du solde…</Muted>
          ) : balance ? (
            <View style={styles.balanceBox}>
              <BalanceLine label="Montant dû" value={balance.amount_due} />
              <BalanceLine label="Déjà payé" value={balance.total_paid} />
              <BalanceLine label="Reste à payer" value={balance.balance} emph />
              {balance.balance <= 0 ? (
                <Text style={styles.okLine}>Solde à jour pour ce service</Text>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Montant payé</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <DateField
            label="Date du paiement"
            value={paymentDate}
            onChange={setPaymentDate}
            maximumDate={new Date()}
          />
          <SelectRow
            label="Mode d’encaissement"
            value={accountLabel}
            onPress={() => setPicker('account')}
          />
          {accounts.length === 0 ? (
            <Muted>Aucun compte bancaire — encaissement possible en Caisse.</Muted>
          ) : null}

          <ErrorBanner message={error} />
          {success ? (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>{success}</Text>
            </View>
          ) : null}

          <Button
            title={saving ? 'Enregistrement…' : 'Enregistrer le paiement'}
            onPress={() => void handleSave()}
            disabled={saving}
          />
        </View>

        <Text style={styles.section}>Historique</Text>
        <View style={styles.filters}>
          <SelectRow
            label="Filtre année"
            value={filterYear || 'Toutes'}
            onPress={() => setPicker('filterYear')}
            compact
          />
          <SelectRow
            label="Filtre classe"
            value={classes.find((c) => c.id === filterClass)?.name || 'Toutes'}
            onPress={() => setPicker('filterClass')}
            compact
          />
        </View>

        {transactions.length === 0 ? (
          <EmptyState title="Aucun paiement" />
        ) : (
          transactions.map((t) => (
            <View key={t.id} style={styles.txCard}>
              <Text style={styles.txTitle}>
                {t.student_name || 'Élève'} · {formatMoney(t.amount_paid)}
              </Text>
              <Muted>
                {[
                  t.payment_date ? String(t.payment_date).slice(0, 10) : null,
                  t.class_name,
                  t.service_name,
                  t.academic_year,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Muted>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={!!picker} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Sélection</Text>
            <FlatList
              data={pickerItems}
              keyExtractor={(i, idx) => `${i.id}-${idx}`}
              renderItem={({ item }) => (
                <Pressable style={styles.modalRow} onPress={() => onPick(item.id)}>
                  <Text style={[styles.modalRowText, item.id && { color: colors.text }]}>
                    {item.label}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={<Muted>Aucune option</Muted>}
            />
            <Button title="Fermer" variant="ghost" onPress={() => setPicker(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function BalanceLine({
  label,
  value,
  emph,
}: {
  label: string;
  value: number;
  emph?: boolean;
}) {
  return (
    <View style={styles.balanceLine}>
      <Text style={[styles.balanceLabel, emph && styles.balanceEmph]}>{label}</Text>
      <Text style={[styles.balanceValue, emph && styles.balanceEmph]}>{formatMoney(value)}</Text>
    </View>
  );
}

function SelectRow({
  label,
  value,
  onPress,
  disabled,
  compact,
}: {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.select, compact && styles.selectCompact, disabled && { opacity: 0.45 }]}
    >
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.selectValue} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  form: {
    marginTop: 14,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  fieldLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  select: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: colors.bg,
  },
  selectCompact: { flex: 1 },
  selectValue: { fontSize: 15, color: colors.text, fontWeight: '600', marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bg,
    marginTop: 4,
    marginBottom: 10,
  },
  duesBox: {
    marginBottom: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    gap: 6,
  },
  duesTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dueRowActive: {
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  dueName: { fontSize: 15, fontWeight: '700', color: colors.text },
  dueBalance: { fontSize: 16, fontWeight: '800', color: colors.text },
  balanceBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  balanceLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: { fontSize: 14, color: colors.textMuted },
  balanceValue: { fontSize: 15, fontWeight: '600', color: colors.text },
  balanceEmph: { fontWeight: '800', color: colors.text, fontSize: 16 },
  okLine: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: colors.success,
  },
  successBanner: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  successText: { color: '#15803D', fontSize: 14 },
  section: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  txCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  txTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
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
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12 },
  modalRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalRowText: { fontSize: 16, color: colors.text },
});
