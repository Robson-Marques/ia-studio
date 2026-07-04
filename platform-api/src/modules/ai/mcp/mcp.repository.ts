// Porta unica ao banco de servidores MCP (diretriz 3). Toda query filtra por
// organization_id (tenant). Servidor MCP nasce OFF (is_active=false).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface McpServerFilters {
  workspaceId?: string;
  environmentId?: string;
}

@Injectable()
export class McpRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(organizationId: string, filters: McpServerFilters = {}) {
    const where: Prisma.AiMcpServerWhereInput = { organization_id: organizationId };
    if (filters.workspaceId) where.workspace_id = filters.workspaceId;
    if (filters.environmentId) where.environment_id = filters.environmentId;
    return this.prisma.aiMcpServer.findMany({
      where,
      orderBy: { updated_at: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.aiMcpServer.findUnique({ where: { id } });
  }

  findActive(organizationId: string) {
    return this.prisma.aiMcpServer.findMany({
      where: { organization_id: organizationId, is_active: true },
    });
  }

  create(data: Prisma.AiMcpServerUncheckedCreateInput) {
    return this.prisma.aiMcpServer.create({ data });
  }

  update(id: string, data: Prisma.AiMcpServerUpdateInput) {
    return this.prisma.aiMcpServer.update({ where: { id }, data });
  }
}
