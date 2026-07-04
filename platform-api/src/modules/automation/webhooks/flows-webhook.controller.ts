// Rota PUBLICA do TRIGGER_WEBHOOK: POST /api/webhooks/flows/:token.
// Token opaco por workflow (gerado no publish; rotacionavel). So dispara
// fluxo PUBLICADO com gatilho webhook. Idempotencia opcional via header
// x-idempotency-key (vira source_event_id da execucao).
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../shared/auth/public.decorator';
import { WorkflowsRepository } from '../workflows/workflows.repository';
import { WorkflowsService } from '../workflows/workflows.service';
import { parseTrigger } from '../engine/workflow-graph';

@ApiTags('Automation — Webhook público')
@Controller({ path: 'webhooks/flows', version: VERSION_NEUTRAL })
export class FlowsWebhookController {
  private readonly logger = new Logger(FlowsWebhookController.name);

  constructor(
    private readonly repository: WorkflowsRepository,
    private readonly workflows: WorkflowsService,
  ) {}

  @Public()
  @Post(':token')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @ApiOperation({ summary: 'Dispara um fluxo publicado com gatilho webhook' })
  async trigger(
    @Param('token') token: string,
    @Body() body: unknown,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const workflow = await this.repository.findByWebhookToken(token);
    if (!workflow || workflow.status !== 'PUBLISHED') {
      throw new NotFoundException('Fluxo não encontrado.');
    }
    const version = await this.repository.findVersion(workflow.id, workflow.current_version);
    const trigger = version ? parseTrigger(version.trigger) : null;
    if (trigger?.type !== 'webhook') {
      throw new BadRequestException('Este fluxo não usa gatilho por webhook.');
    }

    const execution = await this.workflows.startExecution(workflow, {
      triggerType: 'WEBHOOK',
      input: (body ?? {}) as Record<string, unknown>,
      sourceEventId: idempotencyKey?.trim() ? `wh:${workflow.id}:${idempotencyKey.trim()}` : null,
    });
    this.logger.log(`Webhook do fluxo ${workflow.id} aceito (execução ${execution?.id ?? 'dedup'}).`);
    return { accepted: true, execution_id: execution?.id ?? null, status: execution?.status ?? 'DEDUPED' };
  }
}
