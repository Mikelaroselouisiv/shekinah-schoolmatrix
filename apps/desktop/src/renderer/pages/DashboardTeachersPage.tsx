import { useState, useEffect } from "react";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { Link } from "react-router-dom";
import { isTeacherRole } from "@/lib/dashboardRoles";
import { isHomeroomCycle } from "@/lib/educationLevels";

type Teacher = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  active: boolean;
};

type ClassSubjectAssignment = {
  id: string;
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  room_id: string | null;
  room_name: string;
};

type RoomItem = {
  id: string;
  name: string;
  class_id: string | null;
  active?: boolean;
};

type TeacherDetail = Teacher & {
  classes: { id: string; class_id: string; class_name: string; is_main: boolean }[];
  subjects: { id: string; subject_id: string; subject_name: string }[];
  class_subjects?: ClassSubjectAssignment[];
};

type ClassItem = { id: string; name: string; level?: string | null };
type Subject = { id: string; name: string };
type User = { id: number; first_name: string | null; last_name: string | null; email: string; role: string | null };

export function DashboardTeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showPromoteForm, setShowPromoteForm] = useState(false);
  const [promoteUserId, setPromoteUserId] = useState("");
  const [promoting, setPromoting] = useState(false);

  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectId, setNewSubjectId] = useState("");
  const [addingClass, setAddingClass] = useState(false);
  const [newClassId, setNewClassId] = useState("");
  const [addingAssignment, setAddingAssignment] = useState(false);
  const [newAssignmentClassId, setNewAssignmentClassId] = useState("");
  const [newAssignmentRoomId, setNewAssignmentRoomId] = useState("");
  const [newAssignmentSubjectIds, setNewAssignmentSubjectIds] = useState<string[]>([]);
  const [classSubjectsForAssignment, setClassSubjectsForAssignment] = useState<Subject[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!newAssignmentClassId) {
      setClassSubjectsForAssignment([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE}/classes/${newAssignmentClassId}/subjects`);
        const data = await res.json();
        if (!cancelled) setClassSubjectsForAssignment(data.subjects ?? []);
      } catch {
        if (!cancelled) setClassSubjectsForAssignment([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [newAssignmentClassId]);


  async function loadTeachers() {
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/teachers`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setTeachers(data.teachers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function loadTeacherDetail(id: number) {
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/teachers/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setSelectedTeacher(data.teacher);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setSelectedTeacher(null);
    }
  }

  async function loadRefs() {
    setError("");
    try {
      const [classesRes, subjectsRes, roomsRes, usersRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/classes`),
        fetchWithAuth(`${API_BASE}/subjects`),
        fetchWithAuth(`${API_BASE}/rooms`),
        fetchWithAuth(`${API_BASE}/users?exclude_role=PARENT&take=50`),
      ]);
      const classesData = await classesRes.json();
      const subjectsData = await subjectsRes.json();
      const roomsData = await roomsRes.json();
      const usersData = await usersRes.json();
      if (!classesRes.ok) throw new Error(classesData.message || "Erreur");
      if (!subjectsRes.ok) throw new Error(subjectsData.message || "Erreur");
      if (!roomsRes.ok) throw new Error(roomsData.message || "Erreur");
      if (!usersRes.ok) throw new Error(usersData.message || "Erreur");
      setClasses(classesData.classes ?? []);
      setSubjects(subjectsData.subjects ?? []);
      setRooms(roomsData.rooms ?? []);
      setUsers(usersData.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function load() {
    setLoading(true);
    await Promise.all([loadTeachers(), loadRefs()]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selectedTeacher?.id) loadTeacherDetail(selectedTeacher.id);
  }, [selectedTeacher?.id]);

  const nonTeachers = users.filter((u) => !isTeacherRole(u.role));

  async function handlePromote(e: React.FormEvent) {
    e.preventDefault();
    if (!promoteUserId) return;
    setPromoting(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/users/${promoteUserId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ roleName: "TEACHER" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setShowPromoteForm(false);
      setPromoteUserId("");
      await loadTeachers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setPromoting(false);
    }
  }

  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTeacher || !newSubjectId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/teachers/${selectedTeacher.id}/subjects`, {
        method: "POST",
        body: JSON.stringify({ subject_id: newSubjectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setAddingSubject(false);
      setNewSubjectId("");
      await loadTeacherDetail(selectedTeacher.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveSubject(subjectId: string) {
    if (!selectedTeacher || !confirm("Retirer cette matière ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/teachers/${selectedTeacher.id}/subjects/${subjectId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      await loadTeacherDetail(selectedTeacher.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function handleAddClass(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTeacher || !newClassId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/teachers/${selectedTeacher.id}/classes`, {
        method: "POST",
        body: JSON.stringify({ class_id: newClassId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setAddingClass(false);
      setNewClassId("");
      await loadTeacherDetail(selectedTeacher.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveClass(classId: string) {
    if (!selectedTeacher || !confirm("Retirer cette classe ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/teachers/${selectedTeacher.id}/classes/${classId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      await loadTeacherDetail(selectedTeacher.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function handleAddAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTeacher || !newAssignmentClassId || !newAssignmentRoomId || newAssignmentSubjectIds.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/teachers/${selectedTeacher.id}/class-subjects`, {
        method: "POST",
        body: JSON.stringify({
          class_id: newAssignmentClassId,
          room_id: newAssignmentRoomId,
          subject_ids: newAssignmentSubjectIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setAddingAssignment(false);
      setNewAssignmentClassId("");
      setNewAssignmentRoomId("");
      setNewAssignmentSubjectIds([]);
      await loadTeacherDetail(selectedTeacher.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    if (!selectedTeacher || !confirm("Retirer cette assignation ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/teachers/${selectedTeacher.id}/class-subjects/${assignmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      await loadTeacherDetail(selectedTeacher.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  const teacherSubjects = selectedTeacher?.subjects ?? [];
  const teacherClasses = selectedTeacher?.classes ?? [];
  const assignments = selectedTeacher?.class_subjects ?? [];
  const availableSubjects = subjects.filter((s) => !teacherSubjects.some((ts) => ts.subject_id === s.id));
  const availableClasses = classes.filter((c) => !teacherClasses.some((tc) => tc.class_id === c.id));
  const roomsForAssignment = newAssignmentClassId
    ? rooms.filter((r) => r.class_id === newAssignmentClassId && r.active !== false)
    : [];
  const selectedAssignmentClass = classes.find((c) => c.id === newAssignmentClassId);
  const assignmentIsHomeroom = isHomeroomCycle(selectedAssignmentClass?.level);
  const availableSubjectsForNewRoom =
    newAssignmentClassId && newAssignmentRoomId
      ? classSubjectsForAssignment.filter(
          (s) =>
            !assignments.some(
              (a) =>
                a.class_id === newAssignmentClassId &&
                a.room_id === newAssignmentRoomId &&
                a.subject_id === s.id,
            ),
        )
      : [];

  useEffect(() => {
    if (!newAssignmentClassId || !newAssignmentRoomId) {
      setNewAssignmentSubjectIds([]);
      return;
    }
    const availableIds = availableSubjectsForNewRoom.map((s) => s.id);
    if (assignmentIsHomeroom) {
      setNewAssignmentSubjectIds(availableIds);
    } else {
      setNewAssignmentSubjectIds((prev) => prev.filter((id) => availableIds.includes(id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-apply defaults when class/room/subjects change
  }, [newAssignmentClassId, newAssignmentRoomId, classSubjectsForAssignment, assignmentIsHomeroom]);

  function toggleAssignmentSubject(subjectId: string) {
    setNewAssignmentSubjectIds((prev) =>
      prev.includes(subjectId) ? prev.filter((id) => id !== subjectId) : [...prev, subjectId],
    );
  }

  function toggleAllAssignmentSubjects() {
    const ids = availableSubjectsForNewRoom.map((s) => s.id);
    setNewAssignmentSubjectIds((prev) => (prev.length === ids.length ? [] : ids));
  }

  function teacherName(t: Teacher) {
    return [t.first_name, t.last_name].filter(Boolean).join(" ") || t.email;
  }

  if (loading) return <div className="animate-pulse text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-900">Professeurs</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowPromoteForm(true)} className="app-btn-primary text-sm py-2">
            Ajouter un professeur
          </button>
          <Link to="/dashboard/users" className="app-btn-secondary text-sm py-2">
            Gérer les utilisateurs
          </Link>
        </div>
      </div>

      

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      {/* Promouvoir utilisateur en professeur */}
      {showPromoteForm && (
        <form onSubmit={handlePromote} className="p-5 rounded-xl border border-[var(--app-border)] bg-white space-y-4 max-w-md">
          <h3 className="font-semibold text-slate-900">Promouvoir en professeur</h3>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Utilisateur</label>
            <select
              value={promoteUserId}
              onChange={(e) => setPromoteUserId(e.target.value)}
              className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
              required
            >
              <option value="">Sélectionner...</option>
              {nonTeachers.map((u) => (
                <option key={u.id} value={u.id}>
                  {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email} ({u.email})
                </option>
              ))}
            </select>
          </div>
          {nonTeachers.length === 0 && (
            <p className="text-sm text-amber-600">Aucun utilisateur disponible. Créez d&apos;abord un utilisateur dans Gestion Utilisateurs.</p>
          )}
          <div className="flex gap-3">
            <button type="submit" disabled={promoting || nonTeachers.length === 0} className="app-btn-primary disabled:opacity-60 text-sm py-2">
              {promoting ? "En cours..." : "Promouvoir"}
            </button>
            <button type="button" onClick={() => { setShowPromoteForm(false); setPromoteUserId(""); }} className="app-btn-secondary text-sm py-2">
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Liste des professeurs */}
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Liste des professeurs</h3>
          <div className="rounded-xl border border-[var(--app-border)] overflow-hidden">
            {teachers.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-500">Aucun professeur</div>
            ) : (
              teachers.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTeacher({ ...t, classes: [], subjects: [], class_subjects: [] })}
                  className={`w-full text-left px-4 py-3 border-b border-[var(--app-border)] last:border-b-0 hover:bg-slate-50 transition-colors ${selectedTeacher?.id === t.id ? "bg-slate-50 border-l-4 border-l-[var(--school-accent-1)]" : ""}`}
                >
                  <div className="font-medium text-slate-900">{teacherName(t)}</div>
                  <div className="text-sm text-slate-500">{t.email}</div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Détail : matières et classes */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {selectedTeacher ? `Assignations : ${teacherName(selectedTeacher)}` : "Sélectionnez un professeur"}
          </h3>

          {selectedTeacher && (
            <>
              {/* Assignations : matière enseignée dans quelle salle (section) */}
              <div className="rounded-xl border border-[var(--app-border)] bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-slate-900">Assignations (salle + matière)</h4>
                  {!addingAssignment && (
                    <button onClick={() => setAddingAssignment(true)} className="text-sm text-[var(--school-accent-1)] hover:underline">
                      + Ajouter une assignation
                    </button>
                  )}
                </div>
                {addingAssignment && (
                  <form onSubmit={handleAddAssignment} className="mb-3 p-3 bg-slate-50 rounded-lg space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={newAssignmentClassId}
                        onChange={(e) => {
                          setNewAssignmentClassId(e.target.value);
                          setNewAssignmentRoomId("");
                          setNewAssignmentSubjectIds([]);
                        }}
                        className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40 min-w-[140px]"
                        required
                      >
                        <option value="">Classe...</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <select
                        value={newAssignmentRoomId}
                        onChange={(e) => setNewAssignmentRoomId(e.target.value)}
                        className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40 min-w-[140px]"
                        required
                        disabled={!newAssignmentClassId}
                      >
                        <option value="">Salle...</option>
                        {roomsForAssignment.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                    {newAssignmentRoomId && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-slate-700">
                            Matières
                            {assignmentIsHomeroom
                              ? " — toutes cochées (décocher anglais, espagnol, informatique…)"
                              : " — cocher les matières enseignées"}
                          </p>
                          {availableSubjectsForNewRoom.length > 0 && (
                            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={
                                  availableSubjectsForNewRoom.length > 0 &&
                                  newAssignmentSubjectIds.length === availableSubjectsForNewRoom.length
                                }
                                onChange={toggleAllAssignmentSubjects}
                              />
                              Tout cocher
                            </label>
                          )}
                        </div>
                        {availableSubjectsForNewRoom.length === 0 ? (
                          <p className="text-xs text-slate-500">Toutes les matières de cette salle sont déjà assignées à ce professeur.</p>
                        ) : (
                          <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--app-border)] bg-white p-3 space-y-2">
                            {availableSubjectsForNewRoom.map((s) => (
                              <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={newAssignmentSubjectIds.includes(s.id)}
                                  onChange={() => toggleAssignmentSubject(s.id)}
                                />
                                {s.name}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" disabled={saving || !newAssignmentClassId || !newAssignmentRoomId || newAssignmentSubjectIds.length === 0} className="app-btn-primary text-sm py-2 disabled:opacity-60">
                        {saving ? "..." : "Ajouter"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingAssignment(false);
                          setNewAssignmentClassId("");
                          setNewAssignmentRoomId("");
                          setNewAssignmentSubjectIds([]);
                        }}
                        className="app-btn-secondary text-sm py-2"
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                )}
                <div className="overflow-x-auto rounded-lg border border-[var(--app-border)]">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                      <tr>
                        <th className="px-3 py-2 font-medium text-slate-900">Classe</th>
                        <th className="px-3 py-2 font-medium text-slate-900">Salle</th>
                        <th className="px-3 py-2 font-medium text-slate-900">Matière</th>
                        <th className="px-3 py-2 font-medium text-slate-900 w-20">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.length === 0 ? (
                        <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">Aucune assignation</td></tr>
                      ) : (
                        assignments.map((a) => (
                          <tr key={a.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                            <td className="px-3 py-2 text-slate-700">{a.class_name}</td>
                            <td className="px-3 py-2 text-slate-700">{a.room_name || "—"}</td>
                            <td className="px-3 py-2 text-slate-700">{a.subject_name}</td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => handleRemoveAssignment(a.id)} className="text-red-600 hover:underline text-xs">Retirer</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </>
          )}
        </section>
      </div>
    </div>
  );
}
