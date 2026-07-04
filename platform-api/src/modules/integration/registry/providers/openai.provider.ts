// Provider OpenAI — Fase 2: health (GET /v1/models) + discover (modelos).
// Execucao de chat/completions vem na Fase 5 (AI Platform).
import { Injectable } from '@nestjs/common';
import { ProviderCategory } from '@prisma/client';
import { BaseProvider } from './base.provider';
import {
  DiscoveryResult,
  HealthResult,
  ProviderContext,
  ProviderMetadata,
} from '../../../../shared/integration/provider.interface';
import { httpRequest } from '../../../../shared/integration/http.util';

const API_BASE = 'https://api.openai.com/v1';

@Injectable()
export class OpenAiProvider extends BaseProvider {
  metadata(): ProviderMetadata {
    return {
      key: 'openai',
      name: 'OpenAI',
      category: ProviderCategory.AI,
      description: 'Modelos GPT da OpenAI — chat, embeddings e visão (execução na Fase 5).',
      icon: 'sparkles',
      secretKind: 'API_KEY',
      capabilities: ['health', 'discover:models'],
      wizardSchema: {
        testable: true,
        steps: [
          {
            id: 'credentials',
            title: 'API Key',
            description: 'Cole a chave da OpenAI (fica cifrada no Cofre de Segredos).',
            fields: [
              {
                key: 'api_key',
                label: 'API Key',
                type: 'password',
                secret: true,
                required: true,
                placeholder: 'sk-...',
                help: 'Gerada em platform.openai.com → API Keys.',
              },
            ],
          },
        ],
      },
    };
  }

  async health(ctx: ProviderContext): Promise<HealthResult> {
    const apiKey = await ctx.secrets.get('api_key');
    if (!apiKey) return { ok: false, detail: 'API Key ausente no Cofre de Segredos.' };
    try {
      const res = await httpRequest(`${API_BASE}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeoutMs: 10_000,
      });
      if (res.status === 401) return { ok: false, detail: 'API Key inválida (401).', checks: { token: false } };
      if (!res.ok) return { ok: false, detail: `OpenAI respondeu HTTP ${res.status}.` };
      return { ok: true, detail: 'API Key válida — modelos listados.', checks: { token: true, endpoint: true } };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }

  async discover(ctx: ProviderContext): Promise<DiscoveryResult> {
    const apiKey = await ctx.secrets.get('api_key');
    if (!apiKey) return { resources: [] };
    const res = await httpRequest(`${API_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeoutMs: 10_000,
    });
    if (!res.ok) return { resources: [] };
    const body = res.data as { data?: Array<{ id?: string }> } | null;
    const models = Array.isArray(body?.data) ? body.data : [];
    return {
      resources: models
        .filter((m) => typeof m.id === 'string')
        .map((m) => ({ kind: 'model', id: m.id as string, name: m.id as string })),
    };
  }
}
