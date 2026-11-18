// Vínculo assistente↔número: qual assistente de IA atende sozinho um canal
// (conexão WhatsApp). Valida a conexão e o assistente locais antes de gravar.
// O condutor embutido (próximo checkpoint) lê daqui
// qual assistente chamar quando chega uma mensagem — por isso o vínculo vive no
// domínio comm, não no de IA.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { WhatsappAssistantRepository } from './whatsapp-assistant.repository';
import {
  allowsAutomaticWhatsappSend,
  isWhatsappProvider,
} from '../../../shared/integration/whatsapp-provider.constants';

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

  /** Conexão WhatsApp local, ou 404. */
  private async assertConnection(connectionId: string) {
    const connection = await this.connections.findById(connectionId);
    if (
      !connection ||
      !isWhatsappProvider(connection.provider_key)
    ) {
      throw new NotFoundException('Conexão WhatsApp não encontrada.');
    }
    return connection;
  }

  /** Vínculo atual do número (ou null), já com o nome do assistente. */
  async get(connectionId: string): Promise<ChannelAssistantView | null> {
    const connection = await this.assertConnection(connectionId);
    if (isEnabled && !allowsAutomaticWhatsappSend(connection)) {
      throw new BadRequestException(
        'Habilite os envios automáticos desta conexão WAHA antes de ligar um assistente.',
      );
    }
    const row = await this.repository.findByConnection(connectionId);
    if (!row) return null;
    const agent = await this.prisma.aiAgent.findUnique({
      where: { id: row.agent_id },
      select: { name: true },
    });
    return {
      connection_id: row.connection_id,
      agent_id: row.agent_id,
      agent_name: agent?.name ?? null,
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
    connectionId: string,
    agentId: string,
    isEnabled: boolean,
    createdBy: string | null,
  ): Promise<ChannelAssistantView> {
    await this.assertConnection(connectionId);

    // O assistente precisa existir localmente e estar ativo.
    const agent = await this.prisma.aiAgent.findUnique({ where: { id: agentId } });
    if (!agent) {
      throw new NotFoundException('Assistente não encontrado.');
    }
    if (!agent.is_active) {
      throw new BadRequestException('Assistente inativo — ative-o antes de vincular ao número.');
    }

    await this.repository.upsert({
      connection_id: connectionId,
      agent_id: agentId,
      is_enabled: isEnabled,
      created_by: createdBy,
    });
    const view = await this.get(connectionId);
    if (!view) throw new NotFoundException('Conexão WhatsApp não encontrada.');
    return view;
  }

  /** Remove o vínculo (o número deixa de ter assistente automático). */
  async remove(connectionId: string): Promise<{ removed: boolean }> {
    await this.assertConnection(connectionId);
    const res = await this.repository.removeByConnection(connectionId);
    return { removed: res.count > 0 };
  }
}
