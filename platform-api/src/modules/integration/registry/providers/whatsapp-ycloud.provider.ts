// Provider WhatsApp (YCloud — BSP oficial) — Checkpoint 2a do porte de conectores.
// Conexao YCloud = Connection do Integration Manager (provider_key
// 'whatsapp-ycloud'); credenciais (api_key/webhook_secret) no Secret;
// phone_number/waba_id no config (nao-sensiveis). Coexiste com whatsapp-meta:
// as duas sao "oficiais" e capazes de template HSM.
//
// Este checkpoint cobre o OUTBOUND (envio + health + discover). O inbound
// (webhook /api/webhooks/whatsapp/ycloud + assinatura + persistencia) entra
// no Checkpoint 2b.
import { BadRequestException, Injectable } from '@nestjs/common';
import { ProviderCategory } from '@prisma/client';
import { BaseProvider } from './base.provider';
import {
  ConnectResult,
  DiscoveryResult,
  HealthResult,
  ProviderContext,
  ProviderMetadata,
} from '../../../../shared/integration/provider.interface';
import { RichMessage, TemplateVariables } from '../../../../shared/integration/whatsapp.types';
import { pingYCloud, sendYCloudMessage, uploadYCloudMedia } from '../../../../shared/integration/ycloud.client';

interface YCloudRefs {
  apiKey: string;
  phoneNumber: string;
  wabaId: string;
}

@Injectable()
export class WhatsappYcloudProvider extends BaseProvider {
  metadata(): ProviderMetadata {
    return {
      key: 'whatsapp-ycloud',
      name: 'WhatsApp (YCloud)',
      category: ProviderCategory.COMMUNICATION,
      description:
        'WhatsApp oficial via YCloud (BSP) — número oficial, templates HSM, janela de 24h, webhook próprio e coexistência com histórico compartilhado.',
      icon: 'message-circle',
      secretKind: 'API_KEY',
      countMetric: 'whatsapp_numbers',
      capabilities: [
        'health',
        'discover',
        'execute:sendText',
        'execute:sendTemplate',
        'execute:sendMedia',
        'execute:uploadMedia',
        'execute:sendRich',
      ],
      wizardSchema: {
        testable: true,
        // O inbound entra no Checkpoint 2b; a URL já é exibida para cadastro na YCloud.
        webhookPath: '/api/webhooks/whatsapp/ycloud',
        steps: [
          {
            id: 'credentials',
            title: 'Credenciais YCloud',
            description:
              'Dados do painel da YCloud. A chave da API e o segredo do webhook ficam no Cofre de Segredos.',
            fields: [
              {
                key: 'phone_number',
                label: 'Número do WhatsApp',
                type: 'text',
                required: true,
                placeholder: '+5511999999999',
                help: 'Formato internacional. É o número oficial conectado na YCloud.',
              },
              {
                key: 'waba_id',
                label: 'Business Account ID (WABA)',
                type: 'text',
                required: true,
                help: 'Conta oficial que contém os modelos (templates) na YCloud.',
              },
              { key: 'api_key', label: 'Chave da API', type: 'password', secret: true, required: true },
              {
                key: 'webhook_secret',
                label: 'Segredo do webhook',
                type: 'password',
                secret: true,
                required: true,
                help: 'Usado para validar a assinatura dos eventos recebidos da YCloud.',
              },
            ],
          },
          {
            id: 'routing',
            title: 'Roteamento (Orchestrator)',
            description:
              'O fluxo nunca conhece o número: o orchestrator resolve a conexão por tag/departamento, padrão ou prioridade.',
            fields: [
              {
                key: 'department',
                label: 'Departamento',
                type: 'text',
                placeholder: 'Comercial, Financeiro, Suporte…',
                help: 'Critério de roteamento (além das tags da conexão).',
              },
              {
                key: 'is_default',
                label: 'Conexão padrão do ambiente?',
                type: 'select',
                default: 'nao',
                options: [
                  { value: 'nao', label: 'Não' },
                  { value: 'sim', label: 'Sim (recebe envios sem critério)' },
                ],
              },
            ],
          },
        ],
      },
    };
  }

  // ─── Credenciais ────────────────────────────────────

  private async refs(ctx: ProviderContext): Promise<YCloudRefs> {
    const config = (ctx.connection.config ?? {}) as Record<string, unknown>;
    const phoneNumber = typeof config['phone_number'] === 'string' ? (config['phone_number'] as string) : '';
    const wabaId = typeof config['waba_id'] === 'string' ? (config['waba_id'] as string) : '';
    const apiKey = (await ctx.secrets.get('api_key')) ?? '';
    if (!apiKey || !phoneNumber) {
      throw new BadRequestException('Conexão YCloud sem Chave da API / Número configurados.');
    }
    return { apiKey, phoneNumber, wabaId };
  }

  // ─── IProvider ──────────────────────────────────────

  override async connect(ctx: ProviderContext, _config: Record<string, unknown>): Promise<ConnectResult> {
    try {
      const { apiKey, phoneNumber } = await this.refs(ctx);
      const ping = await pingYCloud(apiKey);
      if (!ping.ok) return { ok: false, detail: ping.detail ?? 'Chave da API YCloud inválida.' };
      return { ok: true, detail: ping.detail ? `Número ${phoneNumber} — ${ping.detail}` : `Número ${phoneNumber} validado.` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }

  async health(ctx: ProviderContext): Promise<HealthResult> {
    const checks: Record<string, boolean> = { credentials: false, api_key: false };
    try {
      const { apiKey } = await this.refs(ctx);
      checks.credentials = true;
      const ping = await pingYCloud(apiKey);
      checks.api_key = ping.ok;
      return { ok: ping.ok, detail: ping.detail ?? 'Credenciais YCloud OK.', checks };
    } catch (e) {
      return { ok: false, detail: (e as Error).message, checks };
    }
  }

  override async execute(ctx: ProviderContext, operation: string, params: unknown): Promise<unknown> {
    const { apiKey, phoneNumber } = await this.refs(ctx);
    const p = (params ?? {}) as Record<string, unknown>;

    switch (operation) {
      case 'sendText': {
        const to = String(p['to'] ?? '');
        const body = String(p['body'] ?? '');
        if (!to || !body) throw new BadRequestException('sendText exige "to" e "body".');
        return sendYCloudMessage(apiKey, phoneNumber, to, { kind: 'text', body });
      }
      case 'sendTemplate': {
        const to = String(p['to'] ?? '');
        const name = String(p['name'] ?? '');
        if (!to || !name) throw new BadRequestException('sendTemplate exige "to" e "name".');
        return sendYCloudMessage(apiKey, phoneNumber, to, {
          kind: 'template',
          name,
          language: typeof p['language'] === 'string' ? (p['language'] as string) : 'pt_BR',
          variables: p['variables'] as TemplateVariables | undefined,
        });
      }
      case 'sendMedia': {
        const to = String(p['to'] ?? '');
        const kind = String(p['kind'] ?? '');
        const url = typeof p['url'] === 'string' ? (p['url'] as string) : '';
        const mediaId = typeof p['media_id'] === 'string' ? (p['media_id'] as string) : '';
        if (!to || (!url && !mediaId) || !['image', 'audio', 'video', 'document'].includes(kind)) {
          throw new BadRequestException('sendMedia exige "to", "kind" (image/audio/video/document) e "url" ou "media_id".');
        }
        return sendYCloudMessage(
          apiKey,
          phoneNumber,
          to,
          {
            kind: kind as 'image' | 'audio' | 'video' | 'document',
            caption: typeof p['caption'] === 'string' ? (p['caption'] as string) : undefined,
            filename: typeof p['filename'] === 'string' ? (p['filename'] as string) : undefined,
          },
          { link: url || undefined, id: mediaId || undefined },
        );
      }
      case 'uploadMedia': {
        const mime = String(p['mime_type'] ?? '');
        const filename = String(p['filename'] ?? 'arquivo');
        const data = p['data'];
        if (!mime || !Buffer.isBuffer(data)) {
          throw new BadRequestException('uploadMedia exige "data" (Buffer), "mime_type" e "filename".');
        }
        return uploadYCloudMedia(apiKey, phoneNumber, { data, mimeType: mime, filename });
      }
      case 'sendRich': {
        const to = String(p['to'] ?? '');
        const message = p['message'] as RichMessage | undefined;
        if (!to || !message?.kind) throw new BadRequestException('sendRich exige "to" e "message" (RichMessage).');
        // Mídia por RichMessage: usa url/mediaId embutidos no próprio RichMedia.
        const ref = message.kind === 'image' || message.kind === 'audio' || message.kind === 'video' || message.kind === 'document'
          ? { link: message.url, id: message.mediaId }
          : undefined;
        return sendYCloudMessage(apiKey, phoneNumber, to, message, ref);
      }
      default:
        throw new BadRequestException(`Operação "${operation}" não suportada pelo provider whatsapp-ycloud.`);
    }
  }

  override async discover(ctx: ProviderContext): Promise<DiscoveryResult> {
    const { phoneNumber, wabaId } = await this.refs(ctx);
    const resources: DiscoveryResult['resources'] = [
      { kind: 'phone_number', id: phoneNumber, name: phoneNumber, meta: { provider: 'ycloud', waba_id: wabaId || undefined } },
    ];
    return { resources };
  }
}
