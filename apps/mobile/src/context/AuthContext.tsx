import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getLinkedStudents,
  getMe,
  getRoleName,
  getToken,
  hydrateToken,
  login as apiLogin,
  logout as apiLogout,
  setUnauthorizedHandler,
  type LinkedStudent,
  type SessionUser,
} from '../services/api';

type AuthContextValue = {
  user: SessionUser | null;
  roleName: string;
  rolePermissions: string[];
  /** Enfants / élèves liés au compte (parent ou staff aussi parent). */
  linkedStudents: LinkedStudent[];
  hasLinkedChildren: boolean;
  loading: boolean;
  login: (loginOrEmail: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshLinkedStudents: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [linkedStudents, setLinkedStudents] = useState<LinkedStudent[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshLinkedStudents = useCallback(async () => {
    if (!getToken()) {
      setLinkedStudents([]);
      return;
    }
    try {
      setLinkedStudents(await getLinkedStudents());
    } catch {
      setLinkedStudents([]);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLinkedStudents([]);
      return;
    }
    const u = await getMe();
    setUser(u);
    await refreshLinkedStudents();
  }, [refreshLinkedStudents]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await hydrateToken();
      if (!getToken()) {
        if (!cancelled) {
          setUser(null);
          setLinkedStudents([]);
          setLoading(false);
        }
        return;
      }
      try {
        const u = await getMe();
        if (!cancelled) setUser(u);
        if (!cancelled) {
          try {
            setLinkedStudents(await getLinkedStudents());
          } catch {
            setLinkedStudents([]);
          }
        }
      } catch {
        await apiLogout();
        if (!cancelled) {
          setUser(null);
          setLinkedStudents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setLinkedStudents([]);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(
    async (loginOrEmail: string, password: string, rememberMe = false) => {
      const res = await apiLogin(loginOrEmail, password, rememberMe);
      try {
        const u = await getMe();
        setUser(u ?? res.user ?? null);
      } catch {
        setUser(res.user ?? null);
      }
      try {
        setLinkedStudents(await getLinkedStudents());
      } catch {
        setLinkedStudents([]);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setLinkedStudents([]);
    try {
      const [{ clearOfflineCaches }, { clearMutationQueue }] = await Promise.all([
        import('../lib/offlineCache'),
        import('../lib/mutationQueue'),
      ]);
      await Promise.all([clearOfflineCaches(), clearMutationQueue()]);
    } catch {
      // ignore
    }
  }, []);

  const roleName = getRoleName(user);
  const rolePermissions = user?.role_permissions ?? [];
  const hasLinkedChildren = linkedStudents.length > 0;

  const value = useMemo(
    () => ({
      user,
      roleName,
      rolePermissions,
      linkedStudents,
      hasLinkedChildren,
      loading,
      login,
      logout,
      refreshUser,
      refreshLinkedStudents,
    }),
    [
      user,
      roleName,
      rolePermissions,
      linkedStudents,
      hasLinkedChildren,
      loading,
      login,
      logout,
      refreshUser,
      refreshLinkedStudents,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
