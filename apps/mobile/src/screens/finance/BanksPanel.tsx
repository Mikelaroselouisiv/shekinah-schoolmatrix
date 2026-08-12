import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Muted,
  TextField,
} from '../../components/ui';
import { formatMoney } from '../../lib/format';
import { colors } from '../../theme/tokens';
import {
  createFinanceBank,
  createFinanceBankAccount,
  deleteFinanceBank,
  deleteFinanceBankAccount,
  listFinanceBanks,
  type FinanceBank,
} from '../../services/api';

/** Panneau Banques (embarqué dans Stats financières). */
export function BanksPanel() {
  const [banks, setBanks] = useState<FinanceBank[]>([]);
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState('');
  const [bankName, setBankName] = useState('');
  const [savingBank, setSavingBank] = useState(false);
  const [accountForms, setAccountForms] = useState<
    Record<string, { name: string; account_number: string; opening_balance: string }>
  >({});
  const [savingAccount, setSavingAccount] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBanks(await listFinanceBanks());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur');
      } finally {
        if (!cancelled) setBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const totalBalance = banks.reduce(
    (s, b) => s + (b.accounts || []).reduce((ss, a) => ss + (a.balance ?? 0), 0),
    0,
  );

  async function addBank() {
    if (!bankName.trim()) return;
    setSavingBank(true);
    setError('');
    try {
      await createFinanceBank(bankName.trim());
      setBankName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingBank(false);
    }
  }

  function confirmDeleteBank(id: string) {
    Alert.alert('Supprimer', 'Supprimer cette banque et ses comptes ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await deleteFinanceBank(id);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur');
            }
          })(),
      },
    ]);
  }

  function formFor(bankId: string) {
    return accountForms[bankId] ?? { name: '', account_number: '', opening_balance: '0' };
  }

  async function addAccount(bankId: string) {
    const f = formFor(bankId);
    if (!f.name.trim()) return;
    setSavingAccount(bankId);
    setError('');
    try {
      await createFinanceBankAccount({
        bank_id: bankId,
        name: f.name.trim(),
        account_number: f.account_number.trim() || null,
        opening_balance: parseFloat(f.opening_balance) || 0,
      });
      setAccountForms((prev) => ({
        ...prev,
        [bankId]: { name: '', account_number: '', opening_balance: '0' },
      }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingAccount(null);
    }
  }

  function confirmDeleteAccount(id: string) {
    Alert.alert('Supprimer', 'Supprimer ce compte ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await deleteFinanceBankAccount(id);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur');
            }
          })(),
      },
    ]);
  }

  if (boot) return <LoadingBlock label="Banques…" />;

  return (
    <View style={styles.wrap}>
      <Text style={styles.total}>
        Solde total · <Text style={styles.totalValue}>{formatMoney(totalBalance)}</Text>
      </Text>
      <ErrorBanner message={error} />

      <TextField
        label="Nouvelle banque"
        value={bankName}
        onChangeText={setBankName}
        placeholder="Nom"
      />
      <Button
        title={savingBank ? '…' : 'Ajouter la banque'}
        onPress={() => void addBank()}
        disabled={savingBank}
      />

      {banks.length === 0 ? (
        <EmptyState title="Aucune banque" />
      ) : (
        banks.map((bank) => {
          const f = formFor(bank.id);
          return (
            <View key={bank.id} style={styles.bankCard}>
              <View style={styles.bankHead}>
                <Text style={styles.bankName}>{bank.name}</Text>
                <Pressable onPress={() => confirmDeleteBank(bank.id)}>
                  <Text style={styles.danger}>Supprimer</Text>
                </Pressable>
              </View>
              {(bank.accounts || []).map((a) => (
                <View key={a.id} style={styles.accountRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accountName}>{a.name}</Text>
                    <Muted>
                      {[a.account_number, `Solde ${formatMoney(a.balance ?? 0)}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </Muted>
                  </View>
                  <Pressable onPress={() => confirmDeleteAccount(a.id)}>
                    <Text style={styles.danger}>×</Text>
                  </Pressable>
                </View>
              ))}
              <Text style={styles.subHead}>Nouveau compte</Text>
              <TextField
                label="Nom"
                value={f.name}
                onChangeText={(t) =>
                  setAccountForms((prev) => ({
                    ...prev,
                    [bank.id]: { ...f, name: t },
                  }))
                }
              />
              <TextField
                label="N° compte"
                value={f.account_number}
                onChangeText={(t) =>
                  setAccountForms((prev) => ({
                    ...prev,
                    [bank.id]: { ...f, account_number: t },
                  }))
                }
              />
              <TextField
                label="Solde d’ouverture"
                value={f.opening_balance}
                onChangeText={(t) =>
                  setAccountForms((prev) => ({
                    ...prev,
                    [bank.id]: { ...f, opening_balance: t },
                  }))
                }
                keyboardType="decimal-pad"
              />
              <Button
                title={savingAccount === bank.id ? '…' : 'Ajouter le compte'}
                variant="ghost"
                onPress={() => void addAccount(bank.id)}
                disabled={savingAccount === bank.id}
              />
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 8, paddingBottom: 24 },
  total: { fontSize: 14, color: colors.textMuted, marginBottom: 4 },
  totalValue: { fontWeight: '800', color: colors.text },
  bankCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 6,
  },
  bankHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  bankName: { fontSize: 17, fontWeight: '800', color: colors.text },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  accountName: { fontWeight: '700', color: colors.text },
  subHead: {
    marginTop: 8,
    fontWeight: '700',
    color: colors.textMuted,
    fontSize: 13,
  },
  danger: { color: colors.danger, fontWeight: '700' },
});
