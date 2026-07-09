// Provider ERP IXC Soft (Provedor) — segundo ERP de ISP da plataforma.
//
// A API do IXC e uma unica porta CRUD sobre tabelas do banco:
//   POST /webservice/v1/<tabela>  + header `ixcsoft: listar`  → LISTAR
//   POST /webservice/v1/<tabela>                              → INSERIR
//   PUT  /webservice/v1/<tabela>/<id>                         → EDITAR
//   DEL  /webservice/v1/<tabela>/<id>                         → EXCLUIR
// Auth sempre Basic base64("<id>:<chave>") — nunca Bearer (a API responde 400).
//
// (A doc oficial descreve a listagem como "GET com corpo JSON". `fetch` nao
// envia corpo em GET; POST com o header `ixcsoft: listar` e o caminho aceito
// pela API e usado por todos os SDKs.)
//
// Este provider expoe DUAS familias de operacoes:
//   1) O CONTRATO CANONICO da solucao ISP (`cliente.dados`, `financeiro.*`,
//      `os.cadastrar`, `conectividade.listar_com_status`...) — as mesmas chaves
//      do AltaredeProvider. Assim as tools do agente (isp-tools.ts) funcionam
//      com qualquer um dos dois ERPs, sem tocar em tool nenhuma.
//   2) Operacoes GENERICAS (`ixc.listar/inserir/editar/excluir`) pra qualquer
//      tabela — usadas por nos de workflow e usuarios avancados.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ProviderCategory } from '@prisma/client';
import { BaseProvider } from './base.provider';
import {
  DiscoveredResource,
  DiscoveryResult,
  HealthResult,
  ProviderContext,
  ProviderMetadata,
} from '../../../../shared/integration/provider.interface';
import { httpRequest } from '../../../../shared/integration/http.util';
import {
  IxcGridFilter,
  IxcListParams,
  basicAuthHeader,
  buildGridParam,
  chunk,
  cpfCnpjCandidates,
  IN_CHUNK_SIZE,
  extractRegistros,
  isValidIxcToken,
  isYes,
  ixcDateTime,
  ixcErrorMessage,
  redactRow,
  FIBRA_TABLE,
  SCOPE_GEO_CLIENTE,
  SCOPE_GEO_RADUSUARIOS,
  SCOPE_TO_FIBRA,
  SCOPE_TO_RADUSUARIOS,
  ZERO_MEANS_UNSET,
} from './ixc.helpers';

// Tabelas do IXC usadas pelo contrato canonico.
const T = {
  cliente: 'cliente',
  contrato: 'cliente_contrato',
  areceber: 'fn_areceber',
  radusuarios: 'radusuarios',
  os: 'su_oss_chamado',
  osAssunto: 'su_oss_assunto',
  osSetor: 'su_oss_setor',
  plano: 'vd_contratos',
} as const;

// Catalogo de operacoes (sem path arbitrario — a chave decide o que roda).
const OPERATIONS = [
  // Contrato canonico ISP (mesmas chaves do AltaredeProvider)
  'cliente.dados',
  'cliente.planos',
  'cliente.acesso',
  'cliente.desbloqueio',
  'financeiro.boleto_aberto',
  'financeiro.boleto_aberto_todos',
  'financeiro.historico',
  'financeiro.boleto_base64',
  'conectividade.listar_com_status',
  'os.cadastrar',
  'atendimento.listar_setor',
  'atendimento.listar_motivo_atendimento',
  // Acesso generico a qualquer tabela do IXC
  'ixc.listar',
  'ixc.inserir',
  'ixc.editar',
  'ixc.excluir',
] as const;

type Operation = (typeof OPERATIONS)[number];

// Paginacao das consultas de escopo. PAGE_SIZE alto reduz idas e vindas;
// MAX_PAGES e o teto que impede um escopo largo demais de varrer a base.
const PAGE_SIZE = 500;
const MAX_PAGES = 20;

@Injectable()
export class IxcProvider extends BaseProvider {
  private readonly logger = new Logger(IxcProvider.name);

  metadata(): ProviderMetadata {
    return {
      key: 'ixc',
      name: 'IXC Soft (Provedor)',
      category: ProviderCategory.ERP,
      description: 'ERP de provedores (ISP) — clientes, financeiro, OS, contratos e conectividade (Radius/OLT).',
      icon: 'server',
      secretKind: 'API_KEY',
      capabilities: ['health', 'discover', ...OPERATIONS.map((op) => `execute:${op}`)],
      wizardSchema: {
        testable: true,
        steps: [
          {
            id: 'endpoint',
            title: 'Endereço do IXC',
            description: 'URL do seu IXC Provedor. A plataforma acrescenta /webservice/v1 automaticamente.',
            fields: [
              {
                key: 'base_url',
                label: 'URL do IXC',
                type: 'url',
                required: true,
                placeholder: 'https://ixc.seuprovedor.com.br',
                help: 'Sem barra no final e sem /webservice/v1 — só o domínio.',
              },
            ],
          },
          {
            id: 'credentials',
            title: 'Token de acesso',
            description:
              'No IXC: Configurações → Usuários → seu usuário → marque "Permite acesso webservice" e copie o token. ' +
              'Confira também "Redes permitidas" no grupo do usuário (o IP do servidor precisa estar liberado).',
            fields: [
              {
                key: 'token',
                label: 'Token do webservice',
                type: 'password',
                secret: true,
                required: true,
                placeholder: '7:ca9baa3bc69beec5859034fccde41b49...',
                help: 'Formato "id:chave" — copie exatamente como o IXC exibe, incluindo o número e os dois-pontos.',
              },
            ],
          },
        ],
      },
    };
  }

  // ─── Health ─────────────────────────────────────────

  async health(ctx: ProviderContext): Promise<HealthResult> {
    let token: string;
    try {
      token = await this.token(ctx);
    } catch (e) {
      return { ok: false, detail: (e as Error).message, checks: { credentials: false } };
    }
    try {
      // Chamada mais leve possivel que exercita auth + rota: 1 cliente.
      const res = await this.rawList(ctx, token, T.cliente, { rp: '1', sortname: 'cliente.id' }, 8_000);
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          detail: 'Token recusado pelo IXC (401/403). Verifique o token, se o usuário está ativo e se o IP do servidor está em "Redes permitidas".',
          checks: { endpoint: true, credentials: false },
        };
      }
      const err = ixcErrorMessage(res.data);
      if (err) {
        return { ok: false, detail: `IXC: ${err}`, checks: { endpoint: true, credentials: false } };
      }
      const ok = res.status >= 200 && res.status < 300;
      return {
        ok,
        detail: ok
          ? `IXC alcançável e token aceito (HTTP ${res.status}).`
          : `IXC respondeu HTTP ${res.status}.`,
        checks: { endpoint: true, credentials: ok },
      };
    } catch (e) {
      return { ok: false, detail: (e as Error).message, checks: { endpoint: false } };
    }
  }

  // ─── Execute ────────────────────────────────────────

  async execute(ctx: ProviderContext, operation: string, params: unknown): Promise<unknown> {
    if (!(OPERATIONS as readonly string[]).includes(operation)) {
      if (operation === 'financeiro.boleto_por_email') {
        throw new BadRequestException(
          'O IXC não expõe envio de boleto por e-mail pela API. Use formato "linha" (linha digitável/PIX) ou "pdf".',
        );
      }
      throw new BadRequestException(
        `Operação desconhecida "${operation}". Disponíveis: ${OPERATIONS.join(', ')}.`,
      );
    }
    const args = params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
    const token = await this.token(ctx);

    switch (operation as Operation) {
      case 'cliente.dados':
        return { data: await this.findClientes(ctx, token, this.str(args, 'cpf', true)) };

      case 'cliente.planos': {
        const id = await this.clienteId(ctx, token, this.str(args, 'cpf', true));
        return { data: await this.list(ctx, token, T.contrato, this.eq(`${T.contrato}.id_cliente`, id, `${T.contrato}.id`)) };
      }

      case 'cliente.acesso':
        return { data: await this.acesso(ctx, token, args) };

      case 'cliente.desbloqueio':
        return this.desbloqueio(ctx, token, this.str(args, 'cpf', true));

      case 'financeiro.boleto_aberto': {
        const abertos = await this.boletosAbertos(ctx, token, this.str(args, 'cpf', true), '1');
        return { data: abertos };
      }

      case 'financeiro.boleto_aberto_todos':
        return { data: await this.boletosAbertos(ctx, token, this.str(args, 'cpf', true), '100') };

      case 'financeiro.historico': {
        const id = await this.clienteId(ctx, token, this.str(args, 'cpf', true));
        return {
          data: await this.list(ctx, token, T.areceber, {
            ...this.eq(`${T.areceber}.id_cliente`, id, `${T.areceber}.id`),
            rp: '50',
            sortorder: 'desc',
          }),
        };
      }

      case 'financeiro.boleto_base64':
        return this.boletoPdf(ctx, token, this.str(args, 'cpf', true));

      case 'conectividade.listar_com_status':
        return { data: await this.conectividade(ctx, token, args) };

      case 'os.cadastrar':
        return this.abrirOs(ctx, token, args);

      case 'atendimento.listar_setor':
        return { data: await this.list(ctx, token, T.osSetor, { rp: '200', sortname: `${T.osSetor}.id` }) };

      case 'atendimento.listar_motivo_atendimento':
        return { data: await this.list(ctx, token, T.osAssunto, { rp: '200', sortname: `${T.osAssunto}.id` }) };

      // ─── Genericas ────────────────────────────────────
      case 'ixc.listar': {
        const tabela = this.str(args, 'tabela', true)!;
        const listParams: IxcListParams = {
          qtype: this.str(args, 'qtype'),
          query: this.str(args, 'query'),
          oper: this.str(args, 'oper'),
          page: this.str(args, 'page') ?? '1',
          rp: this.str(args, 'rp') ?? '50',
          sortname: this.str(args, 'sortname') ?? `${tabela}.id`,
          sortorder: this.str(args, 'sortorder') === 'desc' ? 'desc' : 'asc',
        };
        const grid = args['grid_param'];
        if (Array.isArray(grid)) listParams.grid_param = buildGridParam(grid as IxcGridFilter[]);
        else if (typeof grid === 'string' && grid.trim()) listParams.grid_param = grid;
        return { data: await this.list(ctx, token, tabela, listParams) };
      }

      case 'ixc.inserir':
        return this.write(ctx, token, 'POST', this.str(args, 'tabela', true)!, this.payload(args));

      case 'ixc.editar': {
        const tabela = this.str(args, 'tabela', true)!;
        const id = this.str(args, 'id', true)!;
        return this.write(ctx, token, 'PUT', `${tabela}/${id}`, this.payload(args));
      }

      case 'ixc.excluir': {
        const tabela = this.str(args, 'tabela', true)!;
        const id = this.str(args, 'id', true)!;
        return this.write(ctx, token, 'DELETE', `${tabela}/${id}`, undefined);
      }
      default:
        throw new BadRequestException(`Operação "${operation}" sem implementação no provider IXC.`);
    }
  }

  // ─── Discover ───────────────────────────────────────

  async discover(ctx: ProviderContext): Promise<DiscoveryResult> {
    const token = await this.token(ctx);
    const resources: DiscoveredResource[] = [];
    // A ordem dos rotulos e POR TABELA: em `vd_contratos` o rotulo que o
    // operador ve na tela do IXC (coluna "Plano") e `nome`, nao `descricao`.
    resources.push(...(await this.discoverList(ctx, token, T.osSetor, 'setor', ['setor', 'nome', 'descricao'])));
    resources.push(...(await this.discoverList(ctx, token, T.osAssunto, 'motivo_atendimento', ['assunto', 'descricao', 'nome'])));
    resources.push(...(await this.discoverList(ctx, token, T.plano, 'plano', ['nome', 'descricao'])));
    return { resources };
  }

  // ─── Resolucao dos logins de um escopo de rede ──────

  /**
   * Resolve os logins ATIVOS de um escopo. Tres fontes, porque o IXC espalha a
   * informacao e nao tem operador OR:
   *   1. topologia PON  → `radpop_radio_cliente_fibra` (2 estagios, por id_login);
   *   2. rede logica    → colunas do proprio `radusuarios`;
   *   3. geografia      → `radusuarios` (endereco proprio) UNIAO `cliente`
   *      (endereco de cadastro, herdado pelos logins com bairro vazio).
   */
  private async resolveLogins(ctx: ProviderContext, token: string, args: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    const base = this.scopeFilters(args, SCOPE_TO_RADUSUARIOS);
    const fibra = this.scopeFilters(args, SCOPE_TO_FIBRA);
    const geoRad = this.scopeFilters(args, SCOPE_GEO_RADUSUARIOS);
    const geoCli = this.scopeFilters(args, SCOPE_GEO_CLIENTE);
    if (base.length === 0 && fibra.length === 0 && geoRad.length === 0) {
      throw new BadRequestException(
        'Informe ao menos um filtro de escopo. Do mais preciso ao menos: porta_pon, id_cto, id_olt, vlan, bairro.',
      );
    }

    // Topologia PON: primeiro estagio devolve os id_login daquela porta/slot.
    if (fibra.length > 0) {
      const onus = await this.listAll(ctx, token, FIBRA_TABLE, {
        rp: String(PAGE_SIZE),
        sortname: `${FIBRA_TABLE}.id`,
        sortorder: 'asc',
        grid_param: buildGridParam(fibra),
      });
      const loginIds = [...new Set(onus.map((o) => String(o['id_login'] ?? '')).filter((v) => v && v !== '0'))];
      if (loginIds.length === 0) return [];
      base.push({ TB: `${T.radusuarios}.id`, OP: 'IN', P: loginIds.join(',') });
    }
    base.push({ TB: `${T.radusuarios}.ativo`, OP: '=', P: 'S' });

    if (geoRad.length === 0) return this.listLogins(ctx, token, base);

    // Geografia: logins com endereco proprio no escopo...
    const proprios = await this.listLogins(ctx, token, [...base, ...geoRad]);

    // ...uniao dos logins dos clientes cadastrados no escopo, considerando so os
    // que HERDAM o endereco (`endereco_padrao_cliente = 'S'`). Os de endereco
    // proprio ja vieram acima, e incluir os demais colocaria no incidente um
    // login que esta fisicamente noutro bairro.
    const clientes = await this.listAll(ctx, token, T.cliente, {
      rp: String(PAGE_SIZE),
      sortname: `${T.cliente}.id`,
      sortorder: 'asc',
      grid_param: buildGridParam(geoCli),
    });
    const clienteIds = [...new Set(clientes.map((c) => String(c['id'] ?? '')).filter(Boolean))];
    if (clienteIds.length === 0) return proprios;

    const byId = new Map(proprios.map((l) => [String(l['id']), l]));
    // O `IN` vai em lotes: uma lista com centenas de ids numa string so faz o
    // IXC devolver `registros` VAZIO em vez de erro — o afetado sumiria calado.
    for (const lote of chunk(clienteIds, IN_CHUNK_SIZE)) {
      const herdados = await this.listLogins(ctx, token, [
        ...base,
        { TB: `${T.radusuarios}.id_cliente`, OP: 'IN', P: lote.join(',') },
      ]);
      for (const login of herdados) {
        if (isYes(login['endereco_padrao_cliente'])) byId.set(String(login['id']), login);
      }
    }
    return [...byId.values()];
  }

  private listLogins(ctx: ProviderContext, token: string, filters: IxcGridFilter[]): Promise<Record<string, unknown>[]> {
    return this.listAll(ctx, token, T.radusuarios, {
      rp: String(PAGE_SIZE),
      sortname: `${T.radusuarios}.id`,
      sortorder: 'asc',
      grid_param: buildGridParam(filters),
    });
  }

  // ─── Operacoes de negocio ───────────────────────────

  /** Busca o cliente por CPF/CNPJ tentando os formatos aceitos pela base. */
  private async findClientes(ctx: ProviderContext, token: string, cpf?: string): Promise<Record<string, unknown>[]> {
    for (const candidate of cpfCnpjCandidates(cpf!)) {
      const rows = await this.list(ctx, token, T.cliente, {
        qtype: `${T.cliente}.cnpj_cpf`,
        query: candidate,
        oper: '=',
        page: '1',
        rp: '5',
        sortname: `${T.cliente}.id`,
        sortorder: 'asc',
      });
      if (rows.length > 0) return rows;
    }
    return [];
  }

  /** Linha do cliente (nao so o id): a OS precisa da filial que vem no cadastro. */
  private async clienteRow(ctx: ProviderContext, token: string, cpf?: string): Promise<Record<string, unknown>> {
    const rows = await this.findClientes(ctx, token, cpf);
    const row = rows[0];
    const id = row?.['id'];
    if (!row || id === undefined || id === null || id === '') {
      throw new BadRequestException(`Nenhum cliente encontrado no IXC com o CPF/CNPJ "${cpf}".`);
    }
    return row;
  }

  private async clienteId(ctx: ProviderContext, token: string, cpf?: string): Promise<string> {
    return String((await this.clienteRow(ctx, token, cpf))['id']);
  }

  /** Status de conexao do cliente (Radius). Aceita cpf OU login PPPoE. */
  private async acesso(ctx: ProviderContext, token: string, args: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    const login = this.str(args, 'login');
    const cpf = this.str(args, 'cpf');
    let params: IxcListParams;
    if (login) {
      params = this.eq(`${T.radusuarios}.login`, login, `${T.radusuarios}.id`);
    } else if (cpf) {
      params = this.eq(`${T.radusuarios}.id_cliente`, await this.clienteId(ctx, token, cpf), `${T.radusuarios}.id`);
    } else {
      throw new BadRequestException('Informe cpf ou login.');
    }
    const rows = await this.list(ctx, token, T.radusuarios, { ...params, rp: '20' });
    return rows.map((r) => ({ ...r, online: isYes(r['online']), status: isYes(r['online']) ? 'Online' : 'Offline' }));
  }

  /** Desbloqueio de confianca: roda sobre o CONTRATO ativo do cliente. */
  private async desbloqueio(ctx: ProviderContext, token: string, cpf?: string): Promise<unknown> {
    const clienteId = await this.clienteId(ctx, token, cpf);
    const contratos = await this.list(ctx, token, T.contrato, {
      ...this.eq(`${T.contrato}.id_cliente`, clienteId, `${T.contrato}.id`),
      rp: '20',
    });
    const ativo = contratos.find((c) => String(c['status'] ?? '').toUpperCase() === 'A') ?? contratos[0];
    const contratoId = ativo?.['id'];
    if (!contratoId) {
      throw new BadRequestException('Cliente sem contrato no IXC — desbloqueio de confiança indisponível.');
    }
    // Rota dedicada do IXC (nao e uma tabela; nao leva o header `ixcsoft`).
    return this.write(ctx, token, 'POST', 'desbloqueio_confianca', { id: String(contratoId) });
  }

  /** Boletos em aberto (status "A"), do vencimento mais antigo pro mais novo. */
  private async boletosAbertos(ctx: ProviderContext, token: string, cpf: string | undefined, rp: string): Promise<Record<string, unknown>[]> {
    const clienteId = await this.clienteId(ctx, token, cpf);
    return this.list(ctx, token, T.areceber, {
      page: '1',
      rp,
      sortname: `${T.areceber}.data_vencimento`,
      sortorder: 'asc',
      grid_param: buildGridParam([
        { TB: `${T.areceber}.id_cliente`, OP: '=', P: clienteId },
        { TB: `${T.areceber}.status`, OP: '=', P: 'A' },
      ]),
    });
  }

  /** PDF (base64) do boleto em aberto mais antigo. */
  private async boletoPdf(ctx: ProviderContext, token: string, cpf?: string): Promise<unknown> {
    const abertos = await this.boletosAbertos(ctx, token, cpf, '1');
    const boletoId = abertos[0]?.['id'];
    if (!boletoId) throw new BadRequestException('Nenhum boleto em aberto para este cliente no IXC.');
    return this.write(ctx, token, 'POST', 'get_boleto', {
      boletos: String(boletoId),
      juros: 'S',
      multa: 'S',
      atualiza_boleto: 'S',
      tipo_boleto: 'arquivo',
      base64: 'S',
    });
  }

  /**
   * Conectividade por escopo de rede (base do % offline e dos incidentes).
   * Consulta `radusuarios` filtrado e enriquece com nome/telefone do cliente
   * num unico lote (sem N+1), no formato que o IspConnectivityService espera.
   */
  private async conectividade(ctx: ProviderContext, token: string, args: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    const logins = await this.resolveLogins(ctx, token, args);
    if (logins.length === 0) return [];

    // Clientes em lotes (operador IN) → nome + telefone pro disparo. Em lotes
    // porque um IN longo devolve vazio sem erro: os afetados ficariam sem nome
    // nem telefone, e o disparo proativo sairia mudo.
    const ids = [...new Set(logins.map((l) => String(l['id_cliente'] ?? '')).filter(Boolean))];
    const clientes: Record<string, unknown>[] = [];
    for (const lote of chunk(ids, IN_CHUNK_SIZE)) {
      clientes.push(
        ...(await this.list(ctx, token, T.cliente, {
          qtype: `${T.cliente}.id`,
          query: lote.join(','),
          oper: 'IN',
          page: '1',
          rp: String(lote.length),
          sortname: `${T.cliente}.id`,
          sortorder: 'asc',
        })),
      );
    }
    const byId = new Map(clientes.map((c) => [String(c['id']), c]));

    return logins.map((l) => {
      const cliente = byId.get(String(l['id_cliente'] ?? ''));
      const online = isYes(l['online']);
      return {
        login: String(l['login'] ?? ''),
        nome: String(cliente?.['razao'] ?? ''),
        telefone: String(cliente?.['telefone_celular'] ?? cliente?.['fone'] ?? ''),
        status: online ? 'Online' : 'Offline',
        online,
        id_cliente: l['id_cliente'],
        bairro: l['bairro'],
        cidade: l['cidade'],
      };
    });
  }

  /**
   * Abertura de OS. `id_assunto`/`setor` vêm do discover() — não são texto livre.
   * Os defaults (`tipo`, `prioridade`, `melhor_horario_agenda`, `origem_endereco`)
   * seguem a collection oficial da API do IXC (CRUD su_oss_chamado); `extra`
   * permite sobrescrever qualquer um deles sem tocar no provider.
   */
  private async abrirOs(ctx: ProviderContext, token: string, args: Record<string, unknown>): Promise<unknown> {
    const cliente = await this.clienteRow(ctx, token, this.str(args, 'cpf', true));
    const assunto = this.str(args, 'id_assunto') ?? this.str(args, 'motivo');
    const setor = this.str(args, 'setor');
    const login = this.str(args, 'id_login');
    if (!assunto) {
      throw new BadRequestException(
        'Informe "id_assunto" (id do assunto da OS no IXC). Os assuntos disponíveis vêm do Descobrir recursos da conexão.',
      );
    }
    // O IXC exige Setor e Filial ("Preencha Filial<br />Preencha Setor").
    // Setor e decisao de operacao — nao ha default sensato. Filial vem do cadastro
    // do cliente, entao so precisa ser informada quando o cadastro nao a tiver.
    if (!setor) {
      throw new BadRequestException(
        'Informe "setor" (id do setor de OS no IXC) — é obrigatório. Os setores disponíveis vêm do Descobrir recursos da conexão.',
      );
    }
    const idFilial = this.str(args, 'id_filial') ?? this.str(cliente, 'filial_id');
    if (!idFilial) {
      throw new BadRequestException('Cliente sem filial no cadastro do IXC — informe "id_filial".');
    }
    const body: Record<string, unknown> = {
      tipo: 'C',
      id_cliente: String(cliente['id']),
      id_filial: idFilial,
      id_assunto: assunto,
      setor,
      mensagem: this.str(args, 'descricao', true),
      status: 'A',
      prioridade: 'N',
      melhor_horario_agenda: 'Q',
      origem_endereco: 'M',
      data_abertura: ixcDateTime(),
      ...(login ? { id_login: login } : {}),
      ...(args['extra'] && typeof args['extra'] === 'object' ? (args['extra'] as Record<string, unknown>) : {}),
    };
    return this.write(ctx, token, 'POST', T.os, body);
  }

  // ─── Transporte ─────────────────────────────────────

  /**
   * Listagem paginada ate o fim. `rp` sozinho TRUNCA em silencio: pedir 1000 num
   * bairro com 1200 clientes devolve 1000 e nenhum aviso — a mesma familia de
   * falha muda do `IN` grande e do `online` mal lido. Percorre as paginas ate vir
   * menos que uma pagina cheia, com teto (MAX_PAGES) pra nao varrer a base toda
   * quando o escopo e largo demais; ao bater no teto, avisa no log.
   */
  private async listAll(
    ctx: ProviderContext,
    token: string,
    tabela: string,
    params: IxcListParams,
  ): Promise<Record<string, unknown>[]> {
    const rp = params.rp ?? String(PAGE_SIZE);
    const out: Record<string, unknown>[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const rows = await this.list(ctx, token, tabela, { ...params, page: String(page), rp });
      out.push(...rows);
      if (rows.length < Number(rp)) return out;
    }
    this.logger.warn(`IXC: "${tabela}" atingiu o teto de ${MAX_PAGES} páginas — escopo largo demais, resultado truncado.`);
    return out;
  }

  /**
   * Listagem (POST + header `ixcsoft: listar`). Devolve as linhas ja extraidas e
   * REDIGIDAS. A redacao mora aqui, no ponto unico por onde toda leitura passa —
   * incluir uma operacao nova nao reintroduz o vazamento de senha por esquecimento.
   */
  private async list(ctx: ProviderContext, token: string, tabela: string, params: IxcListParams): Promise<Record<string, unknown>[]> {
    const res = await this.rawList(ctx, token, tabela, params, 20_000);
    this.assertOk(res.status, res.data, tabela);
    return extractRegistros(res.data).map(redactRow);
  }

  private rawList(ctx: ProviderContext, token: string, tabela: string, params: IxcListParams, timeoutMs: number) {
    return httpRequest(`${this.baseUrl(ctx)}/${tabela}`, {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(token), ixcsoft: 'listar' },
      body: params,
      timeoutMs,
    });
  }

  /** Escrita (insert/update/delete e rotas dedicadas) — SEM o header `ixcsoft`. */
  private async write(
    ctx: ProviderContext,
    token: string,
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    const res = await httpRequest(`${this.baseUrl(ctx)}/${path}`, {
      method,
      headers: { Authorization: basicAuthHeader(token) },
      ...(body !== undefined ? { body } : {}),
      timeoutMs: 25_000,
    });
    this.assertOk(res.status, res.data, path);
    return res.data;
  }

  // ─── Helpers ────────────────────────────────────────

  private baseUrl(ctx: ProviderContext): string {
    const config = (ctx.connection.config ?? {}) as Record<string, unknown>;
    const raw = typeof config['base_url'] === 'string' ? (config['base_url'] as string) : '';
    if (!raw) throw new BadRequestException('Conexão IXC sem URL configurada.');
    // Tolerante: o usuario pode colar com ou sem /webservice/v1.
    const host = raw.trim().replace(/\/+$/, '').replace(/\/webservice\/v1$/i, '');
    return `${host}/webservice/v1`;
  }

  private async token(ctx: ProviderContext): Promise<string> {
    const token = await ctx.secrets.get('token');
    if (!token) throw new BadRequestException('Token do IXC ausente no Cofre de Segredos.');
    if (!isValidIxcToken(token)) {
      throw new BadRequestException('Token do IXC inválido: use o formato "id:chave" (ex.: 7:ca9baa3b...), copiado do IXC.');
    }
    return token.trim();
  }

  /** Erro HTTP ou envelope `{type:'error'}` → BadRequest com a mensagem do IXC. */
  private assertOk(status: number, raw: unknown, path: string): void {
    const err = ixcErrorMessage(raw);
    if (err) throw new BadRequestException(`IXC (${path}): ${err}`);
    if (status === 401 || status === 403) {
      throw new BadRequestException(`IXC recusou o token (HTTP ${status}). Verifique o token e as "Redes permitidas" do usuário.`);
    }
    if (status === 404) {
      throw new BadRequestException(`IXC não encontrou a rota "${path}" (HTTP 404). Confira o nome da tabela.`);
    }
    if (status < 200 || status >= 300) {
      throw new BadRequestException(`IXC respondeu HTTP ${status} em "${path}".`);
    }
  }

  private str(args: Record<string, unknown>, key: string, required = false): string | undefined {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
    if (required) throw new BadRequestException(`Parâmetro "${key}" obrigatório.`);
    return undefined;
  }

  /**
   * Converte as chaves de escopo presentes em `args` nos filtros da tabela dada.
   * Recusa `"0"` nas chaves em que isso significa "não configurado" no IXC:
   * como filtro casaria com TODOS os logins, e o escopo de um incidente vira a
   * lista do disparo em massa por WhatsApp. Slot 0 e PON 0 existem — por isso a
   * recusa e por chave (ZERO_MEANS_UNSET), nao universal.
   */
  private scopeFilters(args: Record<string, unknown>, map: Record<string, string>): IxcGridFilter[] {
    const filters: IxcGridFilter[] = [];
    for (const [scopeKey, column] of Object.entries(map)) {
      const value = args[scopeKey];
      if (typeof value !== 'string' || !value.trim()) continue;
      const trimmed = value.trim();
      if (trimmed === '0' && ZERO_MEANS_UNSET.has(scopeKey)) {
        throw new BadRequestException(
          `Filtro de escopo "${scopeKey}" com valor "0": no IXC isso significa "não configurado" e casaria com todos os clientes. Use um escopo real (porta_pon, id_cto ou id_olt).`,
        );
      }
      filters.push({ TB: column, OP: '=', P: trimmed });
    }
    return filters;
  }

  /** Atalho pro filtro simples de igualdade. */
  private eq(field: string, value: string, sortname: string): IxcListParams {
    return { qtype: field, query: value, oper: '=', page: '1', rp: '50', sortname, sortorder: 'asc' };
  }

  /** Corpo do insert/update: `dados` explicito, ou os args menos os de controle. */
  private payload(args: Record<string, unknown>): Record<string, unknown> {
    if (args['dados'] && typeof args['dados'] === 'object') return args['dados'] as Record<string, unknown>;
    const rest: Record<string, unknown> = { ...args };
    delete rest['tabela'];
    delete rest['id'];
    return rest;
  }

  private async discoverList(
    ctx: ProviderContext,
    token: string,
    tabela: string,
    kind: string,
    labelKeys: string[],
  ): Promise<DiscoveredResource[]> {
    try {
      const rows = await this.list(ctx, token, tabela, { page: '1', rp: '200', sortname: `${tabela}.id`, sortorder: 'asc' });
      return rows.map((row, i) => {
        const id = String(row['id'] ?? i);
        const name = this.firstLabel(row, labelKeys) ?? `(sem nome) #${id}`;
        return { kind, id, name, meta: row };
      });
    } catch {
      // discover nunca derruba a UI — recurso indisponivel = lista vazia.
      return [];
    }
  }

  /**
   * Primeiro rotulo NAO-VAZIO da linha, na ordem pedida. `??` nao serve aqui:
   * o IXC devolve "" (string vazia) nos campos nao preenchidos, e "" passa
   * pelo nullish — foi por isso que planos sem `descricao` apareciam em branco.
   */
  private firstLabel(row: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  }
}
