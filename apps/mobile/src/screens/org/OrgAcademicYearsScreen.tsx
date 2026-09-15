import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormModal } from '../../components/FormModal';
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Muted,
  Screen,
  DateField,
  TextField,
  Title,
} from '../../components/ui';
import { useSchool } from '../../context/SchoolContext';
import { colors } from '../../theme/tokens';
import {
  createAcademicYear,
  createPeriod,
  deleteAcademicYear,
  deletePeriod,
  getPeriods,
  listAcademicYearsOrg,
  patchSchoolProfile,
  updateAcademicYear,
  updatePeriod,
  type AcademicYearOrg,
  type PeriodOrg,
} from '../../services/api';
import type { MoreStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<MoreStackParamList, 'OrgAcademicYears'>;

export function OrgAcademicYearsScreen({}: Props) {
  const allowed = useCanAccess('academic-years');
  const { context, refetch } = useSchool();
  const [years, setYears] = useState<AcademicYearOrg[]>([]);
  const [periods, setPeriods] = useState<PeriodOrg[]>([]);
  const [selectedYearId, setSelectedYearId] = useState('');
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [yearForm, setYearForm] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYearOrg | null>(null);
  const [yearName, setYearName] = useState('');
  const [yearStart, setYearStart] = useState('');
  const [yearEnd, setYearEnd] = useState('');

  const [periodForm, setPeriodForm] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<PeriodOrg | null>(null);
  const [periodName, setPeriodName] = useState('');
  const [periodOrder, setPeriodOrder] = useState('0');

  const currentYearId =
    context?.academic_year?.id || context?.current_academic_year_id || null;
  const currentPeriodId =
    context?.period?.id || context?.current_period_id || null;

  const loadYears = useCallback(async () => {
    const list = await listAcademicYearsOrg();
    setYears(list);
    setSelectedYearId((prev) => prev || currentYearId || list[0]?.id || '');
  }, [currentYearId]);

  const loadPeriods = useCallback(async (yearId: string) => {
    if (!yearId) {
      setPeriods([]);
      return;
    }
    setPeriods((await getPeriods(yearId)) as PeriodOrg[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadYears();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur');
      } finally {
        if (!cancelled) setBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadYears]);

  useEffect(() => {
    if (!boot && selectedYearId) void loadPeriods(selectedYearId);
  }, [boot, selectedYearId, loadPeriods]);

  function openYear(y?: AcademicYearOrg) {
    setEditingYear(y || null);
    setYearName(y?.name || '');
    setYearStart(y?.start_date ? String(y.start_date).slice(0, 10) : '');
    setYearEnd(y?.end_date ? String(y.end_date).slice(0, 10) : '');
    setYearForm(true);
  }

  function openPeriod(p?: PeriodOrg) {
    setEditingPeriod(p || null);
    setPeriodName(p?.name || '');
    setPeriodOrder(String(p?.order_index ?? periods.length));
    setPeriodForm(true);
  }

  async function saveYear() {
    if (!yearName.trim()) {
      setError('Nom d’année requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingYear) {
        await updateAcademicYear(editingYear.id, {
          name: yearName.trim(),
          start_date: yearStart || undefined,
          end_date: yearEnd || undefined,
        });
      } else {
        await createAcademicYear({
          name: yearName.trim(),
          start_date: yearStart || undefined,
          end_date: yearEnd || undefined,
        });
      }
      setYearForm(false);
      await loadYears();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function savePeriod() {
    if (!selectedYearId || !periodName.trim()) {
      setError('Nom de période requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const order = Number(periodOrder) || 0;
      if (editingPeriod) {
        await updatePeriod(editingPeriod.id, {
          name: periodName.trim(),
          order_index: order,
        });
      } else {
        await createPeriod({
          academic_year_id: selectedYearId,
          name: periodName.trim(),
          order_index: order,
        });
      }
      setPeriodForm(false);
      await loadPeriods(selectedYearId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteYear(id: string) {
    Alert.alert('Supprimer', 'Supprimer cette année ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await deleteAcademicYear(id);
              await loadYears();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur');
            }
          })(),
      },
    ]);
  }

  function confirmDeletePeriod(id: string) {
    Alert.alert('Supprimer', 'Supprimer cette période ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await deletePeriod(id);
              await loadPeriods(selectedYearId);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur');
            }
          })(),
      },
    ]);
  }

  async function setCurrentYear(id: string) {
    setSaving(true);
    setError('');
    try {
      await patchSchoolProfile({ current_academic_year_id: id });
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function setCurrentPeriod(id: string) {
    setSaving(true);
    setError('');
    try {
      await patchSchoolProfile({ current_period_id: id });
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

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
    <Screen style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>Années et périodes</Title>
        <ErrorBanner message={error} />

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Années</Text>
          <Button title="Ajouter" variant="ghost" onPress={() => openYear()} />
        </View>
        {years.length === 0 ? (
          <EmptyState title="Aucune année" />
        ) : (
          years.map((y) => (
            <Pressable
              key={y.id}
              style={[
                styles.card,
                selectedYearId === y.id && styles.cardSelected,
              ]}
              onPress={() => setSelectedYearId(y.id)}
            >
              <Text style={styles.cardTitle}>
                {y.name}
                {currentYearId === y.id ? ' · courante' : ''}
              </Text>
              <Muted>
                {[y.start_date, y.end_date].filter(Boolean).join(' → ') || 'Sans dates'}
              </Muted>
              <View style={styles.rowActions}>
                {currentYearId !== y.id ? (
                  <Pressable onPress={() => void setCurrentYear(y.id)}>
                    <Text style={styles.link}>Définir courante</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => openYear(y)}>
                  <Text style={styles.link}>Modifier</Text>
                </Pressable>
                <Pressable onPress={() => confirmDeleteYear(y.id)}>
                  <Text style={styles.danger}>Supprimer</Text>
                </Pressable>
              </View>
            </Pressable>
          ))
        )}

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Périodes</Text>
          <Button
            title="Ajouter"
            variant="ghost"
            onPress={() => openPeriod()}
            disabled={!selectedYearId}
          />
        </View>
        {periods.length === 0 ? (
          <EmptyState title="Aucune période" />
        ) : (
          periods.map((p) => (
            <View key={p.id} style={styles.card}>
              <Text style={styles.cardTitle}>
                {p.name}
                {currentPeriodId === p.id ? ' · courante' : ''}
              </Text>
              <Muted>Ordre {p.order_index ?? '—'}</Muted>
              <View style={styles.rowActions}>
                {currentPeriodId !== p.id ? (
                  <Pressable onPress={() => void setCurrentPeriod(p.id)}>
                    <Text style={styles.link}>Définir courante</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => openPeriod(p)}>
                  <Text style={styles.link}>Modifier</Text>
                </Pressable>
                <Pressable onPress={() => confirmDeletePeriod(p.id)}>
                  <Text style={styles.danger}>Supprimer</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <FormModal visible={yearForm} onRequestClose={() => setYearForm(false)}>
        <Text style={styles.sheetTitle}>
          {editingYear ? 'Modifier l’année' : 'Nouvelle année'}
        </Text>
        <TextField label="Nom *" value={yearName} onChangeText={setYearName} />
        <DateField label="Début" value={yearStart} onChange={setYearStart} />
        <DateField label="Fin" value={yearEnd} onChange={setYearEnd} />
        <Button
          title={saving ? '…' : 'Enregistrer'}
          onPress={() => void saveYear()}
          disabled={saving}
        />
        <Button title="Annuler" variant="ghost" onPress={() => setYearForm(false)} />
      </FormModal>

      <FormModal visible={periodForm} onRequestClose={() => setPeriodForm(false)}>
        <Text style={styles.sheetTitle}>
          {editingPeriod ? 'Modifier la période' : 'Nouvelle période'}
        </Text>
        <TextField label="Nom *" value={periodName} onChangeText={setPeriodName} />
        <TextField
          label="Ordre"
          value={periodOrder}
          onChangeText={setPeriodOrder}
          keyboardType="number-pad"
        />
        <Button
          title={saving ? '…' : 'Enregistrer'}
          onPress={() => void savePeriod()}
          disabled={saving}
        />
        <Button title="Annuler" variant="ghost" onPress={() => setPeriodForm(false)} />
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  card: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cardSelected: { backgroundColor: colors.bg },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  link: { color: colors.primaryFallback, fontWeight: '700' },
  danger: { color: colors.danger, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 },
});
