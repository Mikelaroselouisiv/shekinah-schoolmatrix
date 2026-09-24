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

function darken(rgb: [number, number, number], amount: number): [number, number, number] {
  return [
    Math.round(rgb[0] * (1 - amount)),
    Math.round(rgb[1] * (1 - amount)),
    Math.round(rgb[2] * (1 - amount)),
  ];
}

function isDark(rgb: [number, number, number]): boolean {
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 155;
}

function applyRgb(doc: jsPDF, c: [number, number, number], kind: "fill" | "draw" | "text") {
  if (kind === "fill") doc.setFillColor(c[0], c[1], c[2]);
  else if (kind === "draw") doc.setDrawColor(c[0], c[1], c[2]);
  else doc.setTextColor(c[0], c[1], c[2]);
}

function clipRoundRect(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(w, 0, w, h, radius);
  ctx.arcTo(w, h, 0, h, radius);
  ctx.arcTo(0, h, 0, 0, radius);
  ctx.arcTo(0, 0, w, 0, radius);
  ctx.closePath();
  ctx.clip();
}

const GCS_PUBLIC_UPLOADS =
  "https://storage.googleapis.com/parallele-schoolmatrix-assets/schoolmatrix/uploads";

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
 * `radiusPx` produit des coins arrondis transparents (cadre photo).
 */
async function prepareImage(
  stored: string | null | undefined,
  boxWpx: number,
  boxHpx: number,
  mode: "contain" | "cover",
  background: string | null,
  loader: BadgeImageLoader,
  radiusPx = 0,
  opacity = 1,
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
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (radiusPx > 0) clipRoundRect(ctx, canvas.width, canvas.height, radiusPx);
          if (background) {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
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
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
          ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
          ctx.restore();
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

function wrapLines(doc: jsPDF, text: string, maxWidth: number, maxLines: number): string[] {
  const t = (text || "").trim();
  if (!t) return [];
  if (maxLines <= 1 || doc.getTextWidth(t) <= maxWidth) {
    return [ellipsize(doc, t, maxWidth)];
  }
  const words = t.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (doc.getTextWidth(trial) <= maxWidth) {
      cur = trial;
      continue;
    }
    if (cur) lines.push(cur);
    if (lines.length >= maxLines - 1) {
      lines.push(ellipsize(doc, word, maxWidth));
      return lines.slice(0, maxLines);
    }
    cur = word;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

function safeImage(
  doc: jsPDF,
  data: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  try {
    doc.addImage(data, "PNG", x, y, w, h, undefined, "FAST");
    return true;
  } catch {
    return false;
  }
}

/**
 * Carte CR80 paysage (gabarit type carte scolaire PVC) :
 * photo identité 3:4 à gauche, textes à droite, logo filigrane
 * collé au bord droit, signature large en bas à droite.
 *
 *  ┌──────────────────────────────────────────────┐
 *  │           NOM DE L'ÉCOLE (MAJUSCULES)        │
 *  │           adresse                            │
 *  │           téléphone                          │
 *  │  ┌──────┐  NOM                    [logo]│    │
 *  │  │ 3:4  │  Prénom                       │    │
 *  │  └──────┘                                    │
 *  │  Classe (large)     Salle    [signature]     │
 *  └──────────────────────────────────────────────┘
 */
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
  const pale = lighten(primary, 0.88);
  const frame = darken(primary, 0.12);
  const ink: [number, number, number] = [15, 23, 42];
  const muted: [number, number, number] = [100, 116, 139];
  const onPrimary: [number, number, number] = isDark(primary) ? [255, 255, 255] : ink;
  const slateSoft: [number, number, number] = [248, 250, 252];

  const m = 2.4;
  const accentH = 0.5;
  const bottomPad = 0.95;
  const footerH = 9.6;
  const metaY = H - bottomPad - footerH;

  const titleMaxW = W - 2 * m;
  const schoolTitle = (school.name || "École").trim().toUpperCase();
  const phone = (school.phone || "").trim();
  const address = (school.address || "").trim();
  const contactLines = [address, phone].filter(Boolean);

  doc.setFont("helvetica", "bold");
  let titleSize = 11.2;
  doc.setFontSize(titleSize);
  while (titleSize > 7.2 && doc.getTextWidth(schoolTitle) > titleMaxW) {
    titleSize -= 0.35;
    doc.setFontSize(titleSize);
  }
  const titleLines = wrapLines(doc, schoolTitle, titleMaxW, 2);
  const titleStartY = titleLines.length === 1 ? 5.65 : 4.35;
  const titleStep = titleSize * 0.32 + 0.2;
  const titleEndY = titleStartY + (titleLines.length - 1) * titleStep;
  const contactStartY = titleEndY + 2.4;
  const headerH =
    (contactLines.length ? contactStartY + (contactLines.length - 1) * 2.4 : titleEndY) + 1.35;

  applyRgb(doc, [255, 255, 255], "fill");
  doc.rect(0, 0, W, H, "F");

  applyRgb(doc, primary, "fill");
  doc.rect(0, 0, W, headerH, "F");
  applyRgb(doc, secondary, "fill");
  doc.rect(0, headerH, W, accentH, "F");

  applyRgb(doc, onPrimary, "text");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(titleSize);
  let nameY = titleStartY;
  for (const line of titleLines) {
    doc.text(line, W / 2, nameY, { align: "center" });
    nameY += titleStep;
  }

  if (contactLines.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    applyRgb(doc, onPrimary, "text");
    let contactY = contactStartY;
    for (const line of contactLines) {
      doc.text(ellipsize(doc, line, titleMaxW), W / 2, contactY, { align: "center" });
      contactY += 2.4;
    }
  }

  const photoY = headerH + accentH + 0.4;
  const maxPhotoH = Math.max(18, metaY - photoY - 0.4);
  const photoH = Math.min(22.2 * (4 / 3), maxPhotoH);
  const photoW = photoH * (3 / 4);
  const photoX = m;
  const inset = 0.4;
  const innerW = photoW - inset * 2;
  const innerH = innerW * (4 / 3);
  const innerX = photoX + inset;
  const innerY = photoY + (photoH - innerH) / 2;

  applyRgb(doc, frame, "fill");
  doc.roundedRect(photoX - 0.35, photoY - 0.35, photoW + 0.7, photoH + 0.7, 1.25, 1.25, "F");
  applyRgb(doc, [255, 255, 255], "fill");
  doc.roundedRect(photoX, photoY, photoW, photoH, 1.05, 1.05, "F");

  const first = (student.first_name || "").trim();
  const last = (student.last_name || "").trim();
  const photoDrawn = assets.photo && safeImage(doc, assets.photo, innerX, innerY, innerW, innerH);
  if (!photoDrawn) {
    applyRgb(doc, pale, "fill");
    doc.roundedRect(innerX, innerY, innerW, innerH, 0.85, 0.85, "F");
    const initials = `${(first[0] || "É").toUpperCase()}${(last[0] || "").toUpperCase()}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    applyRgb(doc, primary, "text");
    doc.text(initials, photoX + photoW / 2, photoY + photoH / 2 + 2.2, { align: "center" });
  }

  const infoX = photoX + photoW + 2.6;

  const logoSize = 16.5;
  const logoX = W - m - logoSize;
  const logoY = photoY + 2.2;
  if (assets.logo) {
    safeImage(doc, assets.logo, logoX, logoY, logoSize, logoSize);
  }

  const nameMaxW = Math.max(22, logoX - infoX - 1.8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  applyRgb(doc, ink, "text");
  doc.text(ellipsize(doc, last.toUpperCase() || "—", nameMaxW), infoX, photoY + 11.6);

  doc.setFontSize(9.4);
  applyRgb(doc, primary, "text");
  doc.text(ellipsize(doc, first || "Élève", nameMaxW), infoX, photoY + 16.4);

  applyRgb(doc, primary, "draw");
  doc.setLineWidth(0.4);
  doc.line(infoX, photoY + 17.7, infoX + 12, photoY + 17.7);

  const gap = 1.15;
  const sigBlockW = 32;
  const sigBlockH = 14.4;
  const salleW = 14;
  const classW = W - 2 * m - salleW - sigBlockW - gap * 2;
  const metaH = footerH;
  const sigX = W - m - sigBlockW;
  const sigY = H - bottomPad - sigBlockH;

  function drawMetaBox(x: number, w: number, label: string, value: string, maxLines: number) {
    applyRgb(doc, slateSoft, "fill");
    doc.roundedRect(x, metaY, w, metaH, 0.9, 0.9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.2);
    applyRgb(doc, muted, "text");
    doc.text(label, x + 1.3, metaY + 2.5);
    doc.setFontSize(6.8);
    applyRgb(doc, ink, "text");
    const lines = wrapLines(doc, value || "—", w - 2.4, maxLines);
    let ly = metaY + (maxLines > 1 && lines.length > 1 ? 5.0 : 6.5);
    for (const line of lines) {
      doc.text(line, x + 1.3, ly);
      ly += 2.7;
    }
  }

  drawMetaBox(m, classW, "CLASSE", student.class_name || "—", 2);
  drawMetaBox(m + classW + gap, salleW, "SALLE", student.room_name || "—", 1);

  applyRgb(doc, [255, 255, 255], "fill");
  doc.rect(sigX, sigY, sigBlockW, sigBlockH, "F");

  const sigImgW = 30;
  const sigImgH = 10.6;
  const lineY = sigY + sigBlockH - 2.45;
  const sigImgY = lineY - sigImgH;
  if (assets.sig) {
    safeImage(doc, assets.sig, sigX + (sigBlockW - sigImgW) / 2, sigImgY, sigImgW, sigImgH);
  }
  applyRgb(doc, primary, "draw");
  doc.setLineWidth(0.28);
  doc.line(sigX + 0.3, lineY, sigX + sigBlockW - 0.3, lineY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.1);
  applyRgb(doc, muted, "text");
  doc.text("Direction", sigX + sigBlockW / 2, lineY + 2.15, { align: "center" });
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
  const PX = 16;
  const photoWmm = 22.2 - 0.8;
  const photoHmm = photoWmm * (4 / 3);
  const logoMm = 16.5;

  const logoPrepared = await prepareImage(
    school.logo_url,
    logoMm * PX,
    logoMm * PX,
    "contain",
    null,
    loader,
    0,
    0.6,
  );
  const sigPrepared = await prepareImage(
    signature?.image_url ?? null,
    30 * PX,
    10.6 * PX,
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
    const photoPrepared = await prepareImage(
      student.photo_url,
      photoWmm * PX,
      photoHmm * PX,
      "cover",
      null,
      loader,
      0.7 * PX,
    );
    drawOneBadge(doc, school, student, {
      logo: logoPrepared,
      photo: photoPrepared,
      sig: sigPrepared,
    });
  }

  return doc.output("blob");
}
