// Tools genericas builtin (diretriz 10 — NADA de negocio). Cada uma registra
// handler + input_schema + timeout + requires_approval no ToolRegistryService.
// As tools de negocio (ISP, ERP) entram via Providers/Tools custom no catalogo,
// nunca aqui. Handlers acessam servicos injetados — nunca Prisma direto.
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WhatsappMessage } from '@prisma/client';
import { ToolRegistryService, ToolExecutionContext } from './tool-registry.service';
import { httpRequest } from '../../../shared/integration/http.util';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { MemoryService } from '../memory/memory.service';
import { MemoryRepository } from '../memory/memory.repository';
import { WhatsappOrchestratorService } from '../../comm/whatsapp/whatsapp-orchestrator.service';
import { WhatsappInboxService } from '../../comm/whatsapp/whatsapp-inbox.service';
import { EmailOrchestratorService } from '../../comm/email/email-orchestrator.service';
import { NotificationCenterService } from '../../automation/notifications/notification-center.service';
import { StorageService } from '../../integration/storage/storage.service';

/** Guarda anti-SSRF (mesma politica do no HTTP_REQUEST da automacao). */
function assertPublicUrl(raw: string): void {
  if ((process.env['AUTOMATION_HTTP_ALLOW_PRIVATE'] ?? 'off') === 'on') return;
  let host = '';
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    throw new Error(`URL inválida: ${raw}`);
  }
  const blocked =
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === 'metadata.google.internal';
  if (blocked) {
    throw new Error(`Destino "${host}" bloqueado (rede interna).`);
  }
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Parâmetro "${field}" obrigatório.`);
  }
  return value;
}

@Injectable()
export class BuiltinTools implements OnModuleInit {
  private readonly logger = new Logger(BuiltinTools.name);

  constructor(
    private readonly registry: ToolRegistryService,
    private readonly connections: ConnectionsService,
    private readonly knowledge: KnowledgeService,
    private readonly memory: MemoryService,
    private readonly memoryRepository: MemoryRepository,
    private readonly whatsapp: WhatsappOrchestratorService,
    private readonly whatsappInbox: WhatsappInboxService,
    private readonly email: EmailOrchestratorService,
    private readonly notifications: NotificationCenterService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit(): void {
    // ─── consultar_faq (RAG) ──────────────────────────
    this.registry.register({
      key: 'consultar_faq',
      name: 'Consultar base de conhecimento',
      description: 'Busca trechos relevantes nas bases de conhecimento do agente para responder uma pergunta.',
      category: 'dados',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Pergunta ou termo de busca.' },
          base_id: { type: 'string', description: 'ID da base (opcional; padrão = todas as bases do agente).' },
        },
        required: ['query'],
      },
      handler: async (args, ctx) => {
        const query = asString(args['query'], 'query');
        const baseId = typeof args['base_id'] === 'string' ? args['base_id'] : undefined;
        const baseIds = baseId ? [baseId] : (ctx.knowledgeBaseIds ?? []);
        if (baseIds.length === 0) return { chunks: [], detail: 'Nenhuma base de conhecimento habilitada.' };
        const result = await this.knowledge.queryMulti(baseIds, query, 5, {
          traceId: ctx.traceId,
          agentId: ctx.agentId,
        });
        return { chunks: result.chunks, top_score: result.topScore };
      },
    });

    // ─── memory_read ──────────────────────────────────
    this.registry.register({
      key: 'memory_read',
      name: 'Ler memória',
      description: 'Lê valores da memória de longo prazo do agente para o escopo atual.',
      category: 'sistema',
      input_schema: {
        type: 'object',
        properties: { key: { type: 'string', description: 'Chave específica (opcional).' } },
      },
      handler: async (args, ctx) => {
        const profileId = ctx.memoryProfileIds?.[0];
        if (!profileId) return { detail: 'Nenhum perfil de memória habilitado.' };
        const profile = await this.memoryRepository.findProfileById(profileId);
        if (!profile) return { detail: 'Perfil de memória não encontrado.' };
        const scopeKey = ctx.scopeKeys?.[profile.scope.toLowerCase()] ?? ctx.scopeKeys?.['session'] ?? ctx.agentRunId;
        const key = typeof args['key'] === 'string' ? args['key'] : undefined;
        if (key) return { key, value: await this.memory.readKey(profile, scopeKey, key) };
        return { entries: await this.memory.readFor(profile, scopeKey) };
      },
    });

    // ─── memory_write ─────────────────────────────────
    this.registry.register({
      key: 'memory_write',
      name: 'Escrever memória',
      description: 'Grava um valor na memória de longo prazo do agente para o escopo atual.',
      category: 'sistema',
      input_schema: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          value: { description: 'Valor a memorizar (qualquer JSON).' },
        },
        required: ['key', 'value'],
      },
      handler: async (args, ctx) => {
        const profileId = ctx.memoryProfileIds?.[0];
        if (!profileId) return { detail: 'Nenhum perfil de memória habilitado.' };
        const profile = await this.memoryRepository.findProfileById(profileId);
        if (!profile) return { detail: 'Perfil de memória não encontrado.' };
        const scopeKey = ctx.scopeKeys?.[profile.scope.toLowerCase()] ?? ctx.scopeKeys?.['session'] ?? ctx.agentRunId;
        const key = asString(args['key'], 'key');
        if (ctx.dryRun) return { detail: `[simulado] memorizaria "${key}".` };
        await this.memory.writeKey(profile, scopeKey, key, args['value']);
        return { ok: true, key };
      },
    });

    // ─── conversation_history ─────────────────────────
    // MEMÓRIA PRIMÁRIA DA CONVERSA (decisão documentada, aquapark-commercial-
    // memory.md): a IA lê o REGISTRO REAL das mensagens deste WhatsApp — quantas
    // interações atrás precisar — COM data e hora, pra lembrar o que já foi dito.
    this.registry.register({
      key: 'conversation_history',
      name: 'Histórico da conversa',
      description:
        'Lê as mensagens anteriores DESTA conversa de WhatsApp, com data e hora. Use para lembrar o que já foi dito, inclusive interações de dias atrás.',
      category: 'comunicacao',
      input_schema: {
        type: 'object',
        properties: {
          limite: { type: 'number', description: 'Quantas mensagens buscar (padrão 30, máx 100).' },
        },
      },
      handler: async (args, ctx) => {
        const chatId = ctx.scopeKeys?.['session'];
        if (!chatId) return { detail: 'Sem uma conversa em contexto.' };
        const take = Math.min(Math.max(Number(args['limite']) || 30, 1), 100);
        const msgs: WhatsappMessage[] = await this.whatsappInbox
          .listMessages(chatId, take)
          .catch(() => []);
        return {
          mensagens: msgs
            .filter((m) => (m.content ?? '').trim())
            .map((m) => ({
              de: m.direction === 'INCOMING' ? 'cliente' : 'atendimento',
              data: m.created_at,
              texto: m.content,
            })),
        };
      },
    });

    // ─── current_datetime ─────────────────────────────
    this.registry.register({
      key: 'current_datetime',
      name: 'Data e hora atual',
      description:
        'Retorna a data e a hora de agora (para raciocinar sobre prazos e sobre as datas do histórico da conversa).',
      category: 'sistema',
      input_schema: { type: 'object', properties: {} },
      handler: async () => {
        const now = new Date();
        return {
          iso: now.toISOString(),
          data_hora_br: now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          timezone: 'America/Sao_Paulo',
        };
      },
    });

    // ─── vincular_cliente ─────────────────────────────
    // Depois de identificar+confirmar o CPF, a IA vincula o titular a este
    // WhatsApp — assim o sistema "sabe" de quem é o número (não re-pergunta, não
    // mistura identidade). Enviar outro CPF re-vincula. O atendente pode desfazer.
    this.registry.register({
      key: 'vincular_cliente',
      name: 'Vincular cliente ao WhatsApp',
      description:
        'Depois de identificar e confirmar o titular pelo CPF/CNPJ, vincule-o a esta conversa. Assim você não precisa pedir o CPF de novo nas próximas mensagens. Se a pessoa quiser atender OUTRO cliente, chame de novo com o novo CPF.',
      category: 'comunicacao',
      input_schema: {
        type: 'object',
        properties: {
          documento: { type: 'string', description: 'CPF ou CNPJ do titular (só números ou formatado).' },
          nome: { type: 'string', description: 'Nome do titular do cadastro.' },
          id_cliente: { type: 'string', description: 'Id do cliente no sistema (se você tiver).' },
        },
        required: ['documento', 'nome'],
      },
      handler: async (args, ctx) => {
        const chatId = ctx.scopeKeys?.['session'];
        if (!chatId) return { detail: 'Sem uma conversa em contexto.' };
        if (ctx.dryRun) return { detail: '[simulado] vincularia o cliente.' };
        await this.whatsappInbox.linkCustomer(chatId, {
          document: typeof args['documento'] === 'string' ? args['documento'] : null,
          name: typeof args['nome'] === 'string' ? args['nome'] : null,
          ref: typeof args['id_cliente'] === 'string' ? args['id_cliente'] : null,
        });
        return { ok: true, vinculado: args['nome'] ?? args['documento'] };
      },
    });

    // ─── http_request ─────────────────────────────────
    this.registry.register({
      key: 'http_request',
      name: 'Requisição HTTP',
      description: 'Chama uma URL pública (GET/POST/...). Não acessa redes internas.',
      category: 'sistema',
      timeout_ms: 20000,
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
          headers: { type: 'object' },
          body: {},
        },
        required: ['url'],
      },
      handler: async (args, ctx) => {
        const url = asString(args['url'], 'url');
        const method = (typeof args['method'] === 'string' ? args['method'].toUpperCase() : 'GET') as
          | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
        if (ctx.dryRun) return { simulated: true, status: 200 };
        assertPublicUrl(url);
        const res = await httpRequest(url, {
          method,
          headers: (args['headers'] as Record<string, string>) ?? {},
          body: method === 'GET' ? undefined : args['body'],
          timeoutMs: 20000,
        });
        return { status: res.status, ok: res.ok, data: res.data };
      },
    });

    // ─── connection_execute ───────────────────────────
    this.registry.register({
      key: 'connection_execute',
      name: 'Executar operação de conexão',
      description: 'Chama a porta execute de um provider conectado (ex.: cliente.dados no ERP).',
      category: 'sistema',
      input_schema: {
        type: 'object',
        properties: {
          connection_id: { type: 'string' },
          operation: { type: 'string' },
          params: { type: 'object' },
        },
        required: ['connection_id', 'operation'],
      },
      handler: async (args, ctx) => {
        const connectionId = asString(args['connection_id'], 'connection_id');
        const operation = asString(args['operation'], 'operation');
        if (ctx.dryRun) return { simulated: true, operation };
        return this.connections.execute(connectionId, operation, args['params'] ?? {});
      },
    });

    // ─── enviar_whatsapp ──────────────────────────────
    this.registry.register({
      key: 'enviar_whatsapp',
      name: 'Enviar WhatsApp',
      description: 'Envia uma mensagem de WhatsApp pelo Meta Orchestrator (por tag/departamento).',
      category: 'comunicacao',
      requires_approval: true,
      input_schema: {
        type: 'object',
        properties: {
          phone: { type: 'string' },
          message: { type: 'string' },
          tag: { type: 'string', description: 'Critério de roteamento (opcional).' },
        },
        required: ['phone', 'message'],
      },
      handler: async (args, ctx) => {
        const phone = asString(args['phone'], 'phone');
        const message = asString(args['message'], 'message');
        const tag = typeof args['tag'] === 'string' ? args['tag'] : undefined;
        if (ctx.dryRun) return { simulated: true, phone };
        const result = await this.whatsapp.send(
          {
            phone,
            criteria: tag ? { tag } : undefined,
            sender: 'bot',
          },
          { kind: 'text', body: message },
        );
        return { wamid: result.wamid, chat_id: result.chatId };
      },
    });

    // ─── enviar_email ─────────────────────────────────
    this.registry.register({
      key: 'enviar_email',
      name: 'Enviar e-mail',
      description: 'Envia um e-mail pelo Email Orchestrator (resolve a conexão Gmail/SMTP por tag ou conexão explícita).',
      category: 'comunicacao',
      requires_approval: true,
      input_schema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Destinatário (ou lista separada por vírgula).' },
          subject: { type: 'string' },
          body: { type: 'string', description: 'Corpo em HTML ou texto.' },
          tag: { type: 'string', description: 'Tag da conexão de e-mail (opcional).' },
          connection_id: { type: 'string', description: 'Conexão de e-mail específica (opcional).' },
        },
        required: ['to', 'subject', 'body'],
      },
      handler: async (args, ctx) => {
        const to = asString(args['to'], 'to');
        const subject = asString(args['subject'], 'subject');
        const body = asString(args['body'], 'body');
        if (ctx.dryRun) return { simulated: true, to };
        const isHtml = /</.test(body);
        const result = await this.email.send(
          { to, subject, html: isHtml ? body : undefined, text: isHtml ? undefined : body },
          {
            tag: typeof args['tag'] === 'string' ? args['tag'] : undefined,
            connectionId: typeof args['connection_id'] === 'string' ? args['connection_id'] : undefined,
          },
        );
        return { message_id: result.message_id, provider_key: result.provider_key };
      },
    });

    // ─── enviar_notificacao ───────────────────────────
    this.registry.register({
      key: 'enviar_notificacao',
      name: 'Enviar notificação',
      description: 'Dispara uma notificação pelo Notification Center (canal resolvido automaticamente).',
      category: 'comunicacao',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          user_id: { type: 'string' },
        },
        required: ['body'],
      },
      handler: async (args, ctx) => {
        const body = asString(args['body'], 'body');
        const result = await this.notifications.notify({
          recipient: {
            phone: typeof args['phone'] === 'string' ? args['phone'] : undefined,
            email: typeof args['email'] === 'string' ? args['email'] : undefined,
            user_id: typeof args['user_id'] === 'string' ? args['user_id'] : undefined,
          },
          title: typeof args['title'] === 'string' ? args['title'] : undefined,
          body,
          traceId: ctx.traceId,
          dryRun: ctx.dryRun,
        });
        return { channel: result.channel, status: result.status };
      },
    });

    // ─── executar_sql (read-only por default; escrita exige aprovacao) ──
    this.registry.register({
      key: 'executar_sql',
      name: 'Executar SQL',
      description: 'Executa uma consulta SQL numa conexão DATABASE. Somente leitura por padrão; escrita exige política de aprovação.',
      category: 'dados',
      requires_approval: true,
      input_schema: {
        type: 'object',
        properties: {
          connection_id: { type: 'string' },
          sql: { type: 'string' },
        },
        required: ['connection_id', 'sql'],
      },
      handler: async (args, ctx) => {
        const connectionId = asString(args['connection_id'], 'connection_id');
        const sql = asString(args['sql'], 'sql');
        const isWrite = /^\s*(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(sql);
        if (isWrite) {
          // A aprovacao e resolvida pelo ToolRuntime (requires_approval + policy).
          // Chegou aqui = ja aprovado ou politica ausente; mesmo assim, marca no retorno.
          this.logger.warn(`executar_sql: comando de escrita na conexão ${connectionId}.`);
        }
        if (ctx.dryRun) return { simulated: true, write: isWrite };
        return this.connections.execute(connectionId, 'sql.query', { sql, readonly: !isWrite });
      },
    });

    // ─── gerar_documento ──────────────────────────────
    this.registry.register({
      key: 'gerar_documento',
      name: 'Gerar documento',
      description: 'Gera um documento simples (HTML/texto) e o salva no Storage Manager.',
      category: 'documento',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          format: { type: 'string', enum: ['html', 'txt'] },
        },
        required: ['content'],
      },
      handler: async (args, ctx) => {
        const content = asString(args['content'], 'content');
        const title = typeof args['title'] === 'string' ? args['title'] : 'documento';
        const format = args['format'] === 'html' ? 'html' : 'txt';
        if (ctx.dryRun) return { simulated: true, title };
        const body = format === 'html'
          ? `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${content}</body></html>`
          : content;
        const file = await this.storage.save(Buffer.from(body, 'utf-8'), {
          originalName: `${title}.${format}`,
          mime: format === 'html' ? 'text/html' : 'text/plain',
          folder: 'ai-documents',
        });
        return { storage_file_id: file.id, name: file.original_name };
      },
    });

    // ─── consultar_especialista (colaboracao) ─────────
    this.registry.register({
      key: 'consultar_especialista',
      name: 'Consultar especialista',
      description: 'Encaminha uma pergunta a agentes colaboradores configurados e retorna as respostas.',
      category: 'sistema',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      handler: async (args, ctx) => {
        const query = asString(args['query'], 'query');
        if (!ctx.runAgent) return { detail: 'Colaboração indisponível neste contexto.' };
        // A resolucao das regras de colaboracao acontece no runner (via
        // CollaborationService.consult, que recebe ctx.runAgent). Aqui so
        // delegamos rodando o proprio mecanismo exposto pelo runner.
        const collaborated = await ctx.runAgent({
          agentId: ctx.agentId,
          input: query,
          traceId: ctx.traceId,
          executionId: ctx.executionId ?? undefined,
        }).catch((e: unknown) => ({ output: `Falha ao consultar especialista: ${(e as Error).message}` }));
        return { answer: collaborated.output };
      },
    });

    this.logger.log(`Tools builtin registradas: ${this.registry.all().length}.`);
  }
}
