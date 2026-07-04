// Extracao de texto das fontes RAG: TXT/MARKDOWN (direto), URL (http.util +
// strip de HTML basico), PDF/DOCX (libs opcionais via require tardio guardado —
// nao sao dependencia de compilacao; se ausentes, erro pt-BR claro). Funcoes
// puras; nenhum acesso a banco.
import { httpRequest } from '../../../shared/integration/http.util';

export type KnowledgeSourceType = 'TXT' | 'URL' | 'PDF' | 'DOCX' | 'MARKDOWN';

/** Remove tags HTML e colapsa espacos (extracao best-effort de URL). */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto de uma URL publica (HTML → texto). */
async function parseUrl(url: string): Promise<string> {
  const res = await httpRequest(url, { method: 'GET', timeoutMs: 20_000 });
  if (!res.ok) throw new Error(`URL respondeu HTTP ${res.status}.`);
  const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  return stripHtml(raw);
}

/** PDF via pdf-parse (opcional). Lanca erro pt-BR se a lib nao estiver instalada. */
async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(buffer);
    return parsed.text ?? '';
  } catch (e) {
    throw new Error(
      `Extração de PDF indisponível (instale "pdf-parse" no servidor): ${(e as Error).message}`,
    );
  }
}

/** DOCX via mammoth (opcional). Lanca erro pt-BR se a lib nao estiver instalada. */
async function parseDocx(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require('mammoth') as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> };
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? '';
  } catch (e) {
    throw new Error(
      `Extração de DOCX indisponível (instale "mammoth" no servidor): ${(e as Error).message}`,
    );
  }
}

export interface ParseInput {
  sourceType: KnowledgeSourceType;
  /** Texto cru (TXT/MARKDOWN) OU URL (URL). */
  text?: string;
  url?: string;
  /** Conteudo binario (PDF/DOCX) via Storage Manager. */
  buffer?: Buffer;
}

/** Extrai texto normalizado da fonte. */
export async function parseSource(input: ParseInput): Promise<string> {
  switch (input.sourceType) {
    case 'TXT':
    case 'MARKDOWN':
      return (input.text ?? '').trim();
    case 'URL':
      if (!input.url) throw new Error('URL não informada.');
      return parseUrl(input.url);
    case 'PDF':
      if (!input.buffer) throw new Error('Arquivo PDF não fornecido.');
      return parsePdf(input.buffer);
    case 'DOCX':
      if (!input.buffer) throw new Error('Arquivo DOCX não fornecido.');
      return parseDocx(input.buffer);
    default:
      throw new Error(`Tipo de fonte não suportado: ${String(input.sourceType)}`);
  }
}
