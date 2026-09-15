import { useEffect, useMemo, useState, type ReactNode } from "react";
import { API_BASE, fetchWithAuth, getImageUrl, getToken } from "@/services/api";
import { ImageUpload } from "@/components/ImageUpload";
import { PasswordInput } from "@/components/PasswordInput";
import { useRevealScroll } from "@/lib/useRevealScroll";
import {
  EDUCATION_LEVELS,
  educationLevelLabel,
  isHomeroomCycle,
  learnerNoun,
  learnerNounCap,
} from "@/lib/educationLevels";

export type ClassListItem = {
  id: string;
  name: string;
  description: string | null;
  level: string | null;
  room_count?: number;
  rooms?: Array<{ id: string; name: string; capacity: number | null }>;
  student_count?: number;
};

type Subject = { id: string; name: string; code?: string | null };
type RoomItem = {
  id: string;
  name: string;
  description: string | null;
  capacity: number | null;
  student_count: number;
  active: boolean;
};
type Assignment = {
  id: string;
  teacher_id: number;
  teacher_name: string;
  teacher_photo_url?: string | null;
  class_id: string;
  subject_id: string;
  subject_name: string;
  room_id: string | null;
  room_name: string;
};
type Teacher = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone?: string | null;
  profile_photo_url?: string | null;
  role?: string | null;
};
type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  photo_identity_student?: string | null;
  room_id?: string | null;
};

type TeacherSource = "pick" | "search" | "create";

function personName(p: { first_name?: string | null; last_name?: string | null; email?: string }) {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "—";
}

function PersonAvatar({
  photo,
  name,
  size = "md",
  kind = "teacher",
}: {
  photo?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  kind?: "teacher" | "student";
}) {
  const src = getImageUrl(photo ?? undefined);
  const dim = size === "lg" ? "h-12 w-12 text-sm" : size === "sm" ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs";
  const ring =
    kind === "teacher"
      ? "border-[var(--school-accent-1)]"
      : "border-amber-400";
  const fallback =
    kind === "teacher"
      ? "bg-teal-50 text-teal-800"
      : "bg-amber-50 text-amber-900";
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  if (src) {
    return (
      <img
        src={src}
        alt=""
        title={name}
        className={`${dim} rounded-full object-cover border-2 ${ring} bg-white`}
      />
    );
  }
  return (
    <div
      title={name}
      className={`${dim} rounded-full ${fallback} font-semibold flex items-center justify-center border-2 ${ring}`}
    >
      {initials || "?"}
    </div>
  );
}

function PeoplePreviewRow({
  label,
  empty,
  countNoun,
  people,
  kind,
}: {
  label: string;
  empty: string;
  countNoun: string;
  people: { key: string; name: string; photo?: string | null }[];
  kind: "teacher" | "student";
}) {
  const box =
    kind === "teacher"
      ? "bg-teal-50 ring-1 ring-teal-100"
      : "bg-amber-50 ring-1 ring-amber-100";
  const labelColor = kind === "teacher" ? "text-teal-800" : "text-amber-900";
  return (
    <div className={`mt-2 rounded-xl px-2.5 py-2 ${box}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={`text-[10px] font-semibold uppercase tracking-wide ${labelColor}`}>{label}</p>
        <p className={`text-[11px] font-medium ${labelColor}`}>
          {people.length} {countNoun}
        </p>
      </div>
      {people.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">{empty}</p>
      ) : (
        <div className="mt-1.5 flex items-center">
          <div className="flex -space-x-2">
            {people.slice(0, 5).map((p) => (
              <PersonAvatar key={p.key} photo={p.photo} name={p.name} size="sm" kind={kind} />
            ))}
          </div>
          {people.length > 5 ? (
            <span className="ml-2 text-[11px] font-medium text-slate-500">+{people.length - 5}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SubjectChip({
  name,
  on,
  onToggle,
}: {
  name: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${
        on
          ? "bg-teal-600 text-white ring-teal-600"
          : "bg-white text-slate-600 ring-slate-200 hover:ring-teal-300"
      }`}
    >
      {name}
    </button>
  );
}

function ConfigPanel({
  kicker,
  title,
  hint,
  action,
  tone = "white",
  children,
}: {
  kicker?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
  tone?: "white" | "slate" | "teal" | "amber";
  children: ReactNode;
}) {
  const wrap = {
    white: "bg-white border-slate-200",
    slate: "bg-slate-50 border-slate-200",
    teal: "bg-teal-50/40 border-teal-100",
    amber: "bg-amber-50/50 border-amber-100",
  }[tone];
  const kickerCls = {
    white: "text-slate-400",
    slate: "text-slate-400",
    teal: "text-teal-700",
    amber: "text-amber-800",
  }[tone];
  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${wrap}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {kicker ? (
            <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${kickerCls}`}>{kicker}</p>
          ) : null}
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ClassConfigModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: ClassListItem | "new";
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = initial === "new";
  const [classId, setClassId] = useState(isNew ? "" : initial.id);
  const [name, setName] = useState(isNew ? "" : initial.name);
  const [description, setDescription] = useState(isNew ? "" : initial.description ?? "");
  const [level, setLevel] = useState(isNew ? "" : initial.level ?? "");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classStudents, setClassStudents] = useState<StudentRow[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomStudents, setRoomStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [addingSubject, setAddingSubject] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomCapacity, setRoomCapacity] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);
  const [editRoomName, setEditRoomName] = useState("");
  const [editRoomCapacity, setEditRoomCapacity] = useState("");
  const [savingRoom, setSavingRoom] = useState(false);
  const [editTeacherId, setEditTeacherId] = useState<number | null>(null);
  const [editSubjectIds, setEditSubjectIds] = useState<string[]>([]);
  const [savingTeacherSubjects, setSavingTeacherSubjects] = useState(false);
  const [teacherSource, setTeacherSource] = useState<TeacherSource | null>(null);
  const [pickedTeacherId, setPickedTeacherId] = useState("");
  const [staffQuery, setStaffQuery] = useState("");
  const [staffHits, setStaffHits] = useState<Teacher[]>([]);
  const [searchingStaff, setSearchingStaff] = useState(false);
  const [createFirst, setCreateFirst] = useState("");
  const [createLast, setCreateLast] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createPhoto, setCreatePhoto] = useState<string | null>(null);
  const [assignSubjectIds, setAssignSubjectIds] = useState<string[]>([]);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;
  const homeroom = isHomeroomCycle(level);
  const roomDetailRef = useRevealScroll<HTMLElement>(!!selectedRoomId, selectedRoomId);
  const teacherFormRef = useRevealScroll<HTMLFormElement>(!!teacherSource, teacherSource);

  useEffect(() => {
    if (!selectedRoom) return;
    setEditRoomName(selectedRoom.name);
    setEditRoomCapacity(selectedRoom.capacity != null ? String(selectedRoom.capacity) : "");
  }, [selectedRoom?.id, selectedRoom?.name, selectedRoom?.capacity]);

  const roomTeachers = useMemo(() => {
    const map = new Map<number, { teacher: Teacher; subjects: Assignment[] }>();
    for (const a of assignments) {
      if (!selectedRoomId || a.room_id !== selectedRoomId) continue;
      const existing = map.get(a.teacher_id);
      const stub: Teacher = {
        id: a.teacher_id,
        first_name: a.teacher_name,
        last_name: "",
        email: "",
        profile_photo_url: a.teacher_photo_url,
      };
      if (existing) existing.subjects.push(a);
      else map.set(a.teacher_id, { teacher: stub, subjects: [a] });
    }
    for (const t of teachers) {
      const row = map.get(t.id);
      if (row) row.teacher = t;
    }
    return [...map.values()];
  }, [assignments, selectedRoomId, teachers]);

  async function loadCatalog() {
    const [subjectsRes, teachersRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/subjects`),
      fetchWithAuth(`${API_BASE}/teachers`),
    ]);
    const subjectsData = await subjectsRes.json();
    const teachersData = await teachersRes.json();
    if (!subjectsRes.ok) throw new Error(subjectsData.message || "Erreur matières");
    if (!teachersRes.ok) throw new Error(teachersData.message || "Erreur professeurs");
    setSubjects(subjectsData.subjects ?? []);
    setTeachers(teachersData.teachers ?? []);
  }

  async function loadClass(id: string) {
    const [classRes, roomsRes, assignRes, studentsRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/classes/${id}`),
      fetchWithAuth(`${API_BASE}/rooms?class_id=${encodeURIComponent(id)}`),
      fetchWithAuth(`${API_BASE}/teachers/assignments?class_id=${encodeURIComponent(id)}`),
      fetchWithAuth(`${API_BASE}/students?class_id=${encodeURIComponent(id)}`),
    ]);
    const classData = await classRes.json();
    const roomsData = await roomsRes.json();
    const assignData = await assignRes.json();
    const studentsData = await studentsRes.json();
    if (!classRes.ok) throw new Error(classData.message || "Erreur classe");
    if (!roomsRes.ok) throw new Error(roomsData.message || "Erreur salles");
    if (!assignRes.ok) throw new Error(assignData.message || "Erreur assignations");
    const cls = classData.class;
    setName(cls.name ?? "");
    setDescription(cls.description ?? "");
    setLevel(cls.level ?? "");
    setSubjectIds(cls.subject_ids ?? []);
    setRooms(roomsData.rooms ?? []);
    setAssignments(assignData.assignments ?? []);
    setClassStudents(studentsRes.ok ? studentsData.students ?? [] : []);
  }

  async function refreshAll(id = classId) {
    await Promise.all([loadCatalog(), id ? loadClass(id) : Promise.resolve()]);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        await loadCatalog();
        if (!isNew && !cancelled) await loadClass(initial.id);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur de chargement");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedRoomId) {
      setRoomStudents([]);
      setEditTeacherId(null);
      return;
    }
    setEditTeacherId(null);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE}/students?room_id=${encodeURIComponent(selectedRoomId)}`);
        const data = await res.json();
        if (!cancelled) setRoomStudents(data.students ?? []);
      } catch {
        if (!cancelled) setRoomStudents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRoomId]);

  useEffect(() => {
    if (teacherSource !== "search") return;
    const q = staffQuery.trim();
    const t = window.setTimeout(async () => {
      setSearchingStaff(true);
      try {
        const res = await fetchWithAuth(
          `${API_BASE}/teachers/staff-search${q ? `?q=${encodeURIComponent(q)}` : ""}`,
        );
        const data = await res.json();
        setStaffHits(data.users ?? []);
      } catch {
        setStaffHits([]);
      } finally {
        setSearchingStaff(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [staffQuery, teacherSource]);

  useEffect(() => {
    if (!teacherSource || !selectedRoomId) return;
    const available = subjects.filter((s) => subjectIds.includes(s.id));
    setAssignSubjectIds(homeroom ? available.map((s) => s.id) : []);
  }, [teacherSource, selectedRoomId, homeroom, subjectIds, subjects]);

  function toggleSubject(id: string) {
    const next = subjectIds.includes(id) ? subjectIds.filter((x) => x !== id) : [...subjectIds, id];
    setSubjectIds(next);
    if (classId) {
      void persistSubjects(next);
    }
  }

  async function persistSubjects(ids: string[]) {
    try {
      const res = await fetchWithAuth(`${API_BASE}/classes/${classId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          level: level || undefined,
          subject_ids: ids,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function saveClass(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        level: level || undefined,
        subject_ids: subjectIds,
      };
      if (classId) {
        const res = await fetchWithAuth(`${API_BASE}/classes/${classId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      } else {
        const res = await fetchWithAuth(`${API_BASE}/classes`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
        setClassId(data.class.id);
        await loadClass(data.class.id);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function createSubjectInline(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    setAddingSubject(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/subjects`, {
        method: "POST",
        body: JSON.stringify({ name: newSubjectName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      const created: Subject = data.subject;
      setSubjects((prev) => [...prev, created]);
      setSubjectIds((prev) => [...prev, created.id]);
      setNewSubjectName("");
      if (classId) {
        await fetchWithAuth(`${API_BASE}/classes/${classId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            level: level || undefined,
            subject_ids: [...subjectIds, created.id],
          }),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setAddingSubject(false);
    }
  }

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!classId) {
      setError("Enregistrez d’abord la classe avant d’ajouter une salle.");
      return;
    }
    setAddingRoom(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/rooms`, {
        method: "POST",
        body: JSON.stringify({
          name: roomName.trim(),
          class_id: classId,
          capacity: roomCapacity.trim() ? parseInt(roomCapacity.trim(), 10) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setRoomName("");
      setRoomCapacity("");
      await loadClass(classId);
      if (data.room?.id) setSelectedRoomId(data.room.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setAddingRoom(false);
    }
  }

  async function updateRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoom) return;
    setSavingRoom(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/rooms/${selectedRoom.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editRoomName.trim(),
          class_id: classId,
          capacity: editRoomCapacity.trim() ? parseInt(editRoomCapacity.trim(), 10) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      await loadClass(classId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingRoom(false);
    }
  }

  async function deleteRoom(id: string) {
    if (!confirm("Supprimer cette salle ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/rooms/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      if (selectedRoomId === id) setSelectedRoomId(null);
      await loadClass(classId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function resolveTeacherId(): Promise<number | null> {
    if (teacherSource === "pick") {
      return pickedTeacherId ? Number(pickedTeacherId) : null;
    }
    if (teacherSource === "search") {
      if (!pickedTeacherId) return null;
      const res = await fetchWithAuth(`${API_BASE}/teachers/promote`, {
        method: "POST",
        body: JSON.stringify({ user_id: Number(pickedTeacherId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      return data.teacher.id as number;
    }
    if (teacherSource === "create") {
      const res = await fetchWithAuth(`${API_BASE}/teachers`, {
        method: "POST",
        body: JSON.stringify({
          first_name: createFirst.trim() || undefined,
          last_name: createLast.trim() || undefined,
          email: createEmail.trim(),
          phone: createPhone.trim() || undefined,
          password: createPassword,
          profile_photo_url: createPhoto || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      return data.teacher.id as number;
    }
    return null;
  }

  async function addTeacherToRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!classId || !selectedRoomId || assignSubjectIds.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const teacherId = await resolveTeacherId();
      if (!teacherId) throw new Error("Choisissez ou créez un professeur.");
      const res = await fetchWithAuth(`${API_BASE}/teachers/${teacherId}/class-subjects`, {
        method: "POST",
        body: JSON.stringify({
          class_id: classId,
          room_id: selectedRoomId,
          subject_ids: assignSubjectIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setTeacherSource(null);
      setPickedTeacherId("");
      setStaffQuery("");
      setCreateFirst("");
      setCreateLast("");
      setCreateEmail("");
      setCreatePhone("");
      setCreatePassword("");
      setCreatePhoto(null);
      await refreshAll(classId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function removeTeacherFromRoom(teacherId: number) {
    if (!confirm("Retirer ce professeur de la salle ?")) return;
    setError("");
    try {
      const toRemove = assignments.filter(
        (a) => a.teacher_id === teacherId && a.room_id === selectedRoomId,
      );
      for (const a of toRemove) {
        const res = await fetchWithAuth(
          `${API_BASE}/teachers/${teacherId}/class-subjects/${a.id}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Erreur");
        }
      }
      if (editTeacherId === teacherId) setEditTeacherId(null);
      await loadClass(classId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  function startEditTeacher(teacherId: number, taught: Assignment[]) {
    setTeacherSource(null);
    setEditTeacherId(teacherId);
    setEditSubjectIds(taught.map((a) => a.subject_id));
  }

  async function saveTeacherSubjects(e: React.FormEvent) {
    e.preventDefault();
    if (!editTeacherId || !classId || !selectedRoomId || editSubjectIds.length === 0) return;
    const current = assignments.filter(
      (a) => a.teacher_id === editTeacherId && a.room_id === selectedRoomId,
    );
    const currentIds = current.map((a) => a.subject_id);
    const toAdd = editSubjectIds.filter((id) => !currentIds.includes(id));
    const toRemove = current.filter((a) => !editSubjectIds.includes(a.subject_id));
    setSavingTeacherSubjects(true);
    setError("");
    try {
      if (toAdd.length > 0) {
        const res = await fetchWithAuth(`${API_BASE}/teachers/${editTeacherId}/class-subjects`, {
          method: "POST",
          body: JSON.stringify({
            class_id: classId,
            room_id: selectedRoomId,
            subject_ids: toAdd,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      }
      for (const a of toRemove) {
        const res = await fetchWithAuth(
          `${API_BASE}/teachers/${editTeacherId}/class-subjects/${a.id}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Erreur");
        }
      }
      setEditTeacherId(null);
      await loadClass(classId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingTeacherSubjects(false);
    }
  }

  const classSubjects = subjects.filter((s) => subjectIds.includes(s.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-700">Fiche de classe</p>
            <h2 className="truncate text-xl font-bold tracking-tight text-slate-900">
              {classId ? name || "Classe" : "Nouvelle classe"}
            </h2>
            {level ? <p className="mt-0.5 text-sm text-slate-500">{educationLevelLabel(level)}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="app-btn-secondary shrink-0 text-sm py-2">
            Fermer
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? <p className="mb-3 text-slate-500 animate-pulse">Chargement…</p> : null}
          {error ? (
            <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{error}</div>
          ) : null}

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(16.5rem,20rem)_minmax(0,1fr)]">
            <div className="space-y-4 xl:sticky xl:top-0">
              <ConfigPanel kicker="Identité" title="La classe">
                <form onSubmit={saveClass} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Nom</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="ex. 1ère AF"
                      className="class-input class-input-name"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Niveau</label>
                    <select
                      value={level}
                      onChange={(e) => setLevel(e.target.value)}
                      required
                      className="class-input w-full max-w-[18rem] bg-white"
                    >
                      <option value="">Choisir…</option>
                      {EDUCATION_LEVELS.map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
                    <input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optionnel"
                      className="class-input w-full max-w-[18rem]"
                    />
                  </div>
                  <button type="submit" disabled={saving} className="app-btn-primary disabled:opacity-60">
                    {saving ? "Enregistrement…" : classId ? "Enregistrer" : "Créer la classe"}
                  </button>
                </form>
              </ConfigPanel>

              <ConfigPanel
                tone="slate"
                kicker="Programme"
                title="Matières"
                action={
                  subjects.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const next =
                          subjectIds.length === subjects.length ? [] : subjects.map((s) => s.id);
                        setSubjectIds(next);
                        if (classId) void persistSubjects(next);
                      }}
                      className="whitespace-nowrap text-[11px] font-medium text-slate-600 hover:text-teal-800"
                    >
                      {subjectIds.length === subjects.length ? "Aucun" : "Tout"}
                    </button>
                  ) : null
                }
              >
                <div className="max-h-44 overflow-y-auto rounded-xl bg-white p-2 ring-1 ring-slate-200">
                  {subjects.length === 0 ? (
                    <p className="px-1 py-2 text-sm text-slate-500">Aucune matière. Ajoutez-en ci-dessous.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {subjects.map((s) => (
                        <SubjectChip
                          key={s.id}
                          name={s.name}
                          on={subjectIds.includes(s.id)}
                          onToggle={() => toggleSubject(s.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <form onSubmit={createSubjectInline} className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    placeholder="Nouvelle matière"
                    className="class-input class-input-name"
                  />
                  <button
                    type="submit"
                    disabled={addingSubject || !newSubjectName.trim()}
                    className="app-btn-secondary text-sm py-2 disabled:opacity-60"
                  >
                    {addingSubject ? "…" : "Ajouter"}
                  </button>
                </form>
              </ConfigPanel>
            </div>

            <div className="space-y-4">
              <ConfigPanel
                tone="teal"
                kicker="Organisation"
                title={classId ? `Salles · ${rooms.length}` : "Salles"}
                hint={!classId ? "Enregistrez d’abord la classe." : undefined}
              >
                {!classId ? (
                  <p className="rounded-xl bg-white px-3 py-4 text-sm text-slate-500 ring-1 ring-teal-100">
                    Créez la classe à gauche, puis ajoutez des salles ici.
                  </p>
                ) : (
                  <>
                    {rooms.length === 0 ? (
                      <p className="mb-3 rounded-xl bg-white px-3 py-4 text-sm text-slate-500 ring-1 ring-teal-100">
                        Aucune salle. Ajoutez-en une ci-dessous.
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {rooms.map((room) => {
                          const teacherPreviews = assignments
                            .filter((a) => a.room_id === room.id)
                            .reduce<{ key: string; name: string; photo?: string | null }[]>((acc, a) => {
                              if (!acc.some((x) => x.key === String(a.teacher_id))) {
                                acc.push({
                                  key: String(a.teacher_id),
                                  name: a.teacher_name,
                                  photo: a.teacher_photo_url,
                                });
                              }
                              return acc;
                            }, []);
                          const studentPreviews = classStudents
                            .filter((s) => s.room_id === room.id)
                            .map((s) => ({
                              key: s.id,
                              name: `${s.first_name} ${s.last_name}`,
                              photo: s.photo_identity_student,
                            }));
                          const selected = selectedRoomId === room.id;
                          return (
                            <button
                              key={room.id}
                              type="button"
                              onClick={() =>
                                setSelectedRoomId((id) => (id === room.id ? null : room.id))
                              }
                              className={`rounded-2xl bg-white p-3 text-left shadow-sm ring-1 transition ${
                                selected
                                  ? "ring-2 ring-teal-600"
                                  : "ring-slate-200 hover:ring-teal-300"
                              }`}
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="font-semibold text-slate-900">Salle {room.name}</span>
                                <span className="text-[11px] text-slate-400">
                                  {room.capacity != null ? `max ${room.capacity}` : "illimitée"}
                                </span>
                              </div>
                              <PeoplePreviewRow
                                label="Professeurs"
                                empty="Aucun professeur"
                                countNoun={teacherPreviews.length > 1 ? "profs" : "prof"}
                                people={teacherPreviews}
                                kind="teacher"
                              />
                              <PeoplePreviewRow
                                label="Élèves"
                                empty={`Aucun ${learnerNoun(level)}`}
                                countNoun={learnerNoun(level, studentPreviews.length !== 1)}
                                people={studentPreviews}
                                kind="student"
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <form
                      onSubmit={createRoom}
                      className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-white p-3 ring-1 ring-dashed ring-teal-200"
                    >
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-slate-600">Nom</label>
                        <input
                          value={roomName}
                          onChange={(e) => setRoomName(e.target.value)}
                          placeholder="1"
                          required
                          className="class-input class-input-room"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-slate-600">Limite</label>
                        <input
                          type="number"
                          min={1}
                          value={roomCapacity}
                          onChange={(e) => setRoomCapacity(e.target.value)}
                          placeholder="—"
                          className="class-input class-input-cap"
                        />
                      </div>
                      <button type="submit" disabled={addingRoom} className="app-btn-primary text-sm py-2 disabled:opacity-60">
                        {addingRoom ? "…" : "Ajouter"}
                      </button>
                    </form>
                  </>
                )}
              </ConfigPanel>

              {selectedRoom ? (
                <section
                  ref={roomDetailRef}
                  tabIndex={-1}
                  className="space-y-4 rounded-2xl border border-teal-200 bg-white p-4 shadow-sm outline-none"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-700">Salle sélectionnée</p>
                      <h3 className="text-base font-semibold text-slate-900">Salle {selectedRoom.name}</h3>
                      <p className="mt-1 text-sm">
                        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">
                          {roomTeachers.length} professeur{roomTeachers.length > 1 ? "s" : ""}
                        </span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                          {roomStudents.length} {learnerNoun(level, roomStudents.length !== 1)}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedRoomId(null)}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Replier
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRoom(selectedRoom.id)}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>

                  <form onSubmit={updateRoom} className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-600">Nom</label>
                      <input
                        value={editRoomName}
                        onChange={(e) => setEditRoomName(e.target.value)}
                        required
                        className="class-input class-input-room"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-600">Limite</label>
                      <input
                        type="number"
                        min={1}
                        value={editRoomCapacity}
                        onChange={(e) => setEditRoomCapacity(e.target.value)}
                        placeholder="∞"
                        className="class-input class-input-cap"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={savingRoom || !editRoomName.trim()}
                      className="app-btn-primary text-sm py-2 disabled:opacity-60"
                    >
                      {savingRoom ? "…" : "Enregistrer"}
                    </button>
                  </form>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl bg-teal-50/60 p-3 ring-1 ring-teal-100">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-teal-900">Professeurs</h4>
                        {teacherSource == null && editTeacherId == null ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditTeacherId(null);
                              setTeacherSource("pick");
                            }}
                            className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-teal-800 ring-1 ring-teal-200 hover:bg-teal-50"
                          >
                            + Ajouter
                          </button>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        {roomTeachers.length === 0 && teacherSource == null ? (
                          <p className="text-sm text-teal-800/70">Aucun professeur dans cette salle.</p>
                        ) : (
                          roomTeachers.map(({ teacher, subjects: taught }) => {
                            const editing = editTeacherId === teacher.id;
                            return (
                            <div
                              key={teacher.id}
                              className="flex items-start gap-3 rounded-xl bg-white p-2.5 ring-1 ring-teal-100"
                            >
                              <PersonAvatar
                                photo={teacher.profile_photo_url}
                                name={personName(teacher) || taught[0]?.teacher_name || ""}
                                size="lg"
                                kind="teacher"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-slate-900">
                                    {personName(teacher) !== "—" ? personName(teacher) : taught[0]?.teacher_name}
                                  </span>
                                  <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800">
                                    Professeur
                                  </span>
                                </div>
                                {teacher.email ? <div className="text-xs text-slate-500">{teacher.email}</div> : null}
                                {editing ? (
                                  <form onSubmit={saveTeacherSubjects} className="mt-2 space-y-2">
                                    {classSubjects.length === 0 ? (
                                      <p className="text-xs text-amber-800">
                                        Cochez d’abord les matières de la classe, à gauche.
                                      </p>
                                    ) : (
                                      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg bg-slate-50 p-2">
                                        {classSubjects.map((s) => (
                                          <SubjectChip
                                            key={s.id}
                                            name={s.name}
                                            on={editSubjectIds.includes(s.id)}
                                            onToggle={() =>
                                              setEditSubjectIds((prev) =>
                                                prev.includes(s.id)
                                                  ? prev.filter((x) => x !== s.id)
                                                  : [...prev, s.id],
                                              )
                                            }
                                          />
                                        ))}
                                      </div>
                                    )}
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="submit"
                                        disabled={savingTeacherSubjects || editSubjectIds.length === 0}
                                        className="app-btn-primary text-sm py-1.5 disabled:opacity-60"
                                      >
                                        {savingTeacherSubjects ? "…" : "Enregistrer"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditTeacherId(null)}
                                        className="app-btn-secondary text-sm py-1.5"
                                      >
                                        Annuler
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {taught.map((a) => (
                                      <span
                                        key={a.id}
                                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                                      >
                                        {a.subject_name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                {!editing ? (
                                  <button
                                    type="button"
                                    onClick={() => startEditTeacher(teacher.id, taught)}
                                    className="rounded-lg px-2 py-1 text-xs font-medium text-teal-800 hover:bg-teal-50"
                                  >
                                    Modifier
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => removeTeacherFromRoom(teacher.id)}
                                  className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                                >
                                  Retirer
                                </button>
                              </div>
                            </div>
                            );
                          })
                        )}
                      </div>

                      {teacherSource ? (
                        <form
                          onSubmit={addTeacherToRoom}
                          ref={teacherFormRef}
                          className="mt-3 space-y-3 rounded-xl bg-white p-3 ring-1 ring-teal-200"
                        >
                          <div className="flex flex-wrap gap-1.5 text-sm">
                            {(["pick", "search", "create"] as TeacherSource[]).map((src) => (
                              <button
                                key={src}
                                type="button"
                                onClick={() => {
                                  setTeacherSource(src);
                                  setPickedTeacherId("");
                                }}
                                className={`rounded-full px-3 py-1 text-xs font-medium ${
                                  teacherSource === src
                                    ? "bg-teal-700 text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                }`}
                              >
                                {src === "pick"
                                  ? "Professeurs"
                                  : src === "search"
                                    ? "Utilisateur"
                                    : "Nouveau"}
                              </button>
                            ))}
                          </div>

                          {teacherSource === "pick" ? (
                            <select
                              value={pickedTeacherId}
                              onChange={(e) => setPickedTeacherId(e.target.value)}
                              required
                              className="class-input w-full max-w-xs bg-white"
                            >
                              <option value="">Choisir…</option>
                              {teachers.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {personName(t)}
                                </option>
                              ))}
                            </select>
                          ) : null}

                          {teacherSource === "search" ? (
                            <div className="space-y-2">
                              <input
                                value={staffQuery}
                                onChange={(e) => setStaffQuery(e.target.value)}
                                placeholder="Nom, email, téléphone…"
                                className="class-input w-full max-w-sm"
                              />
                              {searchingStaff ? <p className="text-xs text-slate-500">Recherche…</p> : null}
                              <div className="max-h-36 overflow-y-auto space-y-1 rounded-lg bg-slate-50 p-1">
                                {staffHits.map((u) => (
                                  <label
                                    key={u.id}
                                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                                      pickedTeacherId === String(u.id) ? "bg-teal-50 ring-1 ring-teal-200" : "hover:bg-white"
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name="staff-pick"
                                      checked={pickedTeacherId === String(u.id)}
                                      onChange={() => setPickedTeacherId(String(u.id))}
                                    />
                                    <PersonAvatar
                                      photo={u.profile_photo_url}
                                      name={personName(u)}
                                      size="sm"
                                      kind="teacher"
                                    />
                                    <span className="min-w-0">
                                      <span className="block truncate">{personName(u)}</span>
                                      <span className="block truncate text-xs text-slate-500">{u.email}</span>
                                    </span>
                                  </label>
                                ))}
                                {!searchingStaff && staffHits.length === 0 ? (
                                  <p className="px-1 py-2 text-xs text-slate-500">
                                    Aucun compte staff. Créez un nouveau compte.
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          {teacherSource === "create" ? (
                            <div className="flex flex-wrap gap-2">
                              <input
                                value={createFirst}
                                onChange={(e) => setCreateFirst(e.target.value)}
                                placeholder="Prénom"
                                className="class-input class-input-name"
                              />
                              <input
                                value={createLast}
                                onChange={(e) => setCreateLast(e.target.value)}
                                placeholder="Nom"
                                className="class-input class-input-name"
                              />
                              <input
                                type="email"
                                value={createEmail}
                                onChange={(e) => setCreateEmail(e.target.value)}
                                placeholder="Email"
                                required
                                className="class-input w-full max-w-xs"
                              />
                              <input
                                value={createPhone}
                                onChange={(e) => setCreatePhone(e.target.value)}
                                placeholder="Téléphone"
                                className="class-input class-input-name"
                              />
                              <div className="w-full max-w-xs">
                                <label className="mb-1 block text-xs font-medium text-slate-600">Mot de passe</label>
                                <PasswordInput
                                  value={createPassword}
                                  onChange={(e) => setCreatePassword(e.target.value)}
                                  required
                                  minLength={6}
                                  autoComplete="new-password"
                                />
                              </div>
                              <div className="w-full">
                                <ImageUpload
                                  value={createPhoto}
                                  onChange={(url) => setCreatePhoto(url)}
                                  label="Photo du professeur"
                                  token={getToken()}
                                  previewClassName="w-16 h-16 rounded-full object-cover border border-slate-200"
                                />
                              </div>
                            </div>
                          ) : null}

                          <div>
                            <p className="mb-1 text-xs font-medium text-slate-600">
                              Matières {homeroom ? "— toutes cochées (décochez au besoin)" : ""}
                            </p>
                            {classSubjects.length === 0 ? (
                              <p className="text-xs text-amber-800">Cochez d’abord les matières de la classe, à gauche.</p>
                            ) : (
                              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg bg-slate-50 p-2">
                                {classSubjects.map((s) => (
                                  <SubjectChip
                                    key={s.id}
                                    name={s.name}
                                    on={assignSubjectIds.includes(s.id)}
                                    onToggle={() =>
                                      setAssignSubjectIds((prev) =>
                                        prev.includes(s.id)
                                          ? prev.filter((x) => x !== s.id)
                                          : [...prev, s.id],
                                      )
                                    }
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={saving || assignSubjectIds.length === 0}
                              className="app-btn-primary text-sm py-2 disabled:opacity-60"
                            >
                              {saving ? "…" : "Ajouter à la salle"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setTeacherSource(null);
                                setPickedTeacherId("");
                              }}
                              className="app-btn-secondary text-sm py-2"
                            >
                              Annuler
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </div>

                    <div className="rounded-xl bg-amber-50/70 p-3 ring-1 ring-amber-100">
                      <h4 className="mb-2 text-sm font-semibold text-amber-950">
                        {learnerNounCap(level, true)}
                      </h4>
                      {roomStudents.length === 0 ? (
                        <p className="text-sm text-amber-900/70">Aucun {learnerNoun(level)} assigné à cette salle.</p>
                      ) : (
                        <ul className="max-h-72 divide-y divide-amber-100 overflow-y-auto rounded-xl bg-white ring-1 ring-amber-100">
                          {roomStudents.map((s) => (
                            <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                              <PersonAvatar
                                photo={s.photo_identity_student}
                                name={`${s.first_name} ${s.last_name}`}
                                size="sm"
                                kind="student"
                              />
                              <span className="min-w-0 truncate text-sm text-slate-800">
                                {s.last_name} {s.first_name}
                              </span>
                              <span className="ml-auto shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                {learnerNounCap(level)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
