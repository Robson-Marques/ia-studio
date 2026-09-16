// Webhook público da YCloud (Checkpoint 2b) — rota da instância dedicada:
//   POST /api/webhooks/whatsapp/ycloud
// A YCloud assina cada evento com HMAC-SHA256 (header `YCloud-Signature:
// t=<unix>,s=<hex>`). Como uma mesma URL pode servir várias conexões, resolvemos
// a conexão dona TENTANDO validar a assinatura com o segredo de cada conexão
// whatsapp-ycloud: a que validar é a dona. Assinatura inválida em todas →
// rejeita (200 { ok:false } para não gerar re-tentativa infinita, como no Meta).
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';
import { Connection, IntegrationDirection, IntegrationLogStatus } from '@prisma/client';
import { Public } from '../../../shared/auth/public.decorator';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { IntegrationLogsRepository } from '../../integration/connections/integration-logs.repository';
import { SecretsService } from '../../integration/secrets/secrets.service';
import { verifyYCloudSignature } from '../../../shared/integration/ycloud.client';
import { WhatsappYcloudInboundService } from './whatsapp-ycloud-inbound.service';

const YCLOUD_PROVIDER_KEY = 'whatsapp-ycloud';

@ApiTags('Comm — WhatsApp YCloud Webhook')
@Controller({ path: 'webhooks/whatsapp/ycloud', version: VERSION_NEUTRAL })
export class WhatsappYcloudWebhookController {
  private readonly logger = new Logger(WhatsappYcloudWebhookController.name);

  constructor(
    private readonly connections: ConnectionsRepository,
    private readonly secrets: SecretsService,
    private readonly inbound: WhatsappYcloudInboundService,
    private readonly integrationLogs: IntegrationLogsRepository,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 600 } })
  @ApiOperation({ summary: 'Eventos do webhook YCloud (mensagens, ACKs, histórico compartilhado)' })
  async handle(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('ycloud-signature') signature: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: boolean; error?: string }> {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');

    const match = await this.resolveBySignature(raw, signature);
    if (!match) {
      this.logger.warn('[YCloud webhook] nenhuma conexão validou a assinatura — evento rejeitado.');
      return { ok: false, error: 'invalid signature' };
    }

    try {
      await this.inbound.handleEvent(match, body);
    } catch (err) {
      // Nunca deixa o erro escapar como 500 (a YCloud re-tentaria): registra e
      // devolve ok pra não empilhar re-entregas do mesmo evento.
      this.logger.error(`[YCloud webhook] falha ao processar evento: ${(err as Error).message}`);
      await this.integrationLogs.record({
        connectionId: match.id,
        direction: IntegrationDirection.INBOUND,
        operation: 'webhook:ycloud:error',
        status: IntegrationLogStatus.FAILURE,
        error: (err as Error).message,
      });
    }
    return { ok: true };
  }

  /**
   * Resolve a conexão dona validando a assinatura contra o `webhook_secret` de
   * cada conexão whatsapp-ycloud. A primeira que validar é a dona.
   */
  private async resolveBySignature(
    raw: Buffer | string,
    signature: string | undefined,
  ): Promise<Connection | null> {
    if (!signature) return null;
    const all = await this.connections.findAllByProvider(YCLOUD_PROVIDER_KEY);
    for (const connection of all) {
      if (!connection.secret_id) continue;
      const secret = await this.secrets
        .accessorFor(connection.secret_id)
        .get('webhook_secret')
        .catch(() => null);
      if (secret && verifyYCloudSignature(raw, signature, secret)) return connection;
    }
    return null;
  }
}
