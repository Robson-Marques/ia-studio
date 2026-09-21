// Tabela de precos por modelo (USD por 1k tokens) — DADO editavel (diretriz 39).
// Usada pelo LlmProviderService pra calcular cost_usd de cada run. Preco
// desconhecido = 0 (nao estima custo pra modelo fora da tabela).
import { AiProviderKind } from '@prisma/client';

export interface ModelPrice {
  /** USD por 1.000 tokens de prompt. */
  prompt: number;
  /** USD por 1.000 tokens de completion. */
  completion: number;
}

// Precos de referencia (jun/2026). Chave = model (case-insensitive, prefixo).
const PRICES: Record<string, ModelPrice> = {
  // OpenAI
  'gpt-4o': { prompt: 0.005, completion: 0.015 },
  'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
  'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
  'gpt-4.1': { prompt: 0.002, completion: 0.008 },
  'gpt-4.1-mini': { prompt: 0.0004, completion: 0.0016 },
  'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
  'text-embedding-3-small': { prompt: 0.00002, completion: 0 },
  'text-embedding-3-large': { prompt: 0.00013, completion: 0 },
  // Anthropic
  'claude-3-5-sonnet': { prompt: 0.003, completion: 0.015 },
  'claude-3-5-haiku': { prompt: 0.0008, completion: 0.004 },
  'claude-3-opus': { prompt: 0.015, completion: 0.075 },
  'claude-sonnet-4': { prompt: 0.003, completion: 0.015 },
  // Mistral (OpenAI-compatível via base_url).
  'mistral': { prompt: 0, completion: 0 },
};

/** Preco por prefixo de modelo (mais especifico primeiro). Null se ausente. */
export function priceForModel(model: string): ModelPrice | null {
  const lower = model.toLowerCase();
  let best: ModelPrice | null = null;
  let bestLen = 0;
  for (const [key, price] of Object.entries(PRICES)) {
    if (lower.startsWith(key) && key.length > bestLen) {
      best = price;
      bestLen = key.length;
    }
  }
  return best;
}

/** Custo em USD de um consumo de tokens (0 se modelo desconhecido). */
export function computeCost(model: string, promptTokens: number, completionTokens: number): number {
  const price = priceForModel(model);
  if (!price) return 0;
  const cost = (promptTokens / 1000) * price.prompt + (completionTokens / 1000) * price.completion;
  // Evita ruido de ponto flutuante (6 casas = fracao de centavo).
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Kind default do provider por model (heuristica pro simulador de custo). */
export function guessKindByModel(model: string): AiProviderKind {
  const m = model.toLowerCase();
  if (m.startsWith('claude')) return AiProviderKind.ANTHROPIC;
  return AiProviderKind.OPENAI;
}
