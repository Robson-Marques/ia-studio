// Porta ao banco do vínculo assistente↔número (comm_channel_agents). Um registro
// por conexão (connection_id @unique) — upsert por conexão.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class WhatsappAssistantRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByConnection(connectionId: string) {
    return this.prisma.commChannelAgent.findUnique({ where: { connection_id: connectionId } });
  }

  /** Upsert por conexão: cria ou atualiza o assistente vinculado. */
  upsert(data: {
    organization_id: string;
    workspace_id: string;
    environment_id: string;
    connection_id: string;
    agent_id: string;
    is_enabled: boolean;
    created_by: string | null;
  }) {
    const update: Prisma.CommChannelAgentUpdateInput = {
      agent_id: data.agent_id,
      is_enabled: data.is_enabled,
    };
    return this.prisma.commChannelAgent.upsert({
      where: { connection_id: data.connection_id },
      update,
      create: data,
    });
  }

  removeByConnection(connectionId: string) {
    return this.prisma.commChannelAgent.deleteMany({ where: { connection_id: connectionId } });
  }
}
