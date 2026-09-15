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
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Muted,
  Screen,
  DateField,
} from '../../components/ui';
import { formatMoney, toYYYYMMDD } from '../../lib/format';
import { colors } from '../../theme/tokens';
import {
  createExpense,
  deleteExpense,
  getBankAccounts,
  listExpenses,
  listFinanceActivities,
  validateExpense,
  type BankAccountOption,
  type ExpenseItem,
  type FinanceActivity,
} from '../../services/api';
import type { FinanceStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<FinanceStackParamList, 'Expenses'>;
type PickerKind = 'account' | 'activity' | null;

export function ExpensesScreen({}: Props) {
  const allowed = useCanAccess('finance');
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [accounts, setAccounts] = useState<BankAccountOption[]>([]);
  const [activities, setActivities] = useState<FinanceActivity[]>([]);
  const [boot, setBoot] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [picker, setPicker] = useState<PickerKind>(null);

  const [expenseDate, setExpenseDate] = useState(toYYYYMMDD());
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [documentRef, setDocumentRef] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [activityId, setActivityId] = useState('');

  const load = useCallback(async () => {
    try {
      setExpenses(await listExpenses());
    } catch {
      setExpenses([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, act] = await Promise.all([getBankAccounts(), listFinanceActivities()]);
        if (cancelled) return;
        setAccounts(a);
        setActivities(act);
        await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement impossible');
      } finally {
        if (!cancelled) setBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleCreate() {
    setError('');
    setSuccess('');
    const amt = Number(amount.replace(',', '.'));
    if (!label.trim() || !expenseDate || Number.isNaN(amt) || amt <= 0) {
      setError('Date, libellé et montant valides requis.');
      return;
    }
    setSaving(true);
    try {
      await createExpense({
        expense_date: expenseDate,
        amount: amt,
        label: label.trim(),
        beneficiary: beneficiary.trim() || undefined,
        document_ref: documentRef.trim() || undefined,
        fee_service_id: activityId || null,
        bank_account_id: bankAccountId || null,
      });
      setSuccess('Dépense créée (brouillon).');
      setAmount('');
      setLabel('');
      setBeneficiary('');
      setDocumentRef('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function confirmAction(kind: 'validate' | 'delete', id: string) {
    Alert.alert(
      kind === 'validate' ? 'Valider' : 'Supprimer',
      kind === 'validate' ? 'Valider cette dépense ?' : 'Supprimer ce brouillon ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: kind === 'validate' ? 'Valider' : 'Supprimer',
          style: kind === 'delete' ? 'destructive' : 'default',
          onPress: () => {
            void (async () => {
              try {
                if (kind === 'validate') await validateExpense(id);
                else await deleteExpense(id);
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Action impossible');
              }
            })();
          },
        },
      ],
    );
  }

  const pickerItems = useMemo(() => {
    if (picker === 'account') {
      return [{ id: '', label: 'Caisse' }, ...accounts.map((a) => ({ id: a.id, label: a.label }))];
    }
    if (picker === 'activity') {
      return [
        { id: '', label: 'Trésorerie générale' },
        ...activities.map((a) => ({ id: a.id, label: a.name })),
      ];
    }
    return [];
  }, [picker, accounts, activities]);

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

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <FormScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <DateField label="Date" value={expenseDate} onChange={setExpenseDate} maximumDate={new Date()} />
          <Field label="Libellé" value={label} onChange={setLabel} />
          <Field label="Montant" value={amount} onChange={setAmount} keyboardType="decimal-pad" />
          <Field label="Bénéficiaire" value={beneficiary} onChange={setBeneficiary} />
          <Field label="N° pièce" value={documentRef} onChange={setDocumentRef} />
          <Select
            label="Imputé à"
            value={bankAccountId ? accounts.find((a) => a.id === bankAccountId)?.label || 'Banque' : 'Caisse'}
            onPress={() => setPicker('account')}
          />
          <Select
            label="Activité"
            value={
              activityId
                ? activities.find((a) => a.id === activityId)?.name || 'Activité'
                : 'Trésorerie générale'
            }
            onPress={() => setPicker('activity')}
          />
          <ErrorBanner message={error} />
          {success ? (
            <View style={styles.ok}>
              <Text style={styles.okText}>{success}</Text>
            </View>
          ) : null}
          <Button
            title={saving ? '…' : 'Créer le brouillon'}
            onPress={() => void handleCreate()}
            disabled={saving}
          />
        </View>

        <Text style={styles.section}>Liste</Text>
        {expenses.length === 0 ? (
          <EmptyState title="Aucune dépense" />
        ) : (
          expenses.map((e) => (
            <View key={e.id} style={styles.item}>
              <Text style={styles.itemTitle}>
                {e.label} · {formatMoney(e.amount)}
              </Text>
              <Muted>
                {String(e.expense_date || '').slice(0, 10)} · {e.statut || '—'}
                {e.beneficiary ? ` · ${e.beneficiary}` : ''}
              </Muted>
              {e.statut === 'BROUILLON' ? (
                <View style={styles.actions}>
                  <Button title="Valider" onPress={() => confirmAction('validate', e.id)} />
                  <Button title="Supprimer" variant="danger" onPress={() => confirmAction('delete', e.id)} />
                </View>
              ) : null}
            </View>
          ))
        )}
      </FormScrollView>

      <Modal visible={!!picker} animationType="slide" transparent>
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Sélection</Text>
            <FlatList
              data={pickerItems}
              keyExtractor={(i, idx) => `${i.id}-${idx}`}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    if (picker === 'account') setBankAccountId(item.id);
                    if (picker === 'activity') setActivityId(item.id);
                    setPicker(null);
                  }}
                >
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

function Field({
  label,
  value,
  onChange,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
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

function Select({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.select}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  card: {
    marginTop: 14,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  section: { marginTop: 22, marginBottom: 10, fontSize: 17, fontWeight: '700', color: colors.text },
  item: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  itemTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  actions: { marginTop: 8, gap: 6 },
  ok: { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 10, marginBottom: 8 },
  okText: { color: '#15803D' },
  label: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  value: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2 },
  select: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    backgroundColor: colors.bg,
  },
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
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
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
