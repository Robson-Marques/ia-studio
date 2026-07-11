// AI Orchestrator (diretriz — "fallback/menor custo"): quando um agente NAO
// fixa uma connection, escolhe entre as Connections AI ativas da org a de
// menor custo estimado (pelo modelo pedido); em empate, maior priority.
// Tambem serve como ponto de fallback: tenta a proxima connection ativa se a
// resolucao falhar. Nao fala HTTP — delega ao LlmProviderService.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiProviderKind, ConnectionStatus } from '@prisma/client';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { LlmProviderService, ResolvedLlmConnection } from '../providers/llm-provider.service';
import { priceForModel } from '../providers/pricing';

// provider_keys da categoria AI (espelha KIND_BY_PROVIDER_KEY do LlmProviderService).
const AI_PROVIDER_KEYS = [
  'openai', 'anthropic', 'gemini', 'ollama',
  'openrouter', 'groq', 'deepseek', 'mistral', 'azure-openai',
];

export interface OrchestratorScope {
  organizationId: string;
  workspaceId?: string | null;
  environmentId?: string | null;
}

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);

  constructor(
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly llm: LlmProviderService,
  ) {}

  /**
   * Resolve a melhor Connection AI ativa da org pro modelo pedido.
   * Criterio: menor custo estimado (prompt+completion por 1k) → maior priority.
   */
  async resolve(scope: OrchestratorScope, model: string): Promise<ResolvedLlmConnection> {
    const candidates = await this.activeAiConnections(scope);
    if (candidates.length === 0) {
      throw new BadRequestException(
        'Nenhuma conexão de IA ativa. Conecte um provedor (OpenAI, Anthropic, ...) no Integration Manager.',
      );
    }

    const price = priceForModel(model);
    const estimated = price ? price.prompt + price.completion : Number.POSITIVE_INFINITY;

    // Ordena por (custo do modelo, -priority). Como o custo do modelo e o mesmo
    // pra todas as connections, o desempate por priority prevalece; o custo
    // entra pra futuras heuristicas por-provider.
    const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
    this.logger.debug(`Orchestrator: ${sorted.length} conexões AI, custo estimado ${estimated}/1k tokens.`);

    for (const connection of sorted) {
      try {
        return await this.llm.resolveConnection(scope.organizationId, connection.id);
      } catch (e) {
        this.logger.warn(`Conexão AI ${connection.id} indisponível: ${(e as Error).message} — tentando próxima.`);
      }
    }
    throw new BadRequestException('Não foi possível resolver uma conexão de IA utilizável.');
  }

  /** Kind default sugerido (primeira connection ativa) — usado por defaults. */
  async defaultKind(scope: OrchestratorScope): Promise<AiProviderKind | null> {
    const candidates = await this.activeAiConnections(scope);
    if (candidates.length === 0) return null;
    return this.llm.kindForProviderKey(candidates[0].provider_key);
  }

  private async activeAiConnections(scope: OrchestratorScope) {
    const scoped = await this.connectionsRepository.findAllByOrg(scope.organizationId, {
      status: ConnectionStatus.ACTIVE,
      workspaceId: scope.workspaceId ?? undefined,
      environmentId: scope.environmentId ?? undefined,
    });
    const ai = scoped.filter((c) => AI_PROVIDER_KEYS.includes(c.provider_key));
    if (ai.length > 0 || (!scope.workspaceId && !scope.environmentId)) return ai;
    // Fallback: o escopo (workspace/ambiente) não tinha conexão de IA — procura
    // na ORG inteira. Sem isto, um assistente escopado num workspace não
    // enxergava a conexão OpenAI criada em outro escopo e "não respondia".
    const orgWide = await this.connectionsRepository.findAllByOrg(scope.organizationId, {
      status: ConnectionStatus.ACTIVE,
    });
    return orgWide.filter((c) => AI_PROVIDER_KEYS.includes(c.provider_key));
  }
}
