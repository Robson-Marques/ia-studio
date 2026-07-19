// Alerta INTERNO de incidente a equipe de plantao (frente 6). Difere do
// IspDispatchService (que avisa o CLIENTE em massa): aqui o alvo e a equipe da
// org — membros da equipe configurada, com telefone e opt-in ligado.
//
// Determinismo (regra de ouro): a IA NUNCA escolhe destinatario nem limiar. A
// equipe vem da config (isp.equipe.incidente); os membros e o opt-in vem do
// banco. O texto interno PODE conter escopo/estatistica (e para o tecnico, nao
// para o cliente) — o "nao vazar" vale so na fala com o assinante.
//
// Envio via WhatsappSmartSendService: dentro da janela de 24h texto livre; fora
// (o caso normal do plantao, que raramente tem conversa aberta) template HSM
// aprovado (Meta oficial exige template fora da janela; sempre 1:1, nunca grupo).
// Sem equipe/sem elegiveis/sem template → degradacao graciosa: alerta in-app.
import { Injectable, Logger } from '@nestjs/common';
import { IspIncident } from '@prisma/client';
import { WhatsappSmartSendService } from '../comm/whatsapp/whatsapp-smart-send.service';
import { NotificationCenterService } from '../automation/notifications/notification-center.service';
import { IspRepository } from './isp.repository';
import { IspOsConfigService } from './isp-os-config.service';
import { scopeLabel } from './isp-scope.util';

export interface TeamAlertStats {
  total: number;
  offline: number;
  offline_pct: number;
}

export interface TeamAlertResult {
  /** 'whatsapp' = disparou ao plantao; 'in-app' = degradou pro aviso interno. */
  channel: 'whatsapp' | 'in-app';
  recipients: number;
  sent: number;
  failed: number;
  skipped: number;
  reason?: string;
}

@Injectable()
export class IspTeamAlertService {
  private readonly logger = new Logger(IspTeamAlertService.name);

  constructor(
    private readonly repository: IspRepository,
    private readonly smartSend: WhatsappSmartSendService,
    private readonly osConfig: IspOsConfigService,
    private readonly notifications: NotificationCenterService,
  ) {}

  /**
   * Dispara o alerta do incidente a equipe de plantao. `normalized` nao se aplica
   * aqui (isto e alerta de deteccao, nao aviso ao cliente). Idempotencia/cooldown
   * sao responsabilidade do chamador (IspIncidentsService.registerDetectedAnomaly).
   */
  async alert(incident: IspIncident, opts: { stats?: TeamAlertStats } = {}): Promise<TeamAlertResult> {
    const cfg = await this.osConfig.getPlantaoConfig(incident.organization_id);
    const body = this.buildBody(incident, opts.stats);

    if (!cfg.team_id) {
      return this.fallbackInApp(incident, body, 'Equipe de plantão não configurada.');
    }

    const recipients = await this.repository.findPlantaoRecipients(incident.organization_id, cfg.team_id);
    if (recipients.length === 0) {
      return this.fallbackInApp(incident, body, 'Nenhum membro elegível (telefone + opt-in) na equipe de plantão.');
    }
    if (!cfg.template) {
      // Sem template aprovado o envio fora da janela de 24h nao sai (Meta). O
      // in-app garante que o plantao ao menos veja o alerta.
      return this.fallbackInApp(incident, body, 'Template de alerta não configurado.');
    }

    const result: TeamAlertResult = { channel: 'whatsapp', recipients: recipients.length, sent: 0, failed: 0, skipped: 0 };
    const summaryLine = this.summaryLine(incident, opts.stats);

    for (const r of recipients) {
      try {
        const { via } = await this.smartSend.send({
          organizationId: incident.organization_id,
          workspaceId: incident.workspace_id,
          environmentId: incident.environment_id,
          phone: r.phone,
          text: body,
          template: cfg.template,
          coldTemplate: cfg.template,
          variables: { '1': summaryLine },
          sender: 'system',
        });
        if (via === 'skipped') result.skipped += 1;
        else result.sent += 1;
        await this.repository.createTeamAlert({
          organization_id: incident.organization_id,
          incident_id: incident.id,
          user_id: r.user_id,
          phone: r.phone,
          via,
          status: via === 'skipped' ? 'FAILED' : 'SENT',
          error: via === 'skipped' ? 'Envio não concluído (janela/template).' : null,
          sent_at: via === 'skipped' ? null : new Date(),
        });
      } catch (e) {
        result.failed += 1;
        await this.repository.createTeamAlert({
          organization_id: incident.organization_id,
          incident_id: incident.id,
          user_id: r.user_id,
          phone: r.phone,
          status: 'FAILED',
          error: (e as Error).message,
        });
        this.logger.warn(`Falha ao alertar plantão ${r.phone} (incidente ${incident.id}): ${(e as Error).message}`);
      }
    }

    // Se NINGUEM recebeu de fato, degrada pro in-app para o plantao nao ficar no escuro.
    if (result.sent === 0) {
      const fb = await this.fallbackInApp(incident, body, 'Disparo ao plantão não concluído (janela/template).');
      return { ...fb, recipients: recipients.length };
    }

    this.logger.log(
      `Alerta de incidente ${incident.id} ao plantão: ${result.sent} enviados, ${result.failed} falhas, ${result.skipped} pulados.`,
    );
    return result;
  }

  private async fallbackInApp(incident: IspIncident, body: string, reason: string): Promise<TeamAlertResult> {
    try {
      await this.notifications.notify({
        organizationId: incident.organization_id,
        workspaceId: incident.workspace_id,
        environmentId: incident.environment_id,
        recipient: { user_id: '' }, // broadcast in-app pra org
        title: 'Possível incidente de rede',
        body: `${body}\n\n(${reason})`,
      });
    } catch (e) {
      this.logger.warn(`Fallback in-app do alerta de incidente ${incident.id} falhou: ${(e as Error).message}`);
    }
    return { channel: 'in-app', recipients: 0, sent: 0, failed: 0, skipped: 0, reason };
  }

  private buildBody(incident: IspIncident, stats?: TeamAlertStats): string {
    const lines = ['🚨 Possível incidente de rede', incident.title];
    const label = scopeLabel(incident.scope);
    if (label) lines.push(`Escopo: ${label}`);
    if (stats) lines.push(`Offline: ${stats.offline}/${stats.total} (${stats.offline_pct}%)`);
    lines.push(`Previsão: ${incident.forecast?.trim() || 'a definir'}`);
    lines.push('Abra o painel ISP → Incidentes para tratar.');
    return lines.join('\n');
  }

  /** Linha unica pro corpo do template ({{1}}). */
  private summaryLine(incident: IspIncident, stats?: TeamAlertStats): string {
    const parts = [incident.title];
    const label = scopeLabel(incident.scope);
    if (label) parts.push(label);
    if (stats) parts.push(`${stats.offline_pct}% offline`);
    return parts.join(' · ');
  }
}
