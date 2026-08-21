import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import type { ParsedStudentRow, PdfParseResult } from './student-pdf-import';
import { parseStudentTableFromPdfText } from './student-pdf-import';
import { normalizeNisu } from './student-nisu';

/** Pages Gemini par appel — limite la taille de la réponse JSON (évite troncature). */
const GEMINI_PAGES_PER_CHUNK = 2;
/** Seuil : au-delà, découpage automatique même si le 1er essai n’a pas encore échoué. */
const GEMINI_AUTO_CHUNK_MIN_PAGES = 3;
/** Taille max d’un morceau texte (OpenAI / fallback Gemini texte). */
const TEXT_CHUNK_CHARS = 35000;
/** Chevauchement entre morceaux texte pour ne pas couper une ligne élève. */
const TEXT_CHUNK_OVERLAP = 1500;

const EXTRACT_PROMPT = `Tu es un assistant d'inscription scolaire (Haïti / MENFP).
Analyse ce document (liste d'élèves, souvent un tableau multi-pages).
Ignore l'en-tête institutionnel (école, année, logo, titres).
Extrais TOUTES les lignes élèves du tableau fourni dans CE morceau.

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
- Réponse COURTE et STRICTEMENT JSON — aucun commentaire, aucune troncature volontaire.

Réponds UNIQUEMENT avec un JSON valide de la forme :
{"students":[{"order_number":"...","last_name":"...","first_name":"...","gender":"M","birth_date":null,"birth_place":null}]}`;

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
   * 2) sinon IA (Gemini PDF vision prioritaire avec découpage auto, OpenAI texte en secours)
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
        ? await this.extractWithGemini(buffer, pdfText)
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

  /** Fusionne les lots IA et déduplique par NISU / matricule. */
  private mergeStudentRows(batches: ParsedStudentRow[][]): ParsedStudentRow[] {
    const seen = new Set<string>();
    const out: ParsedStudentRow[] = [];
    for (const batch of batches) {
      for (const row of batch) {
        const key = (row.order_number || '').trim().toUpperCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ ...row, row: out.length + 1 });
      }
    }
    return out;
  }

  /**
   * Parse JSON IA ; en cas de troncature, récupère les objets élèves complets déjà présents.
   */
  private parseJsonPayload(text: string): any[] {
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.students)) return parsed.students;
      if (Array.isArray(parsed?.rows)) return parsed.rows;
      if (Array.isArray(parsed?.eleves)) return parsed.eleves;
      return [];
    } catch {
      const recovered = this.recoverTruncatedStudentsJson(cleaned);
      if (recovered.length) {
        this.logger.warn(
          `JSON IA tronqué — ${recovered.length} élève(s) récupéré(s) partiellement.`,
        );
        return recovered;
      }
      throw new Error(
        'Réponse IA JSON invalide ou tronquée (PDF trop dense pour un seul appel). Réessayez : le découpage automatique devrait s’appliquer.',
      );
    }
  }

  /** Extrait les objets {…} complets d’un tableau students[] tronqué. */
  private recoverTruncatedStudentsJson(text: string): any[] {
    const arrayStart = text.search(/"students"\s*:\s*\[|"rows"\s*:\s*\[|"eleves"\s*:\s*\[|^\s*\[/i);
    if (arrayStart < 0) return [];
    const fromBracket = text.indexOf('[', arrayStart);
    if (fromBracket < 0) return [];

    const items: any[] = [];
    let i = fromBracket + 1;
    while (i < text.length) {
      while (i < text.length && /[\s,]/.test(text[i])) i += 1;
      if (i >= text.length || text[i] === ']') break;
      if (text[i] !== '{') break;

      let depth = 0;
      let inStr = false;
      let esc = false;
      const start = i;
      for (; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') {
          inStr = true;
          continue;
        }
        if (ch === '{') depth += 1;
        else if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            i += 1;
            const slice = text.slice(start, i);
            try {
              items.push(JSON.parse(slice));
            } catch {
              /* objet incomplet — stop */
              return items;
            }
            break;
          }
        }
      }
      if (depth !== 0) break;
    }
    return items;
  }

  private chunkPrompt(partIndex: number, partTotal: number): string {
    if (partTotal <= 1) return EXTRACT_PROMPT;
    return `${EXTRACT_PROMPT}

Contexte : ceci est le morceau ${partIndex}/${partTotal} du document.
Extrais uniquement les élèves visibles dans CE morceau (ne résume pas les autres pages).`;
  }

  private async loadPdfDoc(buffer: Buffer): Promise<PDFDocument | null> {
    try {
      return await PDFDocument.load(buffer, { ignoreEncryption: true });
    } catch (err: any) {
      this.logger.warn(`pdf-lib load: ${err?.message || err}`);
      return null;
    }
  }

  private async slicePdfPages(
    src: PDFDocument,
    startPage: number,
    endPageExclusive: number,
  ): Promise<Buffer> {
    const out = await PDFDocument.create();
    const indices = Array.from(
      { length: endPageExclusive - startPage },
      (_, i) => startPage + i,
    );
    const pages = await out.copyPages(src, indices);
    for (const p of pages) out.addPage(p);
    return Buffer.from(await out.save());
  }

  /** Découpe le PDF en buffers de N pages. */
  private async splitPdfIntoPageChunks(
    buffer: Buffer,
    pagesPerChunk = GEMINI_PAGES_PER_CHUNK,
  ): Promise<Buffer[]> {
    const src = await this.loadPdfDoc(buffer);
    if (!src) return [buffer];
    const pageCount = src.getPageCount();
    if (pageCount <= pagesPerChunk) return [buffer];

    const chunks: Buffer[] = [];
    for (let start = 0; start < pageCount; start += pagesPerChunk) {
      const end = Math.min(start + pagesPerChunk, pageCount);
      chunks.push(await this.slicePdfPages(src, start, end));
    }
    this.logger.log(
      `PDF découpé en ${chunks.length} morceau(x) (${pageCount} pages, ${pagesPerChunk}/lot).`,
    );
    return chunks;
  }

  /** Découpe un long texte avec chevauchement. */
  private splitTextIntoChunks(text: string, size = TEXT_CHUNK_CHARS): string[] {
    if (!text || text.length <= size) return text ? [text] : [];
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        const nl = text.lastIndexOf('\n', end);
        if (nl > start + size * 0.5) end = nl;
      }
      chunks.push(text.slice(start, end));
      if (end >= text.length) break;
      start = Math.max(end - TEXT_CHUNK_OVERLAP, start + 1);
    }
    return chunks;
  }

  private async callGeminiParts(
    model: string,
    key: string,
    parts: any[],
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
    }
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ||
      '';
    const finish = data?.candidates?.[0]?.finishReason;
    if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') {
      this.logger.warn(`Gemini finishReason=${finish}`);
    }
    if (!text) throw new Error('Réponse Gemini vide.');
    return text;
  }

  private async extractOneGeminiPdfChunk(
    chunk: Buffer,
    model: string,
    key: string,
    partIndex: number,
    partTotal: number,
  ): Promise<ParsedStudentRow[]> {
    const parts: any[] = [
      { text: this.chunkPrompt(partIndex, partTotal) },
      {
        inline_data: {
          mime_type: 'application/pdf',
          data: chunk.toString('base64'),
        },
      },
    ];
    const text = await this.callGeminiParts(model, key, parts);
    return this.normalizeRows(this.parseJsonPayload(text));
  }

  private async extractGeminiPdfChunked(
    buffer: Buffer,
    model: string,
    key: string,
    pagesPerChunk = GEMINI_PAGES_PER_CHUNK,
  ): Promise<ParsedStudentRow[]> {
    const chunks = await this.splitPdfIntoPageChunks(buffer, pagesPerChunk);
    const batches: ParsedStudentRow[][] = [];
    for (let i = 0; i < chunks.length; i++) {
      this.logger.log(`Gemini PDF lot ${i + 1}/${chunks.length}…`);
      try {
        batches.push(
          await this.extractOneGeminiPdfChunk(
            chunks[i],
            model,
            key,
            i + 1,
            chunks.length,
          ),
        );
      } catch (err: any) {
        // Un lot trop dense : re-découpe en pages unitaires
        if (pagesPerChunk > 1) {
          this.logger.warn(
            `Lot ${i + 1} échoué (${err?.message || err}) — retry page par page.`,
          );
          const src = await this.loadPdfDoc(chunks[i]);
          if (src && src.getPageCount() > 1) {
            const singlePages = await this.splitPdfIntoPageChunks(chunks[i], 1);
            for (let j = 0; j < singlePages.length; j++) {
              batches.push(
                await this.extractOneGeminiPdfChunk(
                  singlePages[j],
                  model,
                  key,
                  i + 1,
                  chunks.length,
                ),
              );
            }
            continue;
          }
        }
        throw err;
      }
    }
    return this.mergeStudentRows(batches);
  }

  private async extractGeminiTextChunked(
    pdfText: string,
    model: string,
    key: string,
  ): Promise<ParsedStudentRow[]> {
    const chunks = this.splitTextIntoChunks(pdfText);
    if (!chunks.length) {
      throw new Error('PDF trop volumineux ou vide pour l’analyse IA.');
    }
    const batches: ParsedStudentRow[][] = [];
    for (let i = 0; i < chunks.length; i++) {
      this.logger.log(`Gemini texte lot ${i + 1}/${chunks.length}…`);
      const parts = [
        { text: this.chunkPrompt(i + 1, chunks.length) },
        { text: `Texte extrait du PDF (morceau ${i + 1}/${chunks.length}) :\n\n${chunks[i]}` },
      ];
      const text = await this.callGeminiParts(model, key, parts);
      batches.push(this.normalizeRows(this.parseJsonPayload(text)));
    }
    return this.mergeStudentRows(batches);
  }

  private async extractWithGemini(buffer: Buffer, pdfText: string): Promise<ParsedStudentRow[]> {
    const key = this.geminiKey()!;
    const model =
      this.config.get<string>('GEMINI_MODEL')?.trim() ||
      process.env.GEMINI_MODEL?.trim() ||
      'gemini-3.6-flash';

    const canSendPdf = buffer.length > 0 && buffer.length < 18 * 1024 * 1024;
    if (!canSendPdf) {
      return this.extractGeminiTextChunked(pdfText, model, key);
    }

    const src = await this.loadPdfDoc(buffer);
    const pageCount = src?.getPageCount() ?? 1;

    // PDFs longs : découpage d’emblée (évite JSON tronqué)
    if (pageCount >= GEMINI_AUTO_CHUNK_MIN_PAGES) {
      return this.extractGeminiPdfChunked(buffer, model, key);
    }

    // PDF court : un seul appel, fallback découpage si JSON invalide / tronqué
    try {
      return await this.extractOneGeminiPdfChunk(buffer, model, key, 1, 1);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (/JSON|tronqu/i.test(msg) && pageCount > 1) {
        this.logger.warn(`Essai unique échoué — bascule découpage PDF: ${msg}`);
        return this.extractGeminiPdfChunked(buffer, model, key, 1);
      }
      if (/JSON|tronqu/i.test(msg) && pdfText.length > 500) {
        this.logger.warn(`Essai PDF échoué — bascule texte découpé: ${msg}`);
        return this.extractGeminiTextChunked(pdfText, model, key);
      }
      throw err;
    }
  }

  private async extractWithOpenAi(pdfText: string): Promise<ParsedStudentRow[]> {
    if (!pdfText || pdfText.length < 20) {
      throw new Error(
        'Ce PDF semble scanné (peu de texte). Utilisez GEMINI_API_KEY pour l’analyse visuelle, ou un PDF texte.',
      );
    }
    const key = this.openaiKey()!;
    const model =
      this.config.get<string>('OPENAI_MODEL')?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      'gpt-4o-mini';

    const chunks = this.splitTextIntoChunks(pdfText);
    const batches: ParsedStudentRow[][] = [];

    for (let i = 0; i < chunks.length; i++) {
      this.logger.log(`OpenAI texte lot ${i + 1}/${chunks.length}…`);
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
          max_tokens: 8192,
          messages: [
            { role: 'system', content: this.chunkPrompt(i + 1, chunks.length) },
            {
              role: 'user',
              content: `Texte du PDF (morceau ${i + 1}/${chunks.length}) :\n\n${chunks[i]}`,
            },
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || `OpenAI HTTP ${res.status}`);
      }
      const text = data?.choices?.[0]?.message?.content || '';
      if (!text) throw new Error('Réponse OpenAI vide.');
      batches.push(this.normalizeRows(this.parseJsonPayload(text)));
    }

    return this.mergeStudentRows(batches);
  }
}
