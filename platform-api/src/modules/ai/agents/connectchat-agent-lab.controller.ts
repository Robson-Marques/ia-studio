import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { SettingsService } from '../../core/settings/settings.service';
import { ConnectchatInboxService } from '../../comm/connectchat/connectchat-inbox.service';
import { AgentRunnerService } from './agent-runner.service';
import { AgentsRepository } from './agents.repository';
import { CONNECTCHAT_PREVIEW_RULES, CONNECTCHAT_PREVIEW_TOOLS } from './isp-agent-defaults';
import { ConnectchatMessage } from '../../../shared/integration/connectchat.client';

const BINDING_KEY = 'ai.connectchat.assistant';
const SAFE_DEFAULTS = {
  mode: 'PREVIEW' as const,
  require_confirmed_customer: true,
  allow_financial: false,
  allow_write_actions: false,
  allow_automatic_send: false,
};

class SetConnectchatAgentDto {
  @IsUUID()
  agentId!: string;
}

class PreviewConnectchatAgentDto {
  @IsUUID()
  conversationId!: string;
}

/**
 * Laboratório: vincula UM agente ao ConnectChat desta instalação e gera
 * rascunhos que APENAS o atendente enxerga. Não há webhook de envio automático,
 * alteração no IXC, edição do chat nem disponibilização externa da prévia.
 */
@ApiTags('IA — Laboratório ConnectChat')
@ApiBearerAuth()
@Controller('ai/connectchat-lab')
@Injectable()
export class ConnectchatAgentLabController {
  constructor(
    private readonly agents: AgentsRepository,
    private readonly runner: AgentRunnerService,
    private readonly chat: ConnectchatInboxService,
    private readonly settings: SettingsService,
  ) {}

  private check(user: AuthenticatedUser, action: 'read' | 'write'): void {
    const perms = user.permissions ?? [];
    const want = action === 'write' ? PERMISSIONS.AI_AGENTS_WRITE : PERMISSIONS.COMM_CONNECTCHAT_READ;
    if (!perms.includes('*') && !perms.includes(want)) {
      throw new ForbiddenException('Você não tem permissão para esta operação no ConnectChat.');
    }
  }

  @Get('binding')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_READ)
  async binding(@CurrentUser() user: AuthenticatedUser) {
    this.check(user, 'read');
    const id = await this.settings.getValue(BINDING_KEY);
    const agent = typeof id === 'string' && id ? await this.agents.findById(id) : null;
    return {
      agentId: agent?.is_active ? agent.id : null,
      agentName: agent?.is_active ? agent.name : null,
      ...SAFE_DEFAULTS,
    };
  }

  @Put('binding')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  async configure(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetConnectchatAgentDto) {
    this.check(user, 'read');
    const agent = await this.agents.findById(dto.agentId);
    if (!agent || !agent.is_active) throw new BadRequestException('Selecione um agente ativo.');
    await this.settings.set(BINDING_KEY, agent.id);
    return { agentId: agent.id, agentName: agent.name, ...SAFE_DEFAULTS };
  }

  @Post('preview')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_EXECUTE)
  async preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: PreviewConnectchatAgentDto) {
    this.check(user, 'read');
    const binding = await this.bindingForPreview();
    const conversation = await this.chat.conversationForAgent(dto.conversationId);
    const history = await this.chat.getMessages(dto.conversationId, '0', 100) as ConnectchatMessage[];
    const transcript = history
      .filter((m) => typeof m.body === 'string' && m.body.trim())
      .sort((a, b) => Number(a.serverSequence) - Number(b.serverSequence))
      .slice(-30);
    const lastCustomer = [...transcript].reverse().find((m) => m.senderKind === 'CUSTOMER');
    if (!lastCustomer) {
      throw new BadRequestException('Envie uma mensagem de teste pelo ConnectChat antes de gerar a prévia.');
    }
    const lastIdx = transcript.findIndex((m) => m.id === lastCustomer.id);
    const previous = transcript.slice(0, lastIdx)
      .map((m) => ({
        role: m.senderKind === 'CUSTOMER' ? 'user' as const : 'assistant' as const,
        content: m.body.slice(0, 4000),
      }));
    const linked = typeof conversation.customerRef === 'string'
      && /^ixc:[0-9a-f-]{36}:[1-9]\d*$/i.test(conversation.customerRef)
      && conversation.businessContact?.linkStatus === 'ACTIVE';
    // Identificação permite somente busca. Consultas do titular só entram
    // quando há vínculo já confirmado no próprio ConnectChat.
    const available = linked
      ? [...CONNECTCHAT_PREVIEW_TOOLS]
      : ['identificar_cliente', 'consultar_faq', 'current_datetime'];
    const instructions = [
      CONNECTCHAT_PREVIEW_RULES,
      linked
        ? 'Existe vínculo cadastral ativo no ConnectChat. Ainda confirme autorização do solicitante antes de citar informações pessoais ou financeiras.'
        : 'NÃO há vínculo IXC confirmado para esta conversa. Identifique o cliente antes de acessar histórico, contratos, conexão ou débitos. Pergunte apenas o necessário.',
    ].join('\n\n');
    const result = await this.runner.run({
      agentId: binding.id,
      input: lastCustomer.body.slice(0, 5000),
      history: previous,
      createdBy: user.sub,
      // Não passar scope "session": impedir que uma tool ISP vincule
      // inadvertidamente um ID ConnectChat ao cadastro do WhatsApp.
      scopeKeys: { contact: 'connectchat:' + conversation.id },
      previewAllowedTools: available,
      previewInstructions: instructions,
    });
    return {
      runId: result.runId,
      status: result.status,
      preview: result.output || '',
      sent: false,
      automatic_send: false,
      customer_linked: linked,
      disclaimer: 'Prévia interna: nenhuma mensagem foi enviada ao cliente.',
    };
  }

  private async bindingForPreview() {
    const id = await this.settings.getValue(BINDING_KEY);
    if (typeof id !== 'string' || !id) {
      throw new BadRequestException('Escolha e vincule um assistente no laboratório ConnectChat.');
    }
    const agent = await this.agents.findById(id);
    if (!agent?.is_active) throw new BadRequestException('Assistente vinculado está inativo.');
    return agent;
  }
}
