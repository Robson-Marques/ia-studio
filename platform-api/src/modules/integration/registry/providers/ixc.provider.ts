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
  ixcErrorMessage,
  phoneCandidates,
  redactRow,
  PHONE_FIELDS,
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
  // O campo `setor` da OS (su_oss_chamado) referencia empresa_setor.id — NÃO
  // su_oss_setor (que fica vazio em muitas bases). Confirmado na doc do IXC.
  osSetor: 'empresa_setor',
  plano: 'vd_contratos',
  // Atendimento: a OS "de verdade" nasce de um su_ticket cujo ASSUNTO tem um
  // processo vinculado (O.S. OPA SUITE) — o processo abre a OS com contrato e
  // endereco no contexto. O setor do ticket e su_ticket_setor (departamento),
  // NAO empresa_setor.
  ticket: 'su_ticket',
  ticketSetor: 'su_ticket_setor',
} as const;

// Catalogo de operacoes (sem path arbitrario — a chave decide o que roda).
const OPERATIONS = [
  // Contrato canonico ISP (mesmas chaves do AltaredeProvider)
  'cliente.dados',
  // Extensao do IXC (sem equivalente no Altarede hoje): identificar por telefone.
  'cliente.por_telefone',
  'cliente.planos',
  'cliente.acesso',
  'cliente.desbloqueio',
  'financeiro.boleto_aberto',
  'financeiro.boleto_aberto_todos',
  'financeiro.historico',
  'financeiro.boleto_base64',
  'conectividade.listar_com_status',
  'os.cadastrar',
  'os.listar_abertas',
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

  // Status de OS FINALIZADA/cancelada no IXC (o resto conta como "aberta" pro
  // anti-duplicidade). Ajuste conforme o setup do provedor, se necessário.
  private static readonly OS_CLOSED_STATUS = new Set(['F', 'C', 'CA', 'RAG', 'X']);

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

      case 'cliente.por_telefone':
        return { data: await this.findClientesPorTelefone(ctx, token, this.str(args, 'telefone', true)!) };

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
        return this.abrirAtendimento(ctx, token, args);

      case 'os.listar_abertas':
        return { data: await this.osAbertas(ctx, token, args) };

      case 'atendimento.listar_setor':
        return { data: await this.list(ctx, token, T.ticketSetor, { rp: '200', sortname: `${T.ticketSetor}.id` }) };

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
    // Setor = su_ticket_setor (departamento do ATENDIMENTO — a OS nasce do ticket);
    // só os ATIVOS (ativo='S'), pra não poluir com departamentos desativados.
    const setores = (await this.discoverList(ctx, token, T.ticketSetor, 'setor', ['setor', 'nome', 'descricao'])).filter(
      (r) => String((r.meta as Record<string, unknown> | undefined)?.['ativo'] ?? 'S').toUpperCase() !== 'N',
    );
    resources.push(...setores);
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

  /**
   * Busca o cliente por telefone — a porta de entrada do atendimento (quem manda
   * mensagem no WhatsApp nao digita CPF). O numero mora em varias colunas e o IXC
   * nao tem `OR`, entao tenta coluna a coluna, formato a formato, e para no
   * primeiro acerto. Pior caso: `PHONE_FIELDS.length x candidatos` requisicoes.
   */
  private async findClientesPorTelefone(ctx: ProviderContext, token: string, telefone: string): Promise<Record<string, unknown>[]> {
    for (const candidate of phoneCandidates(telefone)) {
      for (const field of PHONE_FIELDS) {
        const rows = await this.list(ctx, token, T.cliente, {
          qtype: `${T.cliente}.${field}`,
          query: candidate,
          oper: '=',
          page: '1',
          rp: '5',
          sortname: `${T.cliente}.id`,
          sortorder: 'asc',
        });
        if (rows.length > 0) return rows;
      }
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

  /**
   * Resolve a conexao (radusuarios) a partir do NOME do login (PPPoE) OU do id.
   * Devolve o id NUMERICO + o contrato do login + se ele tem endereco proprio — a
   * OS usa os tres: `id_login`/`id_contrato` sao FKs numericas, e `origem_endereco`
   * e 'L' so quando o login tem endereco proprio (senao 'C', herda do cliente).
   * Ja numerico → busca a mesma linha pra ter contrato/endereco. Nao encontrou →
   * undefined (a OS abre sem login, com origem no cliente, em vez de falhar).
   */
  private async resolveLogin(
    ctx: ProviderContext,
    token: string,
    loginArg: string | undefined,
    idCliente?: string,
  ): Promise<{ id: string; idContrato?: string; enderecoProprio: boolean } | undefined> {
    const v = loginArg?.trim();
    if (!v) return undefined;
    const col = /^\d+$/.test(v) ? `${T.radusuarios}.id` : `${T.radusuarios}.login`;
    const filters: IxcGridFilter[] = [{ TB: col, OP: '=', P: v }];
    if (idCliente) filters.push({ TB: `${T.radusuarios}.id_cliente`, OP: '=', P: idCliente });
    const rows = await this.list(ctx, token, T.radusuarios, {
      page: '1',
      rp: '2',
      sortname: `${T.radusuarios}.id`,
      sortorder: 'asc',
      grid_param: buildGridParam(filters),
    });
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: String(row['id']),
      idContrato: row['id_contrato'] ? String(row['id_contrato']) : undefined,
      // 'S' = herda o endereco do cliente → origem CLIENTE; diferente de 'S' = proprio.
      enderecoProprio: String(row['endereco_padrao_cliente'] ?? '').toUpperCase() !== 'S',
    };
  }

  /**
   * Desbloqueio de confianca: roda sobre o contrato ATIVO (`status = 'A'`).
   *
   * A rota `desbloqueio_confianca` recebe `id` = id do CONTRATO e e chamada no
   * modo listar (ver `callListar`). Verificada em base real (09/07/2026): a
   * resposta traz o prazo concedido ("desbloqueado por 5 dias, ate DD/MM").
   *
   * COMO CONFERIR O EFEITO: `cliente_contrato.dt_ult_ativacao` (data de hoje) e
   * `nao_bloquear_ate` (o prazo). NAO use `desbloqueio_confianca_ativo` nem
   * `dt_ult_des_bloq_conf` — parecem os campos certos pelo nome e nao sao; ficam
   * inalterados apos um desbloqueio bem-sucedido. `desbloqueio_confianca` (sem
   * `_ativo`) e coluna de configuracao do contrato, nao de estado.
   *
   * NAO ha fallback: sem exatamente um contrato ativo, falha alto. Desbloquear
   * o contrato errado e pior do que nao desbloquear.
   */
  private async desbloqueio(ctx: ProviderContext, token: string, cpf?: string): Promise<unknown> {
    const clienteId = await this.clienteId(ctx, token, cpf);
    const contratos = await this.list(ctx, token, T.contrato, {
      ...this.eq(`${T.contrato}.id_cliente`, clienteId, `${T.contrato}.id`),
      rp: '20',
    });
    const ativos = contratos.filter((c) => String(c['status'] ?? '').toUpperCase() === 'A');
    if (ativos.length === 0) {
      throw new BadRequestException(
        `Cliente sem contrato ativo (status "A") no IXC — desbloqueio de confiança indisponível. Contratos encontrados: ${contratos.length}.`,
      );
    }
    if (ativos.length > 1) {
      throw new BadRequestException(
        `Cliente com ${ativos.length} contratos ativos no IXC — informe qual desbloquear. Desbloquear o contrato errado é pior do que não desbloquear.`,
      );
    }
    const contratoId = String(ativos[0]!['id']);
    // Rota dedicada, chamada no modo LISTAR (header `ixcsoft: listar`), nao como
    // insert: o exemplo oficial em PHP usa `$api->get('desbloqueio_confianca',
    // ['id' => <id_contrato>])`, e `get()` do WebserviceClient e o modo listar.
    return this.callListar(ctx, token, 'desbloqueio_confianca', { id: contratoId });
  }

  /**
   * Boletos em aberto, do vencimento mais antigo pro mais novo.
   *
   * "Em aberto" no IXC NAO e um status especifico: e `liberado = 'S'` e status
   * diferente de 'C' (cancelado) e de 'R' (recebido) — como faz o exemplo oficial
   * "Listar boletos abertos". Filtrar por `status = 'A'` perderia titulos abertos
   * noutro estado (renegociado, em cobranca) e incluiria titulos nao liberados.
   */
  private async boletosAbertos(ctx: ProviderContext, token: string, cpf: string | undefined, rp: string): Promise<Record<string, unknown>[]> {
    const clienteId = await this.clienteId(ctx, token, cpf);
    return this.list(ctx, token, T.areceber, {
      page: '1',
      rp,
      sortname: `${T.areceber}.data_vencimento`,
      sortorder: 'asc',
      grid_param: buildGridParam([
        { TB: `${T.areceber}.id_cliente`, OP: '=', P: clienteId },
        { TB: `${T.areceber}.liberado`, OP: '=', P: 'S' },
        { TB: `${T.areceber}.status`, OP: '!=', P: 'C' },
        { TB: `${T.areceber}.status`, OP: '!=', P: 'R' },
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

  /** OS ABERTAS do cliente (anti-duplicidade). Heurística de status: tudo que
   *  NÃO está finalizado/cancelado conta como aberta. Se `id_login` vier, filtra
   *  as OS daquela conexão. Se `setor` vier, considera só as OS DAQUELE SETOR —
   *  uma OS de outro setor (ex.: financeiro) não deve bloquear um chamado de
   *  suporte. */
  private async osAbertas(
    ctx: ProviderContext,
    token: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    let idCliente = this.str(args, 'id_cliente');
    if (!idCliente) {
      const cliente = await this.clienteRow(ctx, token, this.str(args, 'cpf', true)!);
      idCliente = String(cliente['id']);
    }
    const rows = await this.list(ctx, token, T.os, {
      qtype: `${T.os}.id_cliente`,
      query: String(idCliente),
      oper: '=',
      rp: '50',
      sortname: `${T.os}.id`,
      sortorder: 'desc',
    });
    // id_login da OS e o id NUMERICO de radusuarios — resolve o nome do login
    // pro id, senao o filtro nunca casa (nome != id) e a anti-dup nao funciona.
    const login = (await this.resolveLogin(ctx, token, this.str(args, 'id_login'), String(idCliente)))?.id;
    // Anti-dup por LOGIN (quando informado): uma OS aberta para aquela conexao.
    // O escopo por setor saiu porque a OS agora nasce do atendimento (su_ticket) —
    // o setor do ticket (su_ticket_setor) nao e o `setor` da OS (empresa_setor),
    // entao comparar os dois nunca casava.
    return rows.filter((r) => {
      const status = String(r['status'] ?? '').toUpperCase();
      if (IxcProvider.OS_CLOSED_STATUS.has(status)) return false;
      if (login && r['id_login'] && String(r['id_login']) !== login) return false;
      return true;
    });
  }

  /**
   * Abre a OS pelo fluxo NATIVO do IXC (OpaSuite): gera um protocolo de
   * atendimento e insere um `su_ticket` cujo ASSUNTO tem um processo vinculado
   * ("O.S. OPA SUITE") — o processo abre a OS com CONTRATO e ENDERECO no contexto.
   * Isso preenche o que o insert direto em `su_oss_chamado` deixava vazio. O
   * `id_assunto` (com processo) e o `setor` (departamento = `su_ticket_setor`) vem
   * da config; `extra` sobrescreve qualquer campo do ticket.
   */
  private async abrirAtendimento(ctx: ProviderContext, token: string, args: Record<string, unknown>): Promise<unknown> {
    const cliente = await this.clienteRow(ctx, token, this.str(args, 'cpf', true));
    const assunto = this.str(args, 'id_assunto') ?? this.str(args, 'motivo');
    const setor = this.str(args, 'setor'); // id_ticket_setor (departamento)
    // Conexao: id_login NUMERICO + contrato do login + se tem endereco proprio.
    const conexao = await this.resolveLogin(ctx, token, this.str(args, 'id_login'), String(cliente['id']));
    const login = conexao?.id;
    // id_contrato: o passado (se numerico) OU o contrato do proprio login.
    const idContratoArg = this.str(args, 'id_contrato');
    const idContrato = idContratoArg && /^\d+$/.test(idContratoArg) ? idContratoArg : conexao?.idContrato;
    if (!assunto) {
      throw new BadRequestException(
        'Informe "id_assunto" (assunto com processo de OS vinculado). Os assuntos vêm do Descobrir recursos da conexão.',
      );
    }
    if (!setor) {
      throw new BadRequestException(
        'Informe "setor" (departamento do atendimento) — obrigatório. Os departamentos vêm do Descobrir recursos da conexão.',
      );
    }
    const idFilial = this.str(args, 'id_filial') ?? this.str(cliente, 'filial_id');
    if (!idFilial) {
      throw new BadRequestException('Cliente sem filial no cadastro do IXC — informe "id_filial".');
    }
    const descricao = this.str(args, 'descricao', true)!;
    // O assunto obriga um processo ("Obrigar processo no atendimento"=Sim). Via API
    // o IXC exige `id_wfl_processo` explicito ("Por favor preencha um processo!") —
    // e o processo que abre a OS e o configurado NO PROPRIO assunto (`id_processo`,
    // ex.: O.S. OPA SUITE). Busca-o do assunto (deterministico).
    const idProcesso = await this.processoDoAssunto(ctx, token, assunto);
    const protocolo = await this.gerarProtocolo(ctx, token);
    const body: Record<string, unknown> = {
      tipo: 'C',
      ...(protocolo ? { protocolo } : {}),
      id_cliente: String(cliente['id']),
      id_filial: idFilial,
      id_assunto: assunto,
      id_ticket_setor: setor,
      ...(idProcesso ? { id_wfl_processo: idProcesso } : {}),
      // `titulo` = "Descrição do assunto" (OBRIGATORIO no IXC — sem ele o ticket
      // recusa com "faltando a descrição do assunto"). Curto; a mensagem completa
      // vai em `menssagem`.
      titulo: descricao.length > 200 ? descricao.slice(0, 200) : descricao,
      // Origem do endereco: LOGIN ('L') so quando o login tem endereco PROPRIO;
      // senao CLIENTE ('C') — o login herda o endereco do cadastro. O ticket copia
      // o endereco pro contexto e o processo leva pra OS.
      origem_endereco: conexao?.enderecoProprio ? 'L' : 'C',
      menssagem: descricao, // grafia da API do IXC ("menssagem")
      su_status: 'N',
      status: 'T',
      prioridade: 'N',
      id_ticket_origem: 'I',
      interacao_pendente: 'N',
      origem_cadastro: 'P',
      atualizar_cliente: 'S',
      atualizar_login: 'S',
      ...(login ? { id_login: login } : {}),
      ...(idContrato ? { id_contrato: idContrato } : {}),
      ...(args['extra'] && typeof args['extra'] === 'object' ? (args['extra'] as Record<string, unknown>) : {}),
    };
    // DEBUG TEMPORARIO: confirma a hipotese da intermitencia (id_wfl_processo as
    // vezes some porque a leitura do assunto erra calado). Remover apos confirmar.
    this.logger.warn(`[DBG-OS] proc=${JSON.stringify(idProcesso)} body=${JSON.stringify(body)}`);
    try {
      const resp = await this.write(ctx, token, 'POST', T.ticket, body);
      this.logger.warn('[DBG-OS] OK');
      return resp;
    } catch (e) {
      this.logger.warn(`[DBG-OS] FALHOU: ${(e as Error).message}`);
      throw e;
    }
  }

  /**
   * Gera um novo protocolo de atendimento (rota dedicada, modo LISTAR — igual ao
   * `desbloqueio_confianca`). Tolera formatos (campo comum ou corpo cru). Sem
   * protocolo o ticket ainda abre; o IXC apenas prefere um.
   */
  private async gerarProtocolo(ctx: ProviderContext, token: string): Promise<string | undefined> {
    try {
      const res = (await this.callListar(ctx, token, 'gerar_protocolo_atendimento', {})) as unknown;
      if (typeof res === 'string') return res.trim() || undefined;
      if (res && typeof res === 'object') {
        const o = res as Record<string, unknown>;
        const v = o['protocolo'] ?? o['retorno'] ?? o['message'] ?? o['mensagem'];
        if (typeof v === 'string' && v.trim()) return v.trim();
        if (typeof v === 'number') return String(v);
      }
      return undefined;
    } catch {
      return undefined; // sem protocolo o ticket ainda abre
    }
  }

  /**
   * Lê o processo vinculado a um assunto (`su_oss_assunto.id_processo`) — o processo
   * que abre a OS ao criar o ticket. `0`/vazio → undefined (assunto sem processo).
   */
  private async processoDoAssunto(ctx: ProviderContext, token: string, idAssunto: string): Promise<string | undefined> {
    // A leitura do assunto no IXC ERRA CALADO (a listagem às vezes volta VAZIA sem
    // erro). Sem o `id_processo`, o ticket sai sem `id_wfl_processo` e o IXC pede o
    // "Departamento destino" (a intermitência observada). Repete a leitura quando a
    // lista vier vazia — o assunto/processo em si é estável.
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const rows = await this.list(ctx, token, T.osAssunto, this.eq(`${T.osAssunto}.id`, idAssunto, `${T.osAssunto}.id`));
      if (rows.length > 0) {
        const p = rows[0]['id_processo'];
        const v = p === undefined || p === null ? '' : String(p);
        return v && v !== '0' ? v : undefined;
      }
      // lista vazia = possível "erra calado" do IXC → tenta de novo
    }
    return undefined;
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

  /**
   * Rota dedicada chamada no modo LISTAR (`ixcsoft: listar`) — nao e tabela e
   * nao devolve `registros`. Ex.: `desbloqueio_confianca`. Devolve o corpo cru.
   */
  private async callListar(
    ctx: ProviderContext,
    token: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const res = await httpRequest(`${this.baseUrl(ctx)}/${path}`, {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(token), ixcsoft: 'listar' },
      body,
      timeoutMs: 25_000,
    });
    this.assertOk(res.status, res.data, path);
    return res.data;
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
