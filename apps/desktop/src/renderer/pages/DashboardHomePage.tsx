import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useSchoolProfile } from "@/context/SchoolProfileContext";
import { API_BASE, getImageUrl, fetchWithAuth } from "@/services/api";
import {
  getNavItemsForRole,
  canSeeSensitiveDashboardStats,
} from "@/lib/dashboardRoles";

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juill.", "août", "sept.", "oct.", "nov.", "déc."];

/** Icônes SVG pour les raccourcis (blanc sur dégradé). */
function ShortcutIcon({ href }: { href: string }) {
  const iconClass = "w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 text-white";
  const stroke = "currentColor";
  if (href.includes("/subjects")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    );
  }
  if (href.includes("/rooms")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /><path d="M9 10h.01M15 10h.01" />
      </svg>
    );
  }
  if (href.includes("/classes")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
        <path d="M3 9l9-4 9 4v10l-9 4-9-4V9z" /><path d="M12 5v14" />
      </svg>
    );
  }
  if (href.includes("/academic-years")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    );
  }
  if (href.includes("/teachers") || href.includes("/users")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (href.includes("/schedule")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
      </svg>
    );
  }
  if (href.includes("/students")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (href.includes("/grades")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    );
  }
  if (href.includes("/discipline")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }
  if (href.includes("/formation-classe")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    );
  }
  if (href.includes("/economat")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M12 12v6" />
      </svg>
    );
  }
  if (href.includes("/depenses")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3" />
      </svg>
    );
  }
  if (href.includes("/moniteur-finance") || href.includes("/stats-financieres") || href.includes("/stats-academiques")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
        <path d="M3 3v18h18" /><path d="M18 9l-5 5-4-4-3 3" />
      </svg>
    );
  }
  if (href.includes("/comptabilite") || href.includes("/banques")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
        <rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 6h6M9 10h6M9 14h4" />
      </svg>
    );
  }
  if (href.includes("/fiche-eleve")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    );
  }
  if (href.includes("/school")) {
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
        <path d="M3 9l9-4 9 4" /><path d="M3 9v10a1 1 0 0 0 1 1h4v-6h8v6h4a1 1 0 0 0 1-1V9" />
      </svg>
    );
  }
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function formatTime(now: Date): string {
  return now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(now: Date): string {
  const day = JOURS[now.getDay()];
  const d = now.getDate();
  const m = MOIS[now.getMonth()];
  const y = now.getFullYear();
  return `${day} ${d} ${m} ${y}`;
}

type DashboardStats = { classesCount: number; studentsCount: number; teachersCount: number };
type CurrentContext = {
  current_academic_year_name: string | null;
  current_period_name: string | null;
};

export function DashboardHomePage() {
  const { school, user, loading, roleName, rolePermissions } = useSchoolProfile();
  const navigate = useNavigate();
  const [now, setNow] = useState<Date>(() => new Date());
  const [context, setContext] = useState<CurrentContext | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [linkedStudentsCount, setLinkedStudentsCount] = useState<number>(0);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchWithAuth(`${API_BASE}/school/current-context`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.current_academic_year_name !== undefined) {
          setContext({
            current_academic_year_name: data.current_academic_year_name ?? null,
            current_period_name: data.current_period_name ?? null,
          });
        }
      })
      .catch(() => setContext(null));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchWithAuth(`${API_BASE}/users/me/linked-students`)
      .then((r) => r.json())
      .then((data) => {
        const list = data?.linked_students ?? [];
        setLinkedStudentsCount(Array.isArray(list) ? list.length : 0);
      })
      .catch(() => setLinkedStudentsCount(0));
  }, [user]);

  useEffect(() => {
    if (!user || !canSeeSensitiveDashboardStats(roleName, rolePermissions)) return;
    fetchWithAuth(`${API_BASE}/school/dashboard-stats`)
      .then((r) => {
        if (!r.ok) {
          setStatsError(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data && typeof data.classesCount === "number") {
          setStats({
            classesCount: data.classesCount,
            studentsCount: data.studentsCount ?? 0,
            teachersCount: data.teachersCount ?? 0,
          });
        }
      })
      .catch(() => setStatsError(true));
  }, [user, roleName, rolePermissions]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-slate-500">Chargement...</div>
      </div>
    );
  }

  const logoUrl = getImageUrl(school?.logo_url ?? undefined);
  const userName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
  const shortcuts = getNavItemsForRole(roleName, rolePermissions);
  const hasLinkedStudents = linkedStudentsCount > 0;
  const otherShortcuts = shortcuts.filter((s) => !s.href.includes("/fiche-eleve"));
  const showStats = canSeeSensitiveDashboardStats(roleName, rolePermissions) && (stats || statsError);

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto">
      {/* Bloc accueil : logo + établissement + message de bienvenue */}
      <div
        className="rounded-2xl border border-[var(--app-border)] bg-white p-8 shadow-sm"
        style={{
          background:
            "linear-gradient(180deg, var(--school-accent-1-pale, #e6f5f4) 0%, #fff 30%)",
        }}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex-shrink-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="h-20 w-20 sm:h-24 sm:w-24 object-contain rounded-xl"
              />
            ) : (
              <div
                className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-xl text-3xl sm:text-4xl font-bold text-white"
                style={{ backgroundColor: "var(--school-accent-1)" }}
              >
                {school?.name?.charAt(0) ?? "É"}
              </div>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 uppercase tracking-tight">
            {school?.name ?? "Shekinah SchoolMatrix"}
          </h1>
          {school?.slogan && (
            <p className="font-script text-slate-700 text-xl sm:text-2xl md:text-3xl">
              {school.slogan}
            </p>
          )}
          <p className="text-slate-700">
            Bienvenue, <span className="font-semibold">{userName}</span>
          </p>
        </div>
      </div>

      {/* Ligne horloge + date + contexte scolaire */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className="rounded-xl border border-[var(--app-border)] bg-white p-5 shadow-sm flex flex-col items-center justify-center"
          style={{ borderLeftWidth: "4px", borderLeftColor: "var(--school-accent-1)" }}
        >
          <span className="text-3xl sm:text-4xl font-mono font-semibold text-slate-800 tabular-nums">
            {formatTime(now)}
          </span>
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">
            Heure
          </span>
        </div>
        <div
          className="rounded-xl border border-[var(--app-border)] bg-white p-5 shadow-sm flex flex-col items-center justify-center"
          style={{ borderLeftWidth: "4px", borderLeftColor: "var(--school-accent-2, var(--school-accent-1))" }}
        >
          <span className="text-base sm:text-lg font-medium text-slate-800 text-center leading-tight">
            {formatDate(now)}
          </span>
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">
            Date
          </span>
        </div>
        <div
          className="rounded-xl border border-[var(--app-border)] bg-white p-5 shadow-sm flex flex-col items-center justify-center min-h-[80px]"
          style={{ borderLeftWidth: "4px", borderLeftColor: "var(--school-accent-1)" }}
        >
          {context?.current_academic_year_name ? (
            <>
              <span className="text-base sm:text-lg font-medium text-slate-800 text-center">
                {context.current_academic_year_name}
              </span>
              {context.current_period_name && (
                <span className="text-sm text-slate-600">{context.current_period_name}</span>
              )}
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">
                Année scolaire
              </span>
            </>
          ) : (
            <span className="text-sm text-slate-500">—</span>
          )}
        </div>
      </div>

      {/* Carte prioritaire : Fiche élève — uniquement pour les utilisateurs qui ont un élève attaché à leur compte */}
      {hasLinkedStudents && (
        <Link
          to="/dashboard/fiche-eleve"
          className="group block rounded-2xl overflow-hidden border-2 border-[var(--school-accent-1)] shadow-lg hover:shadow-xl transition-all"
          style={{
            background: "linear-gradient(145deg, var(--school-accent-1) 0%, var(--school-accent-2, #0d9488) 50%, #0f766e 100%)",
          }}
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-6 p-6 sm:p-8">
            <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-1 group-hover:underline underline-offset-2">
                Fiche élève
              </h2>
              <p className="text-white/90 text-sm sm:text-base">
                {linkedStudentsCount > 1
                  ? "Consulter les dossiers de mes élèves."
                  : "Consulter le dossier de mon élève."}
              </p>
            </div>
            <div className="flex-shrink-0 flex items-center">
              <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/25 text-white group-hover:bg-white/35 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </div>
        </Link>
      )}

      {/* Widgets statistiques (uniquement directeurs / superadmin) */}
      {showStats && (
        <div>
          <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3 text-center">
            Chiffres clés
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {stats ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: "var(--school-accent-1)" }}
                  >
                    {stats.classesCount}
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-slate-900">{stats.classesCount}</p>
                    <p className="text-sm text-slate-600">Classes</p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: "var(--school-accent-1)" }}
                  >
                    {stats.studentsCount}
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-slate-900">{stats.studentsCount}</p>
                    <p className="text-sm text-slate-600">Élèves</p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: "var(--school-accent-1)" }}
                  >
                    {stats.teachersCount}
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-slate-900">{stats.teachersCount}</p>
                    <p className="text-sm text-slate-600">Professeurs</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="sm:col-span-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Indisponible
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bloc des autres raccourcis */}
      {otherShortcuts.length > 0 && (
        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 sm:p-6 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {otherShortcuts.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-all flex items-center gap-5 p-5 min-h-[88px] sm:min-h-[96px] group border border-white/20"
                style={{
                  background: "linear-gradient(135deg, var(--school-accent-1) 0%, var(--school-accent-2, var(--school-accent-1)) 100%)",
                }}
              >
                <div className="flex items-center justify-center text-white">
                  <ShortcutIcon href={item.href} />
                </div>
                <span className="font-semibold text-white text-base sm:text-lg group-hover:underline underline-offset-2">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
