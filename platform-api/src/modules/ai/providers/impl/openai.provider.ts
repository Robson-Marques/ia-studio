// Provider OpenAI-compatible (Chat Completions + Embeddings). Serve OpenAI e,
// via baseUrl da connection, tambem OpenRouter/Groq/DeepSeek/Mistral/Azure —
// todos falam o mesmo dialeto /v1/chat/completions. Sem SDK: HTTP puro.
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

interface OpenAiToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}
interface OpenAiChoice {
  message?: { content?: string | null; tool_calls?: OpenAiToolCall[] };
  finish_reason?: string;
}
interface OpenAiChatResponse {
  choices?: OpenAiChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string };
}
interface OpenAiEmbedResponse {
  data?: Array<{ embedding?: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
  error?: { message?: string };
}

const DEFAULT_BASE = 'https://api.openai.com/v1';

@Injectable()
export class OpenAiLlmProvider implements ILlmProvider {
  readonly kind = AiProviderKind.OPENAI;

  async chat(req: LlmChatRequest): Promise<LlmChatResult> {
    const base = (req.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages.map((m) => this.toOpenAiMessage(m)),
      temperature: req.temperature ?? 0.3,
    };
    if (req.maxTokens) body['max_tokens'] = req.maxTokens;
    if (req.tools && req.tools.length > 0) {
      body['tools'] = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await httpRequest(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${req.apiKey ?? ''}` },
      body,
      timeoutMs: req.timeoutMs ?? 60_000,
    });
    const data = res.data as OpenAiChatResponse | null;
    if (!res.ok) {
      throw new Error(data?.error?.message ?? `Provider OpenAI respondeu HTTP ${res.status}.`);
    }
    const choice = data?.choices?.[0];
    const toolCalls: LlmToolCall[] = (choice?.message?.tool_calls ?? [])
      .filter((c) => c.function?.name)
      .map((c, i) => ({
        id: c.id ?? `call_${i}`,
        name: c.function?.name ?? '',
        arguments: this.parseArgs(c.function?.arguments),
      }));
    return {
      content: choice?.message?.content ?? '',
      toolCalls,
      finishReason: choice?.finish_reason,
      usage: {
        promptTokens: data?.usage?.prompt_tokens ?? 0,
        completionTokens: data?.usage?.completion_tokens ?? 0,
        totalTokens: data?.usage?.total_tokens ?? 0,
      },
    };
  }

  async embed(req: LlmEmbedRequest): Promise<LlmEmbedResult> {
    const base = (req.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
    const res = await httpRequest(`${base}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${req.apiKey ?? ''}` },
      body: { model: req.model, input: req.input },
      timeoutMs: req.timeoutMs ?? 30_000,
    });
    const data = res.data as OpenAiEmbedResponse | null;
    if (!res.ok) {
      throw new Error(data?.error?.message ?? `Embeddings OpenAI respondeu HTTP ${res.status}.`);
    }
    return {
      embeddings: (data?.data ?? []).map((d) => d.embedding ?? []),
      usage: {
        promptTokens: data?.usage?.prompt_tokens ?? 0,
        completionTokens: 0,
        totalTokens: data?.usage?.total_tokens ?? 0,
      },
    };
  }

  private toOpenAiMessage(m: LlmMessage): Record<string, unknown> {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.tool_calls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.arguments) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  }

  private parseArgs(raw?: string): Record<string, unknown> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
}
