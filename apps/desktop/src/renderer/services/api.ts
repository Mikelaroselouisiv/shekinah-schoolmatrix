import axios, { type AxiosRequestConfig } from 'axios';
import { resolveApiBaseUrl } from '../config/resolve-api-base-url';

const TOKEN_KEY = 'token';

export type SessionUser = {
  id?: number;
  userId?: number;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  profile_photo_url?: string | null;
  role?: { name: string } | string;
  role_permissions?: string[];
};

export type LoginResponse = {
  access_token: string;
  user?: SessionUser;
  message?: string;
};

const api = axios.create();
let apiBaseUrl = '';
let apiInitPromise: Promise<string> | null = null;

/** Alias pour les pages portées depuis Next — rempli après initApi(). */
export let API_BASE = '';

/** Résout l’URL selon l’édition (server / remote) avant le premier appel API. */
export function initApi(): Promise<string> {
  if (apiBaseUrl) {
    API_BASE = apiBaseUrl;
    return Promise.resolve(apiBaseUrl);
  }
  if (!apiInitPromise) {
    apiInitPromise = resolveApiBaseUrl().then((url) => {
      apiBaseUrl = url;
      API_BASE = url;
      api.defaults.baseURL = url;
      return url;
    });
  }
  return apiInitPromise;
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

api.interceptors.request.use((config) => {
  const token = readToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return readToken();
}

export function writeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function login(
  loginOrEmail: string,
  password: string,
  rememberMe = false,
): Promise<LoginResponse> {
  await initApi();
  try {
    const { data } = await api.post<LoginResponse>('/auth/login', {
      login: loginOrEmail.trim() || undefined,
      email: loginOrEmail.trim() || undefined,
      password,
      remember_me: rememberMe,
    });
    if (!data.access_token) {
      throw new Error(data.message || 'Réponse serveur invalide');
    }
    writeToken(data.access_token);
    return data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const message =
        (err.response?.data as { message?: string } | undefined)?.message ||
        err.message ||
        'Identifiants invalides';
      throw new Error(message);
    }
    throw err;
  }
}

export function logout(): void {
  clearToken();
}

export async function getMe(): Promise<SessionUser | null> {
  await initApi();
  const { data } = await api.get<{ user?: SessionUser } | SessionUser>('/users/me');
  if (data && typeof data === 'object' && 'user' in data) {
    return (data as { user?: SessionUser }).user ?? null;
  }
  return (data as SessionUser) ?? null;
}

/** Bucket / préfixe GCS SchoolMatrix — même règle que le backend (media-url.ts). */
const GCS_PUBLIC_UPLOADS =
  'https://storage.googleapis.com/shekinah-schoolmatrix-assets/schoolmatrix/uploads';

function extractUploadFilename(stored: string): string | null {
  const s = stored.trim();
  if (!s) return null;
  const rel = s.match(/^(?:\/)?uploads\/([^/?#]+)$/i);
  if (rel) return rel[1];
  const gcs = s.match(
    /storage\.googleapis\.com\/[^/]+\/[^/]+\/uploads\/([^/?#]+)(?:\?|#|$)/i,
  );
  return gcs ? gcs[1] : null;
}

/**
 * URL d’image pour l’UI.
 * Préfère l’API locale (`/uploads/…`) : en dev le fichier est sur disque ;
 * en prod le proxy Nest sert le local ou GCS. Évite les aperçus cassés
 * quand GCS pointe vers un objet inexistant en local.
 */
export function getImageUrl(storedUrl: string | null | undefined): string | null {
  if (!storedUrl || !storedUrl.trim()) return null;
  const trimmed = storedUrl.trim();
  const base = (apiBaseUrl || window.schoolmatrixDesktop?.apiBase || API_BASE || '').replace(
    /\/$/,
    '',
  );
  const filename = extractUploadFilename(trimmed);
  if (filename && base) {
    return `${base}/uploads/${encodeURIComponent(filename)}`;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (filename) return `${GCS_PUBLIC_UPLOADS}/${filename}`;

  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (!base) return path;
  const uploadPath = path.startsWith('/uploads')
    ? path
    : path.startsWith('/api/')
      ? path.slice(4)
      : `/uploads${path.startsWith('/') ? path : `/${path}`}`;
  return `${base}${uploadPath.startsWith('/') ? uploadPath : `/${uploadPath}`}`;
}

/** Fetch avec token Bearer (compat pages portées depuis Next). */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  await initApi();
  const token = readToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const absolute =
    url.startsWith('http://') || url.startsWith('https://')
      ? url
      : `${apiBaseUrl.replace(/\/$/, '')}${url.startsWith('/') ? url : `/${url}`}`;
  return fetch(absolute, { ...options, headers });
}

export async function apiGet<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  await initApi();
  const { data } = await api.get<T>(path, config);
  return data;
}

export async function apiPost<T>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  await initApi();
  const { data } = await api.post<T>(path, body, config);
  return data;
}

export async function apiPut<T>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  await initApi();
  const { data } = await api.put<T>(path, body, config);
  return data;
}

export async function apiPatch<T>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  await initApi();
  const { data } = await api.patch<T>(path, body, config);
  return data;
}

export async function apiDelete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  await initApi();
  const { data } = await api.delete<T>(path, config);
  return data;
}
