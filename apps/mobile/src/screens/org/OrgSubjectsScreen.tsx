import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
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
  SegmentedControl,
  TextField,
  Title,
} from '../../components/ui';
import { colors } from '../../theme/tokens';
import {
  createBringCatalogItem,
  createSubject,
  deleteBringCatalogItem,
  deleteSubject,
  listBringItemCatalog,
  listSubjects,
  updateBringCatalogItem,
  updateSubject,
  type BringCatalogItem,
  type SubjectOrg,
} from '../../services/api';
import type { MoreStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<MoreStackParamList, 'OrgSubjects'>;
type TabId = 'subjects' | 'materials';

export function OrgSubjectsScreen({}: Props) {
  const allowed = useCanAccess('subjects');
  const [tab, setTab] = useState<TabId>('subjects');
  const [items, setItems] = useState<SubjectOrg[]>([]);
  const [materials, setMaterials] = useState<BringCatalogItem[]>([]);
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectOrg | null>(null);
  const [editingMat, setEditingMat] = useState<BringCatalogItem | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [matLabel, setMatLabel] = useState('');

  const load = useCallback(async () => {
    const [subj, catalog] = await Promise.all([listSubjects(), listBringItemCatalog()]);
    setItems(subj);
    setMaterials(catalog);
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

  function openSubject(s?: SubjectOrg) {
    setEditing(s || null);
    setName(s?.name || '');
    setCode(s?.code || '');
    setFormOpen(true);
  }

  function openMaterial(item?: BringCatalogItem) {
    setEditingMat(item || null);
    setMatLabel(item?.label || '');
    setFormOpen(true);
  }

  async function saveSubject() {
    if (!name.trim()) {
      setError('Nom requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updateSubject(editing.id, {
          name: name.trim(),
          code: code.trim() || undefined,
        });
      } else {
        await createSubject({ name: name.trim(), code: code.trim() || undefined });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function saveMaterial() {
    if (!matLabel.trim()) {
      setError('Nom requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingMat) {
        await updateBringCatalogItem(editingMat.id, matLabel.trim());
      } else {
        await createBringCatalogItem(matLabel.trim());
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteSubject(id: string) {
    Alert.alert('Supprimer', 'Supprimer cette matière ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await deleteSubject(id);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur');
            }
          })(),
      },
    ]);
  }

  function confirmDeleteMaterial(id: string) {
    Alert.alert('Supprimer', 'Supprimer ce matériel ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await deleteBringCatalogItem(id);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur');
            }
          })(),
      },
    ]);
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

  const isMaterials = tab === 'materials';

  return (
    <Screen style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={styles.top}>
        <Title>Matières</Title>
        <SegmentedControl
          options={[
            { id: 'subjects', label: 'Matières' },
            { id: 'materials', label: 'Matériel' },
          ]}
          value={tab}
          onChange={(id) => setTab(id as TabId)}
        />
        <Button
          title="Ajouter"
          onPress={() => (isMaterials ? openMaterial() : openSubject())}
        />
        <ErrorBanner message={error} />
      </View>
      {isMaterials ? (
        <FlatList
          data={materials}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="Aucun matériel" />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.label}</Text>
              <View style={styles.actions}>
                <Pressable onPress={() => openMaterial(item)}>
                  <Text style={styles.link}>Modifier</Text>
                </Pressable>
                <Pressable onPress={() => confirmDeleteMaterial(item.id)}>
                  <Text style={styles.danger}>Supprimer</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="Aucune matière" />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Muted>
                {[item.code, item.active === false ? 'Inactive' : null]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </Muted>
              <View style={styles.actions}>
                <Pressable onPress={() => openSubject(item)}>
                  <Text style={styles.link}>Modifier</Text>
                </Pressable>
                <Pressable onPress={() => confirmDeleteSubject(item.id)}>
                  <Text style={styles.danger}>Supprimer</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <FormModal visible={formOpen} onRequestClose={() => setFormOpen(false)}>
        {isMaterials ? (
          <>
            <Text style={styles.sheetTitle}>
              {editingMat ? 'Modifier' : 'Nouveau matériel'}
            </Text>
            <TextField label="Nom *" value={matLabel} onChangeText={setMatLabel} />
            <Button
              title={saving ? '…' : 'Enregistrer'}
              onPress={() => void saveMaterial()}
              disabled={saving}
            />
          </>
        ) : (
          <>
            <Text style={styles.sheetTitle}>
              {editing ? 'Modifier' : 'Nouvelle matière'}
            </Text>
            <TextField label="Nom *" value={name} onChangeText={setName} />
            <TextField label="Code" value={code} onChangeText={setCode} />
            <Button
              title={saving ? '…' : 'Enregistrer'}
              onPress={() => void saveSubject()}
              disabled={saving}
            />
          </>
        )}
        <Button title="Annuler" variant="ghost" onPress={() => setFormOpen(false)} />
      </FormModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 48 },
  card: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  actions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  link: { color: colors.primaryFallback, fontWeight: '700' },
  danger: { color: colors.danger, fontWeight: '700' },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4, color: colors.text },
});
