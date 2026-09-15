"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { API_BASE, fetchWithAuth } from "@/src/lib/api";
import { ImageUpload } from "@/src/components/ImageUpload";
import { useSchoolProfile } from "@/src/contexts/SchoolProfileContext";
import { DateInputJJMMAAAA } from "@/src/components/DateInputJJMMAAAA";
import { isHigherEducationLevel, learnerNoun } from "@/src/lib/educationLevels";

type Student = {
  id: string;
  order_number: string | null;
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

export default function StudentsPage() {
  const searchParams = useSearchParams();
  const editIdFromUrl = searchParams.get("edit_id");
  const handledEditId = useRef<string | null>(null);
  const { roleName } = useSchoolProfile() ?? { roleName: "" };
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [createdOrderNumber, setCreatedOrderNumber] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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

  const roomsForFilter = classFilter
    ? rooms.filter((r) => r.class_id === classFilter)
    : rooms;
  const roomsForForm = form.class_id
    ? rooms.filter((r) => r.class_id === form.class_id)
    : [];
  const selectedClass = classes.find((c) => c.id === form.class_id);
  const formHigherEd = isHigherEducationLevel(selectedClass?.level);
  const filterClass = classes.find((c) => c.id === classFilter);
  const formLearner = learnerNoun(selectedClass?.level);
  const listLearner = learnerNoun(filterClass?.level);
  const listLearnerPlural = learnerNoun(filterClass?.level, true);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (classFilter) qs.set("class_id", classFilter);
      if (roomFilter) qs.set("room_id", roomFilter);
      const q = qs.toString() ? `?${qs}` : "";
      const [studentsRes, classesRes, roomsRes, yearsRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/students${q}`),
        fetchWithAuth(`${API_BASE}/classes`),
        fetchWithAuth(`${API_BASE}/rooms`),
        fetchWithAuth(`${API_BASE}/academic-years`),
      ]);
      const studentsData = await studentsRes.json();
      const classesData = await classesRes.json();
      const roomsData = await roomsRes.json();
      const yearsData = await yearsRes.json();
      if (!studentsRes.ok) throw new Error(studentsData.message || "Erreur");
      setStudents(studentsData.students ?? []);
      setClasses(classesData.classes ?? []);
      setRooms(roomsData.rooms ?? []);
      const years = yearsData.academic_years ?? [];
      setAcademicYears(years);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [classFilter, roomFilter]);

  useEffect(() => {
    if (roomFilter && classFilter) {
      const ok = rooms.some((r) => r.id === roomFilter && r.class_id === classFilter);
      if (!ok) setRoomFilter("");
    }
  }, [classFilter, rooms, roomFilter]);

  useEffect(() => {
    if (!editIdFromUrl || !classes.length || handledEditId.current === editIdFromUrl) return;
    (async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE}/students/${editIdFromUrl}`);
        const data = await res.json();
        if (!res.ok || !data.student) return;
        const s = data.student as Student;
        handledEditId.current = editIdFromUrl;
        setClassFilter(s.class_id ?? "");
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
    if (!formHigherEd && !editing && !form.order_number.trim()) {
      setError("Le NISU (identifiant unique élève) est obligatoire.");
      return;
    }
    if (!form.room_id) {
      setError("La salle (section) est obligatoire.");
      return;
    }
    setSaving(true);
    setError("");
    setCreatedOrderNumber(null);
    try {
      const body = {
        ...(formHigherEd
          ? { order_number: null }
          : form.order_number.trim() || editing
            ? { order_number: form.order_number.trim() || null }
            : {}),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        class_id: form.class_id,
        room_id: form.room_id,
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
        setShowForm(false);
        setEditing(null);
        load();
      } else {
        const res = await fetchWithAuth(`${API_BASE}/students`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
        setCreatedOrderNumber(data.student?.order_number ?? (form.order_number.trim() || null));
        setForm({ order_number: "", first_name: "", last_name: "", class_id: "", room_id: "", academic_year_id: academicYears[0]?.id ?? "", email: "", phone: "", address: "", birth_date: "", birth_place: "", gender: "", photo_identity_student: "", photo_identity_mother: "", photo_identity_father: "", photo_identity_responsible: "", mother_name: "", mother_phone: "", father_name: "", father_phone: "", responsible_name: "", responsible_phone: "" });
        load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Supprimer cet ${learnerNoun(students.find((s) => s.id === id)?.class_level)} ?`)) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/students/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
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
    setShowForm(true);
    setCreatedOrderNumber(null);
  }

  function openCreate() {
    setEditing(null);
    const defaultYearId = academicYears.length > 0 ? academicYears[0].id : "";
    setForm({ order_number: "", first_name: "", last_name: "", class_id: "", room_id: "", academic_year_id: defaultYearId, email: "", phone: "", address: "", birth_date: "", birth_place: "", gender: "", photo_identity_student: "", photo_identity_mother: "", photo_identity_father: "", photo_identity_responsible: "", mother_name: "", mother_phone: "", father_name: "", father_phone: "", responsible_name: "", responsible_phone: "" });
    setShowForm(true);
    setCreatedOrderNumber(null);
  }

  if (loading) return <div className="animate-pulse text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-900">Inscription des {listLearnerPlural}</h2>
        <div className="flex gap-2">
          <Link href="/dashboard/students/import" className="app-btn-secondary">
            Inscription d&apos;anciens {listLearnerPlural}
          </Link>
          <button onClick={openCreate} className="app-btn-primary">Inscrire un {listLearner}</button>
        </div>
      </div>

      {createdOrderNumber && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200">
          <p className="font-semibold text-green-800">Élève inscrit</p>
          <p className="text-green-700 mt-1">
            Identifiant (n° ministère) : <span className="font-mono font-bold">{createdOrderNumber}</span>
          </p>
        </div>
      )}

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Filtrer par classe</label>
          <select
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value);
              setRoomFilter("");
            }}
            className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm max-w-xs"
          >
            <option value="">Toutes les classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Filtrer par salle</label>
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm max-w-xs"
          >
            <option value="">Toutes les salles</option>
            {roomsForFilter.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.capacity != null ? ` (${r.student_count}/${r.capacity})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Formulaire */}
      {showForm && (
        <form onSubmit={handleSubmit} className="p-6 rounded-xl border border-[var(--app-border)] bg-white space-y-6 max-w-2xl">
          <h3 className="font-semibold text-slate-900">{editing ? `Modifier l'${formLearner}` : `Nouvel ${formLearner}`}</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Prénom *</label>
              <input type="text" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label>
              <input type="text" value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" required />
            </div>
          </div>

          {!editing && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Année académique *</label>
              <select value={form.academic_year_id} onChange={(e) => setForm((f) => ({ ...f, academic_year_id: e.target.value }))} className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" required>
                <option value="">Sélectionner</option>
                {academicYears.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Classe *</label>
              <select
                value={form.class_id}
                onChange={(e) => {
                  const class_id = e.target.value;
                  const higher = isHigherEducationLevel(classes.find((c) => c.id === class_id)?.level);
                  setForm((f) => ({
                    ...f,
                    class_id,
                    room_id: "",
                    order_number: higher ? "" : f.order_number,
                  }));
                }}
                className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                required
              >
                <option value="">Sélectionner</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Salle *</label>
              <select
                value={form.room_id}
                onChange={(e) => setForm((f) => ({ ...f, room_id: e.target.value }))}
                className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                disabled={!form.class_id}
                required
              >
                <option value="">Sélectionner</option>
                {roomsForForm.map((r) => {
                  const full = r.capacity != null && r.student_count >= r.capacity;
                  const isCurrent = editing?.room_id === r.id;
                  return (
                    <option key={r.id} value={r.id} disabled={full && !isCurrent}>
                      {r.name}
                      {r.capacity != null
                        ? ` — ${r.student_count}/${r.capacity}${full && !isCurrent ? " (plein)" : ""}`
                        : ` — ${r.student_count} élève(s)`}
                    </option>
                  );
                })}
              </select>
              {form.class_id && roomsForForm.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  Aucune salle pour cette classe.{" "}
                  <Link href="/dashboard/rooms" className="underline">
                    Créer une salle
                  </Link>
                </p>
              )}
            </div>
          </div>

          {form.class_id && !formHigherEd && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                NISU (interne) {!editing && "*"}
              </label>
              <input
                type="text"
                value={form.order_number}
                onChange={(e) => setForm((f) => ({ ...f, order_number: e.target.value }))}
                placeholder="Code NISU — usage interne uniquement"
                className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 font-mono"
                required={!editing && !formHigherEd}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date de naissance</label>
              <DateInputJJMMAAAA value={form.birth_date} onChange={(birth_date) => setForm((f) => ({ ...f, birth_date }))} className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Lieu de naissance</label>
              <input type="text" value={form.birth_place} onChange={(e) => setForm((f) => ({ ...f, birth_place: e.target.value }))} placeholder="Ville, pays" className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Genre</label>
              <select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))} className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2">
                <option value="">—</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
              <input type="text" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+243..." className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@..." className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Adresse</label>
            <input type="text" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" />
          </div>

          <div className="border-t border-[var(--app-border)] pt-4">
            <h4 className="font-medium text-slate-900 mb-3">Photos d&apos;identité</h4>
            <div className="grid grid-cols-2 gap-6">
              <ImageUpload value={form.photo_identity_student || null} onChange={(url) => setForm((f) => ({ ...f, photo_identity_student: url }))} label="Photo de l&apos;enfant" token={token} previewClassName="w-20 h-20 rounded-lg object-cover border border-slate-200" />
              <ImageUpload value={form.photo_identity_mother || null} onChange={(url) => setForm((f) => ({ ...f, photo_identity_mother: url }))} label="Photo de la mère" token={token} previewClassName="w-20 h-20 rounded-lg object-cover border border-slate-200" />
              <ImageUpload value={form.photo_identity_father || null} onChange={(url) => setForm((f) => ({ ...f, photo_identity_father: url }))} label="Photo du père" token={token} previewClassName="w-20 h-20 rounded-lg object-cover border border-slate-200" />
              <ImageUpload value={form.photo_identity_responsible || null} onChange={(url) => setForm((f) => ({ ...f, photo_identity_responsible: url }))} label="Photo du responsable" token={token} previewClassName="w-20 h-20 rounded-lg object-cover border border-slate-200" />
            </div>
          </div>

          <div className="border-t border-[var(--app-border)] pt-4">
            <h4 className="font-medium text-slate-900 mb-3">Parents / Responsables</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mère</label>
                <input type="text" value={form.mother_name} onChange={(e) => setForm((f) => ({ ...f, mother_name: e.target.value }))} placeholder="Nom" className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 mb-1" />
                <input type="text" value={form.mother_phone} onChange={(e) => setForm((f) => ({ ...f, mother_phone: e.target.value }))} placeholder="Téléphone" className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Père</label>
                <input type="text" value={form.father_name} onChange={(e) => setForm((f) => ({ ...f, father_name: e.target.value }))} placeholder="Nom" className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 mb-1" />
                <input type="text" value={form.father_phone} onChange={(e) => setForm((f) => ({ ...f, father_phone: e.target.value }))} placeholder="Téléphone" className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2" />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Responsable légal (si différent)</label>
              <div className="grid grid-cols-2 gap-4">
                <input type="text" value={form.responsible_name} onChange={(e) => setForm((f) => ({ ...f, responsible_name: e.target.value }))} placeholder="Nom" className="border border-[var(--app-border)] rounded-lg px-3 py-2" />
                <input type="text" value={form.responsible_phone} onChange={(e) => setForm((f) => ({ ...f, responsible_phone: e.target.value }))} placeholder="Téléphone" className="border border-[var(--app-border)] rounded-lg px-3 py-2" />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="app-btn-primary disabled:opacity-60">{saving ? "Enregistrement..." : editing ? "Enregistrer" : "Inscrire"}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); setCreatedOrderNumber(null); }} className="app-btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      {/* Tableau */}
      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-[var(--app-border)]">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-900">Identifiant (n° ministère)</th>
              <th className="px-4 py-3 font-medium text-slate-900">Nom</th>
              <th className="px-4 py-3 font-medium text-slate-900">Classe</th>
              <th className="px-4 py-3 font-medium text-slate-900">Salle</th>
              <th className="px-4 py-3 font-medium text-slate-900">Téléphone</th>
              <th className="px-4 py-3 font-medium text-slate-900">Mère / Père</th>
              <th className="px-4 py-3 font-medium text-slate-900 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Aucun {listLearner}</td></tr>
            ) : (
              students.map((s) => (
                <tr key={s.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono font-semibold text-slate-900">{s.order_number ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.first_name} {s.last_name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.class_name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.room_name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{s.phone ?? s.email ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{[s.mother_name, s.father_name].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="px-4 py-3 flex gap-2 flex-wrap">
                    <button onClick={() => openEdit(s)} className="text-[var(--school-accent-1)] hover:underline text-xs">Modifier</button>
                    <button onClick={() => handleDelete(s.id)} className="text-red-600 hover:underline text-xs">Supprimer</button>
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
