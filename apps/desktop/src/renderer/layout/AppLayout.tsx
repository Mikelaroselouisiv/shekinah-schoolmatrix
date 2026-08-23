import { useEffect } from 'react';
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
  if (permissionKey === 'stats-academiques') {
    return rolePermissions.includes('stats-academiques');
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

function NavItemLink({ href, label, strong = false }: { href: string; label: string; strong?: boolean }) {
  return (
    <NavLink
      to={href}
      className={({ isActive }) =>
        `
        relative px-3 py-3.5 text-sm whitespace-nowrap transition-all duration-200
        ${strong ? 'font-semibold px-4 rounded-lg' : 'font-medium'}
        ${isActive ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'}
        ${strong && isActive ? 'bg-slate-100' : ''}
        ${strong && !isActive ? 'text-slate-700 hover:bg-slate-50' : ''}
      `
      }
    >
      {({ isActive }) => (
        <>
          {label}
          {isActive && (
            <span
              className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
              style={{ backgroundColor: 'var(--school-accent-1)' }}
            />
          )}
        </>
      )}
    </NavLink>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
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

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--app-bg-gradient)' }}>
      <header
        className="app-shell-header border-b border-[var(--app-border)] shadow-sm"
        style={{ background: 'var(--app-bg-gradient)' }}
      >
        <div className="app-container flex items-center justify-between gap-4 py-4">
          <Link
            to="/dashboard"
            className="flex items-center gap-5 hover:opacity-90 transition-opacity min-w-0"
            aria-label="Retour à l'accueil"
          >
            <div className="app-header-logo flex-shrink-0">
              {getImageUrl(school?.logo_url ?? undefined) ? (
                <img
                  src={getImageUrl(school?.logo_url ?? undefined)!}
                  alt=""
                  className="h-20 w-20 sm:h-24 sm:w-24 object-contain"
                />
              ) : (
                <div className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-xl text-3xl sm:text-4xl font-bold text-slate-500 bg-slate-100/80">
                  {school?.name?.charAt(0) ?? 'É'}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 uppercase truncate">
                {school?.name ?? 'Shekinah SchoolMatrix'}
              </h1>
            </div>
          </Link>
          <div className="flex items-center gap-3 flex-shrink-0">
            <AppUpdateControls variant="header" />
            {user ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden flex-shrink-0 border-2 border-slate-200 bg-slate-100 flex items-center justify-center">
                    {getImageUrl(user.profile_photo_url ?? undefined) ? (
                      <img
                        src={getImageUrl(user.profile_photo_url ?? undefined)!}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-lg sm:text-xl font-semibold text-slate-500">
                        {(user.first_name?.trim() || user.last_name?.trim() || '?')
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-slate-900 leading-tight mt-1.5 whitespace-nowrap max-w-[140px] sm:max-w-[180px] truncate">
                    {[
                      user.first_name?.trim() || '—',
                      (user.last_name?.trim() || '—').toUpperCase(),
                    ].join(' ')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    navigate('/login', { replace: true });
                  }}
                  className="text-xs py-1.5 px-2.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                >
                  Déconnexion
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <nav className="app-shell-nav border-b border-[var(--app-border)] bg-[var(--app-surface)]">
        <div className="app-container flex items-stretch gap-0">
          <div className="flex gap-0.5 overflow-x-auto scrollbar-thin py-0 min-w-0 flex-1">
            {config.map((item) => (
              <NavItemLink key={item.href} href={item.href} label={item.label} />
            ))}
            {config.length > 0 && management.length > 0 && (
              <span className="flex-shrink-0 w-px self-center h-5 bg-slate-200 mx-1" aria-hidden />
            )}
            {management.map((item) => (
              <NavItemLink key={item.href} href={item.href} label={item.label} />
            ))}
            {finance.length > 0 && (
              <>
                <span className="flex-shrink-0 w-px self-center h-5 bg-slate-200 mx-1" aria-hidden />
                {finance.map((item) => (
                  <NavItemLink key={item.href} href={item.href} label={item.label} />
                ))}
              </>
            )}
            {statistics.length > 0 && (
              <>
                <span className="flex-shrink-0 w-px self-center h-5 bg-slate-200 mx-1" aria-hidden />
                {statistics.map((item) => (
                  <NavItemLink key={item.href} href={item.href} label={item.label} />
                ))}
              </>
            )}
            {(config.length > 0 ||
              management.length > 0 ||
              finance.length > 0 ||
              statistics.length > 0) &&
              fiche.length > 0 && (
                <span className="flex-shrink-0 w-px self-center h-5 bg-slate-200 mx-1" aria-hidden />
              )}
            {fiche.map((item) => (
              <NavItemLink key={item.href} href={item.href} label={item.label} strong />
            ))}
          </div>
          {special.length > 0 && (
            <div
              className="flex items-center gap-1 border-l-2 border-[var(--app-border)] pl-4 ml-2 flex-shrink-0 bg-slate-50/80 rounded-r-lg pr-2"
              style={{ borderLeftColor: 'var(--school-accent-1)' }}
            >
              {special.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={({ isActive }) =>
                    `
                      relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-all duration-200 rounded-lg
                      ${isActive ? 'text-slate-900 bg-white shadow-sm' : 'text-slate-700 hover:text-slate-900 hover:bg-white/80'}
                    `
                  }
                >
                  {({ isActive }) => (
                    <>
                      {item.label}
                      {isActive && (
                        <span
                          className="absolute bottom-1.5 left-2 right-2 h-0.5 rounded-full"
                          style={{ backgroundColor: 'var(--school-accent-1)' }}
                        />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </nav>

      {segments.length > 0 && (
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

      <main className="flex-1 app-container py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
