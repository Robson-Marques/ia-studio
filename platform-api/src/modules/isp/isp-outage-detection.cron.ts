// Deteccao automatica de outage (Fase 6 §3) — NASCE OFF em dois niveis:
//   1) flag tecnica ISP_AUTO_DETECT (default 'off' no codigo; env so override);
//   2) por incidente: so amostra rascunhos com auto_detect=true.
// Ao passar o limiar de % offline (ISP_OUTAGE_THRESHOLD_PCT, default 40), NUNCA
// dispara sozinho: apenas ALERTA o operador (notificacao in-app) sugerindo
// promover o rascunho a incidente ativo. A decisao continua humana.
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IspRepository } from './isp.repository';
import { IspConnectionResolver } from './isp-connection.resolver';
import { IspConnectivityService } from './isp-connectivity.service';
import { IspIncidentsService } from './isp-incidents.service';
import { NotificationCenterService } from '../automation/notifications/notification-center.service';
import { processorsEnabled } from '../automation/worker/processors.gate';

@Injectable()
export class IspOutageDetectionCron {
  private readonly logger = new Logger(IspOutageDetectionCron.name);
  private running = false;

  constructor(
    private readonly repository: IspRepository,
    private readonly resolver: IspConnectionResolver,
    private readonly connectivity: IspConnectivityService,
    private readonly incidents: IspIncidentsService,
    private readonly notifications: NotificationCenterService,
  ) {}

  private enabled(): boolean {
    return (process.env['ISP_AUTO_DETECT'] ?? 'off').toLowerCase() === 'on';
  }

  private threshold(): number {
    const raw = Number(process.env['ISP_OUTAGE_THRESHOLD_PCT'] ?? 40);
    return Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 100) : 40;
  }

  // A cada 10 min (barato; so roda se a flag tecnica estiver ON).
  @Cron(CronExpression.EVERY_10_MINUTES)
  async tick(): Promise<void> {
    if (!processorsEnabled()) return;
    if (!this.enabled()) return;
    if (this.running) return;
    this.running = true;
    try {
      const drafts = await this.repository.findAutoDetectDrafts();
      const limit = this.threshold();
      for (const incident of drafts) {
        try {
          const connection = await this.resolver.resolve({
            connectionId: incident.connection_id,
          });
          const summary = await this.connectivity.query(
            connection.id,
            (incident.scope ?? {}) as Record<string, unknown>,
          );
          if (summary.total > 0 && summary.offline_pct >= limit) {
            // (1) Aviso in-app: sugere ao operador promover o rascunho a ativo.
            await this.notifications.notify({
              recipient: { user_id: '' }, // broadcast in-app da instância
              title: 'Possível outage detectado',
              body: `O escopo do rascunho "${incident.title}" está com ${summary.offline_pct}% offline (${summary.offline}/${summary.total}). Revise e, se confirmado, ative o incidente.`,
            });
            // (2) Alerta a equipe de plantao via WhatsApp — mesmo serviço/cooldown
            // do caminho reativo (não re-spamma a cada tick de 10 min).
            await this.incidents.alertTeamForIncident(incident.id, {
              total: summary.total,
              offline: summary.offline,
              offline_pct: summary.offline_pct,
            });
            this.logger.warn(
              `Outage sugerido: incidente ${incident.id} — ${summary.offline_pct}% offline (limiar ${limit}%).`,
            );
          }
        } catch (e) {
          this.logger.warn(`Detecção de outage falhou para o incidente ${incident.id}: ${(e as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
