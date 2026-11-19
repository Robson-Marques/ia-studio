import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post, RawBodyRequest, Req, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';
import { Public } from '../../../shared/auth/public.decorator';
import { verifyWahaHmac } from '../../../shared/integration/waha.client';
import { WHATSAPP_WAHA_PROVIDER_KEY } from '../../../shared/integration/whatsapp-provider.constants';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { SecretsService } from '../../integration/secrets/secrets.service';
import { WhatsappWahaInboundService } from './whatsapp-waha-inbound.service';

@ApiTags('Comm — WhatsApp WAHA Webhook')
@Controller({ path: 'webhooks/whatsapp/waha', version: VERSION_NEUTRAL })
export class WhatsappWahaWebhookController {
  private readonly logger = new Logger(WhatsappWahaWebhookController.name);
  constructor(
    private readonly connections: ConnectionsRepository,
    private readonly secrets: SecretsService,
    private readonly inbound: WhatsappWahaInboundService,
  ) {}

  @Public() @Post() @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 600 } })
  async handle(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('x-webhook-hmac') signature: string | undefined,
    @Headers('x-webhook-hmac-algorithm') algorithm: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: boolean }> {
    const event = (body ?? {}) as { session?: string };
    const connectionId = String(event.session ?? '').replace(/^iastudio-/, '');
    const connection = connectionId ? await this.connections.findById(connectionId) : null;
    if (!connection || connection.provider_key !== WHATSAPP_WAHA_PROVIDER_KEY || !connection.secret_id) {
      this.logger.warn('Webhook WAHA com sessão desconhecida.');
      return { ok: false };
    }
    const secret = await this.secrets.accessorFor(connection.secret_id).get('webhook_secret');
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
    if (algorithm?.toLowerCase() !== 'sha512' || !secret || !verifyWahaHmac(raw, signature, secret)) {
      this.logger.warn(`Webhook WAHA com assinatura inválida para ${connection.id}.`);
      return { ok: false };
    }
    try { await this.inbound.handleEvent(connection, body); }
    catch (error) {
      this.logger.error(`Webhook WAHA falhou: ${(error as Error).message}`);
      throw error; // 5xx ativa o retry configurado na própria sessão WAHA.
    }
    return { ok: true };
  }
}
