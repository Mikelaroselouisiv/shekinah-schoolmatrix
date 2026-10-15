import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSchoolProfileOptional } from '../context/SchoolProfileContext';
import { getImageUrl } from '../services/api';
import { getBreadcrumbSegments } from '../lib/breadcrumb';
import {
  DASHBOARD_NAV,
  canAccessPath,
  canAccessSchoolProfile,
  isTeacherRole,
  SCHOOL_NAV,
  USERS_NAV,
  ROLES_FULL,
} from '../lib/dashboardRoles';
import { AppUpdateControls } from '../components/AppUpdateControls';

function canSeeNavItem(roleName: string, allowedRoles: string[]): boolean {
  if (allowedRoles.length === 0) return true;
  return allowedRoles.includes(roleName);
}

function canSeeByPermissions(permissionKey: string, rolePermissions: string[]): boolean {
  if (rolePermissions.includes('full_access')) return true;
  if (permissionKey === 'dashboard') return true;
  if (permissionKey === 'finance' || permissionKey === 'stats-financieres') {
    return (
      rolePermissions.includes('finance') ||
      rolePermissions.includes('economat') ||
      rolePermissions.includes('stats-financieres')
    );
  }
  if (permissionKey === 'rooms') return rolePermissions.includes('rooms') || rolePermissions.includes('classes');
  if (permissionKey === 'classes') {
    return (
      rolePermissions.includes('classes') ||
      rolePermissions.includes('rooms') ||
      rolePermissions.includes('teachers')
    );
  }
  if (permissionKey === 'stats-academiques') {
    return rolePermissions.includes('stats-academiques');
  }
  if (permissionKey === 'teacher-hub') {
    return rolePermissions.includes('teacher-hub') || rolePermissions.includes('grades');
  }
  return rolePermissions.includes(permissionKey);
}

function getNavItemsByBlock(roleName: string, rolePermissions: string[]) {
  const usePermissions = rolePermissions.length > 0;
  const config: (typeof DASHBOARD_NAV)[0][] = [];
  const management: (typeof DASHBOARD_NAV)[0][] = [];
  const finance: (typeof DASHBOARD_NAV)[0][] = [];
  const statistics: (typeof DASHBOARD_NAV)[0][] = [];
  const fiche: (typeof DASHBOARD_NAV)[0][] = [];

  for (const item of DASHBOARD_NAV) {
    if (item.href === '/dashboard') continue;
    const canSee =
      item.permissionKey === 'stats-academiques' && isTeacherRole(roleName)
        ? true
        : item.permissionKey === 'teacher-hub' && isTeacherRole(roleName)
          ? true
          : usePermissions
          ? canSeeByPermissions(item.permissionKey, rolePermissions)
          : canSeeNavItem(roleName, item.allowedRoles);
    if (!canSee) continue;
    if (item.block === 'configuration') config.push(item);
    else if (item.block === 'management') management.push(item);
    else if (item.block === 'finance') finance.push(item);
    else if (item.block === 'statistics') statistics.push(item);
    else if (item.block === 'fiche') fiche.push(item);
  }

  const special: { href: string; label: string }[] = [];
  const canSeeUsers = usePermissions
    ? canSeeByPermissions('users', rolePermissions)
    : ROLES_FULL.includes(roleName);
  const canSeeSchool = usePermissions
    ? canSeeByPermissions('school', rolePermissions)
    : canAccessSchoolProfile(roleName);
  if (canSeeUsers) special.push(USERS_NAV);
  if (canSeeSchool) special.push(SCHOOL_NAV);

  return { config, management, finance, statistics, fiche, special };
}

const MENU_GROUPS: { key: string; label: string }[] = [
  { key: 'config', label: 'Organisation' },
  { key: 'management', label: 'Vie scolaire' },
  { key: 'finance', label: 'Finance' },
  { key: 'statistics', label: 'Statistiques' },
  { key: 'fiche', label: 'Élèves' },
  { key: 'special', label: 'Administration' },
];

export function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const ctx = useSchoolProfileOptional();
  const school = ctx?.school ?? null;
  const user = ctx?.user ?? null;
  const roleName = ctx?.roleName ?? '';
  const rolePermissions = ctx?.rolePermissions ?? [];
  // HashRouter pathname is without hash prefix
  const pathForBreadcrumb = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const segments = getBreadcrumbSegments(pathForBreadcrumb);

  const { config, management, finance, statistics, fiche, special } = getNavItemsByBlock(
    roleName,
    rolePermissions,
  );

  useEffect(() => {
    if (ctx?.loading || !roleName) return;
    if (
      !canAccessPath(
        roleName,
        pathname,
        rolePermissions.length > 0 ? rolePermissions : undefined,
      )
    ) {
      navigate('/dashboard?message=access_denied', { replace: true });
    }
  }, [ctx?.loading, roleName, pathname, rolePermissions, navigate]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const groups: { key: string; items: { href: string; label: string }[] }[] = [
    { key: 'config', items: config },
    { key: 'management', items: management },
    { key: 'finance', items: finance },
    { key: 'statistics', items: statistics },
    { key: 'fiche', items: fiche },
    { key: 'special', items: special },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--app-bg-gradient)' }}>
      <header
        className="app-shell-header border-b border-[var(--app-border)] shadow-sm"
        style={{ background: 'var(--app-bg-gradient)' }}
      >
        <div className="app-container flex items-center gap-3 py-2.5">
          <button
            type="button"
            className="app-menu-btn"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <Link
            to="/dashboard"
            className="flex items-center gap-3 hover:opacity-90 transition-opacity min-w-0"
            aria-label="Accueil"
          >
            <div className="flex-shrink-0">
              {getImageUrl(school?.logo_url ?? undefined) ? (
                <img
                  src={getImageUrl(school?.logo_url ?? undefined)!}
                  alt=""
                  className="h-9 w-9 object-contain"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-slate-500 bg-slate-100">
                  {school?.name?.charAt(0) ?? 'É'}
                </div>
              )}
            </div>
            <h1 className="text-base font-semibold tracking-tight text-slate-900 truncate">
              {school?.name ?? 'Shekinah SchoolMatrix'}
            </h1>
          </Link>
          <div className="ml-auto flex items-center gap-3 flex-shrink-0">
            <AppUpdateControls variant="header" />
            {user ? (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border border-slate-200 bg-slate-100 flex items-center justify-center">
                  {getImageUrl(user.profile_photo_url ?? undefined) ? (
                    <img
                      src={getImageUrl(user.profile_photo_url ?? undefined)!}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-slate-500">
                      {(user.first_name?.trim() || user.last_name?.trim() || '?')
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="hidden sm:block text-sm font-medium text-slate-900 whitespace-nowrap max-w-[11rem] truncate">
                  {[
                    user.first_name?.trim() || '—',
                    (user.last_name?.trim() || '—').toUpperCase(),
                  ].join(' ')}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    navigate('/login', { replace: true });
                  }}
                  className="text-xs py-1.5 px-2.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                >
                  Déconnexion
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="app-menu-back" onClick={() => setMenuOpen(false)}>
          <nav
            className="app-menu"
            aria-label="Menu"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="app-menu-head">
              <p className="app-menu-title">Menu</p>
              <button
                type="button"
                className="app-menu-close"
                aria-label="Fermer"
                onClick={() => setMenuOpen(false)}
              >
                Fermer
              </button>
            </div>
            <NavLink
              to="/dashboard"
              end
              className={({ isActive }) => `app-menu-link${isActive ? ' is-on' : ''}`}
            >
              Accueil
            </NavLink>
            {groups.map((group) =>
              group.items.length === 0 ? null : (
                <div key={group.key} className="app-menu-group">
                  <p className="app-menu-label">
                    {MENU_GROUPS.find((item) => item.key === group.key)?.label}
                  </p>
                  {group.items.map((item) => (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      className={({ isActive }) => `app-menu-link${isActive ? ' is-on' : ''}`}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              ),
            )}
          </nav>
        </div>
      )}

      {segments.length > 1 && (
        <div className="app-breadcrumb border-b border-[var(--app-border)] bg-[var(--app-surface)]/80">
          <div className="app-container py-2.5">
            <ol className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
              {segments.map((seg, i) => (
                <li key={seg.href} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span className="text-slate-400 select-none" aria-hidden>
                      /
                    </span>
                  )}
                  {i === segments.length - 1 ? (
                    <span className="font-medium text-slate-900">{seg.label}</span>
                  ) : (
                    <Link to={seg.href} className="hover:text-slate-900 transition-colors">
                      {seg.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      <main className="flex-1 app-container py-5">
        <Outlet />
      </main>
    </div>
  );
}
