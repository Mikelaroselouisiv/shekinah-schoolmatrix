"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, fetchWithAuth } from "@/src/lib/api";
import { educationLevelLabel } from "@/src/lib/educationLevels";

type HubTab = "appel" | "travaux" | "materiel";
type HomeworkKind = "DEVOIR" | "LECON";

type TeacherClass = {
  id: string;
  name: string;
  level?: string | null;
  can_take_attendance?: boolean;
  can_set_materials?: boolean;
};

type Subject = { id: string; name: string };

type AttendanceStudent = {
  id: string;
  first_name: string;
  last_name: string;
  status: string | null;
};

type AssignmentCard = {
  id: string;
  kind: HomeworkKind;
  title: string;
  instructions: string | null;
  due_date: string | null;
  class_id: string | null;
  class_name: string | null;
  subject_id: string | null;
  subject_name: string | null;
  students?: {
    student_id: string;
    first_name: string;
    last_name: string;
    score: string | null;
    comment: string | null;
  }[];
};

type ScheduleSlot = {
  id: string;
  class_id?: string;
  class_name?: string;
  subject_name?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  materials?: string | null;
};

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const STATUSES = [
  { value: "PRESENT", label: "PrÃ©sent" },
  { value: "ABSENT", label: "Absent" },
  { value: "LATE", label: "En retard" },
  { value: "EXCUSED", label: "ExcusÃ©" },
];

function todayYmd() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function DashboardTeacherHubPage() {
  const [tab, setTab] = useState<HubTab>("travaux");
  const [error, setError] = useState("");
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [classId, setClassId] = useState("");
  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId],
  );

  const attendanceClasses = classes.filter((c) => c.can_take_attendance);
  const materialClasses = classes.filter((c) => c.can_set_materials);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE}/teachers/me/classes`);
        const data = await res.json();
        const list: TeacherClass[] = data.classes || [];
        setClasses(list);
        if (!classId && list[0]) setClassId(list[0].id);
      } catch {
        setError("Impossible de charger vos classes.");
      }
    })();
  }, []);

  useEffect(() => {
    if (tab === "appel" && selectedClass && !selectedClass.can_take_attendance) {
      const next = attendanceClasses[0];
      if (next) setClassId(next.id);
    }
    if (tab === "materiel" && selectedClass && !selectedClass.can_set_materials) {
      const next = materialClasses[0];
      if (next) setClassId(next.id);
    }
  }, [tab, selectedClass, attendanceClasses, materialClasses]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Tableau de bord professeur</h2>
        <p className="text-sm text-slate-500 mt-1">
          Appel, devoirs, leÃ§ons et matÃ©riel de vos classes.
        </p>
      </div>

      <div className="flex gap-2 border-b border-[var(--app-border)]">
        {(["travaux", "appel", "materiel"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 font-medium text-sm rounded-t-lg border-b-2 -mb-px ${
              tab === t
                ? "border-[var(--school-accent-1)] text-[var(--school-accent-1)] bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {t === "travaux" && "Devoirs et leÃ§ons"}
            {t === "appel" && "Appel"}
            {t === "materiel" && "MatÃ©riel"}
          </button>
        ))}
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      {classes.length === 0 ? (
        <div className="p-8 rounded-xl border border-[var(--app-border)] text-center text-slate-500">
          Aucune classe ne vous est encore affectÃ©e.
        </div>
      ) : (
        <>
          {tab === "travaux" && (
            <HomeworkTab
              classes={classes}
              classId={classId}
              onClassId={setClassId}
              onError={setError}
            />
          )}
          {tab === "appel" && (
            <AttendanceTab
              classes={attendanceClasses}
              classId={classId}
              onClassId={setClassId}
              onError={setError}
            />
          )}
          {tab === "materiel" && (
            <MaterialsTab
              classes={materialClasses}
              classId={classId}
              onClassId={setClassId}
              onError={setError}
            />
          )}
        </>
      )}
    </div>
  );
}

function ClassSelect({
  classes,
  classId,
  onClassId,
}: {
  classes: TeacherClass[];
  classId: string;
  onClassId: (id: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">Classe</label>
      <select
        value={classId}
        onChange={(e) => onClassId(e.target.value)}
        className="text-sm border border-[var(--app-border)] rounded-lg px-3 py-2 min-w-[220px]"
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.level ? ` â€” ${educationLevelLabel(c.level)}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function AttendanceTab({
  classes,
  classId,
  onClassId,
  onError,
}: {
  classes: TeacherClass[];
  classId: string;
  onClassId: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [date, setDate] = useState(todayYmd());
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!classId || !date) {
      setStudents([]);
      return;
    }
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/discipline/attendance?class_id=${classId}&date=${date}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur appel");
      setStudents(data.students || []);
      onError("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Impossible de charger lâ€™appel.");
      setStudents([]);
    }
  }, [classId, date, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!classId) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/discipline/attendance/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: classId,
          date,
          records: students.map((s) => ({
            student_id: s.id,
            status: s.status || "PRESENT",
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Enregistrement refusÃ©");
      onError("");
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  if (classes.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Lâ€™appel sur lâ€™application est rÃ©servÃ© au prÃ©scolaire et aux 1er / 2e cycles fondamentaux.
      </p>
    );
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <ClassSelect classes={classes} classId={classId} onClassId={onClassId} />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm border border-[var(--app-border)] rounded-lg px-3 py-2"
          />
        </div>
      </div>
      <div className="rounded-xl border border-[var(--app-border)] overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-[var(--app-border)]">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Ã‰lÃ¨ve</th>
              <th className="text-left px-4 py-2 font-medium">PrÃ©sence</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-slate-500">
                  Aucun Ã©lÃ¨ve dans cette classe.
                </td>
              </tr>
            ) : (
              students.map((s) => (
                <tr key={s.id} className="border-b border-[var(--app-border)]">
                  <td className="px-4 py-2">
                    {s.last_name} {s.first_name}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={s.status || "PRESENT"}
                      onChange={(e) =>
                        setStudents((prev) =>
                          prev.map((x) => (x.id === s.id ? { ...x, status: e.target.value } : x)),
                        )
                      }
                      className="text-sm border border-[var(--app-border)] rounded-lg px-2 py-1"
                    >
                      {STATUSES.map((st) => (
                        <option key={st.value} value={st.value}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {students.length > 0 && (
        <button type="submit" disabled={saving} className="app-btn-primary disabled:opacity-60">
          {saving ? "Enregistrement..." : "Enregistrer lâ€™appel"}
        </button>
      )}
    </form>
  );
}

function HomeworkTab({
  classes,
  classId,
  onClassId,
  onError,
}: {
  classes: TeacherClass[];
  classId: string;
  onClassId: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [list, setList] = useState<AssignmentCard[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssignmentCard | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    kind: "DEVOIR" as HomeworkKind,
    title: "",
    instructions: "",
    due_date: "",
    subject_id: "",
  });

  useEffect(() => {
    if (!classId) return;
    (async () => {
      try {
        const [sRes, hRes] = await Promise.all([
          fetchWithAuth(`${API_BASE}/teachers/me/classes/${classId}/subjects`),
          fetchWithAuth(`${API_BASE}/homework?class_id=${classId}`),
        ]);
        const sData = await sRes.json();
        const hData = await hRes.json();
        setSubjects(sData.subjects || []);
        setList(hData.assignments || []);
      } catch {
        onError("Impossible de charger les travaux.");
      }
    })();
  }, [classId, onError]);

  async function refreshList() {
    const hRes = await fetchWithAuth(`${API_BASE}/homework?class_id=${classId}`);
    const hData = await hRes.json();
    setList(hData.assignments || []);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !classId) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/homework`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: form.kind,
          title: form.title.trim(),
          instructions: form.instructions.trim() || null,
          due_date: form.due_date || null,
          class_id: classId,
          subject_id: form.subject_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "CrÃ©ation refusÃ©e");
      setForm({ kind: "DEVOIR", title: "", instructions: "", due_date: "", subject_id: "" });
      onError("");
      await refreshList();
      if (data.assignment?.id) {
        setOpenId(data.assignment.id);
        setDetail(data.assignment);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "CrÃ©ation impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function openCard(id: string) {
    const res = await fetchWithAuth(`${API_BASE}/homework/${id}`);
    const data = await res.json();
    if (res.ok) {
      setOpenId(id);
      setDetail(data.assignment);
    }
  }

  async function saveGrade(studentId: string, score: string, comment: string) {
    if (!openId) return;
    const res = await fetchWithAuth(`${API_BASE}/homework/${openId}/grades`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId, score, comment }),
    });
    const data = await res.json();
    if (!res.ok) {
      onError(data.message || "Note non enregistrÃ©e");
      return;
    }
    setDetail(data.assignment);
    onError("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-end">
        <ClassSelect classes={classes} classId={classId} onClassId={onClassId} />
      </div>

      <form
        onSubmit={create}
        className="rounded-xl border border-[var(--app-border)] bg-white p-4 space-y-3"
      >
        <h3 className="font-semibold text-slate-900">Nouveau travail</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
            <select
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as HomeworkKind }))}
              className="w-full text-sm border border-[var(--app-border)] rounded-lg px-3 py-2"
            >
              <option value="DEVOIR">Devoir</option>
              <option value="LECON">LeÃ§on</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">MatiÃ¨re</label>
            <select
              value={form.subject_id}
              onChange={(e) => setForm((f) => ({ ...f, subject_id: e.target.value }))}
              className="w-full text-sm border border-[var(--app-border)] rounded-lg px-3 py-2"
            >
              <option value="">â€”</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Pour le</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              className="w-full text-sm border border-[var(--app-border)] rounded-lg px-3 py-2"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Titre</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full text-sm border border-[var(--app-border)] rounded-lg px-3 py-2"
              required
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Consigne</label>
            <textarea
              value={form.instructions}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              rows={3}
              className="w-full text-sm border border-[var(--app-border)] rounded-lg px-3 py-2"
            />
          </div>
        </div>
        <button type="submit" disabled={saving} className="app-btn-primary disabled:opacity-60">
          {saving ? "Publication..." : "Publier"}
        </button>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        {list.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun travail pour cette classe.</p>
        ) : (
          list.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => void openCard(a.id)}
              className={`text-left rounded-xl border p-4 bg-white hover:bg-slate-50 ${
                openId === a.id
                  ? "border-[var(--school-accent-1)]"
                  : "border-[var(--app-border)]"
              }`}
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {a.kind === "DEVOIR" ? "Devoir" : "LeÃ§on"}
                {a.subject_name ? ` Â· ${a.subject_name}` : ""}
              </div>
              <div className="font-semibold text-slate-900 mt-1">{a.title}</div>
              {a.due_date && (
                <div className="text-sm text-slate-500 mt-1">Pour le {a.due_date}</div>
              )}
            </button>
          ))
        )}
      </div>

      {detail && (
        <div className="rounded-xl border border-[var(--app-border)] bg-white p-4 space-y-3">
          <h3 className="font-semibold text-slate-900">
            Notes â€” {detail.title}
          </h3>
          {detail.instructions && (
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{detail.instructions}</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                <tr>
                  <th className="text-left px-3 py-2">Ã‰lÃ¨ve</th>
                  <th className="text-left px-3 py-2">Note</th>
                  <th className="text-left px-3 py-2">Commentaire</th>
                </tr>
              </thead>
              <tbody>
                {(detail.students || []).map((s) => (
                  <GradeRow key={s.student_id} student={s} onSave={saveGrade} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function GradeRow({
  student,
  onSave,
}: {
  student: {
    student_id: string;
    first_name: string;
    last_name: string;
    score: string | null;
    comment: string | null;
  };
  onSave: (studentId: string, score: string, comment: string) => Promise<void>;
}) {
  const [score, setScore] = useState(student.score ?? "");
  const [comment, setComment] = useState(student.comment ?? "");
  useEffect(() => {
    setScore(student.score ?? "");
    setComment(student.comment ?? "");
  }, [student.score, student.comment]);

  return (
    <tr className="border-b border-[var(--app-border)]">
      <td className="px-3 py-2">
        {student.last_name} {student.first_name}
      </td>
      <td className="px-3 py-2">
        <input
          value={score}
          onChange={(e) => setScore(e.target.value)}
          onBlur={() => void onSave(student.student_id, score, comment)}
          className="w-24 text-sm border border-[var(--app-border)] rounded-lg px-2 py-1"
          placeholder="Note"
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => void onSave(student.student_id, score, comment)}
          className="w-full text-sm border border-[var(--app-border)] rounded-lg px-2 py-1"
          placeholder="Commentaire"
        />
      </td>
    </tr>
  );
}

function MaterialsTab({
  classes,
  classId,
  onClassId,
  onError,
}: {
  classes: TeacherClass[];
  classId: string;
  onClassId: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!classId) {
      setSlots([]);
      return;
    }
    (async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE}/schedule-slots?class_id=${classId}`);
        const data = await res.json();
        const list: ScheduleSlot[] = data.schedule_slots || [];
        setSlots(list);
        const next: Record<string, string> = {};
        for (const s of list) next[s.id] = s.materials || "";
        setDrafts(next);
        onError("");
      } catch {
        onError("Impossible de charger lâ€™horaire.");
      }
    })();
  }, [classId, onError]);

  async function save(id: string) {
    setSavingId(id);
    try {
      const res = await fetchWithAuth(`${API_BASE}/teachers/me/schedule-slots/${id}/materials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materials: drafts[id] || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Enregistrement refusÃ©");
      onError("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSavingId(null);
    }
  }

  if (classes.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        La liste de matÃ©riel accompagne lâ€™horaire du 1er et 2e cycle fondamental.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ClassSelect classes={classes} classId={classId} onClassId={onClassId} />
      {slots.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun crÃ©neau dâ€™horaire pour cette classe.</p>
      ) : (
        <div className="space-y-3">
          {slots.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-[var(--app-border)] bg-white p-4 space-y-2"
            >
              <div className="font-medium text-slate-900">
                {DAYS[s.day_of_week] ?? s.day_of_week} Â· {s.start_time}â€“{s.end_time} Â·{" "}
                {s.subject_name || "Cours"}
              </div>
              <label className="block text-sm text-slate-600">
                MatÃ©riel Ã  apporter (une ligne par item)
              </label>
              <textarea
                value={drafts[s.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                rows={3}
                className="w-full text-sm border border-[var(--app-border)] rounded-lg px-3 py-2"
              />
              <button
                type="button"
                disabled={savingId === s.id}
                onClick={() => void save(s.id)}
                className="app-btn-primary disabled:opacity-60"
              >
                {savingId === s.id ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

