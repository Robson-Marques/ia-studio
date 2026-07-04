// Chunker: quebra texto em pedacos por tamanho (chars) com overlap. Funcao
// pura, sem estado. Aproximacao de tokens: ~4 chars/token (heuristica p/
// token_count; o custo real vem do provider de embedding).
export interface Chunk {
  idx: number;
  content: string;
  tokenCount: number;
}

/** Divide o texto em chunks respeitando chunkSize/overlap (em caracteres). */
export function chunkText(text: string, chunkSize = 800, overlap = 120): Chunk[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const size = Math.max(1, chunkSize);
  const step = Math.max(1, size - Math.max(0, Math.min(overlap, size - 1)));
  const chunks: Chunk[] = [];
  let idx = 0;
  for (let start = 0; start < clean.length; start += step) {
    const slice = clean.slice(start, start + size).trim();
    if (slice) {
      chunks.push({ idx, content: slice, tokenCount: Math.ceil(slice.length / 4) });
      idx += 1;
    }
    if (start + size >= clean.length) break;
  }
  return chunks;
}
