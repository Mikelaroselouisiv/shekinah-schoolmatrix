import { useEffect, useMemo, useState } from "react";
import { API_BASE, fetchWithAuth, getImageUrl } from "@/services/api";
import { useSchoolProfile } from "@/context/SchoolProfileContext";
import { ExportBadgePdfButton } from "@/components/ExportBadgePdfButton";
import { ClassConfigModal, type ClassListItem } from "@/components/ClassConfigModal";
import { buildBadgesPdfBlob, fetchStudentsForClassBadges } from "@/lib/badgeProduction";
import { EDUCATION_LEVELS, educationLevelLabel, learnerNoun } from "@/lib/educationLevels";

type Assignment = {
  teacher_id: number;
  teacher_name: string;
  teacher_photo_url?: string | null;
  class_id: string;
};

function TeacherStack({ teachers }: { teachers: { name: string; photo?: string | null }[] }) {
  if (teachers.length === 0) {
    return <p className="text-xs text-slate-400">Aucun professeur</p>;
  }
  return (
    <div className="flex items-center min-w-0">
      <div className="flex -space-x-2">
        {teachers.slice(0, 4).map((t, i) => {
          const src = getImageUrl(t.photo ?? undefined);
          const initials = t.name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase() ?? "")
            .join("");
          return src ? (
            <img
              key={`${t.name}-${i}`}
              src={src}
              alt=""
              title={t.name}
              className="h-8 w-8 rounded-full object-cover border-2 border-white bg-white shadow-sm"
            />
          ) : (
            <div
              key={`${t.name}-${i}`}
              title={t.name}
              className="h-8 w-8 rounded-full border-2 border-white bg-teal-50 text-[10px] font-semibold text-teal-800 flex items-center justify-center shadow-sm"
            >
              {initials || "?"}
            </div>
          );
        })}
      </div>
      {teachers.length > 4 ? (
        <span className="ml-2 shrink-0 text-xs font-medium text-slate-500">+{teachers.length - 4}</span>
      ) : null}
    </div>
  );
}

function StatChip({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "teal" | "amber";
}) {
  const cls =
    tone === "teal"
      ? "bg-teal-50 text-teal-800 ring-1 ring-teal-100"
      : "bg-amber-50 text-amber-900 ring-1 ring-amber-100";
  return (
    <div className={`min-w-0 flex-1 rounded-xl px-3 py-2 ${cls}`}>
      <p className="text-lg font-semibold leading-none">{value}</p>
      <p className="mt-1 text-[11px] font-medium opacity-80 truncate">{label}</p>
    </div>
  );
}

export function DashboardClassesPage() {
  const { school } = useSchoolProfile();
  const [classes, setClasses] = useState<ClassListItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<ClassListItem | "new" | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [classesRes, assignRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/classes`),
        fetchWithAuth(`${API_BASE}/teachers/assignments`),
      ]);
      const classesData = await classesRes.json();
      const assignData = await assignRes.json();
      if (!classesRes.ok) throw new Error(classesData.message || "Erreur");
      setClasses(classesData.classes ?? []);
      setAssignments(assignRes.ok ? assignData.assignments ?? [] : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: string, className: string) {
    if (!confirm(`Supprimer la classe « ${className} » ?`)) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/classes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  const grouped = useMemo(() => {
    const byLevel = new Map<string, ClassListItem[]>();
    for (const c of classes) {
      const key = c.level || "_";
      const list = byLevel.get(key) ?? [];
      list.push(c);
      byLevel.set(key, list);
    }
    const ordered: { key: string; label: string; items: ClassListItem[] }[] = [];
    for (const l of EDUCATION_LEVELS) {
      const items = byLevel.get(l.key);
      if (items?.length) ordered.push({ key: l.key, label: l.label, items });
    }
    const unknown = byLevel.get("_");
    if (unknown?.length) ordered.push({ key: "_", label: "Autres", items: unknown });
    return ordered;
  }, [classes]);

  function teachersForClass(classId: string) {
    const seen = new Set<number>();
    const list: { name: string; photo?: string | null }[] = [];
    for (const a of assignments) {
      if (a.class_id !== classId || seen.has(a.teacher_id)) continue;
      seen.add(a.teacher_id);
      list.push({ name: a.teacher_name, photo: a.teacher_photo_url });
    }
    return list;
  }

  if (loading) return <div className="animate-pulse text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">Organisation</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Classes</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Une carte par classe. Ouvrez-la pour régler matières, salles, professeurs et élèves.
          </p>
        </div>
        <button onClick={() => setPanel("new")} className="app-btn-primary shadow-sm">
          Ajouter une classe
        </button>
      </div>

      {error ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">{error}</div> : null}

      {classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
          <p className="text-slate-700 font-medium">Aucune classe pour le moment</p>
          <p className="mt-1 text-sm text-slate-500">Créez la première pour ouvrir le panneau de configuration.</p>
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.key} className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {group.label}
              </h3>
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">
                {group.items.length} classe{group.items.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((c) => {
                const teachers = teachersForClass(c.id);
                const rooms = c.room_count ?? 0;
                const students = c.student_count ?? 0;
                return (
                  <article
                    key={c.id}
                    className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
                  >
                    <button type="button" onClick={() => setPanel(c)} className="w-full text-left">
                      <div className="flex">
                        <span className="w-1.5 shrink-0 bg-[var(--school-accent-1)]" />
                        <div className="min-w-0 flex-1 p-4 pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 title={c.name} className="truncate text-base font-bold text-slate-900">
                                {c.name}
                              </h4>
                              <p className="mt-0.5 text-xs text-slate-500">{educationLevelLabel(c.level)}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <StatChip value={rooms} label={rooms > 1 ? "salles" : "salle"} tone="teal" />
                            <StatChip
                              value={students}
                              label={learnerNoun(c.level, students !== 1)}
                              tone="amber"
                            />
                          </div>
                          <div className="mt-3 rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100">
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800">
                              Professeurs
                            </p>
                            <TeacherStack teachers={teachers} />
                          </div>
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 border-t border-slate-100 bg-slate-50/80 px-3 py-2">
                      <ExportBadgePdfButton
                        label="Badges"
                        filename={`badges-${c.name}`}
                        disabled={!c.student_count}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-teal-800 hover:bg-white disabled:opacity-40"
                        getBlob={async () => {
                          const studentsList = await fetchStudentsForClassBadges(c.id);
                          return buildBadgesPdfBlob({ school, students: studentsList });
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setPanel(c)}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-white"
                      >
                        Configurer
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id, c.name)}
                        className="ml-auto rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-white"
                      >
                        Supprimer
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}

      {panel ? (
        <ClassConfigModal
          initial={panel}
          onClose={() => setPanel(null)}
          onSaved={() => load()}
        />
      ) : null}
    </div>
  );
}
