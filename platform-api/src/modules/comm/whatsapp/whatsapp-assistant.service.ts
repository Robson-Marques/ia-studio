// Vínculo assistente↔número: qual assistente de IA atende sozinho um canal
// (conexão WhatsApp). Valida que a conexão e o assistente pertencem à mesma
// organização antes de gravar. O condutor embutido (próximo checkpoint) lê daqui
// qual assistente chamar quando chega uma mensagem — por isso o vínculo vive no
// domínio comm, não no de IA.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { WhatsappAssistantRepository } from './whatsapp-assistant.repository';
import { WHATSAPP_PROVIDER_KEY } from './whatsapp-orchestrator.service';

export interface ChannelAssistantView {
  connection_id: string;
  agent_id: string;
  agent_name: string | null;
  is_enabled: boolean;
  updated_at: Date;
}

@Injectable()
export class WhatsappAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: ConnectionsRepository,
    private readonly repository: WhatsappAssistantRepository,
  ) {}

  /** Conexão WhatsApp da organização, ou 404. */
  private async assertConnection(organizationId: string, connectionId: string) {
    const connection = await this.connections.findById(connectionId);
    if (
      !connection ||
      connection.organization_id !== organizationId ||
      connection.provider_key !== WHATSAPP_PROVIDER_KEY
    ) {
      throw new NotFoundException('Conexão WhatsApp não encontrada.');
    }
    return connection;
  }

  /** Vínculo atual do número (ou null), já com o nome do assistente. */
  async get(organizationId: string, connectionId: string): Promise<ChannelAssistantView | null> {
    await this.assertConnection(organizationId, connectionId);
    const row = await this.repository.findByConnection(connectionId);
    if (!row) return null;
    const agent = await this.prisma.aiAgent.findUnique({
      where: { id: row.agent_id },
      select: { name: true, organization_id: true },
    });
    return {
      connection_id: row.connection_id,
      agent_id: row.agent_id,
      agent_name: agent?.organization_id === organizationId ? agent.name : null,
      is_enabled: row.is_enabled,
      updated_at: row.updated_at,
    };
  }

  /** Hot path do condutor inbound: id do assistente HABILITADO deste número, ou
   *  null. Sem validações caras (o condutor já confere org/handler depois). */
  async activeAgentId(connectionId: string): Promise<string | null> {
    const row = await this.repository.findEnabledByConnection(connectionId);
    return row?.agent_id ?? null;
  }

  /** Vincula (ou troca) o assistente que atende este número. */
  async set(
    organizationId: string,
    connectionId: string,
    agentId: string,
    isEnabled: boolean,
    createdBy: string | null,
  ): Promise<ChannelAssistantView> {
    const connection = await this.assertConnection(organizationId, connectionId);

    // O assistente precisa ser da mesma organização e estar ativo.
    const agent = await this.prisma.aiAgent.findUnique({ where: { id: agentId } });
    if (!agent || agent.organization_id !== organizationId) {
      throw new NotFoundException('Assistente não encontrado.');
    }
    if (!agent.is_active) {
      throw new BadRequestException('Assistente inativo — ative-o antes de vincular ao número.');
    }

    await this.repository.upsert({
      organization_id: organizationId,
      // Herda o escopo da conexão — o vínculo vive no mesmo workspace/ambiente.
      workspace_id: connection.workspace_id,
      environment_id: connection.environment_id,
      connection_id: connectionId,
      agent_id: agentId,
      is_enabled: isEnabled,
      created_by: createdBy,
    });
    const view = await this.get(organizationId, connectionId);
    if (!view) throw new NotFoundException('Conexão WhatsApp não encontrada.');
    return view;
  }

  /** Remove o vínculo (o número deixa de ter assistente automático). */
  async remove(organizationId: string, connectionId: string): Promise<{ removed: boolean }> {
    await this.assertConnection(organizationId, connectionId);
    const res = await this.repository.removeByConnection(connectionId);
    return { removed: res.count > 0 };
  }
}
