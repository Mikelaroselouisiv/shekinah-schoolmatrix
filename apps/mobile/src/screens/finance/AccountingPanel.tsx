import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FormModal } from '../../components/FormModal';
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Muted,
  SegmentedControl,
  DateField,
  TextField,
} from '../../components/ui';
import { formatMoney, toYYYYMMDD } from '../../lib/format';
import { colors } from '../../theme/tokens';
import {
  createJournalEntry,
  createLedgerAccount,
  createOtherRevenue,
  getFinanceBalance,
  getOpenFinanceExercice,
  listFinanceExercices,
  listJournalEntries,
  listLedgerAccounts,
  listOtherRevenues,
  suggestLedgerAccountType,
  type BalanceLine,
  type FinanceExercice,
  type JournalEntry,
  type LedgerAccount,
  type OtherRevenue,
} from '../../services/api';

type InnerTab = 'balance' | 'journal' | 'revenus' | 'plan';

/** Panneau Comptabilité (embarqué dans Stats financières). */
export function AccountingPanel() {
  const [tab, setTab] = useState<InnerTab>('balance');
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const [exercices, setExercices] = useState<FinanceExercice[]>([]);
  const [openEx, setOpenEx] = useState<FinanceExercice | null>(null);
  const [selectedEx, setSelectedEx] = useState<FinanceExercice | null>(null);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [balance, setBalance] = useState<BalanceLine[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [revenues, setRevenues] = useState<OtherRevenue[]>([]);

  const [entryOpen, setEntryOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(toYYYYMMDD());
  const [entryLabel, setEntryLabel] = useState('');
  const [lines, setLines] = useState<
    { account_id: string; debit: string; credit: string }[]
  >([{ account_id: '', debit: '', credit: '' }]);
  const [accountPickerLine, setAccountPickerLine] = useState<number | null>(null);

  const [revOpen, setRevOpen] = useState(false);
  const [revDate, setRevDate] = useState(toYYYYMMDD());
  const [revAmount, setRevAmount] = useState('');
  const [revLabel, setRevLabel] = useState('');
  const [revCategory, setRevCategory] = useState('');

  const [accOpen, setAccOpen] = useState(false);
  const [accCode, setAccCode] = useState('');
  const [accLabel, setAccLabel] = useState('');
  const [accType, setAccType] = useState('CHARGE');

  const loadCore = useCallback(async () => {
    const [ex, open, acc] = await Promise.all([
      listFinanceExercices(),
      getOpenFinanceExercice(),
      listLedgerAccounts(),
    ]);
    setExercices(ex);
    setOpenEx(open);
    setAccounts(acc);
    setSelectedEx((prev) => {
      if (prev && ex.some((e) => e.id === prev.id)) {
        return ex.find((e) => e.id === prev.id) || prev;
      }
      return open || ex[0] || null;
    });
    return open || ex[0] || null;
  }, []);

  const loadBalance = useCallback(async (exerciceId: string) => {
    setBalance(await getFinanceBalance(exerciceId));
  }, []);

  const loadJournal = useCallback(async (exerciceId: string) => {
    setEntries(await listJournalEntries({ exercice_id: exerciceId }));
  }, []);

  const loadRevenues = useCallback(async () => {
    setRevenues(await listOtherRevenues());
  }, []);

  const selectExercice = useCallback(
    async (ex: FinanceExercice) => {
      setSelectedEx(ex);
      setError('');
      try {
        await Promise.all([loadBalance(ex.id), loadJournal(ex.id)]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    },
    [loadBalance, loadJournal],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await loadCore();
        if (cancelled) return;
        if (current?.id) {
          await Promise.all([loadBalance(current.id), loadJournal(current.id)]);
        }
        await loadRevenues();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur');
      } finally {
        if (!cancelled) setBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCore, loadBalance, loadJournal, loadRevenues]);

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const credit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
    return { debit, credit };
  }, [lines]);

  const canWrite = Boolean(openEx && selectedEx?.id === openEx.id);

  async function saveEntry() {
    if (!openEx || !canWrite) return;
    const mapped = lines
      .filter((l) => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
      .map((l) => ({
        account_id: l.account_id,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
      }));
    if (mapped.length === 0) {
      setError('Au moins une ligne requise.');
      return;
    }
    if (Math.abs(totals.debit - totals.credit) > 0.01) {
      setError('Débit doit égaler crédit.');
      return;
    }
    if (!entryLabel.trim()) {
      setError('Libellé requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createJournalEntry({
        exercice_id: openEx.id,
        entry_date: entryDate,
        label: entryLabel.trim(),
        source: 'MANUEL',
        lines: mapped,
      });
      setEntryOpen(false);
      setEntryLabel('');
      setLines([{ account_id: '', debit: '', credit: '' }]);
      await Promise.all([loadBalance(openEx.id), loadJournal(openEx.id)]);
      setSuccess('Écriture enregistrée.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function saveRevenue() {
    const amt = Number(revAmount.replace(',', '.'));
    if (!revLabel.trim() || !revDate || Number.isNaN(amt) || amt <= 0) {
      setError('Date, libellé et montant valides requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createOtherRevenue({
        revenue_date: revDate,
        amount: amt,
        label: revLabel.trim(),
        category: revCategory.trim() || undefined,
      });
      setRevOpen(false);
      setRevAmount('');
      setRevLabel('');
      setRevCategory('');
      await loadRevenues();
      setSuccess('Autre revenu enregistré.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function saveAccount() {
    if (!accCode.trim() || !accLabel.trim()) {
      setError('Code et libellé requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createLedgerAccount({
        code: accCode.trim(),
        label: accLabel.trim(),
        type: accType,
      });
      setAccOpen(false);
      setAccCode('');
      setAccLabel('');
      setAccounts(await listLedgerAccounts());
      setSuccess('Compte ajouté.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function onCodeBlur() {
    if (!accCode.trim()) return;
    try {
      const s = await suggestLedgerAccountType(accCode.trim());
      if (s.type) setAccType(s.type);
      if (s.label_suggestion && !accLabel.trim()) setAccLabel(s.label_suggestion);
    } catch {
      /* ignore */
    }
  }

  if (boot) return <LoadingBlock label="Comptabilité…" />;

  return (
    <View style={styles.wrap}>
      <View style={styles.exBox}>
        <Text style={styles.exTitle}>
          {selectedEx
            ? `${selectedEx.date_debut} → ${selectedEx.date_fin}`
            : 'Aucun exercice'}
        </Text>
        <Muted>
          {selectedEx
            ? `Statut · ${selectedEx.statut}`
            : 'Consultation des exercices'}
        </Muted>
        {exercices.length > 0 ? (
          <View style={styles.exList}>
            {exercices.map((ex) => {
              const active = selectedEx?.id === ex.id;
              return (
                <Pressable
                  key={ex.id}
                  onPress={() => void selectExercice(ex)}
                  style={[styles.exChip, active && styles.exChipActive]}
                >
                  <Text style={[styles.exChipText, active && styles.exChipTextActive]}>
                    {ex.date_debut} → {ex.date_fin}
                  </Text>
                  <Muted>{ex.statut}</Muted>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Muted>Aucun exercice à consulter</Muted>
        )}
      </View>

      <SegmentedControl
        options={[
          { id: 'balance', label: 'Balance' },
          { id: 'journal', label: 'Journal' },
          { id: 'revenus', label: 'Revenus' },
          { id: 'plan', label: 'Plan' },
        ]}
        value={tab}
        onChange={(id) => setTab(id as InnerTab)}
      />

      <ErrorBanner message={error} />
      {success ? (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>{success}</Text>
        </View>
      ) : null}

      {tab === 'balance' ? (
        <View style={{ marginTop: 8 }}>
          {!selectedEx ? (
            <EmptyState title="Aucun exercice" />
          ) : balance.length === 0 ? (
            <EmptyState title="Balance vide" />
          ) : (
            balance.map((b, i) => (
              <View key={`${b.account_code}-${i}`} style={styles.row}>
                <Text style={styles.rowTitle}>
                  {b.account_code} · {b.account_label}
                </Text>
                <Muted>
                  D {formatMoney(b.total_debit)} · C {formatMoney(b.total_credit)} · Solde{' '}
                  {formatMoney(b.solde)}
                </Muted>
              </View>
            ))
          )}
        </View>
      ) : null}

      {tab === 'journal' ? (
        <View style={{ marginTop: 8, gap: 8 }}>
          <Button
            title="Nouvelle écriture"
            onPress={() => setEntryOpen(true)}
            disabled={!canWrite}
          />
          {entries.length === 0 ? (
            <EmptyState title="Aucune écriture" />
          ) : (
            entries.map((e) => (
              <View key={e.id} style={styles.row}>
                <Text style={styles.rowTitle}>
                  {e.entry_date} · {e.label}
                </Text>
                <Muted>{e.source}</Muted>
                {(e.lines || []).map((l, idx) => (
                  <Muted key={idx}>
                    {l.account_code} {l.account_label} · D {formatMoney(l.debit)} / C{' '}
                    {formatMoney(l.credit)}
                  </Muted>
                ))}
              </View>
            ))
          )}
        </View>
      ) : null}

      {tab === 'revenus' ? (
        <View style={{ marginTop: 8, gap: 8 }}>
          <Button title="Autre revenu" onPress={() => setRevOpen(true)} />
          {revenues.length === 0 ? (
            <EmptyState title="Aucun autre revenu" />
          ) : (
            revenues.map((r) => (
              <View key={r.id} style={styles.row}>
                <Text style={styles.rowTitle}>{r.label}</Text>
                <Muted>
                  {r.revenue_date} · {formatMoney(r.amount)}
                  {r.category ? ` · ${r.category}` : ''}
                </Muted>
              </View>
            ))
          )}
        </View>
      ) : null}

      {tab === 'plan' ? (
        <View style={{ marginTop: 8, gap: 8 }}>
          <Button title="Ajouter un compte" onPress={() => setAccOpen(true)} />
          {accounts.map((a) => (
            <View key={a.id} style={styles.row}>
              <Text style={styles.rowTitle}>
                {a.code} · {a.label}
              </Text>
              <Muted>{a.type}</Muted>
            </View>
          ))}
        </View>
      ) : null}

      <FormModal visible={entryOpen} onRequestClose={() => setEntryOpen(false)}>
        <Text style={styles.sheetTitle}>Écriture manuelle</Text>
        <DateField label="Date" value={entryDate} onChange={setEntryDate} />
        <TextField label="Libellé *" value={entryLabel} onChangeText={setEntryLabel} />
        {lines.map((l, i) => (
          <View key={i} style={styles.lineBox}>
            <Pressable
              style={styles.chip}
              onPress={() => setAccountPickerLine(i)}
            >
              <Text style={styles.chipLabel}>Compte</Text>
              <Text style={styles.chipValue}>
                {accounts.find((a) => a.id === l.account_id)
                  ? `${accounts.find((a) => a.id === l.account_id)!.code} · ${
                      accounts.find((a) => a.id === l.account_id)!.label
                    }`
                  : 'Choisir'}
              </Text>
            </Pressable>
            <View style={styles.lineAmounts}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Débit"
                  value={l.debit}
                  onChangeText={(t) =>
                    setLines((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, debit: t } : x)),
                    )
                  }
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Crédit"
                  value={l.credit}
                  onChangeText={(t) =>
                    setLines((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, credit: t } : x)),
                    )
                  }
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            {lines.length > 1 ? (
              <Pressable onPress={() => setLines((prev) => prev.filter((_, j) => j !== i))}>
                <Text style={styles.danger}>Retirer la ligne</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        <Muted>
          Totaux · D {formatMoney(totals.debit)} / C {formatMoney(totals.credit)}
        </Muted>
        <Button
          title="Ajouter une ligne"
          variant="ghost"
          onPress={() =>
            setLines((prev) => [...prev, { account_id: '', debit: '', credit: '' }])
          }
        />
        <ErrorBanner message={error} />
        <Button
          title={saving ? '…' : 'Enregistrer'}
          onPress={() => void saveEntry()}
          disabled={saving}
        />
        <Button title="Annuler" variant="ghost" onPress={() => setEntryOpen(false)} />
      </FormModal>

      <FormModal visible={revOpen} onRequestClose={() => setRevOpen(false)}>
        <Text style={styles.sheetTitle}>Autre revenu</Text>
        <DateField label="Date" value={revDate} onChange={setRevDate} />
        <TextField label="Libellé *" value={revLabel} onChangeText={setRevLabel} />
        <TextField
          label="Montant *"
          value={revAmount}
          onChangeText={setRevAmount}
          keyboardType="decimal-pad"
        />
        <TextField label="Catégorie" value={revCategory} onChangeText={setRevCategory} />
        <Button
          title={saving ? '…' : 'Enregistrer'}
          onPress={() => void saveRevenue()}
          disabled={saving}
        />
        <Button title="Annuler" variant="ghost" onPress={() => setRevOpen(false)} />
      </FormModal>

      <FormModal visible={accOpen} onRequestClose={() => setAccOpen(false)}>
        <Text style={styles.sheetTitle}>Nouveau compte</Text>
        <TextField
          label="Code *"
          value={accCode}
          onChangeText={setAccCode}
          onBlur={() => void onCodeBlur()}
          autoCapitalize="characters"
        />
        <TextField label="Libellé *" value={accLabel} onChangeText={setAccLabel} />
        <TextField label="Type" value={accType} onChangeText={setAccType} autoCapitalize="characters" />
        <Button
          title={saving ? '…' : 'Enregistrer'}
          onPress={() => void saveAccount()}
          disabled={saving}
        />
        <Button title="Annuler" variant="ghost" onPress={() => setAccOpen(false)} />
      </FormModal>

      <Modal visible={accountPickerLine != null} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setAccountPickerLine(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <FlatList
              data={accounts}
              keyExtractor={(a) => a.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.pickRow}
                  onPress={() => {
                    if (accountPickerLine == null) return;
                    setLines((prev) =>
                      prev.map((x, j) =>
                        j === accountPickerLine ? { ...x, account_id: item.id } : x,
                      ),
                    );
                    setAccountPickerLine(null);
                  }}
                >
                  <Text style={styles.rowTitle}>
                    {item.code} · {item.label}
                  </Text>
                </Pressable>
              )}
            />
            <Button title="Fermer" variant="ghost" onPress={() => setAccountPickerLine(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 8, paddingBottom: 32 },
  exBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 4,
  },
  exTitle: { fontWeight: '800', color: colors.text },
  exList: { marginTop: 8, gap: 6 },
  exChip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    gap: 2,
  },
  exChipActive: {
    borderColor: colors.text,
    backgroundColor: colors.surface,
  },
  exChipText: { fontWeight: '600', color: colors.textMuted, fontSize: 14 },
  exChipTextActive: { color: colors.text, fontWeight: '700' },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTitle: { fontWeight: '700', color: colors.text, fontSize: 15 },
  successBanner: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  successText: { color: '#065F46', fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  lineBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
    gap: 4,
  },
  lineAmounts: { flexDirection: 'row', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
  },
  chipLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  chipValue: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 },
  danger: { color: colors.danger, fontWeight: '700', marginTop: 4 },
  pickRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
