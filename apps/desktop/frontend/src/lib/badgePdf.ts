/**
 * Badges élèves format PVC (CR80 / ISO ID-1) — une page par élève.
 */
import { jsPDF } from "jspdf";

/** Dimensions carte PVC standard (mm), paysage. */
export const BADGE_W_MM = 85.6;
export const BADGE_H_MM = 54;

export type BadgeSchoolInfo = {
  name: string;
  slogan?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  primary_color?: string;
  secondary_color?: string;
};

export type BadgeStudentInfo = {
  first_name: string;
  last_name: string;
  /** Code de gestion public (jamais le NISU). */
  management_code?: string | null;
  /** @deprecated Ne pas utiliser sur le badge — conservé pour compat. */
  order_number?: string | null;
  class_name?: string | null;
  room_name?: string | null;
  photo_url?: string | null;
};

export type BadgeSignatureInfo = {
  signer_name?: string | null;
  signer_role?: string | null;
  image_url?: string | null;
};

export type BadgeImageLoader = {
  /** Résout chemin stocké → URL publique / affichable */
  resolveUrl: (stored: string | null | undefined) => string | null;
  /** Base API (ex. http://127.0.0.1:3000) pour proxy /uploads */
  apiBase?: string;
  /** JWT pour appels authentifiés si besoin */
  token?: string | null;
};

function hexToRgb(hex: string | undefined | null): [number, number, number] {
  const h = (hex || "#0f766e").replace("#", "").trim();
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length >= 6) {
    return [
      parseInt(h.slice(0, 2), 16) || 15,
      parseInt(h.slice(2, 4), 16) || 118,
      parseInt(h.slice(4, 6), 16) || 110,
    ];
  }
  return [15, 118, 110];
}

function lighten(rgb: [number, number, number], amount: number): [number, number, number] {
  return [
    Math.round(rgb[0] + (255 - rgb[0]) * amount),
    Math.round(rgb[1] + (255 - rgb[1]) * amount),
    Math.round(rgb[2] + (255 - rgb[2]) * amount),
  ];
}

const GCS_PUBLIC_UPLOADS =
  "https://storage.googleapis.com/shekinah-schoolmatrix-assets/schoolmatrix/uploads";

/** Extrait le nom de fichier uploads/… depuis un chemin ou une URL GCS. */
function extractUploadFilename(stored: string): string | null {
  const s = stored.trim();
  if (!s) return null;
  const rel = s.match(/^(?:\/)?uploads\/([^/?#]+)$/i);
  if (rel) return rel[1];
  const gcsStrict = s.match(
    /storage\.googleapis\.com\/[^/]+\/[^/]+\/uploads\/([^/?#]+)(?:\?|#|$)/i,
  );
  if (gcsStrict) return gcsStrict[1];
  const gcs = s.match(/\/uploads\/([^/?#]+)(?:\?|#|$)/i);
  if (gcs) return gcs[1];
  // uuid.ext seul
  if (/^[0-9a-f-]{36}\.(jpe?g|png|gif|webp|svg)$/i.test(s)) return s;
  return null;
}

function isApiUrl(url: string, apiBase: string): boolean {
  if (!apiBase) return false;
  const base = apiBase.replace(/\/$/, "");
  return url === base || url.startsWith(`${base}/`);
}

/**
 * Fetch image. N’envoie le JWT qu’à l’API locale/GCP —
 * un Bearer vers GCS fait échouer la requête.
 */
async function fetchBlob(url: string, token?: string | null, apiBase?: string): Promise<Blob | null> {
  try {
    const headers = new Headers();
    if (token && apiBase && isApiUrl(url, apiBase)) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const res = await fetch(url, { headers, mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return blob;
  } catch {
    return null;
  }
}

/** Contournement CORS Electron (process principal). */
async function fetchBlobViaDesktop(url: string): Promise<Blob | null> {
  try {
    const fn = window.schoolmatrixDesktop?.fetchMedia;
    if (!fn) return null;
    const data = await fn(url);
    if (!data?.base64) return null;
    const bin = atob(data.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: data.contentType || "image/png" });
  } catch {
    return null;
  }
}

/**
 * Charge une image métier : API /uploads (proxy GCS) → URL publique → IPC Electron.
 */
async function loadImageBlob(
  stored: string | null | undefined,
  loader: BadgeImageLoader,
): Promise<Blob | null> {
  if (!stored?.trim()) return null;
  const raw = stored.trim();
  const resolved = loader.resolveUrl(raw) || (raw.startsWith("http") ? raw : null);
  const filename =
    extractUploadFilename(raw) || (resolved ? extractUploadFilename(resolved) : null);
  const apiBase = (loader.apiBase || "").replace(/\/$/, "");

  const candidates: string[] = [];
  if (filename && apiBase) {
    candidates.push(`${apiBase}/uploads/${encodeURIComponent(filename)}`);
    candidates.push(`${apiBase}/uploads/${filename}`);
  }
  if (resolved) candidates.push(resolved);
  if (filename) candidates.push(`${GCS_PUBLIC_UPLOADS}/${filename}`);
  if (raw.startsWith("http") && !candidates.includes(raw)) candidates.push(raw);

  const tried = new Set<string>();
  for (const url of candidates) {
    if (!url || tried.has(url)) continue;
    tried.add(url);
    const blob = await fetchBlob(url, loader.token, apiBase);
    if (blob) return blob;
  }

  // Electron : fetch hors renderer (dev = CORS strict)
  for (const url of candidates) {
    if (!url?.startsWith("http")) continue;
    const viaMain = await fetchBlobViaDesktop(url);
    if (viaMain) return viaMain;
  }
  return null;
}

/**
 * Recadre / ajuste une image via canvas (blob: → pas de canvas « tainted »).
 */
async function prepareImage(
  stored: string | null | undefined,
  boxWpx: number,
  boxHpx: number,
  mode: "contain" | "cover",
  background: string | null,
  loader: BadgeImageLoader,
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const blob = await loadImageBlob(stored, loader);
  if (!blob) return null;

  const objectUrl = URL.createObjectURL(blob);
  try {
    const dataUrl = await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(boxWpx));
          canvas.height = Math.max(1, Math.round(boxHpx));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          if (background) {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
          const nw = img.naturalWidth || img.width;
          const nh = img.naturalHeight || img.height;
          if (!nw || !nh) {
            resolve(null);
            return;
          }
          const scale =
            mode === "cover"
              ? Math.max(canvas.width / nw, canvas.height / nh)
              : Math.min(canvas.width / nw, canvas.height / nh);
          const w = nw * scale;
          const h = nh * scale;
          ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = objectUrl;
    });
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function ellipsize(doc: jsPDF, text: string, maxWidth: number): string {
  const t = (text || "").trim();
  if (!t) return "";
  if (doc.getTextWidth(t) <= maxWidth) return t;
  let out = t;
  while (out.length > 1 && doc.getTextWidth(`${out}…`) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function drawOneBadge(
  doc: jsPDF,
  school: BadgeSchoolInfo,
  student: BadgeStudentInfo,
  assets: {
    logo?: string | null;
    photo?: string | null;
    sig?: string | null;
  },
) {
  const W = BADGE_W_MM;
  const H = BADGE_H_MM;
  const primary = hexToRgb(school.primary_color);
  const secondary = hexToRgb(school.secondary_color || school.primary_color);
  const pale = lighten(primary, 0.92);
  const margin = 2.8;
  const footerH = 2;
  const sigBlockH = 12;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, "F");

  // ——— En-tête ———
  const headerH = 13.5;
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(0, 0, W, headerH, "F");
  doc.setFillColor(secondary[0], secondary[1], secondary[2]);
  doc.rect(0, headerH, W, 0.7, "F");

  const logoBox = 10;
  const logoX = margin;
  const logoY = (headerH - logoBox) / 2;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(logoX, logoY, logoBox, logoBox, 1, 1, "F");
  if (assets.logo) {
    try {
      doc.addImage(
        assets.logo,
        "PNG",
        logoX + 0.45,
        logoY + 0.45,
        logoBox - 0.9,
        logoBox - 0.9,
        undefined,
        "FAST",
      );
    } catch {
      /* ignore */
    }
  }

  const headerTextX = logoX + logoBox + 2.2;
  const headerTextW = W - headerTextX - margin;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(ellipsize(doc, school.name || "École", headerTextW), headerTextX, 6.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  const contact = [school.phone, school.address].filter(Boolean).join("  ·  ");
  if (contact) {
    doc.text(ellipsize(doc, contact, headerTextW), headerTextX, 10.4);
  }

  // ——— Corps : photo + infos (toute la largeur restante pour le nom) ———
  const bodyTop = headerH + 0.7 + 2;
  const sigTop = H - footerH - sigBlockH - 0.8;
  const bodyBottom = sigTop - 1.2;

  const photoW = 23;
  const photoH = Math.min(photoW, Math.max(18, bodyBottom - bodyTop));
  const photoX = margin;
  const photoY = bodyTop;

  doc.setFillColor(pale[0], pale[1], pale[2]);
  doc.roundedRect(photoX, photoY, photoW, photoH, 1.2, 1.2, "F");
  doc.setDrawColor(primary[0], primary[1], primary[2]);
  doc.setLineWidth(0.35);
  doc.roundedRect(photoX, photoY, photoW, photoH, 1.2, 1.2, "S");

  if (assets.photo) {
    try {
      doc.addImage(
        assets.photo,
        "PNG",
        photoX + 0.45,
        photoY + 0.45,
        photoW - 0.9,
        photoH - 0.9,
        undefined,
        "FAST",
      );
    } catch {
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text("Photo", photoX + photoW / 2, photoY + photoH / 2 + 1, { align: "center" });
    }
  } else {
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Photo", photoX + photoW / 2, photoY + photoH / 2 + 1, { align: "center" });
  }

  const infoX = photoX + photoW + 3;
  const infoW = W - infoX - margin;
  let y = bodyTop + 3.5;

  const first = (student.first_name || "").trim();
  const last = (student.last_name || "").trim();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  // Nom sur toute la largeur disponible (plus de colonne VISA à droite)
  doc.text(ellipsize(doc, first || "Élève", infoW), infoX, y);
  y += 4.4;

  doc.setFontSize(10);
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text(ellipsize(doc, last.toUpperCase() || "—", infoW), infoX, y);
  y += 5;

  if (student.management_code) {
    doc.setFillColor(pale[0], pale[1], pale[2]);
    doc.roundedRect(infoX, y - 2.6, Math.min(infoW, 30), 4.2, 0.8, 0.8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(primary[0], primary[1], primary[2]);
    doc.text(`N° ${student.management_code}`, infoX + 1.5, y);
    y += 5.8;
  } else {
    y += 1.2;
  }

  const metaW = (infoW - 2) / 2;
  const metas: Array<[string, string, number]> = [
    ["CLASSE", student.class_name || "—", infoX],
    ["SALLE", student.room_name || "—", infoX + metaW + 2],
  ];
  for (const [label, value, x] of metas) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.2);
    doc.setTextColor(100, 116, 139);
    doc.text(label, x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(ellipsize(doc, value, metaW), x, y + 3.1);
  }

  // ——— Visa bas droite : signature → ligne → « Directeur ou Directrice » ———
  const sigImgW = 24;
  const sigImgH = 8;
  const sigBlockW = 28;
  const sigImgX = W - margin - sigBlockW + (sigBlockW - sigImgW) / 2;
  const sigY = sigTop;

  if (assets.sig) {
    try {
      doc.addImage(assets.sig, "PNG", sigImgX, sigY, sigImgW, sigImgH, undefined, "FAST");
    } catch {
      /* ignore */
    }
  }

  const lineY = sigY + sigImgH + 0.5;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(W - margin - sigBlockW, lineY, W - margin, lineY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.2);
  doc.setTextColor(100, 116, 139);
  doc.text("Directeur ou Directrice", W - margin - sigBlockW / 2, lineY + 2.4, {
    align: "center",
  });

  // ——— Pied ———
  doc.setFillColor(secondary[0], secondary[1], secondary[2]);
  doc.rect(0, H - footerH, W, footerH, "F");
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(0, H - footerH, W * 0.35, footerH, "F");
}

/**
 * Génère un PDF de badges (1 page CR80 / élève).
 */
export async function getStudentBadgesPdfBlob(params: {
  school: BadgeSchoolInfo;
  students: BadgeStudentInfo[];
  signature?: BadgeSignatureInfo | null;
  resolveUrl: (stored: string | null | undefined) => string | null;
  apiBase?: string;
  token?: string | null;
}): Promise<Blob> {
  const { school, students, signature, resolveUrl, apiBase, token } = params;
  if (!students.length) {
    throw new Error("Aucun élève à imprimer");
  }

  const loader: BadgeImageLoader = { resolveUrl, apiBase, token };
  const PX = 14;

  const logoPrepared = await prepareImage(
    school.logo_url,
    10 * PX,
    10 * PX,
    "contain",
    "#ffffff",
    loader,
  );
  const sigPrepared = await prepareImage(
    signature?.image_url ?? null,
    22 * PX,
    7.5 * PX,
    "contain",
    null,
    loader,
  );

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [BADGE_W_MM, BADGE_H_MM],
  });

  for (let i = 0; i < students.length; i++) {
    if (i > 0) doc.addPage([BADGE_W_MM, BADGE_H_MM], "landscape");
    const student = students[i];
    // Photos identité déjà carrées à l’upload
    const photoPrepared = await prepareImage(
      student.photo_url,
      23 * PX,
      23 * PX,
      "cover",
      "#f1f5f9",
      loader,
    );
    drawOneBadge(doc, school, student, {
      logo: logoPrepared,
      photo: photoPrepared,
      sig: sigPrepared,
    });
  }

  return doc.output("blob");
}
