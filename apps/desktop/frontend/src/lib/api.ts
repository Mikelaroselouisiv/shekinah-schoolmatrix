declare global {
  interface Window {
    schoolmatrixDesktop?: {
      edition: "server" | "remote";
      apiBase: string;
      fetchMedia?: (
        url: string,
      ) => Promise<{ base64: string; contentType: string } | null>;
    };
  }
}

function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    const desktop = window.schoolmatrixDesktop?.apiBase?.replace(/\/$/, "");
    if (desktop) return desktop;
    return "/api";
  }
  return (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://schoolmatrix-api:3000"
  );
}

const API_BASE = resolveApiBase();

const GCS_PUBLIC_UPLOADS =
  "https://storage.googleapis.com/shekinah-schoolmatrix-assets/schoolmatrix/uploads";

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
 * URL d’image : préfère l’API (`/uploads/…`) pour le dev local et le proxy Nest.
 */
function getImageUrl(storedUrl: string | null | undefined): string | null {
  if (!storedUrl || !storedUrl.trim()) return null;
  const trimmed = storedUrl.trim();
  const filename = extractUploadFilename(trimmed);
  const desktopBase =
    typeof window !== "undefined"
      ? window.schoolmatrixDesktop?.apiBase?.replace(/\/$/, "")
      : "";
  const base = desktopBase || (typeof window !== "undefined" ? "" : "");
  if (filename && desktopBase) {
    return `${desktopBase}/uploads/${encodeURIComponent(filename)}`;
  }
  if (filename && typeof window !== "undefined" && !desktopBase) {
    return `/api/uploads/${encodeURIComponent(filename)}`;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (filename) return `${GCS_PUBLIC_UPLOADS}/${filename}`;
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (base) {
    const uploadPath = path.startsWith("/uploads")
      ? path
      : path.startsWith("/api/")
        ? path.slice(4)
        : `/uploads${path.startsWith("/") ? path : `/${path}`}`;
    return `${base}${uploadPath.startsWith("/") ? uploadPath : `/${uploadPath}`}`;
  }
  return `/api${path}`;
}

/** Fetch avec token Bearer si disponible. */
async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...options, headers });
}

export { API_BASE, getImageUrl, fetchWithAuth, resolveApiBase };
