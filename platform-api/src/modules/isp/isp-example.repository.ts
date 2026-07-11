// Porta ao banco do seed do assistente-exemplo ISP. Uma responsabilidade:
// as poucas consultas que o seed precisa (conexoes ISP ativas, conexao de IA,
// existencia do agente, marca "ja semeado"). Nao mistura com isp.repository
// (incidentes).
import { Injectable } from '@nestjs/common';
import { Prisma, ConnectionStatus, ProviderCategory } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ISP_ERP_PROVIDER_KEYS } from './isp.constants';

const SEED_FLAG_KEY = 'isp_example_assistant_seeded';

@Injectable()
export class IspExampleRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Uma conexao de ERP ISP ATIVA por org (a de maior prioridade) — define
   *  o escopo (workspace/environment) onde o assistente-exemplo vai nascer. */
  ispConnectionsByOrg() {
    return this.prisma.connection.findMany({
      where: { provider_key: { in: [...ISP_ERP_PROVIDER_KEYS] }, status: ConnectionStatus.ACTIVE },
      orderBy: [{ priority: 'desc' }, { created_at: 'asc' }],
      select: { organization_id: true, workspace_id: true, environment_id: true },
    });
  }

  /** Conexao de IA ativa da org (pra vincular ao agente, se houver exatamente uma).
   *  Connection nao tem relacao com ProviderDefinition — so `provider_key`; entao
   *  resolvemos as keys de categoria AI e filtramos por elas. */
  async singleAiConnection(organizationId: string): Promise<string | null> {
    const aiProviders = await this.prisma.providerDefinition.findMany({
      where: { category: ProviderCategory.AI },
      select: { key: true },
    });
    const keys = aiProviders.map((p) => p.key);
    if (keys.length === 0) return null;
    const rows = await this.prisma.connection.findMany({
      where: {
        organization_id: organizationId,
        status: ConnectionStatus.ACTIVE,
        provider_key: { in: keys },
      },
      select: { id: true },
      take: 2,
    });
    return rows.length === 1 ? rows[0]!.id : null;
  }

  agentExists(organizationId: string, name: string) {
    return this.prisma.aiAgent.findFirst({
      where: { organization_id: organizationId, name },
      select: { id: true },
    });
  }

  createAgent(data: Prisma.AiAgentUncheckedCreateInput) {
    return this.prisma.aiAgent.create({ data });
  }

  /** Marca "ja semeei o exemplo nesta org" — impede ressurreicao pos-exclusao. */
  async wasSeeded(organizationId: string): Promise<boolean> {
    const row = await this.prisma.systemSetting.findFirst({
      where: { organization_id: organizationId, key: SEED_FLAG_KEY },
      select: { id: true },
    });
    return !!row;
  }

  markSeeded(organizationId: string) {
    return this.prisma.systemSetting.create({
      data: { organization_id: organizationId, key: SEED_FLAG_KEY, value: true as unknown as Prisma.InputJsonValue },
    });
  }
}
