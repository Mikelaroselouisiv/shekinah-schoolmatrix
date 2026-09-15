import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import type { ParsedStudentRow, PdfParseResult } from './student-pdf-import';
import { parseStudentTableFromPdfText } from './student-pdf-import';
import { normalizeNisu } from './student-nisu';

const EXTRACT_PROMPT = `Tu es un assistant d'inscription scolaire (Haïti / MENFP).
Analyse ce document (liste d'élèves, souvent un tableau multi-pages).
Ignore l'en-tête institutionnel (école, année, logo, titres).
Extrais TOUTES les lignes élèves du tableau, sur toutes les pages fournies.

Pour chaque élève, renvoie un objet JSON avec :
- order_number : identifiant (NISU, N°, matricule, code élève) — chaîne, obligatoire si présent
- last_name : nom de famille
- first_name : prénom(s)
- gender : "M" ou "F" ou null
- birth_date : date au format YYYY-MM-DD ou null
- birth_place : lieu de naissance ou null

Règles :
- Ne fabrique pas d'élèves absents du document.
- Si nom et prénom sont dans une seule colonne, sépare-les raisonnablement (dernier mot = souvent le prénom, ou l'inverse selon le format local : privilégie Nom puis Prénom si colonnes distinctes).
- Normalise les dates (JJ/MM/AAAA → YYYY-MM-DD).
- order_number : préfère NISU / matricule ; sinon le numéro de ligne officiel du tableau.

Réponds UNIQUEMENT avec un JSON valide de la forme :
{"students":[{"order_number":"...","last_name":"...","first_name":"...","gender":"M","birth_date":null,"birth_place":null}]}`;

/** Pages par appel Gemini — assez peu pour éviter JSON tronqué sur listes denses. */
const GEMINI_PAGES_PER_CHUNK = 3;
/** Taille max texte OpenAI par lot. */
const OPENAI_TEXT_CHUNK = 40000;

@Injectable()
export class StudentAiImportService {
  private readonly logger = new Logger(StudentAiImportService.name);

  constructor(private readonly config: ConfigService) {}

  private geminiKey(): string | null {
    return (
      this.config.get<string>('GEMINI_API_KEY')?.trim() ||
      this.config.get<string>('GOOGLE_AI_API_KEY')?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_AI_API_KEY?.trim() ||
      null
    );
  }

  private openaiKey(): string | null {
    return (
      this.config.get<string>('OPENAI_API_KEY')?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      null
    );
  }

  isAiConfigured(): boolean {
    return !!(this.geminiKey() || this.openaiKey());
  }

  /**
   * Extraction élèves depuis un PDF :
   * 1) heuristique locale (rapide)
   * 2) sinon IA (Gemini PDF vision prioritaire, OpenAI texte en secours)
   *    — PDF longs découpés automatiquement par pages / lots.
   */
  async extractStudentsFromPdf(buffer: Buffer): Promise<PdfParseResult & { method: string }> {
    let pdfText = '';
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
      const parsed = await pdfParse(buffer);
      pdfText = (parsed.text || '').trim();
    } catch (err: any) {
      this.logger.warn(`pdf-parse: ${err?.message || err}`);
    }

    const heuristic = parseStudentTableFromPdfText(pdfText);
    if (heuristic.header_found && heuristic.rows.length > 0) {
      return { ...heuristic, method: 'heuristic' };
    }

    if (!this.isAiConfigured()) {
      return {
        rows: [],
        header_found: false,
        warnings: [
          ...(heuristic.warnings || []),
          'Analyse IA indisponible : définissez GEMINI_API_KEY (recommandé) ou OPENAI_API_KEY dans le .env du backend, puis redémarrez.',
        ],
        method: 'none',
      };
    }

    try {
      const aiRows = this.geminiKey()
        ? await this.extractWithGemini(buffer)
        : await this.extractWithOpenAi(pdfText);

      if (!aiRows.length) {
        return {
          rows: [],
          header_found: false,
          warnings: [
            'L’IA n’a trouvé aucune ligne élève. Vérifiez que le PDF contient un tableau lisible (texte ou scan net).',
          ],
          method: this.geminiKey() ? 'gemini' : 'openai',
        };
      }

      return {
        rows: aiRows,
        header_found: true,
        warnings: [],
        method: this.geminiKey() ? 'gemini' : 'openai',
      };
    } catch (err: any) {
      this.logger.error(`AI import failed: ${err?.message || err}`);
      throw new ServiceUnavailableException(
        err?.message ||
          'Échec de l’analyse IA du PDF. Vérifiez la clé API et réessayez.',
      );
    }
  }

  private mergeRows(batches: ParsedStudentRow[]): ParsedStudentRow[] {
    const seen = new Set<string>();
    const out: ParsedStudentRow[] = [];
    for (const row of batches) {
      const nisu = normalizeNisu(row.order_number);
      if (!nisu || seen.has(nisu)) continue;
      seen.add(nisu);
      out.push({ ...row, order_number: nisu, row: out.length + 1 });
    }
    return out;
  }

  private normalizeRows(raw: any[]): ParsedStudentRow[] {
    const rows: ParsedStudentRow[] = [];
    let i = 0;
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const order_number = normalizeNisu(
        String(item.order_number ?? item.nisu ?? item.matricule ?? item.id ?? ''),
      );
      let last_name = String(item.last_name ?? item.nom ?? '').trim();
      let first_name = String(item.first_name ?? item.prenom ?? '').trim();
      if (last_name && !first_name) {
        const parts = last_name.split(/\s+/);
        if (parts.length >= 2) {
          last_name = parts[0];
          first_name = parts.slice(1).join(' ');
        }
      }
      if (!order_number || !last_name || !first_name) continue;
      i += 1;
      let gender: string | null = item.gender ?? item.sexe ?? null;
      if (gender) {
        const g = String(gender).trim().toUpperCase();
        gender = g.startsWith('F') ? 'F' : g.startsWith('M') || g === 'H' ? 'M' : g.slice(0, 1);
      } else {
        gender = null;
      }
      let birth_date: string | null = item.birth_date ?? item.date_naissance ?? null;
      if (birth_date) {
        birth_date = this.normalizeDate(String(birth_date));
      }
      const birth_place = item.birth_place ?? item.lieu_naissance ?? null;
      rows.push({
        row: i,
        order_number,
        last_name: last_name.toUpperCase(),
        first_name: first_name
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' '),
        gender,
        birth_date,
        birth_place: birth_place ? String(birth_place).trim() : null,
      });
    }
    return rows;
  }

  private normalizeDate(s: string): string | null {
    const t = s.trim();
    if (!t) return null;
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dmy = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (dmy) {
      const d = dmy[1].padStart(2, '0');
      const m = dmy[2].padStart(2, '0');
      let y = dmy[3];
      if (y.length === 2) y = Number(y) > 50 ? `19${y}` : `20${y}`;
      return `${y}-${m}-${d}`;
    }
    return null;
  }

  private parseJsonPayload(text: string): any[] {
    let cleaned = (text || '').trim();
    if (!cleaned) {
      throw new Error('Réponse IA vide.');
    }

    cleaned = cleaned
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    const objStart = cleaned.indexOf('{');
    const arrStart = cleaned.indexOf('[');
    let start = -1;
    if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) start = objStart;
    else if (arrStart >= 0) start = arrStart;
    if (start > 0) cleaned = cleaned.slice(start);
    if (start >= 0) {
      const open = cleaned[0];
      const close = open === '{' ? '}' : ']';
      const end = cleaned.lastIndexOf(close);
      if (end > start) cleaned = cleaned.slice(0, end + 1);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err: any) {
      this.logger.warn(
        `AI JSON parse failed (${err?.message || err}): ${cleaned.slice(0, 240)}`,
      );
      throw new Error('Réponse IA illisible (JSON invalide ou tronqué).');
    }

    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.students)) return parsed.students;
    if (Array.isArray(parsed?.rows)) return parsed.rows;
    if (Array.isArray(parsed?.eleves)) return parsed.eleves;
    return [];
  }

  private async splitPdfIntoPageChunks(
    buffer: Buffer,
    pagesPerChunk: number,
  ): Promise<Buffer[]> {
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const total = src.getPageCount();
    if (total <= 0) return [];
    const chunks: Buffer[] = [];
    for (let start = 0; start < total; start += pagesPerChunk) {
      const end = Math.min(start + pagesPerChunk, total);
      const doc = await PDFDocument.create();
      const indices = Array.from({ length: end - start }, (_, i) => start + i);
      const copied = await doc.copyPages(src, indices);
      for (const page of copied) doc.addPage(page);
      chunks.push(Buffer.from(await doc.save()));
    }
    return chunks;
  }

  private async geminiGenerateOnPdfChunk(
    chunk: Buffer,
    chunkLabel: string,
  ): Promise<ParsedStudentRow[]> {
    const key = this.geminiKey()!;
    const model =
      this.config.get<string>('GEMINI_MODEL')?.trim() ||
      process.env.GEMINI_MODEL?.trim() ||
      'gemini-3.6-flash';

    if (!chunk.length || chunk.length >= 18 * 1024 * 1024) {
      throw new Error(`Lot PDF ${chunkLabel} trop volumineux.`);
    }

    const parts: any[] = [
      {
        text: `${EXTRACT_PROMPT}\n\n(Lot ${chunkLabel} d'un document plus long — extrais toutes les lignes de CE lot.)`,
      },
      {
        inline_data: {
          mime_type: 'application/pdf',
          data: chunk.toString('base64'),
        },
      },
    ];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 65536,
          responseMimeType: 'application/json',
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `Gemini HTTP ${res.status} (${chunkLabel})`);
    }
    const finish = String(
      data?.candidates?.[0]?.finishReason ||
        data?.candidates?.[0]?.finish_reason ||
        '',
    ).toUpperCase();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ||
      '';
    if (!text) {
      throw new Error(
        finish === 'MAX_TOKENS'
          ? `Réponse IA tronquée sur le lot ${chunkLabel}.`
          : `Réponse Gemini vide (${chunkLabel}).`,
      );
    }
    if (finish === 'MAX_TOKENS') {
      // Retry this chunk with smaller page slices handled by caller
      const err: any = new Error(`MAX_TOKENS on ${chunkLabel}`);
      err.code = 'MAX_TOKENS';
      throw err;
    }
    return this.normalizeRows(this.parseJsonPayload(text));
  }

  /**
   * Analyse Gemini : découpe auto par pages pour les PDF longs,
   * et réduit encore le lot si un chunk dépasse max tokens.
   */
  private async extractWithGemini(buffer: Buffer): Promise<ParsedStudentRow[]> {
    let pageCount = 1;
    try {
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      pageCount = Math.max(1, doc.getPageCount());
    } catch (err: any) {
      this.logger.warn(`pdf-lib load: ${err?.message || err}`);
    }

    this.logger.log(`Gemini PDF import: ${pageCount} page(s)`);

    const runChunks = async (pagesPerChunk: number): Promise<ParsedStudentRow[]> => {
      const chunks =
        pageCount <= pagesPerChunk
          ? [buffer]
          : await this.splitPdfIntoPageChunks(buffer, pagesPerChunk);
      const batches: ParsedStudentRow[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const label = `${i + 1}/${chunks.length} (≤${pagesPerChunk} p.)`;
        this.logger.log(`Gemini lot ${label}…`);
        const rows = await this.geminiGenerateOnPdfChunk(chunks[i], label);
        batches.push(...rows);
      }
      return this.mergeRows(batches);
    };

    try {
      return await runChunks(GEMINI_PAGES_PER_CHUNK);
    } catch (err: any) {
      // Si un lot trop dense tronque encore → 1 page par appel
      if (err?.code === 'MAX_TOKENS' || /MAX_TOKENS|tronqué|illisible/i.test(String(err?.message))) {
        this.logger.warn(
          `Gemini chunk ${GEMINI_PAGES_PER_CHUNK}p échoué (${err?.message}) → retry 1 page/lot`,
        );
        return await runChunks(1);
      }
      throw err;
    }
  }

  private chunkText(text: string, size: number): string[] {
    if (text.length <= size) return [text];
    const parts: string[] = [];
    let i = 0;
    while (i < text.length) {
      let end = Math.min(i + size, text.length);
      if (end < text.length) {
        const nl = text.lastIndexOf('\n', end);
        if (nl > i + size * 0.5) end = nl;
      }
      parts.push(text.slice(i, end));
      i = end;
    }
    return parts;
  }

  private async extractWithOpenAi(pdfText: string): Promise<ParsedStudentRow[]> {
    if (!pdfText || pdfText.length < 20) {
      throw new Error(
        'Ce PDF semble scanné (peu de texte). Utilisez GEMINI_API_KEY pour l’analyse visuelle.',
      );
    }
    const key = this.openaiKey()!;
    const model =
      this.config.get<string>('OPENAI_MODEL')?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      'gpt-4o-mini';

    const textChunks = this.chunkText(pdfText, OPENAI_TEXT_CHUNK);
    const batches: ParsedStudentRow[] = [];

    for (let i = 0; i < textChunks.length; i++) {
      const label = `${i + 1}/${textChunks.length}`;
      this.logger.log(`OpenAI lot texte ${label}…`);
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: EXTRACT_PROMPT },
            {
              role: 'user',
              content: `Lot ${label} du PDF :\n\n${textChunks[i]}`,
            },
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || `OpenAI HTTP ${res.status}`);
      }
      const text = data?.choices?.[0]?.message?.content || '';
      if (!text) throw new Error(`Réponse OpenAI vide (${label}).`);
      batches.push(...this.normalizeRows(this.parseJsonPayload(text)));
    }

    return this.mergeRows(batches);
  }
}
