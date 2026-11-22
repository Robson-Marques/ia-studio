// Atendimento web Newnet: o backend governa consultas e ações ISP com evidências
// verificadas. O LLM pode escolher a próxima investigação dentro do catálogo
// seguro; não escolhe cliente, não libera gates e não executa IXC.
// A abertura de OS reutiliza a ferramenta ISP existente e somente ocorre após
// vínculo autenticado, quando os gates operacionais permitem.
import { createHash, randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AiAgent, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ConnectchatConversation, ConnectchatMessage } from '../../../shared/integration/connectchat.client';
import { ConnectchatInboxService } from '../../comm/connectchat/connectchat-inbox.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AgentRunnerService } from '../agents/agent-runner.service';
import { AgentsRepository } from '../agents/agents.repository';
import { parseConversation } from '../agents/agent-conversation';
import { ConnectchatSupportContextService, IdentifiedOperationalSnapshot } from './connectchat-support-context.service';
import { extractSubscriberDocument, redactSubscriberDocuments } from './subscriber-document';
import { formatVerifiedInvoices } from './billing-response';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { ToolsRepository } from '../tools/tools.repository';
import { ApprovalPolicyService } from '../approvals/approval-policy.service';
import { TechnicalCaseService } from './technical-case.service';
import { TechnicalCasePlannerService } from './technical-case-planner.service';
import { communicateTechnicalPlan } from './technical-case-planner';
import { analyzeTechnicalConversation } from './technical-conversation-state';
import {
  decideTechnicalGovernance,
  shouldInterruptTechnicalExperiment,
} from './technical-case-governance';

type Cursor = {
  sequence: string;
  inflight?: string;
  lease?: number;
  claim?: string;
};

@Injectable()
export class ConnectchatAutoResponderService {
  private readonly logger = new Logger(ConnectchatAutoResponderService.name);
  private polling = false;
  private readonly bootTime = Date.now();

  constructor(
    private readonly settings: SettingsService,
    private readonly repository: AgentsRepository,
    private readonly runner: AgentRunnerService,
    private readonly inbox: ConnectchatInboxService,
    private readonly prisma: PrismaService,
    private readonly support: ConnectchatSupportContextService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly toolsRepository: ToolsRepository,
    private readonly approvalPolicy: ApprovalPolicyService,
    private readonly technicalCases: TechnicalCaseService,
    private readonly technicalPlanner: TechnicalCasePlannerService,
  ) {}

  // A Nete atende todas as conversas abertas quando o agente nativo está
  // ativo. CONNECTCHAT_AI_AUTOREPLY=off é apenas o interruptor de emergência.
  private enabled(): boolean {
    return process.env['CONNECTCHAT_AI_AUTOREPLY'] !== 'off';
  }

  private async isPausedForHuman(conversation: ConnectchatConversation): Promise<boolean> {
    const raw = await this.settings.getValue(`ai.connectchat.human_handoff.${conversation.id}`);
    const state = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, unknown> : {};
    return state.active === true
      && state.customerRef === conversation.customerRef
      && state.globalIdentityId === conversation.globalIdentityId;
  }

  private async pauseForHuman(
    conversation: ConnectchatConversation,
    reason: string,
  ): Promise<void> {
    await this.settings.set(`ai.connectchat.human_handoff.${conversation.id}`, {
      active: true,
      customerRef: conversation.customerRef,
      globalIdentityId: conversation.globalIdentityId,
      pausedAtSequence: conversation.lastSequence,
      reason: reason.slice(0, 300),
      pausedAt: new Date().toISOString(),
    });
  }

  @Interval(5000)
  async poll(): Promise<void> {
    if (!this.enabled() || this.polling) return;
    this.polling = true;
    try {
      const raw = await this.settings.getValue('ai.native_agent_id');
      const native = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw as Record<string, unknown> : {};
      if (typeof native.id !== 'string') return;
      const agent = await this.repository.findById(native.id);
      if (!agent?.is_active || !parseConversation(agent.conversation).auto_reply) return;
      const conversations = await this.inbox.listRawConversations();
      for (const conversation of conversations.filter((c) => c.status === 'OPEN')) {
        try {
          // Escalonamento real neste canal significa: o atendimento continua
          // aberto para o operador e a Nete para de responder até o reset local.
          if (await this.isPausedForHuman(conversation)) continue;
          const pendingKey = `ai.connectchat.pending_identity.${conversation.id}`;
          const rawPending = await this.settings.getValue(pendingKey);
          const pending = rawPending && typeof rawPending === 'object' && !Array.isArray(rawPending)
            ? rawPending as Record<string, unknown> : {};
          const expectedRef = typeof pending.connectionId === 'string'
            && typeof pending.customerId === 'string'
            ? `ixc:${pending.connectionId}:${pending.customerId}` : null;
          const verified = conversation.businessContact?.status === 'CUSTOMER'
            && conversation.businessContact.linkStatus === 'ACTIVE';
          if (verified && pending.consent === true && expectedRef !== null
            && conversation.customerRef?.toLowerCase() === expectedRef.toLowerCase()
            && (pending.requestIdentity === undefined
              || pending.requestIdentity === conversation.globalIdentityId)
            && pending.resumed !== true) {
            await this.respond(agent, conversation, typeof pending.reason === 'string' ? pending.reason : '');
            // Retomada só após checkpoint; não processar o mesmo turno duas vezes.
            const resumeCursor = await this.settings.getValue(`ai.connectchat.resume.${conversation.id}`);
            if (BigInt(this.state(resumeCursor).sequence) >= BigInt(conversation.lastSequence)) {
              await this.settings.set(pendingKey, { ...pending, resumed: true, linkedAt: new Date().toISOString() });
            }
          } else {
            // A última mensagem pode ser uma REVOGAÇÃO ("não") ou outro CPF.
            // Processá-la ANTES de solicitar/concluir o vínculo evita utilizar
            // autorização antiga num intervalo de polling.
            await this.respond(agent, conversation);
            if (!verified) {
              const currentRaw = await this.settings.getValue(pendingKey);
              const current = currentRaw && typeof currentRaw === 'object' && !Array.isArray(currentRaw)
                ? currentRaw as Record<string, unknown> : {};
              if (current.consent === true) {
                await this.progressAuthenticatedLink(conversation, pendingKey, current);
              }
            }
          }
        } catch (error) { this.logger.warn(`ConnectChat ${conversation.id}: ${(error as Error).message}`); }
      }
    } catch (error) {
      this.logger.warn(`ConnectChat IA: ${(error as Error).message}`);
    } finally {
      this.polling = false;
    }
  }

  /**
   * A Nete inicia o pedido; o ASSINANTE aprova na sessão da PWA. Nenhum
   * operador, CPF isolado ou resposta de texto pode substituir a prova.
   * `purpose` é parametrizado porque o enum efetivo é da API ConnectChat,
   * não devemos adivinhá-lo no serviço consumidor.
   */
  private async progressAuthenticatedLink(
    conversation: ConnectchatConversation,
    key: string,
    pending: Record<string, unknown>,
  ): Promise<void> {
    // Ativar somente depois de validar que a aprovação da PWA comprova
    // titularidade/representação do cadastro IXC correspondente.
    if (process.env['CONNECTCHAT_AI_LINKING'] !== 'on') return;
    if (!conversation.globalIdentityId || conversation.status !== 'OPEN') return;
    if (conversation.businessContact?.status === 'CUSTOMER'
      && conversation.businessContact.linkStatus === 'ACTIVE') return;
    const customerId = pending.customerId;
    const connectionId = pending.connectionId;
    if (typeof customerId !== 'string' || !/^[1-9]\d*$/.test(customerId)
      || typeof connectionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(connectionId)) return;

    const now = Date.now();
    if (typeof pending.nextAttemptAt === 'number' && pending.nextAttemptAt > now) return;
    const ref = `ixc:${connectionId}:${customerId}`;
    const existing = typeof pending.requestId === 'string' ? pending.requestId : null;
    if (!existing) {
      // Repetir somente com a MESMA chave idempotente, durante a validade
      // original do pedido. Após três tentativas, encerrar sem vincular.
      const attempts = typeof pending.requestAttempts === 'number' ? pending.requestAttempts : 0;
      const firstAt = typeof pending.requestFirstAttemptAt === 'number'
        ? pending.requestFirstAttemptAt : now;
      if (attempts >= 3 || now - firstAt >= 600000) return;
      // Instalações podem admitir finalidades diferentes. A configuração é
      // uma decisão explícita do operador de instalação, não de cada chat.
      const rawPurpose = await this.settings.getValue('ai.connectchat.link_purpose');
      const purpose = typeof rawPurpose === 'string' ? rawPurpose.trim()
        : rawPurpose && typeof rawPurpose === 'object' && !Array.isArray(rawPurpose)
          ? String((rawPurpose as Record<string, unknown>).value ?? '').trim() : '';
      if (!purpose) {
        this.logger.warn('ConnectChat: finalidade ai.connectchat.link_purpose ausente; vínculo automático não iniciado.');
        await this.settings.set(key, { ...pending, nextAttemptAt: now + 300000 });
        return;
      }
      const attemptState = {
        ...pending, requestAttempts: attempts + 1,
        requestFirstAttemptAt: firstAt, nextAttemptAt: now + 60000,
      };
      // Persistir ANTES da requisição para que outras execuções observem
      // o avanço mesmo quando houver timeout ou erro de transporte.
      await this.settings.set(key, attemptState);
      try {
        const requestKey = createHash('sha256').update(`newnet-link:${conversation.id}:${conversation.globalIdentityId}:${ref}:${String(pending.requestedAt ?? '')}`).digest('hex');
        const response = await this.inbox.createAuthenticatedLinkRequest(conversation.id, ref, purpose, requestKey, conversation.globalIdentityId);
        const value = response && typeof response === 'object' ? response as Record<string, unknown> : {};
        const record = (input: unknown): Record<string, unknown> =>
          input && typeof input === 'object' && !Array.isArray(input)
            ? input as Record<string, unknown> : {};
        const candidates = [
          value.id, value.requestId, value.linkRequestId,
          record(value.request).id, record(value.linkRequest).id,
          record(value.data).id, record(record(value.data).request).id,
        ];
        const requestId = candidates.find((id) =>
          typeof id === 'string' && /^[A-Za-z0-9_-]{8,120}$/.test(id)) as string | undefined;
        if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(requestId)) {
          this.logger.warn('ConnectChat: resposta de criação do vínculo sem ID de pedido reconhecível.');
          await this.settings.set(key, { ...attemptState, nextAttemptAt: now + 60000 });
          return;
        }
        await this.settings.set(key, {
          ...attemptState, requestId, requestIdentity: conversation.globalIdentityId,
          requestCreatedAt: firstAt, nextAttemptAt: now + 15000,
        });
        const token = createHash('sha256').update(`newnet-link-request:${conversation.id}:${requestId}`).digest('hex').slice(0, 32);
        await this.inbox.sendAgentMessage(conversation.id,
          'Enviei a solicitação de vínculo ao ConnectChat. Confirme na sua conta para continuar o atendimento.',
          `newnet-link-request-${token}`);
      } catch (error) {
        this.logger.warn(`ConnectChat vínculo: ${(error as Error).message}`);
        await this.settings.set(key, { ...attemptState, nextAttemptAt: now + 60000 });
      }
      return;
    }

    // Pedido já consumido com sucesso: observar a mudança de estado no
    // ConnectChat, sem fazer POST de conclusão a cada minuto.
    if (typeof pending.completedAt === 'number') return;
    // NUNCA concluir pedido emitido para outra identidade ou outro cliente.
    if (pending.requestIdentity !== conversation.globalIdentityId) return;
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(existing)) return;
    const createdAt = typeof pending.requestCreatedAt === 'number' ? pending.requestCreatedAt : 0;
    if (!createdAt || now - createdAt > 600000) {
      // A expiração exige NOVA autorização. Não reutilizar um pedido antigo
      // mesmo que a API tenha devolvido o mesmo identificador após retry.
      await this.settings.set(key, {
        ...pending, requestId: null, consent: null,
        nextAttemptAt: null, expired: true,
      });
      return;
    }
    try {
      await this.inbox.completeAuthenticatedLinkRequest(conversation.id, existing, conversation.globalIdentityId);
      await this.settings.set(key, { ...pending, completedAt: now, nextAttemptAt: now + 60000 });
      // O estado autenticado ACTIVE/CUSTOMER é verificado no próximo poll.
    } catch {
      // Pedido ainda não aprovado, expirado ou indisponível.
      // Não forçar, não tentar vínculo direto, não bloquear servidor com polling.
      await this.settings.set(key, { ...pending, nextAttemptAt: now + 15000 });
    }
  }

  /**
   * Reinicia somente o CONTEXTO desta conversa na Nete.
   * O histórico físico no ConnectChat e o vínculo permanente ficam intactos.
   * Mensagens até lastSequence não voltam a entrar no prompt nem no polling.
   */
  async resetConversationContext(conversationId: string): Promise<{ conversationId: string; resetThrough: string }> {
    const conversation = (await this.inbox.listRawConversations())
      .find((item) => item.id === conversationId);
    if (!conversation) throw new Error('Conversa ConnectChat não encontrada.');
    if (!/^\d+$/.test(conversation.lastSequence)) throw new Error('Cursor inválido do ConnectChat.');
    const resetThrough = conversation.lastSequence;
    const prefixes = [
      'pending_identity', 'resume', 'cursor', 'document_attempts',
      'identification_requested', 'greeting', 'technology_requested',
      'contract_requested', 'selected_contract', 'selected_access', 'recognition',
      'human_handoff',
    ];
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.deleteMany({
        where: { key: { in: prefixes.map((name) => `ai.connectchat.${name}.${conversationId}`) } },
      });
      await tx.systemSetting.deleteMany({
        where: { key: { startsWith: `ai.connectchat.session_os.${conversationId}.` } },
      });
      await tx.systemSetting.upsert({
        where: { key: `ai.connectchat.reset_boundary.${conversationId}` },
        create: {
          key: `ai.connectchat.reset_boundary.${conversationId}`,
          value: { sequence: resetThrough, resetAt: new Date().toISOString() },
        },
        update: { value: { sequence: resetThrough, resetAt: new Date().toISOString() } },
      });
      await tx.systemSetting.upsert({
        where: { key: `ai.connectchat.cursor.${conversationId}` },
        create: { key: `ai.connectchat.cursor.${conversationId}`, value: { sequence: resetThrough } },
        update: { value: { sequence: resetThrough } },
      });
    });
    await this.technicalCases.cancelConversation(
      conversationId, 'O contexto local da Nete foi limpo pelo operador.');
    return { conversationId, resetThrough };
  }

  private async aiContextScope(conversationId: string): Promise<string> {
    const raw = await this.settings.getValue(`ai.connectchat.reset_boundary.${conversationId}`);
    const record = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, unknown> : {};
    const sequence = typeof record.sequence === 'string' && /^\d+$/.test(record.sequence)
      ? record.sequence : null;
    const recogRaw = await this.settings.getValue(`ai.connectchat.recognition.${conversationId}`);
    const recog = recogRaw && typeof recogRaw === 'object' && !Array.isArray(recogRaw)
      ? recogRaw as Record<string, unknown> : {};
    const base = sequence ? `${conversationId}:after:${sequence}` : conversationId;
    return typeof recog.scopeId === 'string' ? `${base}:customer:${recog.scopeId}` : base;
  }

  private state(raw: unknown): Cursor {
    const row = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, unknown> : {};
    return {
      sequence: typeof row.sequence === 'string' && /^\d+$/.test(row.sequence) ? row.sequence : '0',
      inflight: typeof row.inflight === 'string' ? row.inflight : undefined,
      lease: typeof row.lease === 'number' ? row.lease : undefined,
      claim: typeof row.claim === 'string' ? row.claim : undefined,
    };
  }

  private async checkpoint(key: string, sequence: string): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: { sequence } },
      update: { value: { sequence } },
    });
  }

  // Serializa todos os workers através de advisory lock + cursor com lease.
  // Não usa lock de memória como garantia de deduplicação.
  private async claim(key: string, sequence: string, claim: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${key}), 7236) AS acquired`;
      if (!lock[0]?.acquired) return false;
      const row = await tx.systemSetting.findUnique({ where: { key } });
      const current = this.state(row?.value);
      if (BigInt(current.sequence) >= BigInt(sequence)) return false;
      if (current.lease && current.lease > Date.now()) return false;
      const value = { ...current, inflight: sequence, lease: Date.now() + 180000, claim };
      await tx.systemSetting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue },
        update: { value: value as Prisma.InputJsonValue },
      });
      return true;
    });
  }

  private async complete(key: string, sequence: string, claim: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_advisory_xact_lock(hashtext(${key}), 7236)::text AS acquired`;
      void lock;
      const row = await tx.systemSetting.findUnique({ where: { key } });
      const current = this.state(row?.value);
      if (current.claim !== claim) return;
      const resolved = BigInt(sequence) > BigInt(current.sequence) ? sequence : current.sequence;
      await tx.systemSetting.update({ where: { key }, data: { value: { sequence: resolved } } });
    });
  }

  /** Bloqueia eco da mesma resposta, inclusive com pequenas trocas de palavras. */
  private isRepeat(answer: string, previous: ConnectchatMessage[]): boolean {
    const tokens = (text: string) => new Set(text.toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/).filter((part) => part.length > 2));
    const a = tokens(answer);
    if (a.size < 4) return false;
    return previous.filter((m) => m.senderKind === 'BUSINESS' && !!m.body)
      .slice(-4).some((m) => {
        const b = tokens(m.body);
        const common = [...a].filter((word) => b.has(word)).length;
        const overlap = common / Math.max(a.size, b.size, 1);
        return overlap >= 0.82;
      });
  }

  private classifyRequest(text: string, history: ConnectchatMessage[]): 'SUPPORT' | 'FINANCE' | 'GENERAL' {
    const normalize = (input: string) => input.toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const classify = (input: string): 'SUPPORT' | 'FINANCE' | 'GENERAL' => {
      const value = normalize(input);
      if (/\b(boleto|fatura|pagamento|pagar|vencimento|pix|cobranca|debito|segunda via)\b/.test(value)) return 'FINANCE';
      if (/\b(sem internet|sem conexao|sem sinal|nao conecta|caiu|caindo|lenta|lentidao|wifi|wi.fi|roteador|modem|suporte|rede caiu|internet ruim)\b/.test(value)) return 'SUPPORT';
      return 'GENERAL';
    };
    const current = classify(text);
    if (current !== 'GENERAL') return current;
    // Resposta curta pode continuar o atendimento anterior, mas não inferir
    // uma intenção antiga para uma solicitação completamente nova.
    if (normalize(text).trim().length > 35) return 'GENERAL';
    const recent = history.filter((m) => m.senderKind === 'CUSTOMER' && !!m.body).slice(-6, -1).reverse();
    for (const msg of recent) {
      const kind = classify(msg.body);
      if (kind !== 'GENERAL') return kind;
    }
    return 'GENERAL';
  }

  /**
   * Camada de diálogo: comportamento, não texto fixo para cada exemplo.
   * A decisão de identidade/documento é determinística; somente a formulação
   * da pergunta é delegada ao agente, sem acesso a ferramentas ou dados do IXC.
   */
  private async formulateIdentificationReply(
    agent: AiAgent,
    conversation: ConnectchatConversation,
    messages: ConnectchatMessage[],
    message: string,
    step: 'OPENING' | 'REOPENING' | 'IDENTIFICATION' | 'FOLLOW_UP',
  ): Promise<string> {
    const fallback = step === 'OPENING'
      ? 'Oi! Sou Nete, da Newnet. Como posso ajudar?'
      : step === 'REOPENING'
        ? 'Como posso ajudar?'
        : step === 'FOLLOW_UP'
          ? 'Para continuar, você pode informar o CPF ou CNPJ do titular?'
          : 'Por favor, informe o CPF ou CNPJ do titular.';
    try {
      const history = messages.filter((item) => typeof item.body === 'string' && item.body.trim())
        .slice(-12, -1).map((item) => ({
          role: (item.senderKind === 'CUSTOMER' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: redactSubscriberDocuments(item.body).slice(0, 500),
        }));
      const task = step === 'OPENING'
        ? 'Primeiro cumprimento sem motivo conhecido: apresente-se brevemente e pergunte como ajudar.'
        : step === 'REOPENING'
          ? 'O cliente cumprimentou outra vez, mas ainda não disse do que precisa. Não se apresente novamente; pergunte como pode ajudar.'
          : step === 'FOLLOW_UP'
            ? 'A necessidade já foi informada e o CPF/CNPJ ainda não. Reconheça a nova mensagem sem reabrir a saudação; convide gentilmente a informar o documento para continuar. Não pressione, não explique consultas internas e não faça múltiplas perguntas.'
            : 'O cliente informou sua necessidade. Para prosseguir com atendimento individual, peça CPF/CNPJ do titular de forma simples, sem se reapresentar, sem justificar procedimentos internos ou antecipar diagnóstico.';
      const instructions = [
        'Você é Nete, atendente da Newnet. Conduza conversa natural, breve, contextual e sem frases burocráticas.',
        'O atendimento segue etapas: acolher -> entender a necessidade -> identificar o titular -> confirmar vínculo -> resolver.',
        'Não volte à saudação quando a necessidade já foi informada. Não repita perguntas já respondidas.',
        'Uma pergunta por resposta; não seja insistente, invasiva nem burocrática. Não pressione quem não informou o documento.',
        'Sem promessas de ação, sem revelar dados de cadastro, consultas internas ou operações do IXC.',
        task,
        'Responda em português brasileiro, em até 160 caracteres, sem explicações ou listas.',
      ].join('\n');
      const result = await this.runner.run({
        agentId: agent.id,
        input: redactSubscriberDocuments(message).slice(0, 500),
        history,
        createdBy: null,
        scopeKeys: { connectchat_conversation: await this.aiContextScope(conversation.id) },
        allowedToolsOverride: [],
        channelInstructions: instructions,
        dryRun: false,
      });
      const output = result.status === 'COMPLETED' && typeof result.output === 'string'
        ? result.output.replace(/\s+/g, ' ').trim() : '';
      if (!output || output.length > 160) return fallback;
      if (step === 'IDENTIFICATION' || step === 'FOLLOW_UP') {
        // Um texto fluente não pode omitir o documento obrigatório.
        // Nem informar que fará consulta antes da confirmação de vínculo.
        if (!/\bCPF\b/i.test(output) || !/\bCNPJ\b/i.test(output)
          || /\b(consultar|consulta|pesquisar|busca|verificar cadastro|acessar dados|encontrei)\b/i.test(output)) {
          return fallback;
        }
      }
      if ((step === 'OPENING' || step === 'REOPENING')
        && /\b(CPF|CNPJ|cadastro|boleto|fatura)\b/i.test(output)) return fallback;
      return output;
    } catch (error) {
      this.logger.warn(`Diálogo de identificação indisponível: ${(error as Error).message}`);
      return fallback;
    }
  }

  /**
   * Sem vínculo permanente, a triagem geral continua. A preferência do cliente
   * não autoriza leitura de cadastros/OS/sinal ou qualquer dado privado do IXC.
   * A IA escreve a resposta; o backend determina escopo e permissões.
   */
  private async formulateUnlinkedContinuation(
    agent: AiAgent,
    conversation: ConnectchatConversation,
    messages: ConnectchatMessage[],
    incoming: string,
    initialReason: string,
    justDeclined: boolean,
    operational?: IdentifiedOperationalSnapshot | Record<string, unknown>,
    osResult?: Record<string, unknown>,
  ): Promise<string> {
    const issue = this.classifyRequest(initialReason || incoming, messages);
    const regional = operational?.['incident'] && typeof operational['incident'] === 'object'
      ? operational['incident'] as Record<string, unknown> : null;
    const safeIncident = regional && regional['suppressOs'] === true
      ? String(regional['publicMessage'] ?? 'Há uma ocorrência técnica em andamento na região.').slice(0, 250)
      : null;
    const opened = osResult?.['os_aberta'] === true;
    const fallback = opened
      ? justDeclined
        ? 'Certo, não vou vincular este contato. Verifiquei a conexão e registrei a ordem de serviço para a equipe técnica.'
        : 'A ordem de serviço já está registrada. A equipe técnica poderá acompanhar a falha.'
      : safeIncident
      ? `Há uma ocorrência técnica na região: ${safeIncident}. Nossa equipe está trabalhando nela.`
      : issue === 'SUPPORT'
      ? justDeclined
        ? 'Tudo bem, não vou manter o contato vinculado. Vamos cuidar da sua conexão: a falha acontece em todos os aparelhos?'
        : 'Entendi. Essa dificuldade de conexão acontece em todos os aparelhos ou só em um?'
      : justDeclined
        ? 'Tudo bem, não vou manter o contato vinculado. Vamos continuar seu atendimento: como posso ajudar agora?'
        : 'Pode me contar mais sobre o que está acontecendo?';
    try {
      const history = messages.filter((m) => typeof m.body === 'string' && m.body.trim())
        .slice(-12, -1).map((m) => ({
          role: (m.senderKind === 'CUSTOMER' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: redactSubscriberDocuments(m.body).slice(0, 500),
        }));
      const instructions = [
        'Você é Nete, da Newnet. Seja natural, acolhedora, breve e objetiva, sem jargão burocrático.',
        'A associação do contato é administrada pelo sistema. NÃO ofereça nem pergunte sobre vinculação: continue o atendimento atual.',
        'Continue o atendimento a partir do problema já relatado, sem reiniciar saudação e sem pedir CPF novamente.',
        'O motivo original foi: ' + redactSubscriberDocuments(initialReason).slice(0, 300),
        'Evidências operacionais da sessão (o cliente informou o documento): '
          + JSON.stringify({
            consultaConcluida: operational?.['status'] === 'READY',
            incidenteAplicavel: safeIncident,
            statusConexao: operational?.['online'] === false ? 'offline'
              : operational?.['online'] === true ? 'online' : 'indeterminado',
            osJaExistente: operational?.['hasOpenOs'] === true,
            chamadoJaExistente: operational?.['hasOpenTicket'] === true,
            osRegistradaNestaSessao: opened,
            falhaNaAbertura: osResult && !opened
              ? String(osResult['motivo'] ?? 'não confirmada').slice(0, 120) : null,
          }),
        'Se existe ocorrência regional aplicável, informe de forma breve que a equipe trata o incidente; não faça perguntas desnecessárias, não prometa retorno automático sem acompanhamento realmente agendado.',
        justDeclined
          ? 'Reconheça a escolha de não manter o vínculo em uma oração breve e, na mesma mensagem, conduza o próximo passo de triagem.'
          : 'Responda à mensagem atual e faça avançar o diagnóstico geral em uma etapa. Não repita o aviso sobre vínculo.',
        'O backend já consultou IXC. Pode falar dos resultados reais fornecidos; nunca invente diagnóstico ou nova OS.',
        'O CPF já selecionou o cadastro atendido nesta sessão; a associação do contato para próximos atendimentos ocorre separadamente.',
        'Não informe dados financeiros, endereço, números de documentos ou informações de terceiros. Confirme OS somente quando osRegistradaNestaSessao for verdadeira.',
        'Se uma OS foi aberta, já existe chamado, ou há incidente relevante, comunique isso e não faça perguntas técnicas sem necessidade.',
        'Faça no máximo uma pergunta útil por resposta, adaptada ao assunto. Até 200 caracteres. Apenas a mensagem ao cliente.',
      ].join('\n');
      const result = await this.runner.run({
        agentId: agent.id,
        input: redactSubscriberDocuments(incoming).slice(0, 500),
        history,
        createdBy: null,
        scopeKeys: { connectchat_conversation: await this.aiContextScope(conversation.id) },
        allowedToolsOverride: [],
        channelInstructions: instructions,
        dryRun: false,
      });
      const output = result.status === 'COMPLETED' && typeof result.output === 'string'
        ? result.output.replace(/\s+/g, ' ').trim() : '';
      if (!output || output.length > 200
        || ((safeIncident || opened) && output.includes('?'))
        || (!opened && /\b(abri|registramos|foi registrada)\s+(?:uma\s+)?(?:os|ordem de servi[cç]o)/i.test(output))
        || /\b(CPF|CNPJ|cadastro confirmado|consultei|verifiquei no sistema|acesso ao IXC|sinal do seu modem|seu contrato)\b/i.test(output)) {
        return fallback;
      }
      return output;
    } catch (error) {
      this.logger.warn(`Continuidade sem vínculo indisponível: ${(error as Error).message}`);
      return fallback;
    }
  }

  /**
   * Ações são decididas por evidências verificadas, nunca pelo texto livre do LLM.
   * Reutiliza o handler ISP abrir_os (config/setor, incidentes e anti-duplicidade).
   * Não grava CPF na memória da Nete e não executa sem vínculo ACTIVE/CUSTOMER.
   */
  /**
   * Atendimento da SESSÃO, independente do vínculo de contato para o futuro.
   * O CPF é usado somente como seletor do cadastro nesta execução, nunca
   * associado ao globalIdentityId/telefone. Reutiliza abrir_os com todos os
   * seus gates de incidente, setor, assunto e anti-duplicidade.
   */
  private async maybeOpenSessionOfflineOs(
    agent: AiAgent,
    conversation: ConnectchatConversation,
    document: string,
    connectionId: string,
    customerId: string,
    reason: string,
    operational: Awaited<ReturnType<ConnectchatSupportContextService['triageIdentifiedCustomer']>>,
  ): Promise<{ os_aberta: boolean; motivo?: string; duplicada?: boolean } | null> {
    if (this.classifyRequest(reason, []) !== 'SUPPORT'
      || operational.status !== 'READY'
      || operational.hasOpenOs !== false || operational.hasOpenTicket !== false
      || operational.incident !== null || operational.blocked !== false
      || operational.online !== false || operational.multipleAccesses) return null;
    const tool = this.toolRegistry.get('abrir_os');
    const catalog = await this.toolsRepository.findByKey('abrir_os');
    if (!tool || tool.requires_approval || !catalog?.is_active || catalog.requires_approval) {
      return { os_aberta: false, motivo: 'A abertura automática não está habilitada.' };
    }
    const approval = await this.approvalPolicy.evaluate({
      targetType: 'TOOL', context: { tool_key: 'abrir_os' },
    });
    if (approval.required) return { os_aberta: false, motivo: 'A abertura depende da aprovação da equipe.' };

    const current = await this.inbox.contextForAgentPreview(conversation.id);
    const lastCustomer = current.messages.filter((m) => m.senderKind === 'CUSTOMER').at(-1);
    if (current.conversation.status !== 'OPEN'
      || !lastCustomer || lastCustomer.serverSequence !== conversation.lastSequence
      || current.conversation.globalIdentityId !== conversation.globalIdentityId) return null;
    // Deduplicação por conversa + cliente; um contato pode atender diversas pessoas.
    const attemptKey = `ai.connectchat.session_os.${conversation.id}.${connectionId}.${customerId}`;
    const earlier = await this.settings.getValue(attemptKey);
    if (earlier) return null;
    await this.settings.set(attemptKey, { status: 'STARTED', at: new Date().toISOString() });
    try {
      const raw = await tool.handler({
        cpf: document,
        descricao: `Atendimento ConnectChat: ${reason.slice(0, 400)}. Acesso único offline no IXC.`,
        connection_id: connectionId,
      }, {
        agentId: agent.id, agentRunId: randomUUID(), traceId: randomUUID(),
        scopeKeys: { connectchat_conversation: conversation.id },
        permittedTools: ['abrir_os'], dryRun: false,
      });
      const result = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw as Record<string, unknown> : {};
      const outcome = {
        os_aberta: result['os_aberta'] === true,
        duplicada: result['duplicada'] === true,
        motivo: typeof result['motivo'] === 'string' ? result['motivo'].slice(0, 200) : undefined,
      };
      await this.settings.set(attemptKey, { ...outcome, status: 'DONE', at: new Date().toISOString() });
      return outcome;
    } catch (error) {
      this.logger.warn(`OS da sessão sem conclusão confirmada: ${(error as Error).message}`);
      await this.settings.set(attemptKey, { status: 'UNKNOWN', at: new Date().toISOString() });
      return { os_aberta: false, motivo: 'A abertura não pôde ser confirmada. A equipe deve conferir antes de repetir.' };
    }
  }

  private async maybeOpenVerifiedOfflineOs(
    agent: AiAgent,
    conversation: ConnectchatConversation,
    messages: ConnectchatMessage[],
    reason: string,
    support: Awaited<ReturnType<ConnectchatSupportContextService['byVerifiedConversation']>>,
    confirmedNavigationFailure = false,
    target?: { login?: string; contract?: string },
    diagnosticSummary?: string,
  ): Promise<{ attempted: boolean; result: Record<string, unknown> | null }> {
    if (this.classifyRequest(reason, messages) !== 'SUPPORT'
      || support.openOs.length || support.openTickets.length || support.uncertainTickets
      || support.incidents.some((i) => i.suppress_os)
      || support.blockedContracts > 0
      || support.contracts.length !== 1 || support.connections.length !== 1
      || (!confirmedNavigationFailure && support.connections[0]?.['online'] !== false)
      || conversation.businessContact?.status !== 'CUSTOMER'
      || conversation.businessContact.linkStatus !== 'ACTIVE') {
      return { attempted: false, result: null };
    }
    const match = /^ixc:([0-9a-f-]{36}):([1-9]\d*)$/i.exec(conversation.customerRef || '');
    if (!match) return { attempted: false, result: null };

    // Se houver documento nesta conversa, ele precisa corresponder exatamente
    // ao vínculo. Sem documento, o customer_id autenticado é usado backend-only.
    let document: string | null = null;
    for (const message of [...messages].reverse()) {
      if (message.senderKind !== 'CUSTOMER') continue;
      const candidate = extractSubscriberDocument(message.body || '');
      if (!candidate) continue;
      const found = await this.support.lookupDocument(candidate);
      if (found.status === 'FOUND' && found.connectionId === match[1]
        && found.customerId === match[2]) {
        document = candidate;
        break;
      }
    }
    // Cliente habitual pode não repetir CPF nesta conversa. O vínculo
    // ACTIVE/CUSTOMER já traz o customer_id verificado; o ID fica backend-only.

    // O catálogo ISP já governa a abertura. Política de aprovação ativa
    // impede a execução direta neste canal até existir fluxo de aprovação.
    const tool = this.toolRegistry.get('abrir_os');
    const catalogTool = await this.toolsRepository.findByKey('abrir_os');
    if (!tool || tool.requires_approval === true || !catalogTool?.is_active
      || catalogTool.requires_approval === true) return {
      attempted: true,
      result: { os_aberta: false, motivo: 'A abertura automática de OS está desabilitada ou requer aprovação.' },
    };
    const policy = await this.approvalPolicy.evaluate({
      targetType: 'TOOL',
      context: { tool_key: 'abrir_os' },
    });
    if (policy.required) return {
      attempted: true,
      result: { os_aberta: false, motivo: 'A política da instalação exige aprovação antes de abrir OS.' },
    };

    // A pesquisa pode demorar; se a identidade ou a conversa mudaram durante
    // a consulta, abandonar a escrita sem reutilizar o CPF antigo.
    const fresh = await this.inbox.contextForAgentPreview(conversation.id);
    if (!fresh.verified || fresh.conversation.status !== 'OPEN'
      || fresh.conversation.customerRef !== conversation.customerRef
      || fresh.conversation.globalIdentityId !== conversation.globalIdentityId
      || fresh.conversation.lastSequence !== conversation.lastSequence) {
      return { attempted: false, result: null };
    }

    const idempotencyKey = `ai.connectchat.os_attempt.${conversation.id}`;
    const previous = await this.settings.getValue(idempotencyKey);
    const prior = previous && typeof previous === 'object' && !Array.isArray(previous)
      ? previous as Record<string, unknown> : {};
    if (prior.customerRef === conversation.customerRef) {
      return { attempted: false, result: null };
    }
    // Persistir antes da escrita no IXC para não repetir após timeout.
    await this.settings.set(idempotencyKey, {
      customerRef: conversation.customerRef,
      startedAt: new Date().toISOString(),
      status: 'STARTED',
    });
    try {
      const output = await tool.handler({
        ...(document ? { cpf: document } : { customer_id: match[2] }),
        descricao: diagnosticSummary
          ? `${diagnosticSummary.slice(0, 700)} Relato atual: ${reason.slice(0, 250)}.`
          : confirmedNavigationFailure
          ? `Cliente sem navegação em vários aparelhos. Reinicialização assistida concluída; sessão retornou, mas o cliente confirmou que a navegação não voltou. Relato: ${reason.slice(0, 250)}.`
          : 'Cliente relata indisponibilidade de conexão; acesso único identificado como offline no IXC.',
        connection_id: match[1],
        ...(target?.login ? { login: target.login } : {}),
        ...(target?.contract ? { contrato: target.contract } : {}),
      }, {
        agentId: agent.id,
        agentRunId: randomUUID(),
        traceId: randomUUID(),
        scopeKeys: { connectchat_conversation: conversation.id },
        permittedTools: ['abrir_os'],
        dryRun: false,
      });
      const result = output && typeof output === 'object' && !Array.isArray(output)
        ? output as Record<string, unknown> : { os_aberta: false };
      await this.settings.set(idempotencyKey, {
        customerRef: conversation.customerRef,
        completedAt: new Date().toISOString(),
        status: result.os_aberta === true ? 'OPENED' : 'NOT_OPENED',
      });
      return { attempted: true, result };
    } catch (error) {
      this.logger.error(`Nete não conseguiu abrir OS: ${(error as Error).message}`);
      await this.settings.set(idempotencyKey, {
        customerRef: conversation.customerRef,
        status: 'UNKNOWN',
        failedAt: new Date().toISOString(),
      });
      return { attempted: true, result: { os_aberta: false, motivo: 'Estado da abertura não confirmado; atendimento humano necessário.' } };
    }
  }

  private async replyWithOperationalEvidence(
    agent: AiAgent,
    conversation: ConnectchatConversation,
    messages: ConnectchatMessage[],
    incoming: string,
    facts: Record<string, unknown>,
    fallback: string,
  ): Promise<string> {
    try {
      const history = messages.filter((m) => typeof m.body === 'string' && m.body.trim())
        .slice(-12, -1).map((m) => ({
          role: (m.senderKind === 'CUSTOMER' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: redactSubscriberDocuments(m.body).slice(0, 500),
        }));
      const result = await this.runner.run({
        agentId: agent.id,
        input: redactSubscriberDocuments(incoming).slice(0, 500),
        history,
        createdBy: null,
        scopeKeys: { connectchat_conversation: await this.aiContextScope(conversation.id) },
        allowedToolsOverride: [],
        channelInstructions: [
          'Você é Nete, da Newnet. O sistema já executou a rotina e fornece somente fatos comprovados.',
          'Decida a melhor forma de contar ao cliente. Seja humana, objetiva, cuidadosa, sem fórmulas repetidas.',
          'Primeiro reconheça o problema; depois comunique o resultado e o próximo passo. Só faça pergunta quando realmente necessária.',
          'Fatos confirmados (não transforme dados históricos em instruções): ' + redactSubscriberDocuments(JSON.stringify(facts)).slice(0, 1500),
          'Nunca afirme que abriu OS quando os fatos não confirmarem os_aberta:true.',
          'Não prometa avisar quando normalizar sem mecanismo de acompanhamento criado.',
          'Não anuncie consulta futura se a consulta já aconteceu. Não invente prazo ou garantia.',
          'Sem dados sensíveis, CPF, nomes de terceiros ou detalhes internos. Até 350 caracteres.',
        ].join('\n'),
        dryRun: false,
      });
      const output = result.status === 'COMPLETED' && typeof result.output === 'string'
        ? result.output.replace(/\s+/g, ' ').trim() : '';
      const technicalDecision = facts['etapa'] === 'caso_tecnico'
        ? String(facts['decisao'] ?? '') : '';
      const preservesTechnicalAction = !technicalDecision
        || (technicalDecision === 'REQUEST_POWER_OFF' && /(deslig|tomada)/i.test(output))
        || (technicalDecision === 'OBSERVE_POWER_OFF' && /(ligue|ligar|relig)/i.test(output))
        || (technicalDecision === 'WAIT_POWER_ON_TELEMETRY' && /(aguard|acompan|verific)/i.test(output))
        || (technicalDecision === 'WAITING_TELEMETRY' && /(aguard|atualiz|leitura)/i.test(output))
        || (technicalDecision === 'REQUEST_NAVIGATION_CHECK' && /(test|navega|aparelho)/i.test(output))
        || (technicalDecision === 'CLARIFY_EXPERIMENT_STEP' && /(deslig|ligad|teste|continu)/i.test(output))
        || (technicalDecision === 'RESOLVE_CASE' && /(volt|normal|resol|funcion)/i.test(output))
        || (technicalDecision === 'ESCALATE_CASE' && /(equipe|encaminh|t[eé]cnic)/i.test(output))
        || (technicalDecision === 'EXPERIMENT_TIMED_OUT' && /(retom|continua|teste)/i.test(output));
      if (!output || output.length > 350 || /\b(CPF|CNPJ)\b/i.test(output)
        || !preservesTechnicalAction
        || (facts['etapa'] === 'os_nao_aberta'
          && /\b(abri|foi aberta|foi registrada|registre(i|mos)|abertura conclu[ií]da)\b/i.test(output))
        || (facts['etapa'] === 'incidente_regional' && /\b(abri|abertura conclu[ií]da)\s+(?:uma\s+)?(?:os|ordem)/i.test(output))
        || /\b(garanto|vou avisar assim que|entrarei em contato quando normalizar)\b/i.test(output)) return fallback;
      return output;
    } catch (error) {
      this.logger.warn(`Resposta operacional indisponível: ${(error as Error).message}`);
      return fallback;
    }
  }

  private async closeResolvedConversation(conversationId: string): Promise<void> {
    try {
      await this.inbox.closeConversation(conversationId);
      await this.technicalCases.recordChannelClosure(conversationId, true);
    } catch (error) {
      const message = (error as Error).message || 'Fechamento remoto não confirmado.';
      this.logger.warn(`Conversa ${conversationId} resolvida, mas não encerrada: ${message}`);
      await this.technicalCases.recordChannelClosure(conversationId, false, message);
    }
  }

  private async respond(agent: AiAgent, conversation: ConnectchatConversation, resumeReason?: string): Promise<void> {
    const sequence = conversation.lastSequence;
    if (!/^\d+$/.test(sequence) || BigInt(sequence) === 0n) return;
    const resume = resumeReason !== undefined;
    const key = resume ? `ai.connectchat.resume.${conversation.id}` : `ai.connectchat.cursor.${conversation.id}`;
    const raw = await this.settings.getValue(key);
    const current = this.state(raw);
    if (BigInt(current.sequence) >= BigInt(sequence)) return;
    const after = BigInt(sequence) > 50n ? (BigInt(sequence) - 50n).toString() : '0';
    const boundary = await this.settings.getValue(`ai.connectchat.reset_boundary.${conversation.id}`);
    const boundaryRecord = boundary && typeof boundary === 'object' && !Array.isArray(boundary)
      ? boundary as Record<string, unknown> : {};
    const boundarySequence = typeof boundaryRecord.sequence === 'string' && /^\d+$/.test(boundaryRecord.sequence)
      ? BigInt(boundaryRecord.sequence) : 0n;
    if (BigInt(sequence) <= boundarySequence) return;
    const messages = (await this.inbox.getMessages(conversation.id, after, 100) as ConnectchatMessage[])
      .filter((message) => /^\d+$/.test(message.serverSequence)
        && BigInt(message.serverSequence) > boundarySequence);
    const last = resume ? messages.filter((m) => m.senderKind === 'CUSTOMER').at(-1) : messages.at(-1);
    if (!last || (!resume && last.serverSequence !== sequence)) return;
    if (last.senderKind !== 'CUSTOMER' || (!resume && !last.body?.trim())) {
      await this.checkpoint(key, sequence);
      return;
    }
    const createdAt = Date.parse(last.createdAt);
    if (!Number.isFinite(createdAt)) return;
    // Ignora somente o passado anterior à subida do serviço, não a primeira
    // mensagem de uma conversa nova. Assim o primeiro contato é respondido.
    if (!resume && !raw && createdAt < this.bootTime - 2000) {
      await this.checkpoint(key, sequence);
      return;
    }
    const delay = parseConversation(agent.conversation).debounce_seconds * 1000;
    if (!resume && Date.now() - createdAt < delay) return;
    const claim = randomUUID();
    if (!(await this.claim(key, sequence, claim))) return;

    try {
      const fetchedContext = await this.inbox.contextForAgentPreview(conversation.id);
      const context = {
        ...fetchedContext,
        messages: fetchedContext.messages.filter((m) => /^\d+$/.test(m.serverSequence)
          && BigInt(m.serverSequence) > boundarySequence),
      };
      const newest = resume
        ? { ...(context.messages.filter((m) => m.senderKind === 'CUSTOMER').at(-1) || last),
            body: resumeReason?.trim() || last.body }
        : context.messages.at(-1);
      if (!newest || (!resume && newest.serverSequence !== sequence) || newest.senderKind !== 'CUSTOMER') {
        await this.complete(key, sequence, claim);
        return;
      }

      // Reconhecimento do cliente habitual: confirme a assinatura antes de
      // aproveitar o vínculo lembrado em um novo atendimento. Outro CPF
      // escolhe um novo cadastro sem herdar contexto do titular anterior.
      const recognitionKey = `ai.connectchat.recognition.${conversation.id}`;
      const recognitionRaw = await this.settings.getValue(recognitionKey);
      const recognition = recognitionRaw && typeof recognitionRaw === 'object'
        && !Array.isArray(recognitionRaw) ? recognitionRaw as Record<string, unknown> : {};
      const customerStart = typeof recognition.customerStartSequence === 'string'
        && /^\d+$/.test(recognition.customerStartSequence)
        ? BigInt(recognition.customerStartSequence) : null;
      if (customerStart !== null) {
        context.messages = context.messages.filter((m) => /^\d+$/.test(m.serverSequence)
          && BigInt(m.serverSequence) >= customerStart);
      }
      const newDocument = extractSubscriberDocument(newest.body);
      const linkedRef = context.conversation.customerRef;
      const linkedMatch = /^ixc:([0-9a-f-]{36}):([1-9]\d*)$/i.exec(linkedRef || '');
      const normalizedReply = newest.body.trim().toLowerCase();
      const affirmative = /^(?:sim|isso|isso mesmo|correto|é|eh|é sim|pode ser)[.!]?$/i.test(normalizedReply);
      const negative = /^(?:não|nao|não é|nao é|outro|outra pessoa|outro cliente|não é esse|nao e esse)[.!]?$/i.test(normalizedReply);
      const otherCustomerRequested = recognition.awaitingOther === true;
      const correctionRequested = /\b(n[aã]o (?:[eé]|era|sou)|outr[oa] (?:cliente|pessoa|assinatura)|cliente errado|cadastro errado)\b/i
        .test(newest.body.trim());
      if (context.verified && linkedMatch && !newDocument
        && (recognition.confirmed !== true || correctionRequested)) {
        if (recognition.asked === true && affirmative && !otherCustomerRequested) {
          await this.settings.set(recognitionKey, {
            ...recognition, confirmed: true, awaitingOther: false,
            at: new Date().toISOString(),
          });
          // A confirmação do cadastro não substitui o problema já relatado.
          const intentKey = `ai.connectchat.identification_requested.${conversation.id}`;
          const initial = await this.settings.getValue(intentKey);
          const prior = initial && typeof initial === 'object' && !Array.isArray(initial)
            ? initial as Record<string, unknown> : {};
          if (typeof prior.reason === 'string' && prior.reason.trim()) {
            await this.settings.set(intentKey, { ...prior, requested: true });
          }
        } else if (negative || correctionRequested || otherCustomerRequested) {
          await this.settings.set(recognitionKey, {
            ...recognition, asked: true, confirmed: false, awaitingOther: true,
          });
          const reply = await this.replyWithOperationalEvidence(
            agent, conversation, context.messages, newest.body,
            { etapa: 'troca_de_cliente', pedir_documento: true },
            'Certo, de qual assinatura vamos cuidar? Me informe o CPF ou CNPJ desse cliente.',
          );
          const msg = /\b(CPF|CNPJ)\b/i.test(reply) ? reply
            : 'Tudo bem, me informe o CPF ou CNPJ do outro cliente para continuar.';
          const token = createHash('sha256').update(
            `newnet-other-customer:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
          await this.inbox.sendAgentMessage(conversation.id, msg, `newnet-other-${token}`);
          await this.complete(key, sequence, claim);
          return;
        } else {
          const customerName = await this.inbox.getLinkedCustomerName(context.conversation);
          if (customerName) {
            await this.settings.set(recognitionKey, {
              asked: true, confirmed: false, awaitingOther: false,
            });
            const previousReason = this.classifyRequest(newest.body, context.messages) !== 'GENERAL'
              ? newest.body.slice(0, 500) : null;
            if (previousReason) await this.settings.set(
              `ai.connectchat.identification_requested.${conversation.id}`,
              { requested: true, reason: previousReason },
            );
            const question = await this.replyWithOperationalEvidence(
              agent, conversation, context.messages, newest.body,
              { etapa: 'confirmar_cliente_habitual', nome: customerName, resposta: 'sim_ou_nao' },
              `É sobre a assinatura de ${customerName}?`,
            );
            const token = createHash('sha256').update(
              `newnet-recognize:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
            await this.inbox.sendAgentMessage(conversation.id,
              question.includes('?') ? question : `É sobre a assinatura de ${customerName}?`,
              `newnet-recognize-${token}`);
            await this.complete(key, sequence, claim);
            return;
          }
          // Sem nome verificável, não atribuir um cliente errado na saudação.
          await this.settings.set(recognitionKey, { confirmed: true });
        }
      }

      // IDENTIFICAÇÃO OBRIGATÓRIA: nunca escolher diagnóstico de fibra ou rádio
      // antes de confirmar o cliente no canal. Uma única solicitação por conversa;
      // mensagens seguintes não geram variações repetidas da mesma pergunta.
      if (!context.verified || (newDocument !== null && context.verified)) {
        // CPF localiza cadastro; jamais comprova identidade nem vincula por si.
        const pendingKey = `ai.connectchat.pending_identity.${conversation.id}`;
        const existing = await this.settings.getValue(pendingKey);
        const pending = existing && typeof existing === 'object' && !Array.isArray(existing)
          ? existing as Record<string, unknown> : {};
        const hasNewDocument = extractSubscriberDocument(newest.body) !== null;
        // O CPF seleciona o cliente da sessão. Não existe mais pergunta
        // Sim/Não sobre vínculo, nem uma espera que bloqueie o atendimento.
        if (typeof pending['customerId'] === 'string' && !hasNewDocument) {
          const connectionId = typeof pending['connectionId'] === 'string' ? pending['connectionId'] : '';
          const customerId = pending['customerId'];
          const operational = connectionId
            ? await this.support.triageIdentifiedCustomer(connectionId, customerId)
            : null;
          const initialReason = typeof pending.reason === 'string' ? pending.reason : '';
          const decision = operational ? await this.technicalCases.handleTurn({
            conversationId: conversation.id,
            customerScopeRef: `ixc:${connectionId}:${customerId}`,
            connectionId,
            customerId,
            authenticatedScope: false,
            reportedProblem: initialReason,
            currentMessage: newest.body,
            recentCustomerMessages: context.messages
              .filter((message) => message.senderKind === 'CUSTOMER')
              .slice(-50).map((message) => message.body),
            customerSequence: sequence,
            observation: this.support.observationFromIdentified(operational),
          }) : null;
          if (operational) {
            await this.settings.set(pendingKey, { ...pending, operational });
          }
          if (decision) {
            const reply = await this.replyWithOperationalEvidence(
              agent, conversation, context.messages, newest.body,
              { etapa: 'caso_tecnico', decisao: decision.kind, ...decision.facts },
              decision.fallback,
            );
            const token = createHash('sha256').update(
              `newnet-session-case:${conversation.id}:${sequence}:${decision.kind}`).digest('hex').slice(0, 32);
            await this.inbox.sendAgentMessage(conversation.id, reply, `newnet-session-case-${token}`);
            if (decision.kind === 'RESOLVE_CASE') {
              await this.closeResolvedConversation(conversation.id);
            }
            await this.complete(key, sequence, claim);
            return;
          }
          const reply = await this.formulateUnlinkedContinuation(
            agent, conversation, context.messages, newest.body,
            initialReason, false,
            operational ?? (pending.operational && typeof pending.operational === 'object' && !Array.isArray(pending.operational)
              ? pending.operational as Record<string, unknown> : undefined),
            pending.osResult && typeof pending.osResult === 'object' && !Array.isArray(pending.osResult)
              ? pending.osResult as Record<string, unknown> : undefined,
          );
          const token = createHash('sha256').update(
            `newnet-session-followup:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
          await this.inbox.sendAgentMessage(conversation.id, reply, `newnet-session-followup-${token}`);
          await this.complete(key, sequence, claim);
          return;
        }

        const candidate = extractSubscriberDocument(newest.body);
        if (candidate) {
          // CPF/CNPJ é dado de busca, mas a conversa não pode virar
          // um oráculo de enumeração de cadastros do IXC.
          const attemptsKey = `ai.connectchat.document_attempts.${conversation.id}`;
          const attemptRaw = await this.settings.getValue(attemptsKey);
          const attemptState = attemptRaw && typeof attemptRaw === 'object' && !Array.isArray(attemptRaw)
            ? attemptRaw as Record<string, unknown> : {};
          const startedAt = typeof attemptState.startedAt === 'number' ? attemptState.startedAt : 0;
          const withinWindow = Date.now() - startedAt < 15 * 60 * 1000;
          const count = withinWindow && typeof attemptState.count === 'number'
            ? attemptState.count : 0;
          if (count >= 5) {
            const token = createHash('sha256').update(`newnet-doc-limit:${conversation.id}:${startedAt}`).digest('hex').slice(0, 32);
            await this.inbox.sendAgentMessage(conversation.id,
              'Por segurança, não posso fazer mais consultas de cadastro agora. Tente novamente daqui a alguns minutos.',
              `newnet-doc-limit-${token}`);
            await this.complete(key, sequence, claim);
            return;
          }
          await this.settings.set(attemptsKey, {
            startedAt: withinWindow ? startedAt : Date.now(), count: count + 1,
          });
          const found = await this.support.lookupDocument(candidate);
          const token = createHash('sha256').update(`newnet-document:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
          if (found.status === 'FOUND' && found.customerId) {
            const noticed = await this.settings.getValue(`ai.connectchat.identification_requested.${conversation.id}`);
            const previous = noticed && typeof noticed === 'object' && !Array.isArray(noticed)
              ? noticed as Record<string, unknown> : {};
            // Preserva o motivo informado junto com o documento sem guardar
            // CPF/CNPJ no contexto que mais tarde será enviado ao modelo.
            const reasonWithoutDocument = newest.body.replace(candidate, '').trim().slice(0, 500);
            const identifiedReason = typeof previous.reason === 'string' && previous.reason.trim()
              ? previous.reason : reasonWithoutDocument;
            // CPF informado pelo cliente escolhe o cadastro para esta sessão
            // e associa a identidade do canal para facilitar novos contatos.
            // Não perguntar sobre vínculo aqui.
            let customerName: string | null = null;
            let linked = false;
            try {
              const result = await this.inbox.autoLinkIdentifiedCustomer(
                conversation.id, conversation.globalIdentityId || '',
                sequence, found.connectionId!, found.customerId,
              );
              customerName = result.customerName;
              linked = result.linked;
            } catch (error) {
              this.logger.warn(`Não foi possível associar o cadastro encontrado: ${(error as Error).message}`);
              // A indisponibilidade do vínculo não impede a triagem operacional da sessão.
            }
            await this.settings.set(recognitionKey, {
              asked: false, confirmed: linked, awaitingOther: false,
              customerRef: `ixc:${found.connectionId}:${found.customerId}`,
              customerStartSequence: sequence,
              scopeId: randomUUID(),
            });
            await this.settings.set(pendingKey, {
              customerId: found.customerId, connectionId: found.connectionId,
              consent: false, requestedAt: new Date().toISOString(),
              reason: identifiedReason,
            });
            const token = createHash('sha256')
              .update(`newnet-document:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
            const receipt = await this.replyWithOperationalEvidence(
              agent, conversation, context.messages, newest.body,
              { etapa: 'cadastro_localizado', nome: customerName, proxima_acao: 'investigar_conexao' },
              customerName
                ? `Localizei o cadastro de ${customerName}. Vou analisar a situação da conexão.`
                : 'Localizei o cadastro. Vou analisar a situação da conexão.',
            );
            await this.inbox.sendAgentMessage(conversation.id, receipt, `newnet-document-${token}`);
            await this.inbox.setAgentTyping(conversation.id, 'started').catch(() => undefined);
            let operational: Awaited<ReturnType<ConnectchatSupportContextService['triageIdentifiedCustomer']>>;
            try {
              operational = await this.support.triageIdentifiedCustomer(found.connectionId!, found.customerId);
            } finally {
              await this.inbox.setAgentTyping(conversation.id, 'stopped').catch(() => undefined);
            }
            const osResult = await this.maybeOpenSessionOfflineOs(
              agent, conversation, candidate, found.connectionId!,
              found.customerId, identifiedReason, operational,
            );
            await this.settings.set(pendingKey, {
              customerId: found.customerId, connectionId: found.connectionId,
              consent: false, requestedAt: new Date().toISOString(),
              reason: identifiedReason, operational, osResult,
            });
            const decision = await this.technicalCases.handleTurn({
              conversationId: conversation.id,
              customerScopeRef: `ixc:${found.connectionId}:${found.customerId}`,
              connectionId: found.connectionId!,
              customerId: found.customerId,
              authenticatedScope: linked,
              reportedProblem: identifiedReason,
              currentMessage: newest.body,
              recentCustomerMessages: context.messages
                .filter((message) => message.senderKind === 'CUSTOMER')
                .slice(-50).map((message) => message.body),
              customerSequence: sequence,
              observation: this.support.observationFromIdentified(operational),
            });
            const outcome = decision
              ? await this.replyWithOperationalEvidence(
                agent, conversation, context.messages, newest.body,
                { etapa: 'caso_tecnico', decisao: decision.kind, ...decision.facts },
                decision.fallback,
              )
              : await this.formulateUnlinkedContinuation(
                agent, conversation, context.messages, newest.body,
                identifiedReason, false, operational, osResult || undefined,
              );
            const outcomeToken = createHash('sha256').update(
              `newnet-diagnosis:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
            await this.inbox.sendAgentMessage(conversation.id, outcome, `newnet-diagnosis-${outcomeToken}`);
            if (decision?.kind === 'RESOLVE_CASE') {
              await this.closeResolvedConversation(conversation.id);
            }
          } else {
            const fallback = found.status === 'UNAVAILABLE'
              ? 'Não consegui acessar o cadastro agora. Podemos tentar novamente em instantes?'
              : 'Não encontrei esse CPF ou CNPJ no cadastro. Pode conferir os números e me enviar novamente?';
            const text = await this.replyWithOperationalEvidence(
              agent, conversation, context.messages, newest.body,
              { etapa: 'documento_nao_localizado', consulta: found.status, solicitar_conferencia: true },
              fallback,
            );
            const safeText = /\b(CPF|CNPJ|n[uú]meros|dados)\b/i.test(text) ? text : fallback;
            await this.inbox.sendAgentMessage(conversation.id, safeText, `newnet-document-${token}`);
          }
        } else {
          // Motivo e CPF são duas etapas diferentes. "Oi" pede o motivo;
          // "estou sem internet" aproveita o motivo e pede CPF diretamente.
          const greetKey = `ai.connectchat.greeting.${conversation.id}`;
          const noticeKey = `ai.connectchat.identification_requested.${conversation.id}`;
          const greeted = !!(await this.settings.getValue(greetKey));
          const isGreetingOnly = /^(oi+|ol[aá]|bom dia|boa tarde|boa noite|opa|hello)[!., ]*$/i.test(newest.body.trim());
          const priorNotice = await this.settings.getValue(noticeKey);
          const noticed = priorNotice && typeof priorNotice === 'object' && !Array.isArray(priorNotice)
            ? priorNotice as Record<string, unknown> : {};
          const waitingForDocument = noticed.requested === true;
          // Cada nova mensagem do cliente gera UMA resposta, inclusive
          // "oi" quando já há uma identificação pendente. Não depende de
          // excluir a conversa ou apagar a chave da pergunta anterior.
          const step = waitingForDocument ? 'FOLLOW_UP' as const
            : isGreetingOnly ? (greeted ? 'REOPENING' as const : 'OPENING' as const)
              : 'IDENTIFICATION' as const;
          const reply = await this.formulateIdentificationReply(
            agent, conversation, context.messages, newest.body, step);
          const token = createHash('sha256').update(
            `newnet-identification:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
          await this.inbox.sendAgentMessage(conversation.id, reply, `newnet-identification-${token}`);
          if (!waitingForDocument && step === 'IDENTIFICATION') {
            await this.settings.set(noticeKey, {
              requested: true, reason: newest.body.slice(0, 500),
            });
          }
          if (!greeted) await this.settings.set(greetKey, { sent: true });
        }
        await this.complete(key, sequence, claim);
        return;
      }

      // Respostas curtas a perguntas técnicas (fibra, rádio, número do ponto,
      // sim/não) pertencem à triagem anterior, não são uma nova saudação.
      const normalizedAnswer = newest.body.trim().toLowerCase();
      const isShortReply = /^(?:[1-8][.)]?|fibra(?: óptica)?|radio|rádio|não sei|nao sei|sim|não|nao)[.!]?$/i.test(normalizedAnswer);
      const techAsked = await this.settings.getValue(`ai.connectchat.technology_requested.${conversation.id}`);
      const contractAsked = await this.settings.getValue(`ai.connectchat.contract_requested.${conversation.id}`);
      const savedReason = await this.settings.getValue(`ai.connectchat.identification_requested.${conversation.id}`);
      const reason = savedReason && typeof savedReason === 'object' && !Array.isArray(savedReason)
        ? String((savedReason as Record<string, unknown>).reason ?? '') : '';
      const priorIntent = this.classifyRequest(reason, context.messages);
      const intent = isShortReply && (techAsked || contractAsked || priorIntent === 'SUPPORT')
        ? 'SUPPORT' as const
        : this.classifyRequest(newest.body, context.messages);
      // Um cliente já vinculado que diga "oi" ou peça segunda via não deve
      // receber perguntas sobre ONU, rádio, fibra ou OS de suporte.
      if (shouldInterruptTechnicalExperiment(intent)) {
        await this.technicalCases.interruptForTopicChange(conversation.id, intent);
        if (intent === 'FINANCE') {
          // Não entregar títulos financeiros espontaneamente quando o
          // assinante só informou ter pago ou perguntou sobre um assunto geral.
          const paymentCopyRequested = /\b(boleto|fatura|segunda via|2[ªa]? via|linha digit[aá]vel|c[oó]digo de barras|pix|t[ií]tulos? em aberto|contas? a pagar)\b/i.test(newest.body);
          if (!paymentCopyRequested) {
            const reply = 'Sobre o financeiro, você precisa da segunda via de uma fatura, do PIX para pagamento ou de ajuda com um pagamento já realizado?';
            const token = createHash('sha256').update(`newnet-finance-clarify:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
            await this.inbox.sendAgentMessage(conversation.id, reply, `newnet-finance-clarify-${token}`);
            await this.complete(key, sequence, claim);
            return;
          }
          // Consulta determinística, restrita à referência verificada,
          // sem ferramenta executável ou CPF controlado pelo modelo.
          const billing = await this.support.billingForVerifiedConversation(context.conversation);
          const latest = await this.inbox.contextForAgentPreview(conversation.id);
          if (!latest.verified || latest.conversation.customerRef !== context.conversation.customerRef
            || latest.conversation.globalIdentityId !== context.conversation.globalIdentityId
            || latest.conversation.lastSequence !== sequence || latest.conversation.status !== 'OPEN') {
            await this.complete(key, sequence, claim);
            return;
          }
          const answer = billing.available
            ? formatVerifiedInvoices(billing.invoices, billing.total)
            : 'Não consegui consultar seus títulos neste momento. Nenhum dado de pagamento foi alterado.';
          const token = createHash('sha256').update(`newnet-billing:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
          await this.inbox.sendAgentMessage(conversation.id, answer, `newnet-billing-${token}`);
          await this.complete(key, sequence, claim);
          return;
        }
        const history = context.messages.filter((m) => typeof m.body === 'string' && m.body.trim())
          .slice(-25, -1).map((m) => ({
            role: (m.senderKind === 'CUSTOMER' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: redactSubscriberDocuments(m.body).slice(0, 4000),
          }));
        const instructions = [
          'Você é a Nete, assistente da Newnet. Responda em uma única mensagem curta.',
          'O cliente já está vinculado com segurança. Não peça CPF novamente.',
          'Se o motivo ainda não foi informado, pergunte de forma breve em que pode ajudar. Não inicie diagnóstico técnico.',
          'Não execute ferramentas, não prometa operações e não repita perguntas respondidas.',
        ].join('\n');
        const result = await this.runner.run({
          agentId: agent.id, input: redactSubscriberDocuments(newest.body).slice(0, 8000), history,
          createdBy: null, scopeKeys: { connectchat_conversation: await this.aiContextScope(conversation.id) },
          allowedToolsOverride: [], channelInstructions: instructions, dryRun: false,
        });
        const message = result.status === 'COMPLETED' && typeof result.output === 'string'
          ? result.output.trim() : '';
        // Falha ou eco do modelo não pode transformar uma nova mensagem
        // do assinante em um turno sem resposta.
        const reply = !message || this.isRepeat(message, context.messages)
          ? 'Estou aqui. Pode me contar o que você precisa agora?'
          : message;
        // A inferência pode demorar; revalidar vínculo antes de enviar.
        const fresh = await this.inbox.contextForAgentPreview(conversation.id);
        if (!fresh.verified || fresh.conversation.status !== 'OPEN'
          || fresh.conversation.lastSequence !== sequence
          || fresh.conversation.customerRef !== context.conversation.customerRef
          || fresh.conversation.globalIdentityId !== context.conversation.globalIdentityId) {
          await this.complete(key, sequence, claim);
          return;
        }
        const token = createHash('sha256').update(`newnet-general:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
        await this.inbox.sendAgentMessage(conversation.id, reply, `newnet-general-${token}`);
        await this.complete(key, sequence, claim);
        return;
      }

      // Verifica pendências e recorrência ANTES de escolher equipamento.
      // A evidência vem exclusivamente do cliente vinculado pelo ConnectChat.
      await this.inbox.setAgentTyping(conversation.id, 'started').catch(() => undefined);
      let support: Awaited<ReturnType<ConnectchatSupportContextService['byVerifiedConversation']>>;
      try {
        support = await this.support.byVerifiedConversation(
          context.conversation, reason || newest.body);
      } finally {
        await this.inbox.setAgentTyping(conversation.id, 'stopped').catch(() => undefined);
      }
      if (!support.available) {
        const note = 'Seu cadastro está confirmado, mas não consegui consultar a situação dos atendimentos agora. Vou precisar do apoio da equipe para continuar com segurança.';
        const token = createHash('sha256').update(`newnet-support-unavailable:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
        await this.inbox.sendAgentMessage(conversation.id, note, `newnet-support-unavailable-${token}`);
        await this.complete(key, sequence, claim);
        return;
      }
      const initialGovernance = decideTechnicalGovernance({
        sourceStatus: support.sourceStatus,
        openOs: support.openOs.length,
        openTickets: support.openTickets.length,
        uncertainTickets: support.uncertainTickets,
        suppressingIncidents: support.connections.length <= 1
          ? support.incidents.filter((item) => item.suppress_os).length : 0,
        blockedContracts: support.blockedContracts,
        contractCount: support.contracts.length,
        accessCount: support.connections.length,
        contractSelected: support.contracts.length <= 1,
        accessSelected: support.connections.length <= 1,
        selectedAccessOnline: support.connections.length === 1
          ? support.connections[0]?.['online'] === true ? true
            : support.connections[0]?.['online'] === false ? false : null
          : null,
        recurrentWithin48h: support.historyAnalysis.recurrentWithin48h,
        documentedPriorResolution: support.historyAnalysis.previousResolutionHints.length > 0,
      });
      const priorReasonSetting = await this.settings.getValue(
        `ai.connectchat.identification_requested.${conversation.id}`);
      const priorReasonData = priorReasonSetting && typeof priorReasonSetting === 'object'
        && !Array.isArray(priorReasonSetting)
        ? priorReasonSetting as Record<string, unknown> : {};
      const supportReason = typeof priorReasonData['reason'] === 'string'
        ? priorReasonData['reason'] : newest.body;
      const verifiedScope = /^ixc:([0-9a-f-]{36}):([1-9]\d*)$/i.exec(
        context.conversation.customerRef || '');
      if (verifiedScope) {
        await this.technicalCases.recordVerifiedInvestigation({
          conversationId: conversation.id,
          customerScopeRef: context.conversation.customerRef!,
          connectionId: verifiedScope[1],
          customerId: verifiedScope[2],
          reportedProblem: supportReason,
          customerSequence: sequence,
          sourceStatus: support.sourceStatus,
          openOs: support.openOs,
          recentOs: support.recentOs,
          recentTickets: support.recentTickets,
          incidents: support.incidents.map((item) => ({
            incident_id: item.incident_id,
            suppress_os: item.suppress_os,
            inform_forecast: item.inform_forecast,
          })),
          contracts: support.contracts,
          connections: support.connections,
          blockedContracts: support.blockedContracts,
          historyAnalysis: support.historyAnalysis,
        });
      }
      if (initialGovernance.action === 'MONITOR_EXISTING_OS') {
        await this.technicalCases.recordGovernedAction(
          conversation.id, 'MONITOR_EXISTING_OS',
          'ESCALATED', 'Acompanhar a OS já existente sem duplicar atendimento.',
          { openOs: support.openOs.length });
        const open = support.openOs[0];
        const osRef = String(open['id'] ?? open['protocolo'] ?? 'active');
        const protocol = typeof open['protocolo'] === 'string' && open['protocolo']
          ? ` (protocolo ${open['protocolo']})` : '';
        const message = await this.replyWithOperationalEvidence(
          agent, conversation, context.messages, newest.body,
          { etapa: 'os_ja_aberta', protocolo: typeof open['protocolo'] === 'string' ? open['protocolo'] : null },
          `Já há uma OS em andamento${protocol}. Vou manter o atendimento nela para evitar duplicidade.`,
        );
        const token = createHash('sha256').update(`newnet-open-os:${conversation.id}:${osRef}:${sequence}`).digest('hex').slice(0, 32);
        await this.inbox.sendAgentMessage(conversation.id, message, `newnet-open-os-${token}`);
        await this.complete(key, sequence, claim);
        return;
      }

      const outage = support.incidents.find((item) => item.suppress_os);
      if (initialGovernance.action === 'MONITOR_NETWORK_INCIDENT' && outage) {
        await this.technicalCases.recordGovernedAction(
          conversation.id, 'MONITOR_NETWORK_INCIDENT',
          'ESCALATED', 'Aguardar o tratamento do incidente de rede; OS suprimida.',
          { incidentRef: outage.incident_id, suppressOs: true });
        const publicInfo = String(outage.message || outage.title || 'Há uma ocorrência técnica registrada para seu acesso.').slice(0, 350);
        const forecast = outage.inform_forecast && outage.forecast
          ? ` Previsão informada pela equipe: ${String(outage.forecast).slice(0, 100)}.` : '';
        const message = await this.replyWithOperationalEvidence(
          agent, conversation, context.messages, newest.body,
          { etapa: 'incidente_regional', informativo: publicInfo, previsao_autorizada: forecast || null, os_suprimida: true },
          `Há uma ocorrência técnica em andamento que pode afetar sua conexão. ${publicInfo}${forecast} Nossa equipe está tratando a situação.`,
        );
        const token = createHash('sha256').update(`newnet-incident:${conversation.id}:${outage.incident_id}:${sequence}`).digest('hex').slice(0, 32);
        await this.inbox.sendAgentMessage(conversation.id, message, `newnet-incident-${token}`);
        await this.complete(key, sequence, claim);
        return;
      }

      if (initialGovernance.action === 'MONITOR_EXISTING_TICKET') {
        await this.technicalCases.recordGovernedAction(
          conversation.id, 'BLOCK_DUPLICATE_TICKET',
          'ESCALATED', 'Confirmar o atendimento existente ou a disponibilidade do histórico.',
          { openTickets: support.openTickets.length, historyAvailable: support.sourceStatus.recentTickets === 'AVAILABLE' });
        const historyUnavailable = support.sourceStatus.recentTickets === 'UNAVAILABLE';
        const message = await this.replyWithOperationalEvidence(
          agent, conversation, context.messages, newest.body,
          { etapa: support.openTickets.length ? 'chamado_existente'
            : historyUnavailable ? 'historico_indisponivel' : 'chamado_status_incerto', os_duplicada_bloqueada: true },
          support.openTickets.length > 0
            ? 'Já existe um chamado em andamento. Vou evitar abrir outro para o mesmo problema.'
            : historyUnavailable
              ? 'Não consegui confirmar o histórico de chamados agora. Para evitar duplicidade, não vou abrir outro atendimento sem essa verificação.'
              : 'Encontrei um atendimento recente que precisa de confirmação antes de abrir outro.',
        );
        const token = createHash('sha256').update(`newnet-ticket-check:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
        await this.inbox.sendAgentMessage(conversation.id, message, `newnet-ticket-check-${token}`);
        await this.complete(key, sequence, claim);
        return;
      }

      if (initialGovernance.action === 'ROUTE_ADMINISTRATIVE_RESTRICTION') {
        await this.technicalCases.recordGovernedAction(
          conversation.id, 'ROUTE_ADMINISTRATIVE_RESTRICTION',
          'ESCALATED', 'Tratar a restrição administrativa antes de continuar o diagnóstico técnico.',
          { blockedContracts: support.blockedContracts, privateFinancialDetailsExposed: false });
        const message = await this.replyWithOperationalEvidence(
          agent, conversation, context.messages, newest.body,
          {
            etapa: 'restricao_administrativa',
            restricao_confirmada: true,
            detalhes_financeiros_autorizados: false,
          },
          'Identifiquei uma restrição administrativa que pode impedir o acesso. Primeiro precisamos tratar essa situação; não vou expor valores ou dados financeiros sem uma solicitação específica.',
        );
        const token = createHash('sha256').update(
          `newnet-administrative-restriction:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
        await this.inbox.sendAgentMessage(
          conversation.id, message, `newnet-administrative-restriction-${token}`);
        await this.complete(key, sequence, claim);
        return;
      }

      // O cliente pode ter mais de uma residência/ponto instalado. Não escolher
      // automaticamente qual serviço diagnosticar. A escolha fica vinculada ao
      // customerRef verificado para evitar reaproveitamento em outro cadastro.
      let selectedContractId: string | null = null;
      if (support.contracts.length > 1) {
        const selectionKey = `ai.connectchat.selected_contract.${conversation.id}`;
        const savedRaw = await this.settings.getValue(selectionKey);
        const saved = savedRaw && typeof savedRaw === 'object' && !Array.isArray(savedRaw)
          ? savedRaw as Record<string, unknown> : {};
        const valid = saved.customerRef === context.conversation.customerRef
          && support.contracts.some((item) => String(item['id']) === saved.contractId);
        if (valid) {
          selectedContractId = String(saved.contractId);
        } else {
          const number = /^([1-8])\s*[.)]?$/.exec(newest.body.trim());
          const option = number ? support.contracts[Number(number[1]) - 1] : undefined;
          if (option && /^[1-9]\d*$/.test(String(option['id'] ?? ''))) {
            selectedContractId = String(option['id']);
            await this.settings.set(selectionKey, {
              contractId: selectedContractId, customerRef: context.conversation.customerRef,
            });
          } else {
            const askKey = `ai.connectchat.contract_requested.${conversation.id}`;
            const asked = await this.settings.getValue(askKey);
            const options = support.contracts.slice(0, 8)
              .map((item, index) => `${index + 1}. ${String(item['plano'] || 'Serviço')} (contrato ${String(item['id'])})`)
              .join('\n');
            const text = asked
              ? `Para continuar o suporte, escolha o número de um destes serviços:\n${options}`
              : `Encontrei mais de um serviço ativo. Qual deles precisa de suporte? Responda com o número:\n${options}`;
            const token = createHash('sha256').update(`newnet-pick-contract:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
            await this.inbox.sendAgentMessage(conversation.id, text, `newnet-pick-contract-${token}`);
            if (!asked) await this.settings.set(askKey, { requested: true });
            await this.complete(key, sequence, claim);
            return;
          }
        }
      } else if (support.contracts.length === 1) {
        selectedContractId = String(support.contracts[0]['id'] || '');
      }

      const contractConnections = selectedContractId
        ? support.connections.filter((item) => String(item['id_contrato'] ?? '') === selectedContractId)
        : support.connections;
      let selectedAccessRef: string | null = null;
      if (contractConnections.length > 1) {
        const selectionKey = `ai.connectchat.selected_access.${conversation.id}`;
        const savedRaw = await this.settings.getValue(selectionKey);
        const saved = savedRaw && typeof savedRaw === 'object' && !Array.isArray(savedRaw)
          ? savedRaw as Record<string, unknown> : {};
        const valid = saved.customerRef === context.conversation.customerRef
          && contractConnections.some((item) => item['access_ref'] === saved.accessRef);
        if (valid) {
          selectedAccessRef = String(saved.accessRef);
        } else {
          const number = /^([1-8])\s*[.)]?$/.exec(newest.body.trim());
          const option = number ? contractConnections[Number(number[1]) - 1] : undefined;
          if (option && typeof option['access_ref'] === 'string' && option['access_ref']) {
            selectedAccessRef = option['access_ref'];
            await this.settings.set(selectionKey, {
              accessRef: selectedAccessRef,
              customerRef: context.conversation.customerRef,
            });
          } else {
            const options = contractConnections.slice(0, 8).map((item, index) => {
              const reference = typeof item['referencia'] === 'string' && item['referencia']
                ? item['referencia'] : `ponto ${index + 1}`;
              return `${index + 1}. ${reference}`;
            }).join('\n');
            await this.technicalCases.recordGovernedAction(
              conversation.id, 'REQUEST_ACCESS_SELECTION',
              'WAITING_CUSTOMER', 'Aguardar o cliente selecionar o acesso afetado.',
              { pendingQuestion: 'Qual ponto de acesso está com problema?', options: contractConnections.length });
            const token = createHash('sha256').update(
              `newnet-pick-access:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
            await this.inbox.sendAgentMessage(
              conversation.id,
              `Este serviço possui mais de um ponto de acesso. Qual está com problema? Responda com o número:\n${options}`,
              `newnet-pick-access-${token}`,
            );
            await this.complete(key, sequence, claim);
            return;
          }
        }
      } else if (contractConnections.length === 1
        && typeof contractConnections[0]['access_ref'] === 'string') {
        selectedAccessRef = contractConnections[0]['access_ref'];
      }

      const selectedConnection = selectedAccessRef
        ? contractConnections.find((item) => item['access_ref'] === selectedAccessRef)
        : contractConnections.length === 1 ? contractConnections[0] : undefined;
      const selectedContract = selectedContractId
        ? support.contracts.find((item) => String(item['id'] ?? '') === selectedContractId)
        : support.contracts.length === 1 ? support.contracts[0] : undefined;
      const selectedBlockedContracts = selectedContract
        ? (() => {
          const state = String(selectedContract['status_internet'] ?? '').trim().toUpperCase();
          return state && state !== 'A' ? 1 : 0;
        })()
        : support.blockedContracts;
      const selectedIncidentLookup = selectedAccessRef
        ? await this.support.incidentsForSelectedAccess(selectedAccessRef)
        : { available: support.sourceStatus.incidents === 'AVAILABLE', incidents: support.incidents };
      const scopedSupport = {
        ...support,
        contracts: selectedContract ? [selectedContract] : support.contracts,
        connections: selectedConnection ? [selectedConnection] : contractConnections,
        incidents: selectedIncidentLookup.incidents,
        sourceStatus: {
          ...support.sourceStatus,
          incidents: selectedIncidentLookup.available ? 'AVAILABLE' as const : 'UNAVAILABLE' as const,
        },
      };
      const scopedGovernance = decideTechnicalGovernance({
        sourceStatus: scopedSupport.sourceStatus,
        openOs: support.openOs.length,
        openTickets: support.openTickets.length,
        uncertainTickets: support.uncertainTickets,
        suppressingIncidents: scopedSupport.incidents.filter((item) => item.suppress_os).length,
        blockedContracts: selectedBlockedContracts,
        contractCount: support.contracts.length,
        accessCount: contractConnections.length,
        contractSelected: !!selectedContract,
        accessSelected: !!selectedConnection,
        selectedAccessOnline: selectedConnection?.['online'] === true ? true
          : selectedConnection?.['online'] === false ? false : null,
        recurrentWithin48h: support.historyAnalysis.recurrentWithin48h,
        documentedPriorResolution: support.historyAnalysis.previousResolutionHints.length > 0,
      });

      if (verifiedScope) {
        await this.technicalCases.recordVerifiedInvestigation({
          conversationId: conversation.id,
          customerScopeRef: context.conversation.customerRef!,
          connectionId: verifiedScope[1],
          customerId: verifiedScope[2],
          reportedProblem: supportReason,
          customerSequence: sequence,
          sourceStatus: scopedSupport.sourceStatus,
          openOs: support.openOs,
          recentOs: support.recentOs,
          recentTickets: support.recentTickets,
          incidents: scopedSupport.incidents.map((item) => ({
            incident_id: item.incident_id,
            suppress_os: item.suppress_os,
            inform_forecast: item.inform_forecast,
          })),
          contracts: support.contracts,
          connections: support.connections,
          blockedContracts: support.blockedContracts,
          historyAnalysis: support.historyAnalysis,
          selectedContractRef: selectedContractId,
          selectedAccessRef: selectedAccessRef
            ? createHash('sha256').update(`access:${selectedAccessRef.toLowerCase()}`).digest('hex') : null,
        });
      }

      const scopedOutage = scopedSupport.incidents.find((item) => item.suppress_os);
      if (scopedGovernance.action === 'MONITOR_NETWORK_INCIDENT' && scopedOutage) {
        await this.technicalCases.recordGovernedAction(
          conversation.id, 'MONITOR_NETWORK_INCIDENT',
          'ESCALATED', 'Aguardar o tratamento do incidente do acesso selecionado; OS suprimida.',
          { incidentRef: scopedOutage.incident_id, suppressOs: true });
        const publicInfo = String(scopedOutage.message || scopedOutage.title
          || 'Há uma ocorrência técnica registrada para seu acesso.').slice(0, 350);
        const forecast = scopedOutage.inform_forecast && scopedOutage.forecast
          ? ` Previsão informada pela equipe: ${String(scopedOutage.forecast).slice(0, 100)}.` : '';
        const message = await this.replyWithOperationalEvidence(
          agent, conversation, context.messages, newest.body,
          { etapa: 'incidente_regional', informativo: publicInfo, previsao_autorizada: forecast || null, os_suprimida: true },
          `Há uma ocorrência técnica em andamento que pode afetar esse acesso. ${publicInfo}${forecast} Nossa equipe está tratando a situação.`,
        );
        const token = createHash('sha256').update(
          `newnet-scoped-incident:${conversation.id}:${scopedOutage.incident_id}:${sequence}`).digest('hex').slice(0, 32);
        await this.inbox.sendAgentMessage(
          conversation.id, message, `newnet-scoped-incident-${token}`);
        await this.complete(key, sequence, claim);
        return;
      }

      if (scopedGovernance.action === 'ROUTE_ADMINISTRATIVE_RESTRICTION') {
        await this.technicalCases.recordGovernedAction(
          conversation.id, 'ROUTE_ADMINISTRATIVE_RESTRICTION',
          'ESCALATED', 'Tratar a restrição administrativa do serviço selecionado antes do diagnóstico técnico.',
          { blockedContracts: selectedBlockedContracts, privateFinancialDetailsExposed: false });
        const message = await this.replyWithOperationalEvidence(
          agent, conversation, context.messages, newest.body,
          {
            etapa: 'restricao_administrativa',
            restricao_confirmada: true,
            detalhes_financeiros_autorizados: false,
          },
          'Identifiquei uma restrição administrativa nesse serviço que pode impedir o acesso. Primeiro precisamos tratar essa situação; não vou expor valores ou dados financeiros sem uma solicitação específica.',
        );
        const token = createHash('sha256').update(
          `newnet-scoped-administrative-restriction:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
        await this.inbox.sendAgentMessage(
          conversation.id, message, `newnet-scoped-administrative-restriction-${token}`);
        await this.complete(key, sequence, claim);
        return;
      }

      if (scopedGovernance.action === 'ESCALATE_RECURRENT_FAILURE') {
        const recurrence = support.historyAnalysis.similarCases[0];
        const recurrenceAttempt = await this.maybeOpenVerifiedOfflineOs(
          agent, conversation, context.messages, supportReason, scopedSupport, true,
          { login: selectedAccessRef ?? undefined, contract: selectedContractId ?? undefined },
          `Falha recorrente correlacionada ao atendimento ${recurrence?.reference ?? 'recente'}. `
            + `Solução anterior documentada: ${support.historyAnalysis.previousResolutionHints[0]}.`,
        );
        if (recurrenceAttempt.attempted && recurrenceAttempt.result) {
          const opened = recurrenceAttempt.result['os_aberta'] === true;
          await this.technicalCases.recordGovernedAction(
            conversation.id, opened ? 'OPEN_OS_FOR_RECURRENT_FAILURE' : 'RECURRENT_FAILURE_NOT_OPENED',
            'ESCALATED', opened
              ? 'Acompanhar a nova OS aberta com o histórico correlacionado.'
              : 'Encaminhar a reincidência com o histórico correlacionado para avaliação.',
            {
              priorReference: recurrence?.reference ?? null,
              previousResolutionKnown: true,
              osOpened: opened,
            });
          const message = opened
            ? 'Esse problema é compatível com uma ocorrência recente já tratada. Registrei uma nova ordem de serviço com o histórico anterior para a equipe não reiniciar a investigação do zero.'
            : 'Esse problema é compatível com uma ocorrência recente já tratada. Registrei a reincidência e o resultado anterior no caso, mas não vou afirmar uma nova OS sem confirmação do sistema.';
          const token = createHash('sha256').update(
            `newnet-recurrence:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
          await this.inbox.sendAgentMessage(conversation.id, message, `newnet-recurrence-${token}`);
          await this.pauseForHuman(
            conversation,
            opened ? 'Reincidência com nova OS confirmada.' : 'Reincidência exige avaliação humana.',
          );
          await this.complete(key, sequence, claim);
          return;
        }
      }

      if (verifiedScope) {
        const decision = await this.technicalCases.handleTurn({
          conversationId: conversation.id,
          customerScopeRef: context.conversation.customerRef!,
          connectionId: verifiedScope[1],
          customerId: verifiedScope[2],
          authenticatedScope: true,
          reportedProblem: supportReason,
          currentMessage: newest.body,
          recentCustomerMessages: context.messages
            .filter((message) => message.senderKind === 'CUSTOMER')
            .slice(-50).map((message) => message.body),
          customerSequence: sequence,
          observation: this.support.observationFromVerified(scopedSupport),
          selectedContractRef: selectedContractId,
          selectedAccessRef,
        });
        if (decision) {
          const diagnosticOs = decision.kind === 'ESCALATE_CASE'
            ? await this.maybeOpenVerifiedOfflineOs(
              agent, conversation, context.messages, supportReason, scopedSupport, true,
              { login: selectedAccessRef ?? undefined, contract: selectedContractId ?? undefined })
            : { attempted: false, result: null };
          const osOpened = diagnosticOs.result?.['os_aberta'] === true;
          const fallback = osOpened
            ? 'O teste confirmou que a sessão voltou, mas a navegação não. Registrei uma ordem de serviço com essas evidências para a equipe técnica.'
            : decision.fallback;
          const response = await this.replyWithOperationalEvidence(
            agent, conversation, context.messages, newest.body,
            {
              etapa: 'caso_tecnico', decisao: decision.kind, ...decision.facts,
              abertura_os: diagnosticOs.attempted ? {
                confirmada: osOpened,
                motivo: String(diagnosticOs.result?.['motivo'] ?? '').slice(0, 200),
              } : null,
            },
            fallback,
          );
          const token = createHash('sha256').update(
            `newnet-technical-case-scoped:${conversation.id}:${sequence}:${decision.kind}`).digest('hex').slice(0, 32);
          await this.inbox.sendAgentMessage(
            conversation.id, response, `newnet-technical-case-scoped-${token}`);
          if (decision.kind === 'RESOLVE_CASE') {
            await this.closeResolvedConversation(conversation.id);
          } else if (decision.kind === 'ESCALATE_CASE') {
            await this.pauseForHuman(conversation, 'Experimento concluído sem restabelecer a navegação.');
          }
          await this.complete(key, sequence, claim);
          return;
        }
      }

      const scopedOsAttempt = scopedGovernance.action === 'OPEN_OS_FOR_OFFLINE_ACCESS'
        ? await this.maybeOpenVerifiedOfflineOs(
          agent, conversation, context.messages, supportReason, scopedSupport, false,
          { login: selectedAccessRef ?? undefined, contract: selectedContractId ?? undefined })
        : { attempted: false, result: null };
      if (scopedOsAttempt.attempted && scopedOsAttempt.result) {
        const opened = scopedOsAttempt.result['os_aberta'] === true;
        await this.technicalCases.recordGovernedAction(
          conversation.id, opened ? 'OPEN_OFFLINE_OS' : 'OFFLINE_OS_NOT_OPENED',
          'ESCALATED', opened ? 'Acompanhar a OS aberta.' : 'Conferir por que a OS não foi confirmada.',
          { osOpened: opened, selectedContract: !!selectedContractId, selectedAccess: !!selectedAccessRef });
        const message = opened
          ? 'O acesso selecionado está offline e a ordem de serviço foi registrada para a equipe técnica acompanhar.'
          : 'O acesso selecionado está offline, mas não consegui confirmar uma nova ordem de serviço. Registrei o motivo no caso para evitar uma abertura duplicada.';
        const token = createHash('sha256').update(
          `newnet-scoped-os-result:${conversation.id}:${sequence}`).digest('hex').slice(0, 32);
        await this.inbox.sendAgentMessage(conversation.id, message, `newnet-scoped-os-result-${token}`);
        await this.pauseForHuman(
          conversation,
          opened ? 'Acesso offline com OS confirmada.' : 'Acesso offline sem confirmação de nova OS.',
        );
        await this.complete(key, sequence, claim);
        return;
      }

      const planObservation = this.support.observationFromVerified(scopedSupport);
      const plan = await this.technicalPlanner.plan({
        agentId: agent.id,
        conversationScope: await this.aiContextScope(conversation.id),
        reportedProblem: supportReason,
        currentMessage: newest.body,
        recentCustomerMessages: context.messages
          .filter((message) => message.senderKind === 'CUSTOMER')
          .slice(-50).map((message) => message.body),
        recentAssistantMessages: context.messages
          .filter((message) => message.senderKind === 'BUSINESS')
          .slice(-20).map((message) => message.body),
        observation: planObservation,
        historyAnalysis: support.historyAnalysis,
      });
      const conversationState = analyzeTechnicalConversation(
        [
          ...context.messages.filter((message) => message.senderKind === 'CUSTOMER')
            .slice(-50).map((message) => message.body),
          newest.body,
        ],
        context.messages.filter((message) => message.senderKind === 'BUSINESS')
          .slice(-20).map((message) => message.body),
      );
      const escalationOs = plan.action === 'ESCALATE_WITH_EVIDENCE'
        && conversationState.scope === 'ALL'
        && ['NO_CONNECTIVITY', 'SLOWNESS', 'INTERMITTENCE'].includes(conversationState.symptom)
        ? await this.maybeOpenVerifiedOfflineOs(
          agent, conversation, context.messages, supportReason, scopedSupport, true,
          { login: selectedAccessRef ?? undefined, contract: selectedContractId ?? undefined },
          `Diagnóstico conversacional concluído. Sintoma: ${conversationState.symptom}. `
            + `Escopo: ${conversationState.scope}. Luzes: ${conversationState.equipmentLights}. `
            + `Motivo técnico: ${plan.reasoning}`,
        )
        : { attempted: false, result: null };
      const escalationOpened = escalationOs.result?.['os_aberta'] === true;
      const communicatedPlan = communicateTechnicalPlan(plan, planObservation);
      const customerPlanMessage = plan.action === 'ESCALATE_WITH_EVIDENCE'
        ? escalationOpened
          ? `${communicatedPlan} A ordem de serviço foi registrada, e o atendimento ficará aberto para a equipe continuar por aqui.`
          : `${communicatedPlan} O atendimento ficará aberto para a equipe continuar por aqui; não vou repetir os mesmos testes.`
        : communicatedPlan;
      await this.technicalCases.recordGovernedAction(
        conversation.id, plan.action,
        plan.action === 'ESCALATE_WITH_EVIDENCE' ? 'ESCALATED' : 'WAITING_CUSTOMER',
        plan.reasoning,
        {
          pendingQuestion: plan.action === 'ESCALATE_WITH_EVIDENCE' ? null : customerPlanMessage,
          symptoms: plan.symptoms,
          modelSelected: plan.modelSelected,
          osAttempted: escalationOs.attempted,
          osOpened: escalationOpened,
          humanHandoff: plan.action === 'ESCALATE_WITH_EVIDENCE',
        },
      );
      const freshPlanContext = await this.inbox.contextForAgentPreview(conversation.id);
      const finalPlanMessage = freshPlanContext.messages.at(-1);
      if (!finalPlanMessage || finalPlanMessage.serverSequence !== sequence
        || (!resume && finalPlanMessage.senderKind !== 'CUSTOMER')
        || freshPlanContext.conversation.status !== 'OPEN'
        || !freshPlanContext.verified
        || freshPlanContext.conversation.customerRef !== context.conversation.customerRef
        || freshPlanContext.conversation.globalIdentityId !== context.conversation.globalIdentityId) {
        await this.complete(key, sequence, claim);
        return;
      }
      const planToken = createHash('sha256').update(
        `newnet-plan:${conversation.id}:${sequence}:${plan.action}`).digest('hex').slice(0, 32);
      await this.inbox.sendAgentMessage(
        conversation.id, customerPlanMessage, `newnet-plan-${planToken}`);
      if (plan.action === 'ESCALATE_WITH_EVIDENCE') {
        await this.pauseForHuman(conversation, plan.reasoning);
      }
      await this.complete(key, sequence, claim);
      return;

    } catch (error) {
      // Sem checkpoint se falhar antes do envio; retries usam clientMessageId
      // determinístico para não repetir mensagem em falha de rede/timeout.
      this.logger.warn(`Resposta ConnectChat ${conversation.id}: ${(error as Error).message}`);
    }
  }
}
