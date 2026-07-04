// IncidentLookupService — nucleo do modo REATIVO (default). As tools do agente
// (abrir_os / status_regiao) consultam activeFor(customer): se o cliente
// pertence a um incidente ATIVO, devolvem o informativo (mensagem+previsao) e
// sinalizam suprimir OS (quando o toggle suppress_os estiver ligado). Nenhum
// disparo acontece aqui — reativo nao envia nada.
import { Injectable } from '@nestjs/common';
import { IspRepository } from './isp.repository';
import { IspIncidentToggles } from './isp.constants';

export interface IncidentInfo {
  incident_id: string;
  title: string;
  message: string | null;
  forecast: string | null;
  /** true = agente deve suprimir a abertura de OS duplicada. */
  suppress_os: boolean;
  /** true = a previsao pode ser informada ao cliente. */
  inform_forecast: boolean;
}

@Injectable()
export class IncidentLookupService {
  constructor(private readonly repository: IspRepository) {}

  /**
   * Retorna o incidente ativo que cobre o cliente (por customer_ref/login/cpf),
   * ou null. Match por target incluido no incidente ATIVO.
   */
  async activeFor(organizationId: string, customerRef: string): Promise<IncidentInfo | null> {
    const ref = customerRef.trim().toLowerCase();
    if (!ref) return null;
    const actives = await this.repository.findActive(organizationId);
    for (const incident of actives) {
      const hit = incident.targets.some(
        (t) => t.included && t.customer_ref.trim().toLowerCase() === ref,
      );
      if (hit) return this.toInfo(incident);
    }
    return null;
  }

  private toInfo(incident: {
    id: string;
    title: string;
    message: string | null;
    forecast: string | null;
    toggles: unknown;
  }): IncidentInfo {
    const toggles = (incident.toggles ?? {}) as IspIncidentToggles;
    return {
      incident_id: incident.id,
      title: incident.title,
      message: incident.message,
      forecast: incident.forecast,
      suppress_os: toggles.suppress_os === true,
      inform_forecast: toggles.inform_forecast === true,
    };
  }
}
