import { LOCAL_API_BASE_URL, PUBLIC_API_BASE_URL } from './public-api';

export type ApiTarget = 'cloud' | 'local';

/**
 * Mobile pointe le cloud par défaut (comme Remote).
 * En DEV sur simulateur, on peut forcer le Nest local via EXPO_PUBLIC_API_TARGET=local
 * ou EXPO_PUBLIC_API_BASE_URL.
 */
export function resolveApiBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (override) return override.replace(/\/$/, '');

  const target = (process.env.EXPO_PUBLIC_API_TARGET?.trim().toLowerCase() ||
    'cloud') as ApiTarget;
  return target === 'local' ? LOCAL_API_BASE_URL : PUBLIC_API_BASE_URL;
}
