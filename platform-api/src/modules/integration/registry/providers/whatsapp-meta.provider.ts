// Provider WhatsApp (Meta Cloud API oficial-only) — Fase 3.
// Conexao WhatsApp = Connection do Integration Manager (provider_key
// 'whatsapp-meta'); credenciais no Secret; phone_number_id/waba_id no config
// (nao-sensiveis — o webhook roteia pela config, indexada por provider_key).
//
// Wizard: modo MANUAL (credenciais Cloud API) ate a aprovacao do App Meta;
// o fluxo oficial Embedded Signup/OAuth e o passo informativo "em breve"
// (spec "Connection Wizard Meta" — a arquitetura ja nasce no fluxo oficial).
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
import {
  createWabaTemplate,
  downloadMedia,
  getPhoneNumberInfo,
  listWabaPhoneNumbers,
  listWabaTemplates,
  markMessageRead,
  sendMessage,
  subscribeAppToWaba,
  uploadMedia,
} from '../../../../shared/integration/meta-graph.client';
import { RichMessage, TemplateVariables } from '../../../../shared/integration/whatsapp.types';

interface MetaConnectionRefs {
  token: string;
  phoneNumberId: string;
  wabaId: string;
}

@Injectable()
export class WhatsappMetaProvider extends BaseProvider {
  metadata(): ProviderMetadata {
    return {
      key: 'whatsapp-meta',
      name: 'WhatsApp (Meta Cloud API)',
      category: ProviderCategory.COMMUNICATION,
      description:
        'WhatsApp oficial via Meta Cloud API — múltiplos números, templates HSM, janela de 24h e webhooks.',
      icon: 'message-circle',
      secretKind: 'TOKEN',
      countMetric: 'whatsapp_numbers',
      capabilities: [
        'health',
        'discover',
        'execute:sendText',
        'execute:sendTemplate',
        'execute:sendMedia',
        'execute:uploadMedia',
        'execute:sendRich',
        'execute:listTemplates',
        'execute:createTemplate',
        'execute:syncStatus',
        'execute:downloadMedia',
        'execute:markRead',
      ],
      wizardSchema: {
        testable: true,
        webhookPath: '/api/webhooks/whatsapp',
        steps: [
          {
            id: 'official-flow',
            title: 'Fluxo oficial (Embedded Signup)',
            description:
              'EM BREVE — o fluxo oficial "Entrar com Facebook → Business Manager → WABA → número → permissões" exige um App Meta aprovado (Tech Provider/App Review). Até a aprovação, use o modo manual do próximo passo: mesma conexão, outro passo de entrada.',
            fields: [],
          },
          {
            id: 'credentials',
            title: 'Credenciais Meta (modo manual)',
            description:
              'Dados do painel Meta for Developers. Access Token, App Secret e Verify Token ficam no Cofre de Segredos.',
            fields: [
              {
                key: 'phone_number_id',
                label: 'Phone Number ID',
                type: 'text',
                required: true,
                help: 'Identificador do número na Cloud API (usado pra rotear o webhook).',
              },
              { key: 'waba_id', label: 'WABA ID', type: 'text', required: true, help: 'WhatsApp Business Account ID.' },
              { key: 'access_token', label: 'Access Token', type: 'password', secret: true, required: true },
              {
                key: 'app_secret',
                label: 'App Secret',
                type: 'password',
                secret: true,
                required: true,
                help: 'Valida a assinatura HMAC (x-hub-signature-256) do webhook.',
              },
              {
                key: 'verify_token',
                label: 'Verify Token',
                type: 'text',
                secret: true,
                required: true,
                generatable: true,
                help: 'Clique em "Gerar", copie e cole no webhook do App Meta (mesmo valor nos dois lados).',
              },
            ],
          },
          {
            id: 'routing',
            title: 'Roteamento (Meta Orchestrator)',
            description:
              'O fluxo nunca conhece o número: o orchestrator resolve a conexão por tag/departamento, padrão ou prioridade.',
            fields: [
              {
                key: 'department',
                label: 'Departamento',
                type: 'text',
                placeholder: 'Comercial, Financeiro, Suporte…',
                help: 'Critério de roteamento do Meta Orchestrator (além das tags da conexão).',
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

  private async refs(ctx: ProviderContext): Promise<MetaConnectionRefs> {
    const config = (ctx.connection.config ?? {}) as Record<string, unknown>;
    const phoneNumberId = typeof config['phone_number_id'] === 'string' ? (config['phone_number_id'] as string) : '';
    const wabaId = typeof config['waba_id'] === 'string' ? (config['waba_id'] as string) : '';
    const token = (await ctx.secrets.get('access_token')) ?? '';
    if (!token || !phoneNumberId) {
      throw new BadRequestException('Conexão WhatsApp sem Access Token/Phone Number ID configurados.');
    }
    return { token, phoneNumberId, wabaId };
  }

  // ─── IProvider ──────────────────────────────────────

  override async connect(ctx: ProviderContext, _config: Record<string, unknown>): Promise<ConnectResult> {
    // Valida token consultando o proprio numero (GET phone number).
    try {
      const { token, phoneNumberId, wabaId } = await this.refs(ctx);
      const info = await getPhoneNumberInfo(token, phoneNumberId);
      // Inscreve a WABA no app — SEM isto a Meta nao encaminha mensagens
      // recebidas (o cliente teria que rodar subscribed_apps na mao). Best-effort:
      // se falhar (ex.: token sem whatsapp_business_management), a conexao ainda
      // vale pro envio; o recebimento pode ser inscrito manualmente depois.
      if (wabaId) {
        try {
          await subscribeAppToWaba(token, wabaId);
        } catch (e) {
          ctx.logger.warn(`WhatsApp: não foi possível inscrever a WABA no app automaticamente: ${(e as Error).message}`);
        }
      }
      return { ok: true, detail: `Número validado: ${info.display_phone_number ?? phoneNumberId}` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }

  async health(ctx: ProviderContext): Promise<HealthResult> {
    const checks: Record<string, boolean> = { token: false, number: false, templates: false };
    try {
      const { token, phoneNumberId, wabaId } = await this.refs(ctx);
      checks.token = true;
      const info = await getPhoneNumberInfo(token, phoneNumberId);
      checks.number = true;
      let detail = `Número OK (${info.display_phone_number ?? phoneNumberId}) — qualidade ${info.quality_rating ?? 'desconhecida'}`;
      if (wabaId) {
        try {
          const templates = await listWabaTemplates(token, wabaId);
          checks.templates = true;
          detail += ` — ${templates.length} template(s) na WABA`;
        } catch {
          detail += ' — falha ao listar templates da WABA';
        }
      }
      return { ok: true, detail, checks };
    } catch (e) {
      return { ok: false, detail: (e as Error).message, checks };
    }
  }

  override async execute(ctx: ProviderContext, operation: string, params: unknown): Promise<unknown> {
    const { token, phoneNumberId, wabaId } = await this.refs(ctx);
    const p = (params ?? {}) as Record<string, unknown>;

    switch (operation) {
      case 'sendText': {
        const to = String(p['to'] ?? '');
        const body = String(p['body'] ?? '');
        if (!to || !body) throw new BadRequestException('sendText exige "to" e "body".');
        return sendMessage(token, phoneNumberId, to, { kind: 'text', body });
      }
      case 'sendTemplate': {
        const to = String(p['to'] ?? '');
        const name = String(p['name'] ?? '');
        if (!to || !name) throw new BadRequestException('sendTemplate exige "to" e "name".');
        return sendMessage(token, phoneNumberId, to, {
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
        return sendMessage(token, phoneNumberId, to, {
          kind: kind as 'image' | 'audio' | 'video' | 'document',
          url: url || undefined,
          mediaId: mediaId || undefined,
          caption: typeof p['caption'] === 'string' ? (p['caption'] as string) : undefined,
          filename: typeof p['filename'] === 'string' ? (p['filename'] as string) : undefined,
        });
      }
      case 'uploadMedia': {
        const mime = String(p['mime_type'] ?? '');
        const filename = String(p['filename'] ?? 'arquivo');
        const data = p['data'];
        if (!mime || !Buffer.isBuffer(data)) {
          throw new BadRequestException('uploadMedia exige "data" (Buffer), "mime_type" e "filename".');
        }
        const mediaId = await uploadMedia(token, phoneNumberId, { data, mimeType: mime, filename });
        return { media_id: mediaId };
      }
      case 'sendRich': {
        const to = String(p['to'] ?? '');
        const message = p['message'] as RichMessage | undefined;
        if (!to || !message?.kind) throw new BadRequestException('sendRich exige "to" e "message" (RichMessage).');
        return sendMessage(token, phoneNumberId, to, message);
      }
      case 'listTemplates': {
        if (!wabaId) throw new BadRequestException('Conexão sem WABA ID — não é possível listar templates.');
        return listWabaTemplates(token, wabaId);
      }
      case 'createTemplate': {
        if (!wabaId) throw new BadRequestException('Conexão sem WABA ID — não é possível criar templates.');
        const name = String(p['name'] ?? '');
        if (!name) throw new BadRequestException('createTemplate exige "name".');
        return createWabaTemplate(token, wabaId, {
          name,
          language: typeof p['language'] === 'string' ? (p['language'] as string) : 'pt_BR',
          category: typeof p['category'] === 'string' ? (p['category'] as string) : 'UTILITY',
          components: Array.isArray(p['components']) ? (p['components'] as unknown[]) : [],
        });
      }
      case 'markRead': {
        // Marca uma mensagem incoming como lida (tick azul) e, se typing=true,
        // dispara o "digitando…". Best-effort: nunca deve quebrar o fluxo de
        // atendimento — quem chama trata como opcional.
        const messageId = String(p['message_id'] ?? '');
        if (!messageId) throw new BadRequestException('markRead exige "message_id".');
        return markMessageRead(token, phoneNumberId, messageId, { typing: p['typing'] === true });
      }
      case 'syncStatus':
        return getPhoneNumberInfo(token, phoneNumberId);
      case 'downloadMedia': {
        const mediaId = String(p['media_id'] ?? '');
        if (!mediaId) throw new BadRequestException('downloadMedia exige "media_id".');
        return downloadMedia(token, mediaId);
      }
      default:
        throw new BadRequestException(`Operação "${operation}" não suportada pelo provider whatsapp-meta.`);
    }
  }

  override async discover(ctx: ProviderContext): Promise<DiscoveryResult> {
    const { token, phoneNumberId, wabaId } = await this.refs(ctx);
    const resources: DiscoveryResult['resources'] = [];
    const info = await getPhoneNumberInfo(token, phoneNumberId);
    resources.push({
      kind: 'phone_number',
      id: phoneNumberId,
      name: info.display_phone_number ?? phoneNumberId,
      meta: {
        verified_name: info.verified_name,
        quality_rating: info.quality_rating,
        messaging_limit_tier: info.messaging_limit_tier,
      },
    });
    if (wabaId) {
      const numbers = await listWabaPhoneNumbers(token, wabaId).catch(() => []);
      for (const n of numbers) {
        const id = String(n['id'] ?? '');
        if (!id || id === phoneNumberId) continue;
        resources.push({
          kind: 'phone_number',
          id,
          name: String(n['display_phone_number'] ?? id),
          meta: { verified_name: n['verified_name'], quality_rating: n['quality_rating'] },
        });
      }
      const templates = await listWabaTemplates(token, wabaId).catch(() => []);
      for (const t of templates) {
        resources.push({
          kind: 'template',
          id: t.id ?? `${t.name}:${t.language}`,
          name: `${t.name} (${t.language})`,
          meta: { status: t.status, category: t.category },
        });
      }
    }
    return { resources };
  }
}
