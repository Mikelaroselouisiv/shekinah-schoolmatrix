import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { listBottomPadding } from '../../lib/layout';
import { formatRoleLabel } from '../../lib/moreNavigation';
import { colors } from '../../theme/tokens';
import {
  createUser,
  deleteUser,
  findStudentByOrderNumber,
  getImageUrl,
  getStudent,
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

type UserDetail = OrgUser & {
  address?: string | null;
  whatsapp?: string | null;
  order_number?: string | null;
  must_change_password?: boolean;
};

function displayName(u: OrgUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
}

function initialOf(u: OrgUser): string {
  const letter = (u.first_name || u.last_name || u.email || '?').trim().charAt(0);
  return letter ? letter.toUpperCase() : '?';
}

export function UsersAdminScreen({}: Props) {
  const allowed = useCanAccess('users');
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
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

  const [viewUser, setViewUser] = useState<UserDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [linkedNames, setLinkedNames] = useState<string[]>([]);
  const [rolePicker, setRolePicker] = useState(false);
  const [resetUser, setResetUser] = useState<OrgUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const loadRoles = useCallback(async () => {
    setRoles(await listRoles());
  }, []);

  const loadFirstPage = useCallback(async (q: string, role = roleFilter) => {
    const res = await listUsers({
      q: q || undefined,
      role: role || undefined,
      page: 1,
      take: TAKE,
    });
    setUsers(res.users);
    setTotal(res.total);
    setPage(1);
    return res;
  }, [roleFilter]);

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
        const res = await listUsers({
          q: searchQuery || undefined,
          role: roleFilter || undefined,
          page: 1,
          take: TAKE,
        });
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
  }, [allowed, searchQuery, roleFilter, loadFirstPage]);

  async function loadMore() {
    if (loadMoreLock.current || listLoading || loadingMore) return;
    if (users.length >= total) return;
    loadMoreLock.current = true;
    const gen = searchGen.current;
    setLoadingMore(true);
    try {
      const res = await listUsers({
        q: searchQuery || undefined,
        role: roleFilter || undefined,
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
    setRolePicker(false);
    setLinkedIds([]);
    setLinkedLabels({});
    setNisuInput('');
    setFormOpen(true);
    setError('');
  }

  async function openView(u: OrgUser) {
    setViewUser(u);
    setLinkedNames([]);
    setViewLoading(true);
    setError('');
    try {
      const full = (await getUser(u.id)) as UserDetail;
      setViewUser(full);
      const ids = full.linked_student_ids ?? [];
      if (ids.length) {
        const students = await Promise.all(ids.map((id) => getStudent(id).catch(() => null)));
        setLinkedNames(students.map((s, i) => (s ? studentDisplayName(s) : ids[i]!)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setViewLoading(false);
    }
  }

  function editFromView() {
    const current = viewUser;
    setViewUser(null);
    if (current) void openEdit(current);
  }

  function resetFromView() {
    const current = viewUser;
    setViewUser(null);
    if (!current) return;
    setResetUser(current);
    setNewPassword('');
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
      setRolePicker(false);
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.roleFilters}
        >
          <Pressable
            style={[styles.filterChip, !roleFilter && styles.filterChipOn]}
            onPress={() => setRoleFilter('')}
          >
            <Text style={[styles.filterChipText, !roleFilter && styles.filterChipTextOn]}>Tous</Text>
          </Pressable>
          {roles.map((role) => {
            const on = roleFilter === role.name;
            return (
              <Pressable
                key={role.id}
                style={[styles.filterChip, on && styles.filterChipOn]}
                onPress={() => setRoleFilter(role.name)}
              >
                <Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>
                  {formatRoleLabel(role.name)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
                searchQuery || roleFilter
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
        renderItem={({ item }) => {
          const photo = getImageUrl(item.profile_photo_url);
          return (
            <Pressable style={styles.card} onPress={() => void openView(item)}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarEmpty]}>
                  <Text style={styles.avatarInitial}>{initialOf(item)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{displayName(item)}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {item.active === false ? 'Inactif · ' : ''}
                  {item.email}
                </Text>
              </View>
              {item.role ? (
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText} numberOfLines={1}>
                    {formatRoleLabel(item.role)}
                  </Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
            </Pressable>
          );
        }}
      />

      <FormModal visible={!!viewUser} onRequestClose={() => setViewUser(null)}>
        {viewUser ? (
          <>
            <View style={styles.viewHead}>
              {getImageUrl(viewUser.profile_photo_url) ? (
                <Image source={{ uri: getImageUrl(viewUser.profile_photo_url)! }} style={styles.viewAvatar} />
              ) : (
                <View style={[styles.viewAvatar, styles.avatarEmpty]}>
                  <Text style={styles.viewInitial}>{initialOf(viewUser)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{displayName(viewUser)}</Text>
                <Text style={styles.cardMeta}>
                  {viewUser.active === false ? 'Inactif' : 'Actif'}
                  {viewUser.role ? ` · ${formatRoleLabel(viewUser.role)}` : ''}
                </Text>
              </View>
            </View>
            {viewLoading ? <ActivityIndicator color={colors.ink} style={{ marginVertical: 12 }} /> : null}
            <Info label="Email" value={viewUser.email} />
            <Info label="Téléphone" value={viewUser.phone} />
            <Info label="WhatsApp" value={viewUser.whatsapp} />
            <Info label="Adresse" value={viewUser.address} />
            <Info label="Rôle" value={viewUser.role ? formatRoleLabel(viewUser.role) : null} />
            <Info label="NISU" value={viewUser.order_number} />
            {linkedNames.length ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Élèves liés</Text>
                {linkedNames.map((name, index) => (
                  <Text key={`${name}-${index}`} style={styles.infoValue}>
                    {name}
                  </Text>
                ))}
              </View>
            ) : null}
            <View style={styles.viewActions}>
              <Button title="Modifier" icon="create-outline" onPress={editFromView} />
              <Button title="Mot de passe" icon="key-outline" variant="ghost" onPress={resetFromView} />
              <Button
                title="Supprimer"
                icon="trash-outline"
                variant="danger"
                onPress={() => {
                  const current = viewUser;
                  setViewUser(null);
                  if (current) confirmDelete(current);
                }}
              />
              <Button title="Fermer" variant="ghost" onPress={() => setViewUser(null)} />
            </View>
          </>
        ) : null}
      </FormModal>

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
        <Pressable
          style={styles.chip}
          onPress={() => {
            setRolePicker((open) => !open);
            if (!roles.length) {
              void loadRoles().catch((err) =>
                setError(err instanceof Error ? err.message : 'Erreur'),
              );
            }
          }}
        >
          <Text style={styles.chipLabel}>Rôle</Text>
          <View style={styles.chipValueRow}>
            <Text style={styles.chipValue}>{formatRoleLabel(roleName)}</Text>
            <Ionicons
              name={rolePicker ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.inkSoft}
            />
          </View>
        </Pressable>
        {rolePicker ? (
          <View style={styles.roleChoices}>
            {roles.length === 0 ? (
              <Muted>Aucun rôle disponible.</Muted>
            ) : (
              roles.map((item) => {
                const on = item.name === roleName;
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.pickRow, on && styles.pickRowOn]}
                    onPress={() => {
                      setRoleName(item.name);
                      setRolePicker(false);
                    }}
                  >
                    <Text style={styles.cardTitle}>{formatRoleLabel(item.name)}</Text>
                    {item.description ? <Muted>{item.description}</Muted> : null}
                  </Pressable>
                );
              })
            )}
          </View>
        ) : null}
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

    </Screen>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  roleFilters: { gap: 8, paddingVertical: 2 },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterChipText: { fontSize: 13, fontWeight: '700', color: colors.inkSoft },
  filterChipTextOn: { color: colors.surface },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: listBottomPadding(24), gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatar: { width: 48, height: 48, borderRadius: 16 },
  avatarEmpty: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 18, fontWeight: '700', color: colors.inkSoft },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  rolePill: {
    maxWidth: 108,
    borderRadius: 999,
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rolePillText: { fontSize: 11, fontWeight: '700', color: colors.inkSoft },
  viewHead: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  viewAvatar: { width: 72, height: 72, borderRadius: 22 },
  viewInitial: { fontSize: 26, fontWeight: '700', color: colors.inkSoft },
  viewActions: { gap: 8, marginTop: 16, marginBottom: 28 },
  infoRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  infoLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  infoValue: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 2 },
  link: { color: colors.primaryFallback, fontWeight: '700' },
  danger: { color: colors.danger, fontWeight: '700' },
  successBanner: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  successText: { color: '#065F46', fontWeight: '600' },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 4,
  },
  chipLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  chipValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chipValue: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2, flex: 1 },
  roleChoices: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
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
  pickRowOn: { backgroundColor: colors.surface, marginHorizontal: -12, paddingHorizontal: 12 },
});
