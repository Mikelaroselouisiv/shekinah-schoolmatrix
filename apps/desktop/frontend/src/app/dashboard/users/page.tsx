"use client";

import { useState, useEffect } from "react";
import { API_BASE, fetchWithAuth, getImageUrl } from "@/src/lib/api";
import { PasswordInput } from "@/src/components/PasswordInput";
import { ImageUpload } from "@/src/components/ImageUpload";
import { PERMISSION_OPTIONS } from "@/src/lib/permissionKeys";

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

type Role = { id: number; name: string; description?: string | null; permissions?: string[] };

type StudentOption = { id: string; order_number: string | null; first_name: string; last_name: string; class_name: string };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  const [savingRole, setSavingRole] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [usersRes, rolesRes, yearsRes, classesRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/users`),
        fetchWithAuth(`${API_BASE}/roles`),
        fetchWithAuth(`${API_BASE}/academic-years`),
        fetchWithAuth(`${API_BASE}/classes`),
      ]);
      const usersData = await usersRes.json();
      const rolesData = await rolesRes.json();
      const yearsData = await yearsRes.json();
      const classesData = await classesRes.json();
      if (!usersRes.ok) throw new Error(usersData.message || "Erreur");
      setUsers(usersData.users ?? []);
      setRoles(rolesData.roles ?? []);
      setAcademicYears((yearsData.academic_years ?? []).map((y: { id: string; name: string }) => ({ id: y.id, name: y.name })));
      setClasses((classesData.classes ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

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
    load();
  }, []);

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
      load();
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
      load();
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
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  function openEdit(u: User) {
    setEditing(u);
    setFirst_name(u.first_name ?? "");
    setLast_name(u.last_name ?? "");
    setEmail(u.email);
    setPhone(u.phone ?? "");
    setPassword("");
    setRoleName(u.role ?? "PARENT");
    setProfile_photo_url(u.profile_photo_url ?? null);
    setLinked_student_ids(u.linked_student_ids ?? []);
    setShowForm(true);
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

  function openCreateRole() {
    setEditingRole(null);
    setRoleNameInput("");
    setRoleDescriptionInput("");
    setRolePermissionsInput([]);
    setShowRoleForm(true);
  }

  function openEditRole(r: Role) {
    setEditingRole(r);
    setRoleNameInput(r.name);
    setRoleDescriptionInput(r.description ?? "");
    setRolePermissionsInput(r.permissions ?? []);
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
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      }
      setShowRoleForm(false);
      setEditingRole(null);
      load();
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
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  if (loading) return <div className="animate-pulse text-slate-500">Chargement...</div>;

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
        <div className="p-5 border-t border-[var(--app-border)]">
          {showRoleForm && (
            <form onSubmit={handleRoleSubmit} className="mb-6 p-5 rounded-xl border border-[var(--app-border)] bg-slate-50/50 space-y-4 max-w-2xl">
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
                      <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                      <td className="px-4 py-3 text-slate-600 text-sm">{r.description ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {r.permissions?.includes("full_access")
                          ? "Accès total"
                          : (r.permissions?.length ?? 0) > 0
                            ? r.permissions!.join(", ")
                            : "Par défaut (selon le rôle)"}
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
        <form onSubmit={handleSubmit} className="p-5 rounded-xl border border-[var(--app-border)] bg-white space-y-4 max-w-lg">
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
                {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
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
        <form onSubmit={handleResetPassword} className="p-5 rounded-xl border border-amber-200 bg-amber-50/50 space-y-4 max-w-md">
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
            {users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Aucun utilisateur</td></tr>
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
                      {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
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
    </div>
  );
}
