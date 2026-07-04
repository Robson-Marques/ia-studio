// Webhook publico da Meta Cloud API — rota UNICA multi-tenant:
//   GET  /api/webhooks/whatsapp  → verificacao (hub.verify_token de QUALQUER
//                                  conexao whatsapp-meta ativa, todas as orgs)
//   POST /api/webhooks/whatsapp  → eventos; roteia pela config.phone_number_id
//                                  (indexada por provider_key) e valida HMAC
//                                  x-hub-signature-256 com o app_secret DA
//                                  conexao dona do numero (Secrets Manager).
// VERSION_NEUTRAL: a URL configurada no App Meta nao carrega /v1.
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Connection, IntegrationDirection, IntegrationLogStatus } from '@prisma/client';
import { Public } from '../../../shared/auth/public.decorator';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { IntegrationLogsRepository } from '../../integration/connections/integration-logs.repository';
import { SecretsService } from '../../integration/secrets/secrets.service';
import { WhatsappInboundService } from './whatsapp-inbound.service';
import { validateWebhookSignature } from './whatsapp.helpers';
import { WHATSAPP_PROVIDER_KEY } from './whatsapp-orchestrator.service';

interface WebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: Record<string, unknown> }>;
  }>;
}

@ApiTags('Comm — WhatsApp Webhook')
@Controller({ path: 'webhooks/whatsapp', version: VERSION_NEUTRAL })
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly connections: ConnectionsRepository,
    private readonly secrets: SecretsService,
    private readonly inbound: WhatsappInboundService,
    private readonly integrationLogs: IntegrationLogsRepository,
  ) {}

  // ─── Verificacao (GET hub.challenge) ────────────────

  @Public()
  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Verificação do webhook Meta (hub.verify_token)' })
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const ok = mode === 'subscribe' && !!token && (await this.matchesAnyVerifyToken(token));
    this.logger.log(`[Webhook GET] mode=${mode} match=${ok}`);
    if (ok) {
      void reply.code(200).send(challenge);
      return;
    }
    void reply.code(403).send('Forbidden');
  }

  // ─── Eventos (POST) ─────────────────────────────────

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 600 } })
  @ApiOperation({ summary: 'Eventos do webhook Meta (mensagens, ACKs, templates, qualidade)' })
  async handle(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: WebhookBody,
  ): Promise<{ ok: boolean; error?: string }> {
    const startedAt = Date.now();
    const entries = body?.entry ?? [];
    if (body?.object !== 'whatsapp_business_account' || entries.length === 0) {
      return { ok: true }; // payload alheio — 200 pra Meta nao re-tentar
    }

    // Roteamento: cada change carrega o phone_number_id dono do evento.
    let handled = 0;
    const resolved = new Map<string, { connection: Connection; valid: boolean } | null>();

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = (change.value ?? {}) as Record<string, unknown>;
        const metadata = value['metadata'] as { phone_number_id?: string } | undefined;
        const pnId = metadata?.phone_number_id;
        if (!pnId) continue;

        let route = resolved.get(pnId);
        if (route === undefined) {
          route = await this.resolveAndValidate(pnId, req, signature);
          resolved.set(pnId, route);
        }
        if (!route) continue; // numero desconhecido — ignora silenciosamente
        if (!route.valid) {
          this.logger.warn(`[Webhook POST] HMAC INVÁLIDO pra phone_number_id=${pnId} — evento rejeitado.`);
          await this.integrationLogs.record({
            organizationId: route.connection.organization_id,
            connectionId: route.connection.id,
            direction: IntegrationDirection.INBOUND,
            operation: 'webhook',
            status: IntegrationLogStatus.FAILURE,
            durationMs: Date.now() - startedAt,
            error: 'assinatura HMAC inválida (x-hub-signature-256)',
          });
          return { ok: false, error: 'invalid signature' };
        }

        await this.inbound.handleChange(route.connection, change.field ?? 'unknown', value as never);
        handled++;
      }
    }

    if (handled > 0) this.logger.log(`[Webhook POST] ${handled} change(s) processados em ${Date.now() - startedAt}ms`);
    return { ok: true };
  }

  // ─── Helpers privados ───────────────────────────────

  private async resolveAndValidate(
    phoneNumberId: string,
    req: RawBodyRequest<FastifyRequest>,
    signature: string | undefined,
  ): Promise<{ connection: Connection; valid: boolean } | null> {
    const connection = await this.connections.findByProviderConfigValue(
      WHATSAPP_PROVIDER_KEY,
      'phone_number_id',
      phoneNumberId,
    );
    if (!connection) {
      this.logger.warn(`[Webhook POST] phone_number_id=${phoneNumberId} sem conexão correspondente.`);
      return null;
    }
    const appSecret = await this.secrets.accessorFor(connection.secret_id).get('app_secret');
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
    const valid = validateWebhookSignature(raw, signature, appSecret);
    return { connection, valid };
  }

  private async matchesAnyVerifyToken(token: string): Promise<boolean> {
    const all = await this.connections.findAllByProvider(WHATSAPP_PROVIDER_KEY);
    for (const connection of all) {
      if (!connection.secret_id) continue;
      const stored = await this.secrets.accessorFor(connection.secret_id).get('verify_token').catch(() => null);
      if (stored && stored === token) return true;
    }
    return false;
  }
}
