import { BadRequestException, Injectable } from '@nestjs/common';
import { ProviderCategory } from '@prisma/client';
import { ConnectchatClient, ConnectchatMention } from '../../../../shared/integration/connectchat.client';
import { HealthResult, ProviderContext, ProviderMetadata } from '../../../../shared/integration/provider.interface';
import { BaseProvider } from './base.provider';

type Params = Record<string, unknown>;

/**
 * ConnectChat é um canal externo: URL e actor são config da Connection; a chave
 * técnica fica exclusivamente no Secrets Manager. Nenhuma credencial é lida do
 * ambiente ou recebida pelo painel de conversas.
 */
@Injectable()
export class ConnectchatProvider extends BaseProvider {
  metadata(): ProviderMetadata {
    return {
      key: 'connectchat',
      name: 'ConnectChat',
      category: ProviderCategory.COMMUNICATION,
      description: 'Canal interno de mensagens entre cliente e empresa, exibido na Central de Atendimento.',
      icon: 'messages-square',
      secretKind: 'API_KEY',
      capabilities: [
        'health',
        'execute:listConversations',
        'execute:getMessages',
        'execute:getTyping',
        'execute:openConversation',
        'execute:sendMessage',
        'execute:sendAttachment',
        'execute:downloadAttachment',
        'execute:editMessage',
        'execute:setTyping',
        'execute:acknowledgeDelivered',
        'execute:acknowledgeRead',
        'execute:linkContactDirectly',
        'execute:disconnectContactDirectly',
        'execute:createLinkRequest',
        'execute:completeLinkRequest',
        'execute:exchangeLinkProof',
      ],
      wizardSchema: {
        testable: true,
        steps: [
          {
            id: 'connection',
            title: 'Servidor e identificação',
            description: 'A URL e o ator padrão pertencem a esta conexão local.',
            fields: [
              {
                key: 'api_url',
                label: 'URL da API ConnectChat',
                type: 'url',
                required: true,
                placeholder: 'https://chat.exemplo.com.br',
                help: 'URL base, sem /v1. O backend acrescenta a versão da API.',
              },
              {
                key: 'actor_ref',
                label: 'Actor referência',
                type: 'text',
                required: true,
                default: 'IA Studio:atendimento',
                help: 'Identifica a origem institucional. Cada ação de operador também leva seu ator local auditável.',
              },
              {
                key: 'timeout_ms',
                label: 'Timeout (ms)',
                type: 'number',
                required: false,
                default: 10000,
                help: 'Entre 100 e 60000 ms.',
              },
            ],
          },
          {
            id: 'credentials',
            title: 'Credencial técnica',
            description: 'A chave é cifrada no Cofre de Segredos; após o envio, não volta ao navegador nem vai para variáveis do front.',
            fields: [
              {
                key: 'api_key',
                label: 'Chave técnica ConnectChat',
                type: 'password',
                secret: true,
                required: true,
                help: 'Use uma chave com os escopos chat:read, chat:write, chat:edit, chat:receipt, link:direct e link:disconnect.',
              },
            ],
          },
        ],
      },
    };
  }

  private async client(ctx: ProviderContext, actorRef?: string): Promise<ConnectchatClient> {
    const config = (ctx.connection.config ?? {}) as Record<string, unknown>;
    const baseUrl = typeof config['api_url'] === 'string' ? config['api_url'] : '';
    const configuredActor = typeof config['actor_ref'] === 'string' ? config['actor_ref'] : '';
    const timeoutMs = config['timeout_ms'];
    const apiKey = (await ctx.secrets.get('api_key')) ?? '';
    if (!baseUrl || !apiKey || !configuredActor) {
      throw new BadRequestException('Conexão ConnectChat incompleta. Configure URL, actor referência e chave técnica em Integrações.');
    }
    return new ConnectchatClient({ baseUrl, apiKey, actorRef: actorRef || configuredActor, timeoutMs: typeof timeoutMs === 'number' || typeof timeoutMs === 'string' ? timeoutMs : undefined });
  }

  async health(ctx: ProviderContext): Promise<HealthResult> {
    const checks = { credentials: false, api: false };
    try {
      // A rota /health é pública; listar conversas confirma também a credencial e os escopos reais.
      await (await this.client(ctx)).listConversations();
      checks.credentials = true;
      checks.api = true;
      return { ok: true, detail: 'API e credencial ConnectChat validadas.', checks };
    } catch (error) {
      return { ok: false, detail: (error as Error).message, checks };
    }
  }

  override async execute(ctx: ProviderContext, operation: string, params: unknown): Promise<unknown> {
    const p = (params ?? {}) as Params;
    const actorRef = this.string(p, 'actorRef');
    const client = await this.client(ctx, actorRef || undefined);

    switch (operation) {
      case 'listConversations':
        return client.listConversations();
      case 'getMessages':
        return client.getMessages(this.required(p, 'conversationId'), this.string(p, 'afterSequence') || '0', this.number(p, 'limit', 50));
      case 'getTyping':
        return client.getTyping(this.required(p, 'conversationId'));
      case 'openConversation':
        return client.openConversation(this.required(p, 'businessContactId'), actorRef || undefined);
      case 'sendMessage':
        return client.sendMessage({
          conversationId: this.required(p, 'conversationId'),
          body: this.required(p, 'body'),
          clientMessageId: this.required(p, 'clientMessageId'),
          actorRef: actorRef || undefined,
          replyToMessageId: this.string(p, 'replyToMessageId') || undefined,
          mentions: Array.isArray(p['mentions']) ? p['mentions'] as ConnectchatMention[] : undefined,
        });
      case 'sendAttachment': {
        const data = p['data'];
        const attachmentKind = this.required(p, 'attachmentKind');
        if (!Buffer.isBuffer(data) || !['IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO'].includes(attachmentKind)) {
          throw new BadRequestException('ConnectChat exige um arquivo e uma categoria de anexo válidos.');
        }
        return client.sendAttachment({
          conversationId: this.required(p, 'conversationId'),
          clientMessageId: this.required(p, 'clientMessageId'),
          attachmentKind: attachmentKind as 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO',
          data,
          filename: this.required(p, 'filename'),
          mimeType: this.required(p, 'mimeType'),
          actorRef: actorRef || undefined,
        });
      }
      case 'downloadAttachment':
        return client.downloadAttachment(this.required(p, 'attachmentId'));
      case 'editMessage':
        return client.editMessage(this.required(p, 'messageId'), this.required(p, 'body'), actorRef || undefined);
      case 'setTyping': {
        const status = this.required(p, 'status');
        if (status !== 'started' && status !== 'stopped') throw new BadRequestException('ConnectChat exige um estado de digitação válido.');
        return client.setTyping(this.required(p, 'conversationId'), status, actorRef || undefined);
      }
      case 'acknowledgeDelivered':
        return client.acknowledgeDelivered(this.required(p, 'conversationId'), this.required(p, 'sequence'), actorRef || undefined);
      case 'acknowledgeRead':
        return client.acknowledgeRead(this.required(p, 'conversationId'), this.required(p, 'sequence'), actorRef || undefined);
      case 'linkContactDirectly':
        return client.linkContactDirectly(this.required(p, 'globalIdentityId'), this.required(p, 'customerRef'), this.string(p, 'customerDisplayName') || undefined, actorRef || undefined);
      case 'disconnectContactDirectly':
        return client.disconnectContactDirectly(this.required(p, 'globalIdentityId'), actorRef || undefined);
      case 'createLinkRequest':
        return client.createLinkRequest(this.required(p, 'globalIdentityId'), this.required(p, 'purpose'), this.string(p, 'customerRef') || undefined, this.optionalNumber(p, 'ttlSeconds'), actorRef || undefined);
      case 'completeLinkRequest':
        return client.completeLinkRequest(this.required(p, 'requestId'), this.required(p, 'globalIdentityId'), actorRef || undefined);
      case 'exchangeLinkProof':
        return client.exchangeLinkProof(
          this.required(p, 'proof'),
          this.string(p, 'customerRef') || undefined,
          actorRef || undefined,
        );
      default:
        return super.execute(ctx, operation, params);
    }
  }

  private required(params: Params, key: string): string {
    const value = this.string(params, key);
    if (!value) throw new BadRequestException(`ConnectChat exige "${key}".`);
    return value;
  }

  private string(params: Params, key: string): string {
    return typeof params[key] === 'string' ? params[key].trim() : '';
  }

  private number(params: Params, key: string, fallback: number): number {
    const value = this.optionalNumber(params, key);
    return value ?? fallback;
  }

  private optionalNumber(params: Params, key: string): number | undefined {
    const value = params[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
}
