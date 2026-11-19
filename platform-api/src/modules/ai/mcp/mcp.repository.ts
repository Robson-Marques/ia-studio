// Porta única ao banco de servidores MCP da instância dedicada. Servidor nasce
// OFF (is_active=false).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class McpRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    const where: Prisma.AiMcpServerWhereInput = {};
    return this.prisma.aiMcpServer.findMany({
      where,
      orderBy: { updated_at: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.aiMcpServer.findUnique({ where: { id } });
  }

  findActive() {
    return this.prisma.aiMcpServer.findMany({
      where: { is_active: true },
    });
  }

  create(data: Prisma.AiMcpServerUncheckedCreateInput) {
    return this.prisma.aiMcpServer.create({ data });
  }

  update(id: string, data: Prisma.AiMcpServerUpdateInput) {
    return this.prisma.aiMcpServer.update({ where: { id }, data });
  }
}
