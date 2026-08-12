import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import {
  flushMutationQueue,
  getPendingMutationCount,
  isOnline,
} from '../lib/mutationQueue';

type NetworkContextValue = {
  online: boolean;
  pendingCount: number;
  refreshing: boolean;
  refreshStatus: () => Promise<void>;
  flushQueue: () => Promise<{ flushed: number; remaining: number; errors: string[] }>;
};

const NetworkCtx = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const refreshStatus = useCallback(async () => {
    setOnline(await isOnline());
    setPendingCount(await getPendingMutationCount());
  }, []);

  const flushQueue = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await flushMutationQueue();
      setPendingCount(result.remaining);
      setOnline(await isOnline());
      return result;
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();

    const sub = Network.addNetworkStateListener((state) => {
      const next =
        !!state.isConnected && state.isInternetReachable !== false;
      setOnline(next);
      if (next) {
        void flushMutationQueue().then(async (r) => {
          setPendingCount(r.remaining);
        });
      }
    });

    const onAppState = (status: AppStateStatus) => {
      if (status === 'active') {
        void (async () => {
          await refreshStatus();
          if (await isOnline()) {
            const r = await flushMutationQueue();
            setPendingCount(r.remaining);
          }
        })();
      }
    };
    const appSub = AppState.addEventListener('change', onAppState);

    return () => {
      sub.remove();
      appSub.remove();
    };
  }, [refreshStatus]);

  const value = useMemo(
    () => ({ online, pendingCount, refreshing, refreshStatus, flushQueue }),
    [online, pendingCount, refreshing, refreshStatus, flushQueue],
  );

  return <NetworkCtx.Provider value={value}>{children}</NetworkCtx.Provider>;
}

export function useNetwork() {
  const ctx = useContext(NetworkCtx);
  if (!ctx) throw new Error('useNetwork must be used within NetworkProvider');
  return ctx;
}
