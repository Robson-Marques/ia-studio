// Condutor embutido inbound → assistente (frente "assistente conduz sem fluxo").
// Faz a IA ATENDER direto uma mensagem de WhatsApp quando o número tem um
// assistente vinculado e habilitado (v0.10.81) — sem exigir que o usuário monte
// um fluxo. Reaproveita a maquinaria que já existe:
//   · debounce por conversa (junta a rajada de mensagens picadas, igual ao
//     AutomationProcessors) — aqui o tempo vem do "Como conversa" do assistente;
//   · histórico da conversa (continuidade) e nota de cliente vinculado;
//   · AgentRunnerService (loop de tool-calling, custo, aprovação);
//   · envio governado pelo orquestrador (janela de 24h, modo manual bloqueado);
//   · assignBot (a conversa passa a mostrar "atendido pela IA", sem roubar de
//     humano).
//
// Não responde quando: não há vínculo/habilitado, auto_reply desligado, um
// humano está no comando (current_handler=USER), a conversa está em modo manual,
// ou chegou mensagem mais nova (o timer da mais nova responde). É o caminho do
// Aquapark (assistente conduz), paralelo e independente dos fluxos — um número
// usa um OU outro (a demoção dos Fluxos vem no próximo checkpoint).
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AiAgent } from '@prisma/client';
import { EventEnvelope } from '../../../shared/events/event-envelope';
import { WHATSAPP_INBOUND_EVENT } from '../../comm/whatsapp/whatsapp-inbound.service';
import { WhatsappAssistantService } from '../../comm/whatsapp/whatsapp-assistant.service';
import { WhatsappInboxService } from '../../comm/whatsapp/whatsapp-inbox.service';
import { WhatsappOrchestratorService } from '../../comm/whatsapp/whatsapp-orchestrator.service';
import { ChatAssignmentService } from '../../comm/attendance/chat-assignment.service';
import { AgentsRepository } from '../agents/agents.repository';
import { AgentRunnerService } from '../agents/agent-runner.service';
import { AgentConversation, parseConversation } from '../agents/agent-conversation';

interface InboundPayload {
  chat_id?: string;
  connection_id?: string;
  phone?: string;
  content?: string;
  external_id?: string;
  handler_type?: string | null;
}

@Injectable()
export class WhatsappAssistantResponderService {
  private readonly logger = new Logger(WhatsappAssistantResponderService.name);
  // Coalesce por conversa (in-memory, mesmo padrão do AutomationProcessors): o
  // timer reinicia a cada mensagem e só dispara quando o cliente para de digitar.
  private readonly debounce = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly binding: WhatsappAssistantService,
    private readonly agentsRepo: AgentsRepository,
    private readonly runner: AgentRunnerService,
    private readonly inbox: WhatsappInboxService,
    private readonly orchestrator: WhatsappOrchestratorService,
    private readonly assignment: ChatAssignmentService,
  ) {}

  private enabled(): boolean {
    // Interruptor de emergência (rollback sem deploy). Default: ligado.
    return (process.env['WHATSAPP_ASSISTANT_RESPONDER'] ?? 'on') !== 'off';
  }

  @OnEvent(WHATSAPP_INBOUND_EVENT)
  async onInbound(envelope: EventEnvelope): Promise<void> {
    if (!this.enabled()) return;
    const payload = (envelope.payload ?? {}) as InboundPayload;
    const chatId = payload.chat_id;
    const connectionId = payload.connection_id;
    if (!chatId || !connectionId) return;

    try {
      // Número tem assistente habilitado? (1 query — hot path.)
      const agentId = await this.binding.activeAgentId(connectionId);
      if (!agentId) return;

      const agent = await this.agentsRepo.findById(agentId);
      if (!agent || !agent.is_active) return;

      const conv = parseConversation((agent as { conversation?: unknown }).conversation);
      if (!conv.auto_reply) return; // vínculo existe, mas o atendimento automático está desligado

      // Debounce: reinicia o timer da conversa; só a última mensagem dispara.
      const prev = this.debounce.get(chatId);
      if (prev) clearTimeout(prev);
      const ms = Math.max(1, conv.debounce_seconds) * 1000;
      const timer = setTimeout(() => {
        this.debounce.delete(chatId);
        void this.respond(envelope, agent, conv).catch((e) =>
          this.logger.warn(`Condutor (chat ${chatId}): ${(e as Error).message}`),
        );
      }, ms);
      this.debounce.set(chatId, timer);
    } catch (e) {
      this.logger.warn(`Condutor inbound (chat ${chatId}): ${(e as Error).message}`);
    }
  }

  private async respond(envelope: EventEnvelope, agent: AiAgent, conv: AgentConversation): Promise<void> {
    const payload = (envelope.payload ?? {}) as InboundPayload;
    const chatId = payload.chat_id as string;
    const connectionId = payload.connection_id as string;
    const phone = (payload.phone ?? '').trim();
    const content = (payload.content ?? '').trim();
    if (!phone || !content) return; // sem telefone/texto não há o que responder (mídia pura fica pro humano)

    // Chegou mensagem mais nova nesta conversa? Deixa o timer dela responder.
    const lastIn = await this.inbox.lastIncomingExternalId(chatId).catch(() => null);
    if (payload.external_id && lastIn && lastIn !== payload.external_id) return;

    // Estado ATUAL da conversa (pode ter mudado durante a espera).
    const chat = await this.inbox.getChat(chatId).catch(() => null);
    if (!chat) return;
    // Humano no comando → a IA não responde por cima. Modo manual → idem.
    if (chat.current_handler_type === 'USER') return;
    if (chat.manual_connection_id) return;

    // UX: marca como lida (tick azul) e mostra "digitando…". Best-effort.
    if (payload.external_id) {
      await this.orchestrator.markRead(connectionId, payload.external_id, { typing: true }).catch(() => undefined);
    }

    // Continuidade: turnos anteriores (tira o atual, que vai no input).
    const history = await this.loadHistory(organizationId, chatId);
    const linkedNote = this.linkedNote(chat);
    const input = linkedNote ? `${linkedNote}\n\n${content}` : content;

    const result = await this.runner.run({
      agentId,
      input,
      scopeKeys: { contact: phone, session: chatId },
      history,
    });

    const text = typeof result.output === 'string' ? result.output.trim() : '';
    if (result.status !== 'COMPLETED' || !text) {
      this.logger.debug(`Condutor: run ${result.runId} → ${result.status} (sem resposta utilizável).`);
      return;
    }

    // A IA assume a conversa (BOT) — não rouba de humano (assignBot confere).
    await this.assignment.assignBot(chatId, agent.id).catch(() => undefined);

    // Envio governado pelo orquestrador (janela de 24h / modo manual já tratados
    // lá). O cliente acabou de escrever, então estamos dentro da janela.
    const parts = conv.split_paragraphs ? this.splitParagraphs(text) : [text];
    for (const body of parts) {
      await this.orchestrator.send(
        { phone, criteria: { connectionId }, sender: 'bot' },
        { kind: 'text', body },
      );
    }
  }

  /** Quebra a resposta em parágrafos curtos (bolhas separadas) quando o
   *  assistente pede. Divide por linhas em branco; ignora vazios. */
  private splitParagraphs(text: string): string[] {
    const parts = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : [text];
  }

  /** Histórico da conversa (antiga→nova) menos a última (a atual, que vai no
   *  input). Best-effort: falha vira "sem histórico". */
  private async loadHistory(
    organizationId: string,
    chatId: string,
  ): Promise<{ role: 'user' | 'assistant'; content: string }[] | undefined> {
    const rows = await this.inbox.listMessages(organizationId, chatId, 16).catch(() => []);
    if (!rows.length) return undefined;
    const chrono = rows.slice(0, -1);
    const history = chrono
      .filter((m) => (m.content ?? '').trim())
      .map((m) => ({
        role: (m.direction === 'INCOMING' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content as string,
      }));
    return history.length ? history : undefined;
  }

  /** Nota de cliente já vinculado a este WhatsApp — pro assistente não re-pedir
   *  o documento nem confundir identidade. */
  private linkedNote(chat: { linked_customer_name?: string | null; linked_customer_document?: string | null }): string | null {
    if (!chat.linked_customer_name && !chat.linked_customer_document) return null;
    const doc = chat.linked_customer_document ? ` (doc ${chat.linked_customer_document})` : '';
    return (
      `Contexto: esta conversa já está vinculada ao cliente ${chat.linked_customer_name ?? ''}${doc}. ` +
      'Trate os assuntos como desse cliente e não peça o documento de novo.'
    );
  }
}
