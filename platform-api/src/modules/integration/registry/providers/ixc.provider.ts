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
import { BadRequestException, Injectable } from '@nestjs/common';
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
  cpfCnpjCandidates,
  extractRegistros,
  isValidIxcToken,
  isYes,
  ixcDateTime,
  ixcErrorMessage,
  SCOPE_TO_RADUSUARIOS,
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

@Injectable()
export class IxcProvider extends BaseProvider {
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

  private async clienteId(ctx: ProviderContext, token: string, cpf?: string): Promise<string> {
    const rows = await this.findClientes(ctx, token, cpf);
    const id = rows[0]?.['id'];
    if (id === undefined || id === null || id === '') {
      throw new BadRequestException(`Nenhum cliente encontrado no IXC com o CPF/CNPJ "${cpf}".`);
    }
    return String(id);
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
    const filters: IxcGridFilter[] = [];
    for (const [scopeKey, column] of Object.entries(SCOPE_TO_RADUSUARIOS)) {
      const value = args[scopeKey];
      if (typeof value === 'string' && value.trim()) filters.push({ TB: column, OP: '=', P: value.trim() });
    }
    // Sem filtro nenhum a consulta varreria a base inteira — exige escopo.
    if (filters.length === 0) {
      throw new BadRequestException('Informe ao menos um filtro de escopo (cidade, bairro, id_olt ou id_cto).');
    }
    filters.push({ TB: `${T.radusuarios}.ativo`, OP: '=', P: 'S' });

    const logins = await this.list(ctx, token, T.radusuarios, {
      page: '1',
      rp: '1000',
      sortname: `${T.radusuarios}.id`,
      sortorder: 'asc',
      grid_param: buildGridParam(filters),
    });
    if (logins.length === 0) return [];

    // Lote unico de clientes (operador IN) → nome + telefone pro disparo.
    const ids = [...new Set(logins.map((l) => String(l['id_cliente'] ?? '')).filter(Boolean))];
    const clientes = ids.length
      ? await this.list(ctx, token, T.cliente, {
          qtype: `${T.cliente}.id`,
          query: ids.join(','),
          oper: 'IN',
          page: '1',
          rp: String(ids.length),
          sortname: `${T.cliente}.id`,
          sortorder: 'asc',
        })
      : [];
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
    const clienteId = await this.clienteId(ctx, token, this.str(args, 'cpf', true));
    const assunto = this.str(args, 'id_assunto') ?? this.str(args, 'motivo');
    const setor = this.str(args, 'setor');
    const login = this.str(args, 'id_login');
    if (!assunto) {
      throw new BadRequestException(
        'Informe "id_assunto" (id do assunto da OS no IXC). Os assuntos disponíveis vêm do Descobrir recursos da conexão.',
      );
    }
    const body: Record<string, unknown> = {
      tipo: 'C',
      id_cliente: clienteId,
      id_assunto: assunto,
      mensagem: this.str(args, 'descricao', true),
      status: 'A',
      prioridade: 'N',
      melhor_horario_agenda: 'Q',
      origem_endereco: 'M',
      data_abertura: ixcDateTime(),
      ...(setor ? { setor } : {}),
      ...(login ? { id_login: login } : {}),
      ...(args['extra'] && typeof args['extra'] === 'object' ? (args['extra'] as Record<string, unknown>) : {}),
    };
    return this.write(ctx, token, 'POST', T.os, body);
  }

  // ─── Transporte ─────────────────────────────────────

  /** Listagem (POST + header `ixcsoft: listar`). Devolve as linhas ja extraidas. */
  private async list(ctx: ProviderContext, token: string, tabela: string, params: IxcListParams): Promise<Record<string, unknown>[]> {
    const res = await this.rawList(ctx, token, tabela, params, 20_000);
    this.assertOk(res.status, res.data, tabela);
    return extractRegistros(res.data);
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
