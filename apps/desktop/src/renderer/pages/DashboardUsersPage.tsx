import { useState, useEffect } from "react";
import { API_BASE, fetchWithAuth, getImageUrl } from "@/services/api";
import { PasswordInput } from "@/components/PasswordInput";
import { ImageUpload } from "@/components/ImageUpload";
import { PERMISSION_OPTIONS } from "@/lib/permissionKeys";
import { EDUCATION_LEVELS, educationLevelLabel } from "@/lib/educationLevels";
import { formatRoleLabel } from "@/lib/dashboardRoles";
import { useRevealScroll } from "@/lib/useRevealScroll";

type User = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  profile_photo_url?: string | null;
  order_number?: string | null;
  linked_student_ids?: string[];
};

type Role = {
  id: number;
  name: string;
  description?: string | null;
  permissions?: string[];
  education_levels?: string[];
};

type StudentOption = { id: string; order_number: string | null; first_name: string; last_name: string; class_name: string };

export function DashboardUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const take = 25;
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [first_name, setFirst_name] = useState("");
  const [last_name, setLast_name] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [roleName, setRoleName] = useState("PARENT");
  const [profile_photo_url, setProfile_photo_url] = useState<string | null>(null);
  const [linked_student_ids, setLinked_student_ids] = useState<string[]>([]);
  const [academicYears, setAcademicYears] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [studentFilterYear, setStudentFilterYear] = useState("");
  const [studentFilterClass, setStudentFilterClass] = useState("");
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [linkByOrderNumberInput, setLinkByOrderNumberInput] = useState("");
  const [linkByOrderNumberLoading, setLinkByOrderNumberLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetPwdUser, setResetPwdUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resettingPwd, setResettingPwd] = useState(false);
  const [rolesSectionExpanded, setRolesSectionExpanded] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleNameInput, setRoleNameInput] = useState("");
  const [roleDescriptionInput, setRoleDescriptionInput] = useState("");
  const [rolePermissionsInput, setRolePermissionsInput] = useState<string[]>([]);
  const [roleLevelsInput, setRoleLevelsInput] = useState<string[]>([]);
  const [savingRole, setSavingRole] = useState(false);
  const rolesPanelRef = useRevealScroll<HTMLDivElement>(rolesSectionExpanded);
  const roleFormRef = useRevealScroll<HTMLFormElement>(showRoleForm, editingRole?.id ?? "new");
  const userFormRef = useRevealScroll<HTMLFormElement>(showForm, editing?.id ?? "new");
  const resetPwdRef = useRevealScroll<HTMLFormElement>(!!resetPwdUser, resetPwdUser?.id);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  async function loadMeta() {
    setMetaLoading(true);
    setError("");
    try {
      const [rolesRes, yearsRes, classesRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/roles`),
        fetchWithAuth(`${API_BASE}/academic-years`),
        fetchWithAuth(`${API_BASE}/classes`),
      ]);
      const rolesData = await rolesRes.json();
      const yearsData = await yearsRes.json();
      const classesData = await classesRes.json();
      if (!rolesRes.ok) throw new Error(rolesData.message || "Erreur");
      setRoles(rolesData.roles ?? []);
      setAcademicYears((yearsData.academic_years ?? []).map((y: { id: string; name: string }) => ({ id: y.id, name: y.name })));
      setClasses((classesData.classes ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setMetaLoading(false);
    }
  }

  async function loadUsers(opts?: { page?: number; q?: string; role?: string }) {
    const p = opts?.page ?? page;
    const q = opts?.q ?? searchQuery;
    const role = opts?.role ?? roleFilter;
    setUsersLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(p),
        take: String(take),
      });
      if (q) params.set("q", q);
      if (role) params.set("role", role);
      const usersRes = await fetchWithAuth(`${API_BASE}/users?${params}`);
      const usersData = await usersRes.json();
      if (!usersRes.ok) throw new Error(usersData.message || "Erreur");
      setUsers(usersData.users ?? []);
      setTotal(Number(usersData.total) || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = searchInput.trim();
      setSearchQuery((prev) => {
        if (prev !== next) setPage(1);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    loadUsers({ page, q: searchQuery, role: roleFilter });
  }, [page, searchQuery, roleFilter]);

  async function loadFilteredStudents() {
    if (!studentFilterYear || !studentFilterClass) {
      setStudents([]);
      return;
    }
    setStudentsLoading(true);
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/formation-classe/students?academic_year_id=${studentFilterYear}&class_id=${studentFilterClass}`
      );
      const data = await res.json();
      const list = (data.students ?? []).map((s: { id: string; order_number: string | null; first_name: string; last_name: string }) => ({
        id: s.id,
        order_number: s.order_number ?? null,
        first_name: s.first_name,
        last_name: s.last_name,
        class_name: classes.find((c) => c.id === studentFilterClass)?.name ?? "—",
      }));
      setStudents(list);
    } catch {
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }

  useEffect(() => {
    loadFilteredStudents();
  }, [studentFilterYear, studentFilterClass, classes]);

  async function addLinkedStudentByOrderNumber() {
    const raw = linkByOrderNumberInput.trim();
    if (!raw) return;
    setLinkByOrderNumberLoading(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/students/by-order-number/${encodeURIComponent(raw)}`);
      const data = await res.json();
      if (!data.ok || !data.student) {
        setError(`Aucun élève trouvé avec l'identifiant « ${raw} ».`);
        return;
      }
      const id = data.student.id;
      if (linked_student_ids.includes(id)) {
        setError("Cet élève est déjà lié à ce compte.");
        return;
      }
      setLinked_student_ids((prev) => [...prev, id]);
      setLinkByOrderNumberInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLinkByOrderNumberLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          first_name: first_name.trim() || undefined,
          last_name: last_name.trim() || undefined,
          email: email.trim(),
          phone: phone.trim() || undefined,
          profile_photo_url: profile_photo_url || undefined,
          linked_student_ids,
        };
        if (password) body.password = password;
        const res = await fetchWithAuth(`${API_BASE}/users/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      } else {
        const res = await fetchWithAuth(`${API_BASE}/users`, {
          method: "POST",
          body: JSON.stringify({
            first_name: first_name.trim() || undefined,
            last_name: last_name.trim() || undefined,
            email: email.trim(),
            phone: phone.trim() || undefined,
            password,
            roleName,
            profile_photo_url: profile_photo_url || undefined,
            linked_student_ids: linked_student_ids.length ? linked_student_ids : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      }
      setShowForm(false);
      setEditing(null);
      setFirst_name("");
      setLast_name("");
      setEmail("");
      setPhone("");
      setPassword("");
      setRoleName("PARENT");
      setProfile_photo_url(null);
      setLinked_student_ids([]);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetRole(id: number, newRole: string) {
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ roleName: newRole }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetPwdUser || !newPassword.trim() || newPassword.length < 6) {
      setError("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    setResettingPwd(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/users/${resetPwdUser.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: newPassword.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setResetPwdUser(null);
      setNewPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setResettingPwd(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      if (users.length <= 1 && page > 1) setPage((p) => p - 1);
      else await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function openEdit(u: User) {
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/users/${u.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      const full = (data.user ?? u) as User;
      setEditing(full);
      setFirst_name(full.first_name ?? "");
      setLast_name(full.last_name ?? "");
      setEmail(full.email);
      setPhone(full.phone ?? "");
      setPassword("");
      setRoleName(full.role ?? "PARENT");
      setProfile_photo_url(full.profile_photo_url ?? null);
      setLinked_student_ids(full.linked_student_ids ?? []);
      setShowForm(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  function openCreate() {
    setEditing(null);
    setFirst_name("");
    setLast_name("");
    setEmail("");
    setPhone("");
    setPassword("");
    setRoleName("PARENT");
    setProfile_photo_url(null);
    setLinked_student_ids([]);
    setShowForm(true);
  }

  function toggleLinkedStudent(id: string) {
    setLinked_student_ids((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleRolePermission(key: string) {
    if (key === "full_access") {
      setRolePermissionsInput((prev) =>
        prev.includes("full_access") ? [] : ["full_access"]
      );
      return;
    }
    setRolePermissionsInput((prev) => {
      const hasKey = prev.includes(key);
      if (hasKey) return prev.filter((k) => k !== key);
      return [...prev.filter((k) => k !== "full_access"), key];
    });
  }

  function toggleRoleLevel(key: string) {
    setRoleLevelsInput((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function openCreateRole() {
    setEditingRole(null);
    setRoleNameInput("");
    setRoleDescriptionInput("");
    setRolePermissionsInput([]);
    setRoleLevelsInput([]);
    setShowRoleForm(true);
  }

  function openEditRole(r: Role) {
    setEditingRole(r);
    setRoleNameInput(r.name);
    setRoleDescriptionInput(r.description ?? "");
    setRolePermissionsInput(r.permissions ?? []);
    setRoleLevelsInput(r.education_levels ?? []);
    setShowRoleForm(true);
  }

  async function handleRoleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingRole(true);
    setError("");
    try {
      if (editingRole) {
        const res = await fetchWithAuth(`${API_BASE}/roles/${editingRole.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: roleNameInput.trim(),
            description: roleDescriptionInput.trim() || undefined,
            permissions: rolePermissionsInput,
            education_levels: roleLevelsInput,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      } else {
        const res = await fetchWithAuth(`${API_BASE}/roles`, {
          method: "POST",
          body: JSON.stringify({
            name: roleNameInput.trim(),
            description: roleDescriptionInput.trim() || undefined,
            permissions: rolePermissionsInput.length ? rolePermissionsInput : undefined,
            education_levels: roleLevelsInput.length ? roleLevelsInput : null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      }
      setShowRoleForm(false);
      setEditingRole(null);
      await loadMeta();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingRole(false);
    }
  }

  async function handleDeleteRole(id: number) {
    if (!confirm("Supprimer ce rôle ? Les utilisateurs ayant ce rôle devront être réaffectés.")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/roles/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      await loadMeta();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / take));

  if (metaLoading) return <div className="animate-pulse text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-900">Gestion des utilisateurs</h2>
        <button onClick={openCreate} className="app-btn-primary">Ajouter un utilisateur</button>
      </div>

      {/* Section Gestion des rôles (repliable) */}
      <section className="rounded-xl border border-[var(--app-border)] bg-white overflow-hidden">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setRolesSectionExpanded((v) => !v)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRolesSectionExpanded((v) => !v); } }}
          className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
        >
          <h3 className="text-lg font-semibold text-slate-900">Gestion des rôles</h3>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openCreateRole(); setRolesSectionExpanded(true); }}
              className="app-btn-secondary text-sm"
            >
              Créer un rôle
            </button>
            <span className="inline-block text-slate-400 text-xs transition-transform duration-200" style={{ transform: rolesSectionExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
              ▼
            </span>
          </div>
        </div>
        {rolesSectionExpanded && (
        <div ref={rolesPanelRef} tabIndex={-1} className="p-5 border-t border-[var(--app-border)] outline-none">
          {showRoleForm && (
            <form ref={roleFormRef} onSubmit={handleRoleSubmit} className="mb-6 p-5 rounded-xl border border-[var(--app-border)] bg-slate-50/50 space-y-4 max-w-2xl">
              <h4 className="font-semibold text-slate-900">{editingRole ? "Modifier le rôle" : "Nouveau rôle"}</h4>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom du rôle</label>
                <input
                  type="text"
                  value={roleNameInput}
                  onChange={(e) => setRoleNameInput(e.target.value.toUpperCase())}
                  placeholder="EXEMPLE_ROLE"
                  className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description (optionnel)</label>
                <input
                  type="text"
                  value={roleDescriptionInput}
                  onChange={(e) => setRoleDescriptionInput(e.target.value)}
                  placeholder="Description du rôle..."
                  className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Accès (permissions)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-[var(--app-border)] rounded-lg bg-white">
                  {PERMISSION_OPTIONS.map((opt) => (
                    <label key={opt.key} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-slate-50 rounded px-2">
                      <input
                        type="checkbox"
                        checked={rolePermissionsInput.includes(opt.key)}
                        onChange={() => toggleRolePermission(opt.key)}
                        className="rounded border-slate-300 text-[var(--school-accent-1)]"
                      />
                      <span className="text-sm text-slate-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Périmètre (niveaux)</label>
                <p className="text-xs text-slate-500 mb-2">
                  Aucune case = toute l’école. En Haïti : directeur pédagogique du primaire = 1er et 2e cycles ; directeur pédagogique du secondaire = 3e cycle et secondaire.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 border border-[var(--app-border)] rounded-lg bg-white">
                  {EDUCATION_LEVELS.map((l) => (
                    <label key={l.key} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-slate-50 rounded px-2">
                      <input
                        type="checkbox"
                        checked={roleLevelsInput.includes(l.key)}
                        onChange={() => toggleRoleLevel(l.key)}
                        className="rounded border-slate-300 text-[var(--school-accent-1)]"
                      />
                      <span className="text-sm text-slate-700">{l.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3">
                <button type="submit" disabled={savingRole} className="app-btn-primary disabled:opacity-60">
                  {savingRole ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button type="button" onClick={() => { setShowRoleForm(false); setEditingRole(null); setError(""); }} className="app-btn-secondary">
                  Annuler
                </button>
              </div>
            </form>
          )}
          <div className="overflow-x-auto rounded-lg border border-[var(--app-border)]">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-900">Nom</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Description</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Accès</th>
                  <th className="px-4 py-3 font-medium text-slate-900 w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Aucun rôle</td></tr>
                ) : (
                  roles.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {formatRoleLabel(r.name)}
                        {formatRoleLabel(r.name) !== r.name ? (
                          <span className="block text-xs font-normal text-slate-400">{r.name}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-sm">{r.description ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {r.permissions?.includes("full_access")
                          ? "Accès total"
                          : (r.permissions?.length ?? 0) > 0
                            ? r.permissions!.join(", ")
                            : "Par défaut (selon le rôle)"}
                        {(r.education_levels?.length ?? 0) > 0
                          ? ` · ${r.education_levels!.map((k) => educationLevelLabel(k)).join(", ")}`
                          : ""}
                      </td>
                      <td className="px-4 py-3 flex gap-2">
                        <button onClick={() => openEditRole(r)} className="text-sm text-[var(--school-accent-1)] hover:underline">Modifier</button>
                        <button onClick={() => handleDeleteRole(r.id)} className="text-sm text-red-600 hover:underline">Supprimer</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </section>

      {showForm && (
        <form ref={userFormRef} onSubmit={handleSubmit} className="p-5 rounded-xl border border-[var(--app-border)] bg-white space-y-4 max-w-lg">
          <h3 className="font-semibold text-slate-900">{editing ? "Modifier" : "Nouvel utilisateur"}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Prenom</label>
              <input type="text" value={first_name} onChange={(e) => setFirst_name(e.target.value)} className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
              <input type="text" value={last_name} onChange={(e) => setLast_name(e.target.value)} className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!editing} className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40 disabled:bg-slate-50 disabled:text-slate-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Photo de profil</label>
            <ImageUpload value={profile_photo_url} onChange={(url) => setProfile_photo_url(url)} label="" token={token} previewClassName="w-20 h-20 rounded-lg object-cover border border-slate-200" />
          </div>
          <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Dossiers élèves liés</label>
              <p className="text-xs text-slate-500 mb-2">Gestion parentale en plus du rôle actuel — le compte reste super admin, enseignant, etc.</p>
              <div className="flex flex-wrap items-end gap-2 mb-3 p-2 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs text-slate-500 mb-0.5">Lier par identifiant (n° ministère)</label>
                  <input
                    type="text"
                    value={linkByOrderNumberInput}
                    onChange={(e) => setLinkByOrderNumberInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLinkedStudentByOrderNumber())}
                    placeholder="Numéro ministère de l'élève"
                    className="w-full text-sm border border-[var(--app-border)] rounded-lg px-3 py-2 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={addLinkedStudentByOrderNumber}
                  disabled={!linkByOrderNumberInput.trim() || linkByOrderNumberLoading}
                  className="app-btn-secondary text-sm py-2 disabled:opacity-50"
                >
                  {linkByOrderNumberLoading ? "..." : "Ajouter"}
                </button>
              </div>
              <div className="flex flex-wrap gap-3 mb-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Année académique</label>
                  <select
                    value={studentFilterYear}
                    onChange={(e) => { setStudentFilterYear(e.target.value); setStudentFilterClass(""); }}
                    className="text-sm border border-[var(--app-border)] rounded-lg px-3 py-2 min-w-[140px]"
                  >
                    <option value="">— Sélectionner —</option>
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Classe</label>
                  <select
                    value={studentFilterClass}
                    onChange={(e) => setStudentFilterClass(e.target.value)}
                    disabled={!studentFilterYear}
                    className="text-sm border border-[var(--app-border)] rounded-lg px-3 py-2 min-w-[140px] disabled:opacity-50"
                  >
                    <option value="">— Sélectionner —</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {linked_student_ids.length > 0 && (
                <p className="text-xs text-slate-600 mb-2">{linked_student_ids.length} élève(s) sélectionné(s)</p>
              )}
              <div className="max-h-48 overflow-y-auto border border-[var(--app-border)] rounded-lg p-2 space-y-1">
                {!studentFilterYear || !studentFilterClass ? (
                  <p className="text-sm text-slate-500">Sélectionnez une année académique et une classe pour afficher les élèves.</p>
                ) : studentsLoading ? (
                  <p className="text-sm text-slate-500">Chargement...</p>
                ) : students.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucun élève dans cette classe pour cette année.</p>
                ) : (
                  students.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-slate-50 rounded px-2">
                      <input type="checkbox" checked={linked_student_ids.includes(s.id)} onChange={() => toggleLinkedStudent(s.id)} className="rounded border-slate-300 text-[var(--school-accent-1)]" />
                      <span className="text-sm">
                        {s.order_number ? `${s.order_number} — ` : ""}{s.first_name} {s.last_name}
                        <span className="text-slate-500 ml-1">({s.class_name})</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe {editing && "(vide = ne pas changer)"} {!editing && "(min. 6 caractères)"}</label>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required={!editing} minLength={editing ? undefined : 6} autoComplete="new-password" />
          </div>
          {!editing && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
              <select value={roleName} onChange={(e) => setRoleName(e.target.value)} className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40">
                {roles.map((r) => <option key={r.id} value={r.name}>{formatRoleLabel(r.name)}</option>)}
              </select>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="app-btn-primary disabled:opacity-60">{saving ? "Enregistrement..." : "Enregistrer"}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="app-btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      {resetPwdUser && (
        <form ref={resetPwdRef} onSubmit={handleResetPassword} className="p-5 rounded-xl border border-amber-200 bg-amber-50/50 space-y-4 max-w-md">
          <h3 className="font-semibold text-slate-900">Réinitialiser le mot de passe</h3>
          <p className="text-sm text-slate-600">Utilisateur : {resetPwdUser.first_name} {resetPwdUser.last_name} ({resetPwdUser.email})</p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nouveau mot de passe (min. 6 caractères)</label>
            <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} autoComplete="new-password" placeholder="Nouveau mot de passe" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={resettingPwd || newPassword.trim().length < 6} className="app-btn-primary disabled:opacity-60">{resettingPwd ? "Enregistrement..." : "Enregistrer"}</button>
            <button type="button" onClick={() => { setResetPwdUser(null); setNewPassword(""); setError(""); }} className="app-btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      {error && !showForm && !resetPwdUser && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">Rechercher</label>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Nom, prénom, email ou téléphone…"
            className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
          />
        </div>
        <div className="min-w-[160px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">Rôle</label>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
          >
            <option value="">Tous</option>
            {roles.map((r) => (
              <option key={r.id} value={r.name}>{formatRoleLabel(r.name)}</option>
            ))}
          </select>
        </div>
        <p className="text-sm text-slate-500 pb-2">{total} utilisateur{total > 1 ? "s" : ""}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-[var(--app-border)]">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-900 w-14">Photo</th>
              <th className="px-4 py-3 font-medium text-slate-900">Nom</th>
              <th className="px-4 py-3 font-medium text-slate-900">Email</th>
              <th className="px-4 py-3 font-medium text-slate-900">Téléphone</th>
              <th className="px-4 py-3 font-medium text-slate-900">Rôle</th>
              <th className="px-4 py-3 font-medium text-slate-900 w-48">Actions</th>
            </tr>
          </thead>
          <tbody>
            {usersLoading && users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Chargement...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                {searchQuery || roleFilter ? "Aucun utilisateur ne correspond à la recherche." : "Aucun utilisateur"}
              </td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    {getImageUrl(u.profile_photo_url ?? undefined) ? (
                      <img src={getImageUrl(u.profile_photo_url ?? undefined)!} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-sm">👤</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{(u.first_name || "") + " " + (u.last_name || "").trim() || "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3 text-slate-600">{u.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <select value={u.role ?? ""} onChange={(e) => handleSetRole(u.id, e.target.value)} className="text-sm border border-[var(--app-border)] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--school-accent-1)]">
                      {roles.map((r) => <option key={r.id} value={r.name}>{formatRoleLabel(r.name)}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 flex gap-2 flex-wrap">
                    <button onClick={() => openEdit(u)} className="text-sm text-[var(--school-accent-1)] hover:underline">Modifier</button>
                    <button onClick={() => { setResetPwdUser(u); setNewPassword(""); setError(""); }} className="text-sm text-amber-600 hover:underline">Réinitialiser le mot de passe</button>
                    <button onClick={() => handleDelete(u.id)} className="text-sm text-red-600 hover:underline">Supprimer</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={page <= 1 || usersLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="app-btn-secondary text-sm py-2 disabled:opacity-50"
          >
            Précédent
          </button>
          <p className="text-sm text-slate-600">Page {page} / {pageCount}</p>
          <button
            type="button"
            disabled={page >= pageCount || usersLoading}
            onClick={() => setPage((p) => p + 1)}
            className="app-btn-secondary text-sm py-2 disabled:opacity-50"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
