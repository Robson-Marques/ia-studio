// Provider Anthropic (Messages API). System prompt vai no campo `system`;
// tool-calling via `tools`/`tool_use`/`tool_result`. Sem embeddings (Anthropic
// nao oferece) — o LlmProviderService cai pro provider de embedding da base.
import { Injectable } from '@nestjs/common';
import { AiProviderKind } from '@prisma/client';
import { httpRequest } from '../../../../shared/integration/http.util';
import {
  ILlmProvider,
  LlmChatRequest,
  LlmChatResult,
  LlmMessage,
  LlmToolCall,
} from '../llm.interface';

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}
interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

const DEFAULT_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

@Injectable()
export class AnthropicLlmProvider implements ILlmProvider {
  readonly kind = AiProviderKind.ANTHROPIC;

  async chat(req: LlmChatRequest): Promise<LlmChatResult> {
    const base = (req.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const messages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => this.toAnthropicMessage(m));

    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0.3,
      messages,
    };
    if (system) body['system'] = system;
    if (req.tools && req.tools.length > 0) {
      body['tools'] = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const res = await httpRequest(`${base}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': req.apiKey ?? '',
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body,
      timeoutMs: req.timeoutMs ?? 60_000,
    });
    const data = res.data as AnthropicResponse | null;
    if (!res.ok) {
      throw new Error(data?.error?.message ?? `Provider Anthropic respondeu HTTP ${res.status}.`);
    }
    const blocks = data?.content ?? [];
    const text = blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    const toolCalls: LlmToolCall[] = blocks
      .filter((b) => b.type === 'tool_use' && b.name)
      .map((b) => ({
        id: b.id ?? '',
        name: b.name ?? '',
        arguments: b.input ?? {},
      }));
    return {
      content: text,
      toolCalls,
      finishReason: data?.stop_reason,
      usage: {
        promptTokens: data?.usage?.input_tokens ?? 0,
        completionTokens: data?.usage?.output_tokens ?? 0,
        totalTokens: (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0),
      },
    };
  }

  private toAnthropicMessage(m: LlmMessage): Record<string, unknown> {
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }],
      };
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      const content: Array<Record<string, unknown>> = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const c of m.tool_calls) {
        content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.arguments });
      }
      return { role: 'assistant', content };
    }
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content };
  }
}
