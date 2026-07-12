// Tools do agente ISP (Fase 6 §2) — registradas no MESMO mecanismo das tools
// builtin (ToolRegistryService), semeadas no catalogo ai_tools pelo seed da
// Fase 5 (AiProvidersSeedService itera toolRegistry.all()). Cada tool:
//   * resolve a conexao de ERP (IspConnectionResolver — nunca sabe QUAL ERP);
//   * chama ConnectionsService.execute (Provider Registry → IntegrationLog);
//   * A IA NUNCA chama a API do ERP direto.
// As chaves de operacao abaixo (`cliente.dados`, `financeiro.*`, `os.cadastrar`)
// sao o CONTRATO CANONICO do ERP de provedor: Altarede e IXC implementam as
// mesmas chaves, cada um traduzindo pra sua API. Trocar de ERP = trocar a
// conexao; nenhuma tool muda.
// abrir_os e status_regiao consultam IncidentLookupService (modo reativo):
// se o cliente pertence a incidente ATIVO, devolvem o informativo e suprimem OS.
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ToolRegistryService, ToolExecutionContext } from '../ai/tools/tool-registry.service';
import { ConnectionsService } from '../integration/connections/connections.service';
import { WhatsappInboxService } from '../comm/whatsapp/whatsapp-inbox.service';
import { IspOsConfigService } from './isp-os-config.service';
import { IspConnectionResolver } from './isp-connection.resolver';
import { IspConnectivityService } from './isp-connectivity.service';
import { IncidentLookupService } from './incident-lookup.service';
import { SCOPE_KEYS } from './isp.constants';
import { projectBoleto, projectCliente, projectConexao, projectContrato, rows } from './isp-projections';

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Parâmetro "${field}" obrigatório.`);
  }
  return value.trim();
}

@Injectable()
export class IspTools implements OnModuleInit {
  private readonly logger = new Logger(IspTools.name);

  constructor(
    private readonly registry: ToolRegistryService,
    private readonly connections: ConnectionsService,
    private readonly resolver: IspConnectionResolver,
    private readonly connectivity: IspConnectivityService,
    private readonly lookup: IncidentLookupService,
    private readonly whatsappInbox: WhatsappInboxService,
    private readonly osConfig: IspOsConfigService,
  ) {}

  /**
   * Resolve a conexao de ERP do escopo do run (aceita connection_id/tag
   * opcionais). `erp` nao entra no schema das tools de proposito: escolher o
   * ERP e decisao de operador (prioridade da conexao / tag), nao do modelo —
   * mas nos de workflow podem passa-lo explicitamente.
   */
  private async connectionId(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> {
    const connection = await this.resolver.resolve({
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId ?? undefined,
      environmentId: ctx.environmentId ?? undefined,
      connectionId: typeof args['connection_id'] === 'string' ? (args['connection_id'] as string) : undefined,
      tag: typeof args['filial'] === 'string' ? (args['filial'] as string) : undefined,
      providerKey: typeof args['erp'] === 'string' ? (args['erp'] as string) : undefined,
    });
    return connection.id;
  }

  private scopeFromArgs(args: Record<string, unknown>): Record<string, string> {
    const scope: Record<string, string> = {};
    for (const key of SCOPE_KEYS) {
      const v = args[key];
      if (typeof v === 'string' && v.trim()) scope[key] = v.trim();
    }
    return scope;
  }

  onModuleInit(): void {
    // ─── identificar_cliente ──────────────────────────
    this.registry.register({
      key: 'identificar_cliente',
      name: 'Identificar cliente (ISP)',
      description:
        'Busca o cadastro de um cliente do provedor por CPF/CNPJ ou por telefone. No atendimento por WhatsApp, comece pelo telefone — o cliente raramente digita o CPF.',
      category: 'isp',
      input_schema: {
        type: 'object',
        properties: {
          cpf: { type: 'string', description: 'CPF ou CNPJ do cliente (com ou sem máscara).' },
          telefone: { type: 'string', description: 'Telefone do cliente, inclusive no formato do WhatsApp (5527999998888). Só no IXC.' },
          connection_id: { type: 'string', description: 'Conexão do ERP (opcional; resolvida automaticamente).' },
          filial: { type: 'string', description: 'Tag/filial quando há múltiplas conexões de ERP (opcional).' },
        },
      },
      handler: async (args, ctx) => {
        const cpf = typeof args['cpf'] === 'string' && args['cpf'].trim() ? args['cpf'].trim() : undefined;
        const telefone = typeof args['telefone'] === 'string' && args['telefone'].trim() ? args['telefone'].trim() : undefined;
        if (!cpf && !telefone) throw new Error('Informe cpf ou telefone.');
        if (ctx.dryRun) return { simulated: true, cpf, telefone };
        const connectionId = await this.connectionId(args, ctx);
        // Telefone tem precedencia: e o dado que o atendimento realmente possui.
        const raw = telefone
          ? await this.connections.execute(ctx.organizationId, connectionId, 'cliente.por_telefone', { telefone })
          : await this.connections.execute(ctx.organizationId, connectionId, 'cliente.dados', { cpf });
        const clientes = rows(raw).map(projectCliente);
        // Auto-vínculo (determinístico, não depende do modelo chamar outra tool):
        // achou EXATAMENTE 1 cliente e há uma conversa em contexto → grava o
        // vínculo CPF↔WhatsApp. Outro CPF depois re-identifica e re-vincula.
        const session = ctx.scopeKeys?.['session'];
        if (clientes.length === 1 && session) {
          const c = clientes[0];
          await this.whatsappInbox
            .linkCustomer(ctx.organizationId, session, {
              document: typeof c['cpf_cnpj'] === 'string' ? (c['cpf_cnpj'] as string) : null,
              name: typeof c['nome'] === 'string' ? (c['nome'] as string) : null,
              ref: typeof c['id'] === 'string' ? (c['id'] as string) : null,
            })
            .catch(() => undefined);
        }
        return { clientes };
      },
    });

    // ─── consultar_debitos ────────────────────────────
    this.registry.register({
      key: 'consultar_debitos',
      name: 'Consultar débitos (ISP)',
      description: 'Lista boletos em aberto e histórico financeiro de um cliente no ERP do provedor.',
      category: 'isp',
      input_schema: {
        type: 'object',
        properties: {
          cpf: { type: 'string' },
          incluir_historico: { type: 'boolean', description: 'Também retorna o histórico financeiro.' },
          connection_id: { type: 'string' },
          filial: { type: 'string' },
        },
        required: ['cpf'],
      },
      handler: async (args, ctx) => {
        const cpf = asString(args['cpf'], 'cpf');
        if (ctx.dryRun) return { simulated: true, cpf };
        const connectionId = await this.connectionId(args, ctx);
        const abertos = await this.connections.execute(
          ctx.organizationId,
          connectionId,
          'financeiro.boleto_aberto_todos',
          { cpf },
        );
        const out: Record<string, unknown> = { abertos: rows(abertos).map(projectBoleto) };
        if (args['incluir_historico'] === true) {
          const historico = await this.connections.execute(ctx.organizationId, connectionId, 'financeiro.historico', { cpf });
          out['historico'] = rows(historico).map(projectBoleto);
        }
        return out;
      },
    });

    // ─── consultar_contrato ───────────────────────────
    this.registry.register({
      key: 'consultar_contrato',
      name: 'Consultar contrato/plano (ISP)',
      description:
        'Mostra o plano contratado e o estado do contrato — inclusive se o acesso está BLOQUEADO por inadimplência (status_internet). Consulte antes de tratar "sem internet" como problema técnico: contrato bloqueado não se resolve com ordem de serviço.',
      category: 'isp',
      input_schema: {
        type: 'object',
        properties: {
          cpf: { type: 'string' },
          connection_id: { type: 'string' }, filial: { type: 'string' },
        },
        required: ['cpf'],
      },
      handler: async (args, ctx) => {
        const cpf = asString(args['cpf'], 'cpf');
        if (ctx.dryRun) return { simulated: true, cpf };
        const connectionId = await this.connectionId(args, ctx);
        const raw = await this.connections.execute(ctx.organizationId, connectionId, 'cliente.planos', { cpf });
        return { contratos: rows(raw).map(projectContrato) };
      },
    });

    // ─── status_conexao ───────────────────────────────
    this.registry.register({
      key: 'status_conexao',
      name: 'Status da conexão (ISP)',
      description: 'Verifica se o cliente está online/offline (IP, MAC, sessão) no ERP do provedor.',
      category: 'isp',
      input_schema: {
        type: 'object',
        properties: {
          cpf: { type: 'string' },
          login: { type: 'string', description: 'Login PPPoE (alternativa ao CPF).' },
          connection_id: { type: 'string' },
          filial: { type: 'string' },
        },
      },
      handler: async (args, ctx) => {
        const params: Record<string, unknown> = {};
        if (typeof args['cpf'] === 'string') params['cpf'] = args['cpf'];
        if (typeof args['login'] === 'string') params['login'] = args['login'];
        if (!params['cpf'] && !params['login']) throw new Error('Informe cpf ou login.');
        if (ctx.dryRun) return { simulated: true };
        const connectionId = await this.connectionId(args, ctx);
        const raw = await this.connections.execute(ctx.organizationId, connectionId, 'cliente.acesso', params);
        return { conexoes: rows(raw).map(projectConexao) };
      },
    });

    // ─── status_regiao ────────────────────────────────
    this.registry.register({
      key: 'status_regiao',
      name: 'Status da região (ISP)',
      description:
        'Calcula o % de clientes offline por filtros de rede. Falha de rede é topologia, não geografia: prefira porta_pon > id_cto > id_olt > vlan; bairro/cidade só como último recurso. Antes de sugerir OS, verifica incidente ativo.',
      category: 'isp',
      input_schema: {
        type: 'object',
        properties: {
          porta_pon: { type: 'string', description: 'Porta PON no formato frame/slot/pon (ex.: "0/1/1") — o filtro mais preciso: a PON inteira cai junto.' },
          id_porta_pon: { type: 'string', description: 'Id numérico da porta PON, quando conhecido (mais rápido que porta_pon).' },
          id_slot: { type: 'string', description: 'Slot da OLT (slot 0 é válido).' },
          numero_pon: { type: 'string', description: 'Número da PON dentro do slot (PON 0 é válida).' },
          id_cto: { type: 'string', description: 'Caixa/CTO do cliente.' },
          porta_cto: { type: 'string', description: 'Porta do splitter dentro da CTO.' },
          id_olt: { type: 'string', description: 'OLT/transmissor.' },
          vlan: { type: 'string', description: 'VLAN do cliente (não use "0" — significa "sem VLAN").' },
          ip_concentrador: { type: 'string', description: 'IP do concentrador (BRAS/BNG).' },
          interface_concentrador: { type: 'string', description: 'Interface do concentrador — só discrimina se houver uma interface por VLAN.' },
          bairro: { type: 'string', description: 'Geografia: proxy ruim de topologia (vizinhos podem estar em PONs distintas).' },
          cidade: { type: 'string', description: 'Geografia: use só se nada mais estiver disponível.' },
          customer_ref: { type: 'string', description: 'Login/CPF do cliente (para checar incidente ativo).' },
          connection_id: { type: 'string' }, filial: { type: 'string' },
        },
      },
      handler: async (args, ctx) => {
        if (ctx.dryRun) return { simulated: true };
        const connectionId = await this.connectionId(args, ctx);
        const summary = await this.connectivity.query(ctx.organizationId, connectionId, this.scopeFromArgs(args));
        // Reativo: se o cliente pertence a um incidente ativo, informa a manutencao.
        let incident = null;
        if (typeof args['customer_ref'] === 'string' && args['customer_ref'].trim()) {
          incident = await this.lookup.activeFor(ctx.organizationId, args['customer_ref']);
        }
        return {
          total: summary.total,
          offline: summary.offline,
          offline_pct: summary.offline_pct,
          active_incident: incident,
        };
      },
    });

    // ─── segunda_via_boleto ───────────────────────────
    this.registry.register({
      key: 'segunda_via_boleto',
      name: '2ª via de boleto (ISP)',
      description:
        'Gera a 2ª via de boleto no ERP do provedor. No IXC devolve linha digitável e link do boleto no gateway (não há PIX copia-e-cola); no Altarede, linha digitável e PIX quando disponível.',
      category: 'isp',
      input_schema: {
        type: 'object',
        properties: {
          cpf: { type: 'string' },
          formato: {
            type: 'string',
            enum: ['linha', 'pdf', 'email'],
            description: 'linha (padrão), pdf (base64) ou email. O IXC não suporta "email" — use linha ou pdf.',
          },
          email: { type: 'string', description: 'Destino quando formato=email.' },
          connection_id: { type: 'string' }, filial: { type: 'string' },
        },
        required: ['cpf'],
      },
      handler: async (args, ctx) => {
        const cpf = asString(args['cpf'], 'cpf');
        const formato = typeof args['formato'] === 'string' ? args['formato'] : 'linha';
        if (ctx.dryRun) return { simulated: true, cpf, formato };
        const connectionId = await this.connectionId(args, ctx);
        if (formato === 'pdf') {
          return this.connections.execute(ctx.organizationId, connectionId, 'financeiro.boleto_base64', { cpf });
        }
        if (formato === 'email') {
          const email = asString(args['email'], 'email');
          return this.connections.execute(ctx.organizationId, connectionId, 'financeiro.boleto_por_email', { cpf, email });
        }
        const raw = await this.connections.execute(ctx.organizationId, connectionId, 'financeiro.boleto_aberto', { cpf });
        return { boletos: rows(raw).map(projectBoleto) };
      },
    });

    // ─── desbloqueio_confianca (destrutivo → aprovacao) ──
    this.registry.register({
      key: 'desbloqueio_confianca',
      name: 'Desbloqueio de confiança (ISP)',
      description: 'Libera temporariamente o acesso de um cliente em atraso (desbloqueio de confiança) no ERP do provedor.',
      category: 'isp',
      requires_approval: true,
      input_schema: {
        type: 'object',
        properties: {
          cpf: { type: 'string' },
          connection_id: { type: 'string' }, filial: { type: 'string' },
        },
        required: ['cpf'],
      },
      handler: async (args, ctx) => {
        const cpf = asString(args['cpf'], 'cpf');
        if (ctx.dryRun) return { simulated: true, cpf };
        const connectionId = await this.connectionId(args, ctx);
        return this.connections.execute(ctx.organizationId, connectionId, 'cliente.desbloqueio', { cpf });
      },
    });

    // ─── abrir_os ─────────────────────────────────────
    this.registry.register({
      key: 'abrir_os',
      name: 'Abrir ordem de serviço (ISP)',
      description:
        'Abre uma OS no ERP do provedor. Antes, checa incidente ativo no escopo do cliente: se houver manutenção com supressão de OS, informa e NÃO abre OS duplicada.',
      category: 'isp',
      // Abre direto (decisão do operador): os ids de setor/assunto vêm da CONFIG
      // curada, mais o guard de incidente + o anti-duplicidade abaixo.
      requires_approval: false,
      input_schema: {
        type: 'object',
        properties: {
          cpf: { type: 'string', description: 'CPF/CNPJ do titular (do cliente já identificado).' },
          descricao: { type: 'string', description: 'Descrição do problema do cliente (vai na observação da OS).' },
          login: { type: 'string', description: 'Login da conexão com problema (identifica a instalação; use quando houver mais de uma).' },
          contrato: { type: 'string', description: 'Id/nº do contrato da conexão com problema (quando houver mais de um).' },
          setor: { type: 'string', description: 'OPCIONAL — normalmente vem da config; só informe para sobrescrever.' },
          id_assunto: { type: 'string', description: 'OPCIONAL — normalmente vem da config; só informe para sobrescrever.' },
          connection_id: { type: 'string' }, filial: { type: 'string' },
        },
        required: ['cpf', 'descricao'],
      },
      handler: async (args, ctx) => {
        const cpf = asString(args['cpf'], 'cpf');
        const descricao = asString(args['descricao'], 'descricao');
        const login = typeof args['login'] === 'string' && args['login'].trim() ? args['login'].trim() : undefined;
        const contrato = typeof args['contrato'] === 'string' && args['contrato'].trim() ? args['contrato'].trim() : undefined;

        // 1) Incidente ativo com supressão → não abre OS duplicada de região.
        const ref = login ?? cpf;
        const incident = await this.lookup.activeFor(ctx.organizationId, ref);
        if (incident && incident.suppress_os) {
          return {
            os_aberta: false,
            motivo: 'Cliente coberto por incidente ativo com supressão de OS.',
            incident: {
              title: incident.title,
              message: incident.message,
              forecast: incident.inform_forecast ? incident.forecast : null,
            },
          };
        }
        if (ctx.dryRun) return { simulated: true, cpf };

        const connectionId = await this.connectionId(args, ctx);

        // 2) Setor + assunto da CONFIG curada (a IA não chuta ids). Override
        //    opcional se a IA mandar setor/id_assunto explicitamente.
        const cfg = await this.osConfig.defaultForSupport(ctx.organizationId, connectionId);
        const setor = (typeof args['setor'] === 'string' && args['setor']) || cfg?.setor_id;
        const idAssunto = (typeof args['id_assunto'] === 'string' && args['id_assunto']) || cfg?.assunto_id;
        if (!setor || !idAssunto) {
          return {
            os_aberta: false,
            motivo:
              'A abertura de OS ainda não foi configurada para esta conexão (setor/assunto). Encaminhe para um atendente humano abrir o chamado.',
          };
        }

        // 3) Anti-duplicidade: já existe OS aberta pra este cliente/conexão?
        const abertas = rows(
          await this.connections.execute(ctx.organizationId, connectionId, 'os.listar_abertas', {
            cpf,
            ...(login ? { id_login: login } : {}),
          }),
        );
        if (abertas.length > 0) {
          const ja = abertas[0];
          return {
            os_aberta: false,
            duplicada: true,
            motivo: 'Já existe um chamado técnico aberto para esta conexão.',
            chamado: { id: ja['id'] ?? null, status: ja['status'] ?? null, assunto: ja['id_assunto'] ?? null },
          };
        }

        // 4) Abre a OS com o que a IA sabe + a config.
        const os = await this.connections.execute(ctx.organizationId, connectionId, 'os.cadastrar', {
          cpf,
          descricao,
          setor,
          id_assunto: idAssunto,
          ...(login ? { id_login: login } : {}),
          ...(contrato ? { id_contrato: contrato } : {}),
        });
        return { os_aberta: true, os, active_incident: incident };
      },
    });

    this.logger.log('Tools ISP registradas no catálogo de ferramentas do agente.');
  }
}
