// Avaliacao GENERICA de aprovacao (diretriz 31): dado um tipo de acao + contexto,
// decide se alguma politica ATIVA da org exige aprovacao humana.
// Servico interno — SEM controller. Usado pelo ToolRuntime / AgentRunner.
// Como as politicas nascem OFF (is_active=false), o comportamento padrao e
// NUNCA exigir aprovacao ate o usuario ligar uma politica.
import { Injectable, Logger } from '@nestjs/common';
import { AiApprovalPolicy } from '@prisma/client';
import { ApprovalsRepository } from './approvals.repository';

/** Contexto da acao avaliada (campos conhecidos + extras livres). */
export interface ApprovalContext {
  tool_key?: string;
  recipients?: number;
  cost_usd?: number;
  [k: string]: unknown;
}

export interface EvaluateParams {
  organizationId: string;
  targetType: string;
  context: ApprovalContext;
}

export interface EvaluateResult {
  required: boolean;
  policy: AiApprovalPolicy | null;
}

/** Forma tipada da coluna `condition` (Json) de uma politica. */
interface ApprovalCondition {
  tool_key?: string;
  min_recipients?: number;
  min_cost_usd?: number;
}

@Injectable()
export class ApprovalPolicyService {
  private readonly logger = new Logger(ApprovalPolicyService.name);

  constructor(private readonly repository: ApprovalsRepository) {}

  /**
   * Retorna a primeira politica ATIVA que casa com a acao/contexto.
   * Sem politica ativa casando → { required:false, policy:null }.
   */
  async evaluate(params: EvaluateParams): Promise<EvaluateResult> {
    const { organizationId, targetType, context } = params;
    const policies = await this.repository.findActivePolicies(organizationId);

    for (const policy of policies) {
      if (policy.target_type !== targetType) continue;
      if (this.matches(policy, context)) {
        this.logger.debug(
          `Politica de aprovacao "${policy.name}" (${policy.id}) casou com a acao ${targetType}.`,
        );
        return { required: true, policy };
      }
    }
    return { required: false, policy: null };
  }

  /** Testa a `condition` da politica contra o contexto da acao. */
  private matches(policy: AiApprovalPolicy, context: ApprovalContext): boolean {
    const condition = this.parseCondition(policy.condition);

    // tool_key: se a politica restringe uma tool especifica, precisa bater.
    if (condition.tool_key !== undefined && context.tool_key !== condition.tool_key) {
      return false;
    }
    // min_recipients: envio em massa acima do limiar.
    if (
      condition.min_recipients !== undefined &&
      (context.recipients ?? 0) < condition.min_recipients
    ) {
      return false;
    }
    // min_cost_usd: custo estimado acima do limiar.
    if (
      condition.min_cost_usd !== undefined &&
      (context.cost_usd ?? 0) < condition.min_cost_usd
    ) {
      return false;
    }
    return true;
  }

  /** Converte o Json da coluna para a forma tipada, ignorando lixo. */
  private parseCondition(raw: unknown): ApprovalCondition {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const obj = raw as Record<string, unknown>;
    const condition: ApprovalCondition = {};
    if (typeof obj.tool_key === 'string') condition.tool_key = obj.tool_key;
    if (typeof obj.min_recipients === 'number') condition.min_recipients = obj.min_recipients;
    if (typeof obj.min_cost_usd === 'number') condition.min_cost_usd = obj.min_cost_usd;
    return condition;
  }
}
