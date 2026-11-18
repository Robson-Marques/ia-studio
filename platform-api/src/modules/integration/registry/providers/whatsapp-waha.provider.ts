import { BadRequestException, Injectable } from '@nestjs/common';
import { ProviderCategory } from '@prisma/client';
import { BaseProvider } from './base.provider';
import {
  ConnectResult, DiscoveryResult, HealthResult, ProviderContext, ProviderMetadata,
} from '../../../../shared/integration/provider.interface';
import { RichMessage } from '../../../../shared/integration/whatsapp.types';
import {
  WahaRefs, downloadWahaMedia, ensureWahaSession, getWahaMe, getWahaSession,
  markWahaRead, sendWahaMedia, sendWahaText, stopWahaSession,
} from '../../../../shared/integration/waha.client';
import { WHATSAPP_WAHA_PROVIDER_KEY } from '../../../../shared/integration/whatsapp-provider.constants';

@Injectable()
export class WhatsappWahaProvider extends BaseProvider {
  metadata(): ProviderMetadata {
    return {
      key: WHATSAPP_WAHA_PROVIDER_KEY,
      name: 'WhatsApp por QR Code (WAHA)',
      category: ProviderCategory.COMMUNICATION,
      description: 'Conexão não oficial por QR Code via WAHA. Suporta vários números/sessões; use por sua conta e risco, pois pode haver bloqueio pela Meta.',
      icon: 'message-circle',
      secretKind: 'API_KEY',
      countMetric: 'whatsapp_numbers',
      capabilities: [
        'health', 'discover', 'execute:sendText', 'execute:sendMedia',
        'execute:uploadMedia', 'execute:sendRich', 'execute:downloadMedia', 'execute:markRead',
      ],
      wizardSchema: {
        testable: true,
        webhookPath: '/api/webhooks/whatsapp/waha',
        steps: [{
          id: 'waha',
          title: 'Servidor WAHA',
          description: 'A conexão e o QR Code são concluídos em WhatsApp → Números.',
          fields: [
            { key: 'api_url', label: 'URL do servidor WAHA', type: 'url', required: true, placeholder: 'https://waha.seudominio.com' },
            { key: 'webhook_url', label: 'URL pública do webhook do IA Studio', type: 'url', required: true, placeholder: 'https://studio.seudominio.com/api/webhooks/whatsapp/waha', help: 'Em WhatsApp → Números esta URL é preenchida automaticamente.' },
            { key: 'api_key', label: 'Chave da API WAHA', type: 'password', secret: true, required: true },
            { key: 'webhook_secret', label: 'Segredo do webhook', type: 'password', secret: true, required: true, generatable: true },
            { key: 'department', label: 'Departamento', type: 'text' },
            { key: 'is_default', label: 'Conexão padrão?', type: 'select', default: 'nao', options: [{ value: 'nao', label: 'Não' }, { value: 'sim', label: 'Sim' }] },
            { key: 'allow_automations', label: 'Permitir automações?', type: 'select', default: 'nao', options: [{ value: 'nao', label: 'Não (recomendado)' }, { value: 'sim', label: 'Sim, assumo o risco' }] },
          ],
        }],
      },
    };
  }

  async refs(ctx: ProviderContext): Promise<WahaRefs & { webhookUrl: string; webhookSecret: string }> {
    const config = (ctx.connection.config ?? {}) as Record<string, unknown>;
    const apiUrl = String(config['api_url'] ?? '').trim();
    const webhookUrl = String(config['webhook_url'] ?? '').trim();
    const apiKey = (await ctx.secrets.get('api_key')) ?? '';
    const webhookSecret = (await ctx.secrets.get('webhook_secret')) ?? '';
    if (!apiUrl || !apiKey || !webhookUrl || !webhookSecret) {
      throw new BadRequestException('Conexão WAHA sem URL, chave da API ou webhook configurado.');
    }
    return { apiUrl, apiKey, session: `iastudio-${ctx.connection.id}`, webhookUrl, webhookSecret };
  }

  override async connect(ctx: ProviderContext): Promise<ConnectResult> {
    try {
      const refs = await this.refs(ctx);
      const session = await ensureWahaSession(refs, refs.webhookUrl, refs.webhookSecret);
      return session.status === 'WORKING'
        ? { ok: true, detail: 'Sessão WAHA conectada.' }
        : { ok: true, detail: 'Sessão criada. Leia o QR Code em WhatsApp → Números.' };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }

  async health(ctx: ProviderContext): Promise<HealthResult> {
    try {
      const refs = await this.refs(ctx);
      const session = await getWahaSession(refs);
      if (!session) return { ok: false, detail: 'Sessão WAHA não encontrada.' };
      if (session.status === 'WORKING') {
        return { ok: true, detail: 'WhatsApp conectado por QR Code.', checks: { session: true, authenticated: true } };
      }
      if (['STARTING', 'SCAN_QR_CODE', 'PASSKEY_REQUIRED', 'PASSKEY_CONFIRMATION_REQUIRED'].includes(session.status)) {
        return { ok: false, pendingAuth: true, detail: 'Aguardando leitura do QR Code.', checks: { session: true, authenticated: false } };
      }
      return { ok: false, detail: `Sessão WAHA em estado ${session.status}.`, checks: { session: true, authenticated: false } };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }

  override async disconnect(ctx: ProviderContext): Promise<void> {
    await stopWahaSession(await this.refs(ctx));
  }

  override async execute(ctx: ProviderContext, operation: string, params: unknown): Promise<unknown> {
    const refs = await this.refs(ctx);
    const p = (params ?? {}) as Record<string, unknown>;
    if (operation === 'sendText') {
      const to = String(p['to'] ?? '');
      const body = String(p['body'] ?? '');
      if (!to || !body) throw new BadRequestException('sendText exige "to" e "body".');
      return sendWahaText(refs, to, body);
    }
    if (operation === 'uploadMedia') {
      const data = p['data'];
      if (!Buffer.isBuffer(data)) throw new BadRequestException('uploadMedia exige um arquivo.');
      const mime = String(p['mimeType'] ?? p['mime_type'] ?? 'application/octet-stream');
      return { media_id: `data:${mime};base64,${data.toString('base64')}` };
    }
    if (operation === 'sendMedia') {
      return sendWahaMedia(refs, {
        to: String(p['to'] ?? ''), kind: String(p['kind'] ?? ''),
        data: String(p['data'] ?? p['media_id'] ?? '') || undefined,
        url: typeof p['url'] === 'string' ? p['url'] : undefined,
        mimeType: typeof p['mime_type'] === 'string' ? p['mime_type'] : undefined,
        filename: typeof p['filename'] === 'string' ? p['filename'] : undefined,
        caption: typeof p['caption'] === 'string' ? p['caption'] : undefined,
      });
    }
    if (operation === 'sendRich') {
      const to = String(p['to'] ?? '');
      const message = p['message'] as RichMessage | undefined;
      if (!message) throw new BadRequestException('sendRich exige uma mensagem.');
      if (message.kind === 'text') return sendWahaText(refs, to, message.body);
      if (['image', 'audio', 'video', 'document'].includes(message.kind)) {
        const media = message as Extract<RichMessage, { kind: 'image' | 'audio' | 'video' | 'document' }>;
        return sendWahaMedia(refs, { to, kind: media.kind, data: media.data ?? media.mediaId, url: media.url, mimeType: media.mimeType, filename: media.filename, caption: media.caption });
      }
      throw new BadRequestException(`Tipo ${message.kind} não suportado pela conexão WAHA.`);
    }
    if (operation === 'markRead') {
      await markWahaRead(refs, String(p['message_id'] ?? ''), p['typing'] === true);
      return { ok: true };
    }
    if (operation === 'downloadMedia') {
      const result = await downloadWahaMedia(refs, String(p['media_id'] ?? ''));
      return { base64: result.data.toString('base64'), mime: result.contentType };
    }
    throw new BadRequestException(`Operação "${operation}" não suportada pelo provider WAHA.`);
  }

  override async discover(ctx: ProviderContext): Promise<DiscoveryResult> {
    const refs = await this.refs(ctx);
    const me = await getWahaMe(refs);
    return { resources: [{ kind: 'phone_number', id: me.id ?? refs.session, name: me.pushName ?? me.id ?? refs.session, meta: { provider: 'waha' } }] };
  }
}
