import { useState, useEffect } from "react";
import { API_BASE, fetchWithAuth, getImageUrl } from "@/services/api";
import { ImageUpload } from "@/components/ImageUpload";

type ClassItem = { id: string; name: string };
type RoomItem = {
  id: string;
  name: string;
  class_id: string | null;
};
type Student = {
  id: string;
  first_name: string;
  last_name: string;
  order_number: string | null;
  student_code: string | null;
  class_id: string | null;
  class_name: string | null;
  room_id: string | null;
  room_name: string | null;
  photo_identity_student: string | null;
};

type Photo = {
  id: string;
  kind: string;
  label: string | null;
  url: string;
};

const PHOTO_KINDS: { value: string; label: string }[] = [
  { value: "profile", label: "Photo de profil" },
  { value: "identity", label: "Photo d'identité" },
  { value: "souvenir", label: "Photo souvenir" },
  { value: "promotion", label: "Photo de promotion" },
  { value: "other", label: "Autre" },
];

export function DashboardPhotographyPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classFilter, setClassFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [selected, setSelected] = useState<Student | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [kind, setKind] = useState("profile");
  const [uploadUrl, setUploadUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  async function loadRefs() {
    const [cRes, rRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/classes`),
      fetchWithAuth(`${API_BASE}/rooms`),
    ]);
    const cData = await cRes.json();
    const rData = await rRes.json();
    setClasses(cData.classes ?? []);
    setRooms(rData.rooms ?? []);
  }

  async function loadStudents() {
    setError("");
    try {
      const qs = new URLSearchParams();
      if (classFilter) qs.set("class_id", classFilter);
      if (roomFilter) qs.set("room_id", roomFilter);
      const res = await fetchWithAuth(`${API_BASE}/students?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setStudents(data.students ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function loadPhotos(studentId: string) {
    const res = await fetchWithAuth(`${API_BASE}/students/${studentId}/photos`);
    const data = await res.json();
    setPhotos(data.photos ?? []);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadRefs();
      await loadStudents();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!loading) void loadStudents();
  }, [classFilter, roomFilter]);

  useEffect(() => {
    if (selected) void loadPhotos(selected.id);
    else setPhotos([]);
  }, [selected?.id]);

  const filtered = students.filter((s) => {
    if (!nameQuery.trim()) return true;
    const q = nameQuery.trim().toLowerCase();
    const full = `${s.first_name} ${s.last_name} ${s.student_code ?? ""} ${s.order_number ?? ""}`.toLowerCase();
    return full.includes(q);
  });

  const roomsForFilter = classFilter
    ? rooms.filter((r) => r.class_id === classFilter)
    : rooms;

  async function handleSavePhoto() {
    if (!selected || !uploadUrl) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/students/${selected.id}/photos`, {
        method: "POST",
        body: JSON.stringify({ kind, url: uploadUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setUploadUrl("");
      await loadPhotos(selected.id);
      await loadStudents();
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              photo_identity_student:
                kind === "profile" || kind === "identity"
                  ? uploadUrl
                  : prev.photo_identity_student,
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!selected || !confirm("Supprimer cette photo ?")) return;
    await fetchWithAuth(`${API_BASE}/students/${selected.id}/photos/${photoId}`, {
      method: "DELETE",
    });
    await loadPhotos(selected.id);
  }

  if (loading) return <div className="animate-pulse text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Photographie</h2>

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Classe</label>
          <select
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value);
              setRoomFilter("");
              setSelected(null);
            }}
            className="text-sm border border-[var(--app-border)] rounded px-2 py-1.5"
          >
            <option value="">Toutes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Salle</label>
          <select
            value={roomFilter}
            onChange={(e) => {
              setRoomFilter(e.target.value);
              setSelected(null);
            }}
            className="text-sm border border-[var(--app-border)] rounded px-2 py-1.5"
            disabled={!classFilter}
          >
            <option value="">Toutes</option>
            {roomsForFilter.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-slate-500 mb-0.5">Nom / code école</label>
          <input
            type="text"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            className="w-full text-sm border border-[var(--app-border)] rounded px-2 py-1.5"
            placeholder="Rechercher…"
          />
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-[var(--app-border)] overflow-hidden max-h-[70vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-500">Aucun élève</div>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelected(s)}
                className={`w-full text-left px-4 py-3 border-b border-[var(--app-border)] last:border-b-0 hover:bg-slate-50 flex items-center gap-3 ${
                  selected?.id === s.id ? "bg-slate-50 border-l-4 border-l-[var(--school-accent-1)]" : ""
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">
                  {getImageUrl(s.photo_identity_student) ? (
                    <img src={getImageUrl(s.photo_identity_student)!} alt="" className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div>
                  <div className="font-medium text-slate-900">
                    {s.last_name} {s.first_name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {[s.class_name, s.room_name, s.student_code].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </button>
            ))
          )}
        </section>

        <section className="space-y-4">
          {!selected ? (
            <p className="text-slate-500 text-sm">Sélectionnez un élève pour ajouter des photos.</p>
          ) : (
            <>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {selected.last_name} {selected.first_name}
                </h3>
                <p className="text-sm text-slate-500">
                  {[selected.class_name, selected.room_name].filter(Boolean).join(" · ")}
                </p>
              </div>

              <div className="p-4 rounded-xl border border-[var(--app-border)] bg-white space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                    className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
                  >
                    {PHOTO_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>{k.label}</option>
                    ))}
                  </select>
                </div>
                <ImageUpload
                  value={uploadUrl || null}
                  onChange={setUploadUrl}
                  label="Nouvelle photo"
                  token={token}
                  crop="square"
                />
                <button
                  type="button"
                  onClick={handleSavePhoto}
                  disabled={!uploadUrl || saving}
                  className="app-btn-primary text-sm py-2 disabled:opacity-60"
                >
                  {saving ? "Enregistrement…" : "Enregistrer la photo"}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((p) => (
                  <div key={p.id} className="rounded-lg border border-[var(--app-border)] overflow-hidden bg-white">
                    <div className="aspect-square bg-slate-100">
                      {getImageUrl(p.url) && (
                        <img src={getImageUrl(p.url)!} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="p-2 flex items-center justify-between gap-1">
                      <span className="text-xs text-slate-600 truncate">
                        {PHOTO_KINDS.find((k) => k.value === p.kind)?.label ?? p.kind}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeletePhoto(p.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
