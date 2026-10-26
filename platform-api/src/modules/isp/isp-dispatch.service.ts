// Disparo proativo em massa (modo PROACTIVE/COMBINED). Envia o informativo por
// WhatsApp (Meta Orchestrator da Fase 3) aos targets included=true, com:
//   * confirmacao explicita (validada no controller/service chamador);
//   * rate limit configuravel (mensagens/segundo, com teto de seguranca);
//   * log por destinatario em isp_incident_dispatches.
// Nasce OFF: so roda quando o operador ativa o modo proativo e confirma.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { IspIncident } from '@prisma/client';
import { WhatsappSmartSendService } from '../comm/whatsapp/whatsapp-smart-send.service';
import { SEED_CATALOG } from '../comm/whatsapp/template-catalog/catalog.seed';
import { IspRepository } from './isp.repository';
import {
  DEFAULT_DISPATCH_RATE_PER_SEC,
  MAX_DISPATCH_RATE_PER_SEC,
} from './isp.constants';

export interface DispatchResult {
  total: number;
  sent: number;
  queued: number;
  failed: number;
  skipped: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class IspDispatchService {
  private readonly logger = new Logger(IspDispatchService.name);

  constructor(
    private readonly repository: IspRepository,
    private readonly whatsapp: WhatsappSmartSendService,
  ) {}

  /**
   * Dispara o informativo do incidente. `confirm` DEVE ser true (disparo em
   * massa e sensivel). `normalized=true` envia o aviso de normalizacao.
   */
  async dispatch(
    incident: IspIncident,
    opts: { confirm: boolean; ratePerSec?: number; normalized?: boolean },
  ): Promise<DispatchResult> {
    if (!opts.confirm) {
      throw new BadRequestException('Disparo em massa exige confirmação explícita.');
    }
    const targets = await this.repository.findIncludedTargets(incident.id);
    const result: DispatchResult = { total: targets.length, sent: 0, queued: 0, failed: 0, skipped: 0 };
    if (targets.length === 0) return result;

    const rate = Math.min(Math.max(opts.ratePerSec ?? DEFAULT_DISPATCH_RATE_PER_SEC, 1), MAX_DISPATCH_RATE_PER_SEC);
    const delayMs = Math.ceil(1000 / rate);
    const body = this.buildBody(incident, opts.normalized === true);

    for (const target of targets) {
      if (!target.phone) {
        result.skipped += 1;
        await this.repository.createDispatch({
          incident_id: incident.id,
          target_id: target.id,
          channel: 'WHATSAPP',
          status: 'FAILED',
          error: 'Destinatário sem telefone.',
        });
        continue;
      }
      try {
        const { via, jobId } = await this.whatsapp.send({
          phone: target.phone,
          text: body,
          template: opts.normalized ? SEED_CATALOG[2].name : SEED_CATALOG[1].name,
          variables: { '1': incident.title },
          sender: 'system',
        });
        if (via === 'skipped' || !jobId) throw new Error('Template não aprovado ou envio não aceito pela Central.');
        result.queued += 1;
        await this.repository.createDispatch({
          incident_id: incident.id,
          target_id: target.id,
          channel: 'WHATSAPP',
          status: 'PENDING',
          job_id: jobId,
        }).catch((error) => {
          this.logger.error(`A Central aceitou o job ${jobId}, mas o log ISP falhou: ${(error as Error).message}`);
        });
      } catch (e) {
        result.failed += 1;
        await this.repository.createDispatch({
          incident_id: incident.id,
          target_id: target.id,
          channel: 'WHATSAPP',
          status: 'FAILED',
          error: (e as Error).message,
        });
        this.logger.warn(`Falha ao disparar incidente ${incident.id} → ${target.phone}: ${(e as Error).message}`);
      }
      await sleep(delayMs);
    }
    this.logger.log(
      `Disparo do incidente ${incident.id}: ${result.queued} aceitos pela Central, ${result.failed} falhas, ${result.skipped} sem telefone.`,
    );
    return result;
  }

  private buildBody(incident: IspIncident, normalized: boolean): string {
    if (normalized) {
      return `✅ ${incident.title}\n\nO serviço foi normalizado. Caso persista alguma instabilidade, entre em contato.`;
    }
    const toggles = (incident.toggles ?? {}) as { inform_forecast?: boolean };
    const lines = [`🔧 ${incident.title}`];
    if (incident.message) lines.push('', incident.message);
    if (toggles.inform_forecast && incident.forecast) lines.push('', `Previsão de normalização: ${incident.forecast}`);
    return lines.join('\n');
  }
}
