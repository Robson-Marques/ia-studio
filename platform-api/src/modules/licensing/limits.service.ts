// Enforcement central de limites (diretriz 19). Cadeia obrigatoria:
// Billing → Licensing → Feature Flags → Sistema — os modulos consultam ESTE
// service (nunca o Billing) antes de criar recurso ou consumir cota.
import { ForbiddenException, Injectable } from '@nestjs/common';
import { LicenseStatus } from '@prisma/client';
import { LicensingRepository } from './licensing.repository';
import { UsageService } from './usage.service';
import { mergeLimits } from './licensing.helpers';

export interface EffectiveLicense {
  status: LicenseStatus;
  planId: string;
  planName: string;
  features: string[];
  limits: Record<string, number>;
}

@Injectable()
export class LimitsService {
  constructor(
    private readonly repository: LicensingRepository,
    private readonly usage: UsageService,
  ) {}

  /** Licenca efetiva da org: status + features + limites (plano ⊕ override). */
  async getEffective(organizationId: string): Promise<EffectiveLicense> {
    const license = await this.repository.findLicenseByOrg(organizationId);
    if (!license) {
      throw new ForbiddenException('Organização sem licença. Contate o suporte.');
    }
    return {
      status: license.status,
      planId: license.plan_id,
      planName: license.plan.name,
      features: license.plan.features,
      limits: mergeLimits(license.plan.limits, license.limits_override),
    };
  }

  /** A feature esta habilitada no plano? (whatsapp, automation, rag, ...) */
  async hasFeature(organizationId: string, feature: string): Promise<boolean> {
    const eff = await this.getEffective(organizationId);
    return eff.features.includes(feature);
  }

  /**
   * Checa limite de metrica MEDIDA (executions_month, ai_tokens_month...):
   * consumo do periodo corrente + incremento contra o limite efetivo.
   * Metrica sem limite definido = ilimitada.
   * Lanca ForbiddenException com mensagem pt-BR quando estoura.
   */
  async checkLimit(organizationId: string, metric: string, increment = 1): Promise<void> {
    const eff = await this.getEffective(organizationId);
    this.assertLicenseUsable(eff.status);
    const limit = eff.limits[metric];
    if (limit === undefined || limit === null) return; // ilimitado
    const used = await this.usage.getValue(organizationId, metric);
    if (used + increment > limit) {
      throw new ForbiddenException(
        `Limite do plano atingido para "${metric}" (${used}/${limit}). Faça upgrade do plano.`,
      );
    }
  }

  /**
   * Checa limite de metrica ESTRUTURAL (users, workspaces, agents...):
   * contagem atual + incremento contra o limite efetivo.
   * O caller informa a contagem (ele conhece o criterio de "ativo").
   */
  async assertCountWithin(
    organizationId: string,
    metric: string,
    currentCount: number,
    increment = 1,
  ): Promise<void> {
    const eff = await this.getEffective(organizationId);
    this.assertLicenseUsable(eff.status);
    const limit = eff.limits[metric];
    if (limit === undefined || limit === null) return;
    if (currentCount + increment > limit) {
      throw new ForbiddenException(
        `Limite do plano atingido para "${metric}" (${currentCount}/${limit}). Faça upgrade do plano.`,
      );
    }
  }

  /** Licenca RESTRICTED/SUSPENDED/EXPIRED bloqueia criacao de recurso (nunca apaga dados). */
  private assertLicenseUsable(status: LicenseStatus): void {
    if (this.repository.isLicenseBlocked(status)) {
      throw new ForbiddenException(
        'Licença em modo restrito ou suspensa. Regularize a assinatura para criar novos recursos.',
      );
    }
  }
}
