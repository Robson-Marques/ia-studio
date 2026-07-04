// Porta unica ao banco de regras de colaboracao entre agentes de IA.
// Regra = agente principal delega/consulta um agente colaborador (diretriz 3).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface CollaborationRuleFilters {
  principalAgentId?: string;
}

@Injectable()
export class CollaborationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByOrg(organizationId: string, filters: CollaborationRuleFilters = {}) {
    const where: Prisma.AiCollaborationRuleWhereInput = { organization_id: organizationId };
    if (filters.principalAgentId) where.principal_agent_id = filters.principalAgentId;
    return this.prisma.aiCollaborationRule.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.aiCollaborationRule.findUnique({ where: { id } });
  }

  /** Regras ativas de um agente principal — base do consultar_especialista. */
  findActiveByPrincipal(principalAgentId: string) {
    return this.prisma.aiCollaborationRule.findMany({
      where: { principal_agent_id: principalAgentId, is_active: true },
      orderBy: { created_at: 'asc' },
    });
  }

  create(data: Prisma.AiCollaborationRuleUncheckedCreateInput) {
    return this.prisma.aiCollaborationRule.create({ data });
  }

  update(id: string, data: Prisma.AiCollaborationRuleUpdateInput) {
    return this.prisma.aiCollaborationRule.update({ where: { id }, data });
  }
}
