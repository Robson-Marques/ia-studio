// Bancada segura do ConnectChat: vínculo de agente para ensaio supervisionado.
// Nunca publica respostas automaticamente nem habilita o WhatsApp.
import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { SettingsService } from '../../core/settings/settings.service';
import { ConnectchatInboxService } from '../../comm/connectchat/connectchat-inbox.service';
import { AgentsRepository } from '../agents/agents.repository';
import { AgentRunnerService } from '../agents/agent-runner.service';
import type { ConnectchatMessage } from '../../../shared/integration/connectchat.client';

const BINDING_KEY = 'ai.connectchat.pilot.agent_id';
// Nenhuma ferramenta com escrita, envio, desbloqueio, emissão ou alteração
// é oferecida ao LLM durante o ensaio. Não confiar no nome/categoria dinâmica.
const READ_TOOLS = [
  'identificar_cliente', 'consultar_chamados_recentes', 'diagnosticar_conexao',
  'consultar_contrato', 'status_conexao', 'current_datetime', 'consultar_faq',
] as const;

class BindPilotDto {
  @IsOptional() @IsUUID() agentId?: string;
}
class PreviewPilotDto {
  @IsString() @MaxLength(2000) @IsOptional() guidance?: string;
}

@ApiTags('IA — Bancada ConnectChat')
@ApiBearerAuth()
@Controller('ai/connectchat-pilot')
export class ConnectchatPilotController {
  constructor(
    private readonly settings: SettingsService,
    private readonly inbox: ConnectchatInboxService,
    private readonly agents: AgentsRepository,
    private readonly runner: AgentRunnerService,
  ) {}

  private requireBoth(user: AuthenticatedUser, a: string, b: string) {
    const permissions = user.permissions ?? [];
    if (!permissions.includes('*') && (!permissions.includes(a) || !permissions.includes(b))) {
      throw new ForbiddenException('Esta operação exige permissões de agentes e leitura do ConnectChat.');
    }
  }

  @Get()
  @RequirePermissions(PERMISSIONS.AI_AGENTS_READ, PERMISSIONS.COMM_CONNECTCHAT_READ)
  async getBinding(@CurrentUser() user: AuthenticatedUser) {
    this.requireBoth(user, PERMISSIONS.AI_AGENTS_READ, PERMISSIONS.COMM_CONNECTCHAT_READ);
    const value = await this.settings.getValue(BINDING_KEY);
    return { agentId: typeof value === 'string' ? value : null, automaticReplies: false, whatsappEnabled: false };
  }

  @Post('binding')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE, PERMISSIONS.COMM_CONNECTCHAT_READ)
  async setBinding(@CurrentUser() user: AuthenticatedUser, @Body() body: BindPilotDto) {
    this.requireBoth(user, PERMISSIONS.AI_AGENTS_WRITE, PERMISSIONS.COMM_CONNECTCHAT_READ);
    if (body.agentId) {
      const agent = await this.agents.findById(body.agentId);
      if (!agent?.is_active) throw new BadRequestException('Escolha um agente ativo.');
    }
    await this.settings.set(BINDING_KEY, body.agentId || '');
    return { agentId: body.agentId || null, automaticReplies: false, whatsappEnabled: false };
  }

  @Post('conversations/:conversationId/preview')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_EXECUTE, PERMISSIONS.COMM_CONNECTCHAT_READ)
  async preview(@CurrentUser() user: AuthenticatedUser, @Param('conversationId') conversationId: string, @Body() body: PreviewPilotDto) {
    this.requireBoth(user, PERMISSIONS.AI_AGENTS_EXECUTE, PERMISSIONS.COMM_CONNECTCHAT_READ);
    if (!/^[0-9a-f-]{36}$/i.test(conversationId)) throw new BadRequestException('Conversa inválida.');
    const agentId = await this.settings.getValue(BINDING_KEY);
    if (typeof agentId !== 'string') throw new BadRequestException('Selecione e vincule um agente à bancada ConnectChat.');
    const agent = await this.agents.findById(agentId);
    if (!agent?.is_active) throw new BadRequestException('O agente da bancada está desativado.');

    // Só ensaiar em conversas que realmente existem no ConnectChat.
    // Não confiar em conversationId fornecido pelo navegador para acessar
    // histórico de outro canal ou criar vínculo de titularidade.
    const conversations = await this.inbox.listConversations();
    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation) throw new BadRequestException('Conversa não encontrada no ConnectChat.');
    const raw = await this.inbox.getMessages(conversationId, '0', 100) as ConnectchatMessage[];
    const history = raw
      .filter((m) => typeof m.body === 'string' && m.body.trim().length > 0)
      .slice(-20)
      .map((m) => ({
        role: m.senderKind === 'CUSTOMER' ? 'user' as const : 'assistant' as const,
        content: m.body.slice(0, 3500),
      }));
    const lastCustomer = [...history].reverse().find((m) => m.role === 'user');
    if (!lastCustomer) throw new BadRequestException('Não existe mensagem de cliente para testar.');

    // Nunca tomar a presença de um telefone ou nome como prova de titularidade.
    // Sem vínculo IXC confirmado, o ensaio não recebe ferramentas cadastrais.
    const linked = conversation.businessContact?.linkStatus === 'ACTIVE'
      && conversation.businessContact?.status === 'CUSTOMER';
    const tools = linked
      ? [...READ_TOOLS] : ['current_datetime', 'consultar_faq'];
    const customerName = linked ? (conversation.businessContact?.customerDisplayName || '') : '';
    const caution = linked
      ? 'Existe vínculo de cliente no ConnectChat. Use apenas dados necessários; não execute operações financeiras ou alterações.'
      : 'O cliente ainda não teve a titularidade validada. Não consulte ou divulgue cadastros, chamados, débitos ou dados pessoais. Solicite identificação segura.';
    const input = [
      '[ENSAIO INTERNO — NÃO ENVIAR MENSAGEM AO CLIENTE]',
      caution,
      customerName ? 'Cliente vinculado: ' + customerName.slice(0, 120) : '',
      body.guidance ? 'Orientação do operador: ' + body.guidance.trim() : '',
      'Última mensagem do cliente: ' + lastCustomer.content,
      'Responda apenas com uma sugestão de atendimento para revisão humana.',
    ].filter(Boolean).join('\n');
    const result = await this.runner.run({
      agentId, input, history: history.slice(0, -1),
      createdBy: user.sub,
      scopeKeys: { channel: 'connectchat', session: conversationId, contact: conversationId },
      toolAllowlist: tools,
      // dryRun não é usado aqui: consultas de leitura devem chegar ao IXC,
      // mas a allowlist elimina todas as ferramentas com efeitos externos.
    });
    return {
      status: result.status, preview: result.output,
      runId: result.runId, customerLinked: linked,
      sent: false, automaticReplies: false,
    };
  }
}
