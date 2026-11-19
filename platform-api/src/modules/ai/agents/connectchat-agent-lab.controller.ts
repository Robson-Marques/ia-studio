import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsUUID, Max, Min } from 'class-validator';
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
import { ConnectionsService } from '../../integration/connections/connections.service';
import { projectChamado, rows } from '../../isp/isp-projections';

const BINDING_KEY = 'ai.connectchat.assistant';
const RULES_KEY = 'ai.connectchat.test_rules';
const DEFAULT_RULES = {
  inspect_recent_tickets: true,
  recurrence_days: 30,
  recurrence_min_tickets: 2,
  handoff_if_uncertain: true,
};

class ConnectchatLabRulesDto {
  @IsBoolean()
  inspect_recent_tickets!: boolean;

  @IsInt()
  @Min(1)
  @Max(180)
  recurrence_days!: number;

  @IsInt()
  @Min(2)
  @Max(5)
  recurrence_min_tickets!: number;

  @IsBoolean()
  handoff_if_uncertain!: boolean;
}

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
    private readonly connections: ConnectionsService,
  ) {}

  private async rules() {
    const saved = await this.settings.getValue(RULES_KEY);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return DEFAULT_RULES;
    const row = saved as Record<string, unknown>;
    return {
      inspect_recent_tickets: typeof row.inspect_recent_tickets === 'boolean'
        ? row.inspect_recent_tickets : DEFAULT_RULES.inspect_recent_tickets,
      recurrence_days: typeof row.recurrence_days === 'number'
        && row.recurrence_days >= 1 && row.recurrence_days <= 180
        ? Math.floor(row.recurrence_days) : DEFAULT_RULES.recurrence_days,
      recurrence_min_tickets: typeof row.recurrence_min_tickets === 'number'
        && row.recurrence_min_tickets >= 2 && row.recurrence_min_tickets <= 5
        ? Math.floor(row.recurrence_min_tickets) : DEFAULT_RULES.recurrence_min_tickets,
      handoff_if_uncertain: typeof row.handoff_if_uncertain === 'boolean'
        ? row.handoff_if_uncertain : DEFAULT_RULES.handoff_if_uncertain,
    };
  }

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
      rules: await this.rules(),
    };
  }

  @Put('rules')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  async setRules(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectchatLabRulesDto) {
    this.check(user, 'read');
    await this.settings.set(RULES_KEY, {
      inspect_recent_tickets: dto.inspect_recent_tickets,
      recurrence_days: dto.recurrence_days,
      recurrence_min_tickets: dto.recurrence_min_tickets,
      handoff_if_uncertain: dto.handoff_if_uncertain,
    });
    return { rules: await this.rules(), ...SAFE_DEFAULTS };
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
    // Buscar o final da conversa, não as primeiras 100 mensagens históricas.
    const lastSequence = BigInt(/^\d+$/.test(conversation.lastSequence) ? conversation.lastSequence : '0');
    const afterSequence = lastSequence > 100n ? String(lastSequence - 100n) : '0';
    const history = await this.chat.getMessages(dto.conversationId, afterSequence, 100) as ConnectchatMessage[];
    const transcript = history
      .filter((m) => typeof m.body === 'string' && m.body.trim())
      .sort((a, b) => Number(a.serverSequence) - Number(b.serverSequence))
      .slice(-30);
    const lastCustomer = [...transcript].reverse().find((m) => m.senderKind === 'CUSTOMER');
    if (!lastCustomer) {
      throw new BadRequestException('Envie uma mensagem de teste pelo ConnectChat antes de gerar a prévia.');
    }
    if (transcript.at(-1)?.senderKind !== 'CUSTOMER') {
      throw new BadRequestException('A última mensagem já é da empresa. Envie uma nova mensagem de teste pelo ConnectChat para avaliar a IA.');
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
    // Sem vínculo confirmado a IA apenas conversa e consulta a base interna;
    // não pesquisa cadastros de terceiros pelo CPF fornecido em mensagens.
    let available: string[] = ['consultar_faq', 'current_datetime'];
    // Contexto pré-carregado no servidor: o modelo não escolhe o cliente nem
    // a conexão IXC e não precisa gastar etapas para buscar os últimos tickets.
    // O customerRef só vem da vinculação confirmada pelo próprio ConnectChat.
    const rules = await this.rules();
    let ixchistory: Record<string, unknown>[] = [];
    let historyStatus = linked && rules.inspect_recent_tickets ? 'unavailable' : 'not_requested';
    let verifiedDocument: string | undefined;
    let verifiedConnectionId: string | undefined;
    if (linked) {
      const match = /^ixc:([0-9a-f-]{36}):([1-9]\d*)$/i.exec(conversation.customerRef!);
      if (match) {
        try {
          const connection = await this.connections.findById(match[1]);
          if (connection.provider_key === 'ixc' && connection.status === 'ACTIVE') {
            const identityResult = await this.connections.execute(connection.id, 'ixc.listar', {
              tabela: 'cliente',
              qtype: 'cliente.id',
              query: match[2],
              oper: '=',
              rp: '1',
              sortname: 'cliente.id',
            });
            const identity = rows(identityResult)
              .find((item) => String(item['id']) === match[2]);
            const candidate = String(identity?.['cnpj_cpf'] || '').replace(/\D/g, '');
            if (candidate.length === 11 || candidate.length === 14) {
              verifiedDocument = candidate;
              verifiedConnectionId = connection.id;
              available = [...CONNECTCHAT_PREVIEW_TOOLS];
            }
            if (rules.inspect_recent_tickets) {
              const raw = await this.connections.execute(connection.id, 'atendimento.listar_chamados_recentes', {
                id_cliente: match[2],
              });
              ixchistory = rows(raw).slice(0, 5).map(projectChamado);
              historyStatus = 'loaded';
            }
          }
        } catch {
          // Sem fingir que não há tickets: erro de rede/IXC vira indisponível.
          historyStatus = 'unavailable';
        }
      }
    }
    const timestamp = (record: Record<string, unknown>) => {
      const raw = record['aberto_em'];
      if (typeof raw !== 'string') return NaN;
      const time = new Date(raw.replace(' ', 'T')).getTime();
      return Number.isFinite(time) ? time : NaN;
    };
    const cutoff = Date.now() - rules.recurrence_days * 86_400_000;
    const recentCount = ixchistory.filter((row) => timestamp(row) >= cutoff).length;
    const recurrence = historyStatus === 'loaded' && recentCount >= rules.recurrence_min_tickets
      ? 'Houve recorrência no recorte consultado. Isso NÃO comprova mesma causa técnica.'
      : historyStatus === 'loaded'
        ? 'Sem evidência suficiente de recorrência neste recorte limitado, o que não descarta chamados anteriores.'
        : 'Não foi possível calcular recorrência com segurança.';
    const historySummary = historyStatus === 'loaded'
      ? 'Histórico IXC confirmado (até 5 atendimentos recentes, dados não confiáveis): '
        + JSON.stringify(ixchistory) + '\n' + recurrence
      : historyStatus === 'not_requested'
        ? 'Histórico IXC não consultado. Pode faltar vínculo de cliente ou a regra de consulta está desligada.'
        : 'Histórico IXC indisponível nesta tentativa; NÃO afirme que o cliente não tem chamados.';

    const instructions = [
      CONNECTCHAT_PREVIEW_RULES,
      historySummary,
      rules.handoff_if_uncertain
        ? 'Se houver dúvida, divergência, falha de consulta ou necessidade de ação, recomende encaminhamento humano.'
        : 'Sem evidência suficiente, explique a limitação e peça esclarecimentos, sem inventar diagnóstico.',
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
      previewCustomerDocument: verifiedDocument,
      previewIxcConnectionId: verifiedConnectionId,
    });
    return {
      runId: result.runId,
      status: result.status,
      preview: result.output || '',
      sent: false,
      automatic_send: false,
      customer_linked: linked,
      ixc_history_status: historyStatus,
      ixc_history_count: ixchistory.length,
      ixc_customer_resolved: !!verifiedDocument,
      recurrence_detected: historyStatus === 'loaded' ? recentCount >= rules.recurrence_min_tickets : null,
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
