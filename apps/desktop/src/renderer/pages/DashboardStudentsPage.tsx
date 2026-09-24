import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { ImageUpload } from "@/components/ImageUpload";
import { DateInputJJMMAAAA } from "@/components/DateInputJJMMAAAA";
import { isHigherEducationLevel, learnerNoun, learnerNounCap } from "@/lib/educationLevels";
import { useRevealScroll } from "@/lib/useRevealScroll";

type Student = {
  id: string;
  order_number: string | null;
  management_code: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  birth_date: string | null;
  birth_place: string | null;
  gender: string | null;
  photo_identity_student: string | null;
  photo_identity_mother: string | null;
  photo_identity_father: string | null;
  photo_identity_responsible: string | null;
  mother_name: string | null;
  mother_phone: string | null;
  father_name: string | null;
  father_phone: string | null;
  responsible_name: string | null;
  responsible_phone: string | null;
  class_id: string;
  class_name: string;
  class_level?: string | null;
  room_id: string | null;
  room_name: string | null;
  active: boolean;
};

type ClassItem = { id: string; name: string; level?: string | null };
type RoomItem = {
  id: string;
  name: string;
  class_id: string | null;
  capacity: number | null;
  student_count: number;
};
type AcademicYearItem = { id: string; name: string };

const FIELD =
  "class-input w-full";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DashboardStudentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editIdFromUrl = searchParams.get("edit_id");
  const handledEditId = useRef<string | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Student | null>(null);
  const [createdOrderNumber, setCreatedOrderNumber] = useState<string | null>(null);
  const [createdManagementCode, setCreatedManagementCode] = useState<string | null>(null);
  const [createdLearnerCap, setCreatedLearnerCap] = useState("Élève");
  const [saving, setSaving] = useState(false);
  const formRef = useRevealScroll<HTMLFormElement>(true, editing?.id ?? "new");
  const [form, setForm] = useState({
    order_number: "",
    first_name: "",
    last_name: "",
    class_id: "",
    room_id: "",
    academic_year_id: "",
    email: "",
    phone: "",
    address: "",
    birth_date: "",
    birth_place: "",
    gender: "",
    photo_identity_student: "",
    photo_identity_mother: "",
    photo_identity_father: "",
    photo_identity_responsible: "",
    mother_name: "",
    mother_phone: "",
    father_name: "",
    father_phone: "",
    responsible_name: "",
    responsible_phone: "",
  });

  const roomsForForm = form.class_id
    ? rooms.filter((r) => r.class_id === form.class_id)
    : [];
  const selectedClass = classes.find((c) => c.id === form.class_id);
  const formHigherEd = isHigherEducationLevel(selectedClass?.level);
  const formLearner = learnerNoun(selectedClass?.level);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  function blankForm(yearId = "") {
    return {
      order_number: "",
      first_name: "",
      last_name: "",
      class_id: "",
      room_id: "",
      academic_year_id: yearId,
      email: "",
      phone: "",
      address: "",
      birth_date: "",
      birth_place: "",
      gender: "",
      photo_identity_student: "",
      photo_identity_mother: "",
      photo_identity_father: "",
      photo_identity_responsible: "",
      mother_name: "",
      mother_phone: "",
      father_name: "",
      father_phone: "",
      responsible_name: "",
      responsible_phone: "",
    };
  }

  async function loadRefs() {
    setLoading(true);
    setError("");
    try {
      const [classesRes, roomsRes, yearsRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/classes`),
        fetchWithAuth(`${API_BASE}/rooms`),
        fetchWithAuth(`${API_BASE}/academic-years`),
      ]);
      const classesData = await classesRes.json();
      const roomsData = await roomsRes.json();
      const yearsData = await yearsRes.json();
      if (!classesRes.ok) throw new Error(classesData.message || "Erreur");
      setClasses(classesData.classes ?? []);
      setRooms(roomsData.rooms ?? []);
      const years = yearsData.academic_years ?? [];
      setAcademicYears(years);
      setForm((f) =>
        f.academic_year_id || editing ? f : { ...f, academic_year_id: years[0]?.id ?? "" },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRefs();
  }, []);

  useEffect(() => {
    if (!editIdFromUrl || !classes.length || handledEditId.current === editIdFromUrl) return;
    (async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE}/students/${editIdFromUrl}`);
        const data = await res.json();
        if (!res.ok || !data.student) return;
        const s = data.student as Student;
        handledEditId.current = editIdFromUrl;
        openEdit(s);
      } catch {
        // ignore
      }
    })();
  }, [editIdFromUrl, classes.length]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim() || !form.class_id) return;
    if (!editing && !form.academic_year_id) return;
    const nisu = form.order_number.trim().replace(/[\s\u00A0]+/g, "").toUpperCase();
    setSaving(true);
    setError("");
    setCreatedOrderNumber(null);
    setCreatedManagementCode(null);
    try {
      const body = {
        order_number: nisu || null,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        class_id: form.class_id,
        room_id: form.room_id || null,
        ...(form.academic_year_id ? { academic_year_id: form.academic_year_id } : {}),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        birth_date: form.birth_date || undefined,
        birth_place: form.birth_place.trim() || undefined,
        gender: form.gender.trim() || undefined,
        photo_identity_student: form.photo_identity_student.trim() || undefined,
        photo_identity_mother: form.photo_identity_mother.trim() || undefined,
        photo_identity_father: form.photo_identity_father.trim() || undefined,
        photo_identity_responsible: form.photo_identity_responsible.trim() || undefined,
        mother_name: form.mother_name.trim() || undefined,
        mother_phone: form.mother_phone.trim() || undefined,
        father_name: form.father_name.trim() || undefined,
        father_phone: form.father_phone.trim() || undefined,
        responsible_name: form.responsible_name.trim() || undefined,
        responsible_phone: form.responsible_phone.trim() || undefined,
      };
      if (editing) {
        const res = await fetchWithAuth(`${API_BASE}/students/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
        setEditing(null);
        handledEditId.current = null;
        if (editIdFromUrl) navigate("/dashboard/students", { replace: true });
        setForm(blankForm(form.academic_year_id || academicYears[0]?.id || ""));
        loadRefs();
      } else {
        const res = await fetchWithAuth(`${API_BASE}/students`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
        setCreatedOrderNumber(data.student?.order_number ?? null);
        setCreatedManagementCode(data.student?.management_code ?? null);
        setCreatedLearnerCap(learnerNounCap(selectedClass?.level));
        setForm(blankForm(form.academic_year_id || academicYears[0]?.id || ""));
        loadRefs();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(s: Student) {
    setEditing(s);
    setForm({
      order_number: s.order_number ?? "",
      academic_year_id: "",
      first_name: s.first_name ?? "",
      last_name: s.last_name ?? "",
      class_id: s.class_id ?? "",
      room_id: s.room_id ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      address: s.address ?? "",
      birth_date: s.birth_date ? String(s.birth_date).slice(0, 10) : "",
      birth_place: s.birth_place ?? "",
      gender: s.gender ?? "",
      photo_identity_student: s.photo_identity_student ?? "",
      photo_identity_mother: s.photo_identity_mother ?? "",
      photo_identity_father: s.photo_identity_father ?? "",
      photo_identity_responsible: s.photo_identity_responsible ?? "",
      mother_name: s.mother_name ?? "",
      mother_phone: s.mother_phone ?? "",
      father_name: s.father_name ?? "",
      father_phone: s.father_phone ?? "",
      responsible_name: s.responsible_name ?? "",
      responsible_phone: s.responsible_phone ?? "",
    });
    setCreatedOrderNumber(null);
    setCreatedManagementCode(null);
  }

  function resetToNew() {
    setEditing(null);
    handledEditId.current = null;
    setForm(blankForm(academicYears[0]?.id ?? form.academic_year_id));
    setCreatedOrderNumber(null);
    setCreatedManagementCode(null);
    if (editIdFromUrl) navigate("/dashboard/students", { replace: true });
  }

  const displayName = [form.first_name, form.last_name].filter(Boolean).join(" ").trim();

  if (loading && classes.length === 0) {
    return <div className="animate-pulse text-slate-500">Chargement...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">
            Scolarité
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {editing ? displayName || `Modifier l'${formLearner}` : "Inscription"}
          </h2>
        </div>
        <Link to="/dashboard/students/import" className="app-btn-secondary shadow-sm">
          Inscription d&apos;anciens {learnerNoun(undefined, true)}
        </Link>
      </div>

      {(createdManagementCode || createdOrderNumber) && (
        <div className="flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
              {createdLearnerCap} inscrit
            </p>
            {createdOrderNumber ? (
              <p className="mt-1 font-mono text-sm text-emerald-800/80">{createdOrderNumber}</p>
            ) : null}
          </div>
          <div className="rounded-xl bg-white px-4 py-2 ring-1 ring-emerald-100">
            <p className="text-[11px] font-medium text-slate-500">Code de gestion</p>
            <p className="font-mono text-xl font-bold tracking-wide text-slate-900">
              {createdManagementCode ?? "—"}
            </p>
          </div>
        </div>
      )}

      {error ? (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
          {error}
        </div>
      ) : null}

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
          <Section title="Identité">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prénom *">
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  className={FIELD}
                  required
                />
              </Field>
              <Field label="Nom *">
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  className={FIELD}
                  required
                />
              </Field>
              <Field label="Genre">
                <select
                  value={form.gender}
                  onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                  className={FIELD}
                >
                  <option value="">—</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </Field>
              <Field label="Date de naissance (JJ/MM/AAAA)">
                <DateInputJJMMAAAA
                  value={form.birth_date}
                  onChange={(birth_date) => setForm((f) => ({ ...f, birth_date }))}
                  className={FIELD}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Lieu de naissance">
                  <input
                    type="text"
                    value={form.birth_place}
                    onChange={(e) => setForm((f) => ({ ...f, birth_place: e.target.value }))}
                    className={FIELD}
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Photos" className="xl:sticky xl:top-4 xl:row-span-4">
            <div className="space-y-5">
              <ImageUpload
                value={form.photo_identity_student || null}
                onChange={(url) => setForm((f) => ({ ...f, photo_identity_student: url }))}
                label={formHigherEd ? "Étudiant" : "Élève"}
                buttonLabel="Choisir"
                token={token}
                previewClassName="h-40 w-40 rounded-2xl object-cover border border-slate-200 shadow-sm"
              />
              <div className="grid grid-cols-1 gap-4">
                <ImageUpload
                  value={form.photo_identity_mother || null}
                  onChange={(url) => setForm((f) => ({ ...f, photo_identity_mother: url }))}
                  label="Mère"
                  buttonLabel="Choisir"
                  token={token}
                  previewClassName="h-16 w-16 rounded-xl object-cover border border-slate-200"
                />
                <ImageUpload
                  value={form.photo_identity_father || null}
                  onChange={(url) => setForm((f) => ({ ...f, photo_identity_father: url }))}
                  label="Père"
                  buttonLabel="Choisir"
                  token={token}
                  previewClassName="h-16 w-16 rounded-xl object-cover border border-slate-200"
                />
                <ImageUpload
                  value={form.photo_identity_responsible || null}
                  onChange={(url) => setForm((f) => ({ ...f, photo_identity_responsible: url }))}
                  label="Responsable"
                  buttonLabel="Choisir"
                  token={token}
                  previewClassName="h-16 w-16 rounded-xl object-cover border border-slate-200"
                />
              </div>
            </div>
          </Section>

          <Section title="Scolarité">
            <div className="grid gap-4 sm:grid-cols-2">
              {!editing ? (
                <div className="sm:col-span-2">
                  <Field label="Année académique *">
                    <select
                      value={form.academic_year_id}
                      onChange={(e) => setForm((f) => ({ ...f, academic_year_id: e.target.value }))}
                      className={FIELD}
                      required
                    >
                      <option value="">Sélectionner</option>
                      {academicYears.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              ) : null}
              <Field label="Classe *">
                <select
                  value={form.class_id}
                  onChange={(e) => {
                    const class_id = e.target.value;
                    setForm((f) => ({
                      ...f,
                      class_id,
                      room_id: "",
                    }));
                  }}
                  className={FIELD}
                  required
                >
                  <option value="">Sélectionner</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div>
                <Field label="Salle">
                  <select
                    value={form.room_id}
                    onChange={(e) => setForm((f) => ({ ...f, room_id: e.target.value }))}
                    className={FIELD}
                    disabled={!form.class_id}
                  >
                    <option value="">À assigner plus tard</option>
                    {roomsForForm.map((r) => {
                      const full = r.capacity != null && r.student_count >= r.capacity;
                      const isCurrent = editing?.room_id === r.id;
                      return (
                        <option key={r.id} value={r.id} disabled={full && !isCurrent}>
                          {r.name}
                          {r.capacity != null
                            ? ` — ${r.student_count}/${r.capacity}${full && !isCurrent ? " (plein)" : ""}`
                            : ` — ${r.student_count} ${learnerNoun(selectedClass?.level, r.student_count !== 1)}`}
                        </option>
                      );
                    })}
                  </select>
                </Field>
                {form.class_id && roomsForForm.length === 0 ? (
                  <p className="mt-1.5 text-xs text-amber-700">
                    Aucune salle.{" "}
                    <Link to="/dashboard/classes" className="underline">
                      Créer
                    </Link>
                  </p>
                ) : null}
              </div>
              {form.class_id ? (
                <div className="sm:col-span-2">
                  <Field label="NISU">
                    <input
                      type="text"
                      value={form.order_number}
                      onChange={(e) => setForm((f) => ({ ...f, order_number: e.target.value }))}
                      onBlur={() =>
                        setForm((f) => ({
                          ...f,
                          order_number: f.order_number.trim().replace(/[\s\u00A0]+/g, "").toUpperCase(),
                        }))
                      }
                      className={`${FIELD} font-mono`}
                      placeholder="Optionnel — à compléter s’il est connu"
                    />
                  </Field>
                  {editing?.management_code ? (
                    <p className="mt-2 font-mono text-sm text-slate-600">{editing.management_code}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Section>

          <Section title="Contact">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Téléphone">
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className={FIELD}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className={FIELD}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Adresse">
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    className={FIELD}
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Famille">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Mère</p>
                <input
                  type="text"
                  value={form.mother_name}
                  onChange={(e) => setForm((f) => ({ ...f, mother_name: e.target.value }))}
                  placeholder="Nom"
                  className={FIELD}
                />
                <input
                  type="text"
                  value={form.mother_phone}
                  onChange={(e) => setForm((f) => ({ ...f, mother_phone: e.target.value }))}
                  placeholder="Téléphone"
                  className={FIELD}
                />
              </div>
              <div className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Père</p>
                <input
                  type="text"
                  value={form.father_name}
                  onChange={(e) => setForm((f) => ({ ...f, father_name: e.target.value }))}
                  placeholder="Nom"
                  className={FIELD}
                />
                <input
                  type="text"
                  value={form.father_phone}
                  onChange={(e) => setForm((f) => ({ ...f, father_phone: e.target.value }))}
                  placeholder="Téléphone"
                  className={FIELD}
                />
              </div>
              <div className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 sm:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Responsable
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    value={form.responsible_name}
                    onChange={(e) => setForm((f) => ({ ...f, responsible_name: e.target.value }))}
                    placeholder="Nom"
                    className={FIELD}
                  />
                  <input
                    type="text"
                    value={form.responsible_phone}
                    onChange={(e) => setForm((f) => ({ ...f, responsible_phone: e.target.value }))}
                    placeholder="Téléphone"
                    className={FIELD}
                  />
                </div>
              </div>
            </div>
          </Section>
        </div>

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-slate-200 bg-white/95 px-5 py-3 shadow-lg backdrop-blur">
          {editing ? (
            <button type="button" onClick={resetToNew} className="app-btn-secondary">
              Annuler
            </button>
          ) : null}
          <button type="submit" disabled={saving} className="app-btn-primary disabled:opacity-60">
            {saving ? "Enregistrement..." : editing ? "Enregistrer" : "Inscrire"}
          </button>
        </div>
      </form>
    </div>
  );
}
