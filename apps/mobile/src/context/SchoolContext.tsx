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
  getCurrentContext,
  getSchoolHome,
  type SchoolContext,
  type SchoolHome,
} from '../services/api';
import {
  cacheSchoolContext,
  cacheSchoolHome,
  readCachedSchoolContext,
  readCachedSchoolHome,
} from '../lib/offlineCache';
import { isOnline } from '../lib/mutationQueue';
import { buildTheme, type SchoolTheme } from '../theme/tokens';
import { useAuth } from './AuthContext';

type SchoolContextValue = {
  home: SchoolHome | null;
  context: SchoolContext | null;
  theme: SchoolTheme;
  loading: boolean;
  fromCache: boolean;
  refetch: () => Promise<void>;
};

const SchoolCtx = createContext<SchoolContextValue | null>(null);

export function SchoolProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [home, setHome] = useState<SchoolHome | null>(null);
  const [context, setContext] = useState<SchoolContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);

  const loadFromCache = useCallback(async () => {
    const [h, c] = await Promise.all([
      readCachedSchoolHome(),
      user ? readCachedSchoolContext() : Promise.resolve(null),
    ]);
    setHome(h);
    setContext(c);
    setFromCache(!!(h || c));
  }, [user]);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      if (!(await isOnline())) {
        await loadFromCache();
        return;
      }
      const [h, c] = await Promise.all([
        getSchoolHome(),
        user ? getCurrentContext() : Promise.resolve(null),
      ]);
      setHome(h);
      setContext(c);
      setFromCache(false);
      await Promise.all([cacheSchoolHome(h), cacheSchoolContext(c)]);
    } catch {
      await loadFromCache();
    } finally {
      setLoading(false);
    }
  }, [user, loadFromCache]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const theme = useMemo(
    () =>
      buildTheme(
        context?.school?.primary_color || home?.primary_color,
        context?.school?.secondary_color || home?.secondary_color,
      ),
    [context, home],
  );

  const value = useMemo(
    () => ({ home, context, theme, loading, fromCache, refetch }),
    [home, context, theme, loading, fromCache, refetch],
  );

  return <SchoolCtx.Provider value={value}>{children}</SchoolCtx.Provider>;
}

export function useSchool() {
  const ctx = useContext(SchoolCtx);
  if (!ctx) throw new Error('useSchool must be used within SchoolProvider');
  return ctx;
}
