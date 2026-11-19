import { BadRequestException, Injectable } from '@nestjs/common';
import { ProviderCategory } from '@prisma/client';
import { BaseProvider } from './base.provider';
import { DiscoveryResult, HealthResult, ProviderContext, ProviderMetadata } from '../../../../shared/integration/provider.interface';
import { NivooWhatsappClient } from '../../../../shared/integration/nivoo-whatsapp.client';

export const NIVOO_PROVIDER_KEY = 'whatsapp-nivoo';

export async function clientForNivooConnection(ctx: ProviderContext): Promise<NivooWhatsappClient> {
  const config = (ctx.connection.config ?? {}) as Record<string, unknown>;
  return new NivooWhatsappClient({
    installationId: String(config['installation_id'] ?? ''),
    internalKey: (await ctx.secrets.get('internal_key')) ?? '',
    baseUrl: String(config['base_url'] ?? 'https://integracoes.nivoo.dev.br'),
  });
}

function remoteId(ctx: ProviderContext): string {
  const config = (ctx.connection.config ?? {}) as Record<string, unknown>;
  const id = String(config['remote_connection_id'] ?? '');
  if (!id) throw new BadRequestException('Conclua a conexão do número pela Central WhatsApp antes de enviar.');
  return id;
}

function templateValues(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') values[key.includes(':') ? key : `body:${key}`] = value;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [position, text] of Object.entries(value)) {
        if (typeof text === 'string') values[`${key}:${position}`] = text;
      }
    }
  }
  return values;
}

@Injectable()
export class WhatsappNivooProvider extends BaseProvider {
  metadata(): ProviderMetadata {
    return {
      key: NIVOO_PROVIDER_KEY,
      name: 'WhatsApp (Central Nivoo)',
      category: ProviderCategory.COMMUNICATION,
      description: 'Conexão oficial pela Central Nivoo. A Central administra a Meta, o histórico e os modelos.',
      icon: 'message-circle',
      secretKind: 'API_KEY',
      capabilities: [
        'health', 'discover', 'execute:sendText', 'execute:sendTemplate', 'execute:sendMedia',
        'execute:uploadMedia', 'execute:listTemplates', 'execute:createTemplate',
        'execute:editTemplate', 'execute:deleteTemplate', 'execute:uploadTemplateMedia',
        'execute:syncStatus', 'execute:markRead',
      ],
      wizardSchema: {
        testable: true,
        steps: [{
          id: 'consumer', title: 'Consumidor da Central Nivoo',
          description: 'Cadastre primeiro esta instalação em Plataforma → Consumidores integradores na Central. A chave fica cifrada no Cofre de Segredos.',
          fields: [
            { key: 'installation_id', label: 'Identificador da instalação', type: 'text', required: true },
            { key: 'consumer_origin', label: 'Origem HTTPS do painel', type: 'url', required: true, help: 'Origem exata cadastrada na Central, sem caminho.' },
            { key: 'internal_key', label: 'Chave do consumidor', type: 'password', secret: true, required: true },
          ],
        }],
      },
    };
  }

  override async health(ctx: ProviderContext): Promise<HealthResult> {
    try {
      const client = await clientForNivooConnection(ctx);
      const { connections } = await client.listConnections();
      const own = (ctx.connection.config as Record<string, unknown>)['remote_connection_id'];
      if (own) {
        const remote = connections.find((item) => item.id === own);
        if (!remote) return { ok: false, detail: 'Este número não pertence mais à instalação na Central.' };
        if (remote.status !== 'ACTIVE') return { ok: false, detail: 'Este número está desconectado na Central.' };
      }
      return { ok: true, detail: own ? 'Número encontrado na Central.' : 'Consumidor autenticado. Conecte um número pela tela WhatsApp → Números.' };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }

  override async discover(ctx: ProviderContext): Promise<DiscoveryResult> {
    const client = await clientForNivooConnection(ctx);
    const { connections } = await client.listConnections();
    return { resources: connections.map((item) => ({
      kind: 'phone_number', id: item.id, name: item.display_name || item.phone_number || item.phone_number_id,
      meta: { status: item.status, phone_number_id: item.phone_number_id, waba_id: item.waba_id },
    })) };
  }

  override async execute(ctx: ProviderContext, operation: string, params: unknown): Promise<unknown> {
    const client = await clientForNivooConnection(ctx);
    const p = (params ?? {}) as Record<string, unknown>;
    const id = remoteId(ctx);
    const to = String(p['to'] ?? '');
    switch (operation) {
      case 'sendText':
        return client.sendText(id, to, String(p['body'] ?? ''));
      case 'sendTemplate':
        return client.sendTemplate(id, to, String(p['name'] ?? ''), String(p['language'] ?? 'pt_BR'), templateValues(p['variables']));
      case 'sendMedia': {
        const kind = String(p['kind'] ?? '');
        const mediaId = String(p['media_id'] ?? '');
        const url = String(p['url'] ?? '');
        if (!['image', 'audio', 'video', 'document'].includes(kind) || (!mediaId && !url)) {
          throw new BadRequestException('Selecione uma mídia válida antes de enviar.');
        }
        return client.sendMedia(id, to, kind,
          { ...(mediaId ? { id: mediaId } : { link: url }), ...(kind === 'document' ? { filename: String(p['filename'] ?? 'arquivo') } : {}) },
          typeof p['caption'] === 'string' ? p['caption'] : undefined,
          p['voice'] === true,
        );
      }
      case 'uploadMedia': {
        const data = p['data'];
        if (!Buffer.isBuffer(data)) throw new BadRequestException('Arquivo inválido.');
        const mime = String(p['mimeType'] ?? '');
        const type = String(p['kind'] ?? '');
        if (!['image', 'audio', 'video', 'document'].includes(type)) {
          throw new BadRequestException('Tipo de mídia inválido.');
        }
        const result = await client.uploadMedia(id, type, data, mime, String(p['filename'] ?? 'arquivo'));
        return { media_id: result.id };
      }
      case 'listTemplates': {
        const response = await client.templates(id);
        return Array.isArray(response) ? response : response.templates;
      }
      case 'createTemplate': {
        const response = await client.createTemplate(id, p);
        return response['template'] && typeof response['template'] === 'object'
          ? response['template'] : response;
      }
      case 'editTemplate': {
        const { template_id: templateId, ...changes } = p;
        return client.editTemplate(id, String(templateId ?? ''), changes);
      }
      case 'deleteTemplate': {
        let templateId = String(p['hsm_id'] ?? '');
        if (!templateId) {
          const response = await client.templates(id);
          const found = response.templates.find((template) => template['name'] === p['name']);
          templateId = String(found?.['id'] ?? '');
        }
        if (!templateId) throw new BadRequestException('Modelo não encontrado na Central.');
        return client.deleteTemplate(id, templateId);
      }
      case 'uploadTemplateMedia': {
        const data = p['data'];
        if (!Buffer.isBuffer(data)) throw new BadRequestException('Arquivo inválido.');
        const mime = String(p['mime_type'] ?? '');
        const format = mime.startsWith('image/') ? 'IMAGE' : mime.startsWith('video/') ? 'VIDEO' : 'DOCUMENT';
        return client.uploadTemplateMedia(id, format, data, mime, String(p['filename'] ?? 'arquivo'));
      }
      case 'markRead':
        return client.markRead(String(p['remote_chat_id'] ?? ''), p['typing'] === true);
      case 'syncStatus': {
        const { connections } = await client.listConnections();
        const found = connections.find((connection) => connection.id === id);
        if (!found) throw new BadRequestException('Número não encontrado nesta instalação da Central.');
        return found;
      }
      default:
        throw new BadRequestException(`Operação WhatsApp indisponível: ${operation}.`);
    }
  }
}
