// Provider Ollama (local/self-hosted) — API /api/chat e /api/embeddings.
// baseUrl obrigatorio (ex.: http://localhost:11434). Sem custo (modelo local).
import { Injectable } from '@nestjs/common';
import { AiProviderKind } from '@prisma/client';
import { httpRequest } from '../../../../shared/integration/http.util';
import {
  ILlmProvider,
  LlmChatRequest,
  LlmChatResult,
  LlmEmbedRequest,
  LlmEmbedResult,
  LlmMessage,
  LlmToolCall,
} from '../llm.interface';

interface OllamaToolCall {
  function?: { name?: string; arguments?: Record<string, unknown> };
}
interface OllamaChatResponse {
  message?: { content?: string; tool_calls?: OllamaToolCall[] };
  prompt_eval_count?: number;
  eval_count?: number;
  done_reason?: string;
  error?: string;
}
interface OllamaEmbedResponse {
  embedding?: number[];
  error?: string;
}

const DEFAULT_BASE = 'http://localhost:11434';

@Injectable()
export class OllamaLlmProvider implements ILlmProvider {
  readonly kind = AiProviderKind.OLLAMA;

  async chat(req: LlmChatRequest): Promise<LlmChatResult> {
    const base = (req.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
    const body: Record<string, unknown> = {
      model: req.model,
      stream: false,
      messages: req.messages.map((m) => this.toOllamaMessage(m)),
      options: { temperature: req.temperature ?? 0.3 },
    };
    if (req.tools && req.tools.length > 0) {
      body['tools'] = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }
    const res = await httpRequest(`${base}/api/chat`, {
      method: 'POST',
      body,
      timeoutMs: req.timeoutMs ?? 120_000,
    });
    const data = res.data as OllamaChatResponse | null;
    if (!res.ok || data?.error) {
      throw new Error(data?.error ?? `Provider Ollama respondeu HTTP ${res.status}.`);
    }
    const toolCalls: LlmToolCall[] = (data?.message?.tool_calls ?? [])
      .filter((c) => c.function?.name)
      .map((c, i) => ({
        id: `call_${i}`,
        name: c.function?.name ?? '',
        arguments: c.function?.arguments ?? {},
      }));
    return {
      content: data?.message?.content ?? '',
      toolCalls,
      finishReason: data?.done_reason,
      usage: {
        promptTokens: data?.prompt_eval_count ?? 0,
        completionTokens: data?.eval_count ?? 0,
        totalTokens: (data?.prompt_eval_count ?? 0) + (data?.eval_count ?? 0),
      },
    };
  }

  async embed(req: LlmEmbedRequest): Promise<LlmEmbedResult> {
    const base = (req.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
    const embeddings: number[][] = [];
    for (const prompt of req.input) {
      const res = await httpRequest(`${base}/api/embeddings`, {
        method: 'POST',
        body: { model: req.model, prompt },
        timeoutMs: req.timeoutMs ?? 30_000,
      });
      const data = res.data as OllamaEmbedResponse | null;
      if (!res.ok || data?.error) {
        throw new Error(data?.error ?? `Embeddings Ollama respondeu HTTP ${res.status}.`);
      }
      embeddings.push(data?.embedding ?? []);
    }
    return { embeddings, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  }

  private toOllamaMessage(m: LlmMessage): Record<string, unknown> {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content };
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.tool_calls.map((c) => ({
          function: { name: c.name, arguments: c.arguments },
        })),
      };
    }
    return { role: m.role, content: m.content };
  }
}
