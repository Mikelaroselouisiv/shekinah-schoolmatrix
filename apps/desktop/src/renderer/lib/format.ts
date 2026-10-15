/**
 * Retourne la date du jour au format YYYY-MM-DD en heure locale (pas UTC).
 * Évite un décalage d'un jour en fin de journée selon le fuseau horaire.
 */
export function getTodayLocalYYYYMMDD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Format montant en gourdes (format comptable : espaces milliers, 2 décimales, suffixe Gdes).
 */
export function formatGdes(amount: number | string | null | undefined): string {
  if (amount == null || amount === "") return "— Gdes";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(n)) return "— Gdes";
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Gdes`;
}

/**
 * Affiche une date au format JJ/MM/AAAA (ex: 26/02/2025).
 * Accepte YYYY-MM-DD ou ISO string.
 */
export function formatDateJJMMAAAA(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const s = String(dateStr).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Convertit YYYY-MM-DD en JJ/MM/AAAA pour l'affichage dans un champ (vide → "").
 */
export function toDisplayDateJJMMAAAA(isoDate: string | null | undefined): string {
  if (!isoDate || !String(isoDate).trim()) return "";
  const s = String(isoDate).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Convertit JJ/MM/AAAA ou JJ-MM-AAAA en YYYY-MM-DD pour les APIs / input type="date".
 */
export function parseJJMMAAAAToIso(jjMmAaaa: string): string | null {
  const trimmed = jjMmAaaa.trim();
  const match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const dd = d.padStart(2, "0");
  const mm = m.padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}
