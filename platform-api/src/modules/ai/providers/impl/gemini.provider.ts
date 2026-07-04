// Provider Google Gemini (generateContent + embedContent). API key via query
// ?key=. Tool-calling via functionDeclarations/functionCall/functionResponse.
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

interface GeminiPart {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
  functionResponse?: { name?: string; response?: Record<string, unknown> };
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  error?: { message?: string };
}
interface GeminiEmbedResponse {
  embedding?: { values?: number[] };
  error?: { message?: string };
}

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

@Injectable()
export class GeminiLlmProvider implements ILlmProvider {
  readonly kind = AiProviderKind.GEMINI;

  async chat(req: LlmChatRequest): Promise<LlmChatResult> {
    const base = (req.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const contents = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => this.toGeminiContent(m));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: req.temperature ?? 0.3,
        ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
      },
    };
    if (system) body['systemInstruction'] = { parts: [{ text: system }] };
    if (req.tools && req.tools.length > 0) {
      body['tools'] = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    const url = `${base}/models/${encodeURIComponent(req.model)}:generateContent?key=${encodeURIComponent(req.apiKey ?? '')}`;
    const res = await httpRequest(url, { method: 'POST', body, timeoutMs: req.timeoutMs ?? 60_000 });
    const data = res.data as GeminiResponse | null;
    if (!res.ok) {
      throw new Error(data?.error?.message ?? `Provider Gemini respondeu HTTP ${res.status}.`);
    }
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? '').join('');
    const toolCalls: LlmToolCall[] = parts
      .filter((p) => p.functionCall?.name)
      .map((p, i) => ({
        id: `call_${i}`,
        name: p.functionCall?.name ?? '',
        arguments: p.functionCall?.args ?? {},
      }));
    return {
      content: text,
      toolCalls,
      finishReason: data?.candidates?.[0]?.finishReason,
      usage: {
        promptTokens: data?.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data?.usageMetadata?.totalTokenCount ?? 0,
      },
    };
  }

  async embed(req: LlmEmbedRequest): Promise<LlmEmbedResult> {
    const base = (req.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
    const embeddings: number[][] = [];
    for (const text of req.input) {
      const url = `${base}/models/${encodeURIComponent(req.model)}:embedContent?key=${encodeURIComponent(req.apiKey ?? '')}`;
      const res = await httpRequest(url, {
        method: 'POST',
        body: { model: `models/${req.model}`, content: { parts: [{ text }] } },
        timeoutMs: req.timeoutMs ?? 30_000,
      });
      const data = res.data as GeminiEmbedResponse | null;
      if (!res.ok) {
        throw new Error(data?.error?.message ?? `Embeddings Gemini respondeu HTTP ${res.status}.`);
      }
      embeddings.push(data?.embedding?.values ?? []);
    }
    return { embeddings, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  }

  private toGeminiContent(m: LlmMessage): Record<string, unknown> {
    if (m.role === 'tool') {
      return {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: m.name ?? m.tool_call_id ?? 'tool',
              response: { result: m.content },
            },
          },
        ],
      };
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      const parts: Array<Record<string, unknown>> = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.tool_calls) {
        parts.push({ functionCall: { name: c.name, args: c.arguments } });
      }
      return { role: 'model', parts };
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
  }
}
