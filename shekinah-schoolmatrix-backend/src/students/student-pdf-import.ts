/**
 * Extraction intelligente d’un tableau élèves depuis le texte d’un PDF
 * (listes MENFP / NISU : N°, NISU, Nom, Prénom, Sexe, lieu/date de naissance…).
 * Gère les tableaux multi-pages (en-tête répété).
 */
import { normalizeNisu } from './student-nisu';

export type ParsedStudentRow = {
  row: number;
  order_number: string;
  last_name: string;
  first_name: string;
  gender: string | null;
  birth_date: string | null;
  birth_place: string | null;
  raw?: string;
};

export type PdfParseResult = {
  rows: ParsedStudentRow[];
  header_found: boolean;
  warnings: string[];
};

type ColKey =
  | 'no'
  | 'nisu'
  | 'last_name'
  | 'first_name'
  | 'gender'
  | 'birth_date'
  | 'birth_place';

const HEADER_ALIASES: Record<ColKey, string[]> = {
  no: ['n0', 'no', 'n°', 'num', 'numero', 'nº', '#'],
  nisu: ['nisu', 'identifiant', 'id', 'matricule', 'code'],
  last_name: ['nom', 'name', 'lastname', 'last_name'],
  first_name: ['prenom', 'prénom', 'firstname', 'first_name'],
  gender: ['sexe', 'genre', 'gender', 'sex'],
  birth_date: [
    'date_de_naissance',
    'date_naissance',
    'naissance',
    'birth_date',
    'ddn',
    'ne_le',
    'né_le',
  ],
  birth_place: [
    'lieu_de_naissance',
    'lieu_naissance',
    'lieux_de_naissance',
    'lieux_naissance',
    'birth_place',
    'ne_a',
    'né_a',
  ],
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function scoreHeaderToken(token: string): ColKey | null {
  const t = norm(token);
  if (!t) return null;
  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [ColKey, string[]][]) {
    if (aliases.some((a) => t === a || t.includes(a) || a.includes(t))) {
      return key;
    }
  }
  return null;
}

function splitCells(line: string): string[] {
  // Tabulations / pipes / multi-espaces
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim()).filter(Boolean);
  if (line.includes('|')) return line.split('|').map((c) => c.trim()).filter(Boolean);
  return line
    .split(/\s{2,}|\s*\|\s*/)
    .map((c) => c.trim())
    .filter(Boolean);
}

function detectHeader(cells: string[]): Partial<Record<ColKey, number>> | null {
  const map: Partial<Record<ColKey, number>> = {};
  let hits = 0;
  cells.forEach((cell, i) => {
    const key = scoreHeaderToken(cell);
    if (key && map[key] === undefined) {
      map[key] = i;
      hits++;
    }
  });
  // Minimum : NISU (ou N°) + Nom + Prénom
  const hasId = map.nisu !== undefined || map.no !== undefined;
  if (hasId && map.last_name !== undefined && map.first_name !== undefined && hits >= 3) {
    return map;
  }
  // Variante : une seule colonne "Nom Prénom"
  if (hasId && map.last_name !== undefined && hits >= 2) {
    return map;
  }
  return null;
}

function parseBirthDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    let y = dmy[3];
    if (y.length === 2) y = Number(y) > 50 ? `19${y}` : `20${y}`;
    return `${y}-${m}-${d}`;
  }
  return null;
}

function normalizeGender(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^(m|masculin|male|garcon|garçon|h|homme)$/i.test(s)) return 'M';
  if (/^(f|feminin|féminin|female|fille|femme)$/i.test(s)) return 'F';
  return s.slice(0, 1).toUpperCase();
}

function cellAt(cells: string[], idx: number | undefined): string {
  if (idx === undefined || idx < 0 || idx >= cells.length) return '';
  return (cells[idx] ?? '').trim();
}

/**
 * Parse le texte brut extrait d’un PDF (toutes pages concaténées).
 */
export function parseStudentTableFromPdfText(text: string): PdfParseResult {
  const warnings: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').trim())
    .filter((l) => l.length > 0);

  let colMap: Partial<Record<ColKey, number>> | null = null;
  const rows: ParsedStudentRow[] = [];
  let dataRow = 0;

  for (const line of lines) {
    const cells = splitCells(line);
    if (cells.length < 2) continue;

    const asHeader = detectHeader(cells);
    if (asHeader) {
      colMap = asHeader;
      continue; // en-tête (y compris répété page 2+)
    }
    if (!colMap) continue;

    // Ignorer lignes quasi-identiques à l’en-tête
    if (detectHeader(cells)) continue;

    dataRow++;
    const nisu = cellAt(cells, colMap.nisu);
    const no = cellAt(cells, colMap.no);
    const order_number = normalizeNisu(nisu || no);
    let last_name = cellAt(cells, colMap.last_name);
    let first_name = cellAt(cells, colMap.first_name);

    // Si pas de prénom séparé : « NOM Prenom » dans la colonne Nom
    if (last_name && !first_name) {
      const parts = last_name.split(/\s+/);
      if (parts.length >= 2) {
        last_name = parts[0];
        first_name = parts.slice(1).join(' ');
      }
    }

    if (!order_number || !last_name || !first_name) {
      if (order_number || last_name || first_name) {
        warnings.push(`Ligne ignorée (données incomplètes) : ${line.slice(0, 80)}`);
      }
      continue;
    }

    // Éviter de reprendre une ligne d’en-tête mal détectée
    if (/^(nisu|nom|prenom|sexe)$/i.test(order_number)) continue;

    const genderRaw = cellAt(cells, colMap.gender);
    const birthDateRaw = cellAt(cells, colMap.birth_date);
    const birthPlaceRaw = cellAt(cells, colMap.birth_place);

    // Si une seule colonne « naissance » ambiguë
    let birth_date = parseBirthDate(birthDateRaw);
    let birth_place = birthPlaceRaw || null;
    if (!birth_date && birthDateRaw && !/\d/.test(birthDateRaw)) {
      birth_place = birth_place || birthDateRaw;
    }
    if (!birth_date && birthPlaceRaw) {
      const maybeDate = parseBirthDate(birthPlaceRaw);
      if (maybeDate) {
        birth_date = maybeDate;
        if (birth_place === birthPlaceRaw) birth_place = null;
      }
    }

    rows.push({
      row: dataRow,
      order_number,
      last_name: last_name.toUpperCase(),
      first_name: first_name
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' '),
      gender: normalizeGender(genderRaw),
      birth_date,
      birth_place: birth_place || null,
      raw: line,
    });
  }

  return {
    rows,
    header_found: !!colMap,
    warnings,
  };
}
