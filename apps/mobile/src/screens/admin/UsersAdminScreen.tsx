import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
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
  SearchBar,
  TextField,
  Title,
} from '../../components/ui';
import { studentDisplayName } from '../../lib/format';
import { colors } from '../../theme/tokens';
import {
  createUser,
  deleteUser,
  findStudentByOrderNumber,
  getUser,
  listRoles,
  listUsers,
  resetUserPassword,
  setUserRole,
  updateUser,
  type OrgUser,
  type RoleItem,
} from '../../services/api';
import type { MoreStackParamList } from '../../navigation/types';
import { AccessDenied, useCanAccess } from '../../lib/access';

type Props = NativeStackScreenProps<MoreStackParamList, 'UsersAdmin'>;

const TAKE = 25;

function displayName(u: OrgUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
}

export function UsersAdminScreen({}: Props) {
  const allowed = useCanAccess('users');
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [boot, setBoot] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const loadMoreLock = useRef(false);
  const searchGen = useRef(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OrgUser | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [roleName, setRoleName] = useState('PARENT');
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [linkedLabels, setLinkedLabels] = useState<Record<string, string>>({});
  const [nisuInput, setNisuInput] = useState('');
  const [linking, setLinking] = useState(false);

  const [rolePicker, setRolePicker] = useState(false);
  const [resetUser, setResetUser] = useState<OrgUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const loadRoles = useCallback(async () => {
    setRoles(await listRoles());
  }, []);

  const loadFirstPage = useCallback(async (q: string) => {
    const res = await listUsers({ q: q || undefined, page: 1, take: TAKE });
    setUsers(res.users);
    setTotal(res.total);
    setPage(1);
    return res;
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!allowed) {
      setBoot(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await loadRoles();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, loadRoles]);

  useEffect(() => {
    if (!allowed) {
      setBoot(false);
      return;
    }
    let cancelled = false;
    const gen = ++searchGen.current;
    (async () => {
      setListLoading(true);
      setError('');
      try {
        const res = await listUsers({ q: searchQuery || undefined, page: 1, take: TAKE });
        if (cancelled || gen !== searchGen.current) return;
        setUsers(res.users);
        setTotal(res.total);
        setPage(1);
      } catch (err) {
        if (!cancelled && gen === searchGen.current) {
          setError(err instanceof Error ? err.message : 'Erreur');
          setUsers([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled && gen === searchGen.current) {
          setBoot(false);
          setListLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, searchQuery, loadFirstPage]);

  async function loadMore() {
    if (loadMoreLock.current || listLoading || loadingMore) return;
    if (users.length >= total) return;
    loadMoreLock.current = true;
    const gen = searchGen.current;
    setLoadingMore(true);
    try {
      const res = await listUsers({
        q: searchQuery || undefined,
        page: page + 1,
        take: TAKE,
      });
      if (gen !== searchGen.current) return;
      setPage(res.page);
      setTotal(res.total);
      setUsers((prev) => {
        const seen = new Set(prev.map((u) => u.id));
        return [...prev, ...res.users.filter((u) => !seen.has(u.id))];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      loadMoreLock.current = false;
      setLoadingMore(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setRoleName(roles[0]?.name || 'PARENT');
    setLinkedIds([]);
    setLinkedLabels({});
    setNisuInput('');
    setFormOpen(true);
    setError('');
  }

  async function openEdit(u: OrgUser) {
    setError('');
    try {
      const full = await getUser(u.id);
      setEditing(full);
      setFirstName(full.first_name || '');
      setLastName(full.last_name || '');
      setEmail(full.email || '');
      setPhone(full.phone || '');
      setPassword('');
      setRoleName(full.role || 'PARENT');
      setLinkedIds(full.linked_student_ids || []);
      setLinkedLabels({});
      setNisuInput('');
      setFormOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function addByNisu() {
    const raw = nisuInput.trim();
    if (!raw) return;
    setLinking(true);
    setError('');
    try {
      const student = await findStudentByOrderNumber(raw);
      if (!student) {
        setError(`Aucun élève pour « ${raw} ».`);
        return;
      }
      if (linkedIds.includes(student.id)) {
        setError('Élève déjà lié.');
        return;
      }
      setLinkedIds((prev) => [...prev, student.id]);
      setLinkedLabels((prev) => ({
        ...prev,
        [student.id]: studentDisplayName(student),
      }));
      setNisuInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLinking(false);
    }
  }

  async function save() {
    if (!email.trim()) {
      setError('Email requis.');
      return;
    }
    if (!editing && !password.trim()) {
      setError('Mot de passe requis pour la création.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (editing) {
        await updateUser(editing.id, {
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
          email: email.trim(),
          phone: phone.trim() || undefined,
          linked_student_ids: linkedIds,
          ...(password.trim() ? { password: password.trim() } : {}),
        });
        if (editing.role && roleName && roleName !== editing.role) {
          await setUserRole(editing.id, roleName);
        }
      } else {
        await createUser({
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
          email: email.trim(),
          phone: phone.trim() || undefined,
          password: password.trim(),
          roleName,
          linked_student_ids: linkedIds.length ? linkedIds : undefined,
        });
      }
      setFormOpen(false);
      setSuccess(editing ? 'Utilisateur mis à jour.' : 'Utilisateur créé.');
      await loadFirstPage(searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(u: OrgUser) {
    Alert.alert('Supprimer', `Supprimer ${displayName(u)} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await deleteUser(u.id);
              await loadFirstPage(searchQuery);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur');
            }
          })(),
      },
    ]);
  }

  async function doResetPassword() {
    if (!resetUser || !newPassword.trim()) {
      setError('Nouveau mot de passe requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await resetUserPassword(resetUser.id, newPassword.trim());
      setResetUser(null);
      setNewPassword('');
      setSuccess('Mot de passe réinitialisé.');
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
      <View style={styles.top}>
        <Title>Utilisateurs</Title>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Nom, email ou téléphone…" />
        <Muted>
          {total} utilisateur{total > 1 ? 's' : ''}
        </Muted>
        <Button title="Nouvel utilisateur" onPress={openCreate} />
        <ErrorBanner message={error} />
        {success ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}
      </View>

      <FlatList
        data={users}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.4}
        onEndReached={() => void loadMore()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadFirstPage(searchQuery).finally(() => setRefreshing(false));
            }}
          />
        }
        ListEmptyComponent={
          listLoading ? (
            <LoadingBlock />
          ) : (
            <EmptyState
              title={
                searchQuery
                  ? 'Aucun utilisateur ne correspond à la recherche.'
                  : 'Aucun utilisateur'
              }
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primaryFallback} />
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{displayName(item)}</Text>
            <Muted>
              {item.email}
              {item.role ? ` · ${item.role}` : ''}
              {item.active === false ? ' · inactif' : ''}
            </Muted>
            <View style={styles.actions}>
              <Pressable onPress={() => openEdit(item)}>
                <Text style={styles.link}>Modifier</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setResetUser(item);
                  setNewPassword('');
                  setError('');
                }}
              >
                <Text style={styles.link}>Mot de passe</Text>
              </Pressable>
              <Pressable onPress={() => confirmDelete(item)}>
                <Text style={styles.danger}>Supprimer</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <FormModal visible={formOpen} onRequestClose={() => setFormOpen(false)}>
        <Text style={styles.sheetTitle}>
          {editing ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'}
        </Text>
        <TextField label="Prénom" value={firstName} onChangeText={setFirstName} />
        <TextField label="Nom" value={lastName} onChangeText={setLastName} />
        <TextField
          label="Email *"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextField
          label="Téléphone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Pressable style={styles.chip} onPress={() => setRolePicker(true)}>
          <Text style={styles.chipLabel}>Rôle</Text>
          <Text style={styles.chipValue}>{roleName}</Text>
        </Pressable>
        <TextField
          label={editing ? 'Mot de passe (optionnel)' : 'Mot de passe *'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Text style={styles.subHead}>Élèves liés (NISU)</Text>
        <TextField
          label="NISU"
          value={nisuInput}
          onChangeText={setNisuInput}
          autoCapitalize="characters"
        />
        <Button
          title={linking ? '…' : 'Lier'}
          variant="ghost"
          onPress={() => void addByNisu()}
          disabled={linking}
        />
        {linkedIds.map((id) => (
          <View key={id} style={styles.linkRow}>
            <Text style={styles.cardTitle}>{linkedLabels[id] || id}</Text>
            <Pressable
              onPress={() => setLinkedIds((prev) => prev.filter((x) => x !== id))}
            >
              <Text style={styles.danger}>Retirer</Text>
            </Pressable>
          </View>
        ))}

        <ErrorBanner message={error} />
        <View style={{ gap: 8, marginTop: 12, marginBottom: 28 }}>
          <Button
            title={saving ? '…' : 'Enregistrer'}
            onPress={() => void save()}
            disabled={saving}
          />
          <Button title="Annuler" variant="ghost" onPress={() => setFormOpen(false)} />
        </View>
      </FormModal>

      <FormModal visible={!!resetUser} onRequestClose={() => setResetUser(null)}>
        <Text style={styles.sheetTitle}>
          Réinitialiser · {resetUser ? displayName(resetUser) : ''}
        </Text>
        <TextField
          label="Nouveau mot de passe *"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />
        <ErrorBanner message={error} />
        <Button
          title={saving ? '…' : 'Réinitialiser'}
          onPress={() => void doResetPassword()}
          disabled={saving}
        />
        <Button title="Annuler" variant="ghost" onPress={() => setResetUser(null)} />
      </FormModal>

      <Modal visible={rolePicker} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setRolePicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <FlatList
              data={roles}
              keyExtractor={(r) => String(r.id)}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.pickRow}
                  onPress={() => {
                    setRoleName(item.name);
                    setRolePicker(false);
                  }}
                >
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  {item.description ? <Muted>{item.description}</Muted> : null}
                </Pressable>
              )}
            />
            <Button title="Fermer" variant="ghost" onPress={() => setRolePicker(false)} />
          </Pressable>
        </Pressable>
      </Modal>
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  link: { color: colors.primaryFallback, fontWeight: '700' },
  danger: { color: colors.danger, fontWeight: '700' },
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
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 4,
  },
  chipLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  chipValue: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2 },
  subHead: {
    marginTop: 10,
    marginBottom: 4,
    fontWeight: '700',
    color: colors.textMuted,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  pickRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
