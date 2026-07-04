// Interface UNICA de provider de LLM (diretriz 35 — registry declarativo).
// Espelha o padrao IProvider do Integration Manager: cada implementacao
// registra-se no LlmProviderRegistryService — proibido switch por kind
// espalhado. Sem SDK oficial de LLM: HTTP puro (shared/integration/http.util).
import { AiProviderKind } from '@prisma/client';

// ─── Mensagens / ferramentas (formato canonico, provider-agnostico) ─────

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmMessage {
  role: LlmRole;
  content: string;
  /** Chamadas de ferramenta solicitadas pelo assistente (role=assistant). */
  tool_calls?: LlmToolCall[];
  /** Correlacao da resposta de tool (role=tool). */
  tool_call_id?: string;
  /** Nome da tool (role=tool). */
  name?: string;
}

export interface LlmTool {
  name: string;
  description: string;
  /** JSON Schema dos parametros. */
  parameters: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  /** Argumentos ja parseados (JSON). */
  arguments: Record<string, unknown>;
}

// ─── Requisicoes / resultados ───────────────────────────────────────────

export interface LlmChatRequest {
  model: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  temperature?: number;
  maxTokens?: number;
  /** URL base da API (OpenAI-compatible: OpenRouter/Groq/DeepSeek/... via config). */
  baseUrl?: string;
  /** Credencial decifrada do Cofre (nunca logada). */
  apiKey?: string;
  timeoutMs?: number;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmChatResult {
  /** Texto da resposta (vazio quando so ha tool_calls). */
  content: string;
  toolCalls: LlmToolCall[];
  usage: LlmUsage;
  /** Motivo de parada informado pelo provider (stop|tool_calls|length|...). */
  finishReason?: string;
}

export interface LlmEmbedRequest {
  model: string;
  input: string[];
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface LlmEmbedResult {
  embeddings: number[][];
  usage: LlmUsage;
}

// ─── Interface unica ────────────────────────────────────────────────────

export interface ILlmProvider {
  kind: AiProviderKind;
  chat(req: LlmChatRequest): Promise<LlmChatResult>;
  /** Nem todo provider gera embeddings (Anthropic nao). */
  embed?(req: LlmEmbedRequest): Promise<LlmEmbedResult>;
}
