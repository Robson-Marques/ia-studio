// Provider ERP Altarede (Fase 6 — solucao ISP). A API Altarede (Slim/PHP)
// autentica com appkey+token NO CORPO JSON de cada request (RELATORIO 2.2),
// nao em headers. Operacoes num catalogo fixo (sem path arbitrario). Resposta:
//   { data: [...] }            → sucesso
//   { message: "Sem resultados." } → 404 logico (retornamos data vazio)
//   { error: "..." }           → erro de negocio
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

// Catalogo de operacoes → path da API Altarede. A chave usa ponto (padrao das
// tools/CONNECTION_EXECUTE); o valor e o path REST do Slim.
const OPERATIONS: Record<string, string> = {
  // Clientes
  'cliente.dados': 'cliente/dados',
  'cliente.planos': 'cliente/planos',
  'cliente.acesso': 'cliente/acesso',
  'cliente.desbloqueio': 'cliente/desbloqueio',
  // Financeiro
  'financeiro.boleto_aberto': 'financeiro/boleto_aberto',
  'financeiro.boleto_aberto_todos': 'financeiro/boleto_aberto_todos',
  'financeiro.historico': 'financeiro/historico',
  'financeiro.boleto_base64': 'financeiro/boleto_base64',
  'financeiro.boleto_por_email': 'financeiro/boleto_por_email',
  // Conectividade / rede
  'conectividade.listar_com_status': 'conectividade/listar/com_status',
  // Ordens de servico / atendimento
  'os.cadastrar': 'os/cadastrar',
  'atendimento.cadastrar': 'atendimento/cadastrar',
  'atendimento.listar_setor': 'atendimento/listar_setor',
  'atendimento.listar_motivo_atendimento': 'atendimento/listar_motivo_atendimento',
};

/** Envelope de resposta da API Altarede. */
interface AltaredeEnvelope {
  data?: unknown;
  message?: string;
  error?: string;
}

@Injectable()
export class AltaredeProvider extends BaseProvider {
  metadata(): ProviderMetadata {
    return {
      key: 'altarede',
      name: 'Altarede',
      category: ProviderCategory.ERP,
      description: 'ERP de provedores (ISP) — clientes, financeiro, OS e conectividade.',
      icon: 'server',
      secretKind: 'API_KEY',
      capabilities: ['health', 'discover', ...Object.keys(OPERATIONS).map((op) => `execute:${op}`)],
      wizardSchema: {
        testable: true,
        steps: [
          {
            id: 'endpoint',
            title: 'Endereço da API',
            description: 'URL base da API do Altarede da sua operação.',
            fields: [
              {
                key: 'base_url',
                label: 'URL base',
                type: 'url',
                required: true,
                placeholder: 'https://api.seuprovedor.altarede.com.br',
                help: 'Sem barra no final. Ex.: https://api.exemplo.com.br',
              },
            ],
          },
          {
            id: 'credentials',
            title: 'Credenciais',
            description: 'App Key e Token fornecidos pelo Altarede (ficam no Cofre de Segredos).',
            fields: [
              { key: 'appkey', label: 'App Key', type: 'password', secret: true, required: true },
              { key: 'token', label: 'Token', type: 'password', secret: true, required: true },
            ],
          },
        ],
      },
    };
  }

  async health(ctx: ProviderContext): Promise<HealthResult> {
    const baseUrl = this.baseUrl(ctx);
    const appkey = await ctx.secrets.get('appkey');
    const token = await ctx.secrets.get('token');
    if (!appkey || !token) {
      return { ok: false, detail: 'Credenciais Altarede ausentes no Cofre de Segredos.', checks: { credentials: false } };
    }
    // Chamada leve que valida credencial: lista setores de atendimento.
    try {
      const res = await httpRequest(`${baseUrl}/atendimento/listar_setor`, {
        method: 'POST',
        body: { appkey, token },
        timeoutMs: 8_000,
      });
      const envelope = this.asEnvelope(res.data);
      // A API valida a credencial contra INTEGRACAO_API: error/HTTP 401 = credencial ruim.
      const credOk = res.status !== 401 && !this.looksLikeAuthError(envelope);
      return {
        ok: credOk,
        detail: credOk
          ? `Endpoint alcançável e credencial aceita (HTTP ${res.status}).`
          : envelope.error ?? `Credencial recusada (HTTP ${res.status}).`,
        checks: { endpoint: res.status > 0, credentials: credOk },
      };
    } catch (e) {
      return { ok: false, detail: (e as Error).message, checks: { endpoint: false } };
    }
  }

  async execute(ctx: ProviderContext, operation: string, params: unknown): Promise<unknown> {
    const path = OPERATIONS[operation];
    if (!path) {
      throw new BadRequestException(
        `Operação desconhecida "${operation}". Disponíveis: ${Object.keys(OPERATIONS).join(', ')}.`,
      );
    }
    const { appkey, token } = await this.credentials(ctx);
    const extra = params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
    // appkey+token vao no CORPO JSON junto aos parametros (nunca em headers).
    const res = await httpRequest(`${this.baseUrl(ctx)}/${path}`, {
      method: 'POST',
      body: { appkey, token, ...extra },
      timeoutMs: 20_000,
    });
    return this.unwrap(res.status, res.data, path);
  }

  async discover(ctx: ProviderContext): Promise<DiscoveryResult> {
    const { appkey, token } = await this.credentials(ctx);
    const resources: DiscoveredResource[] = [];

    // Setores de OS/atendimento e motivos — uteis pra UI de escopo/abertura de OS.
    resources.push(...(await this.discoverList(ctx, 'atendimento/listar_setor', 'setor', appkey, token)));
    resources.push(
      ...(await this.discoverList(ctx, 'atendimento/listar_motivo_atendimento', 'motivo_atendimento', appkey, token)),
    );
    return { resources };
  }

  // ─── Helpers ────────────────────────────────────────

  private async credentials(ctx: ProviderContext): Promise<{ appkey: string; token: string }> {
    const appkey = await ctx.secrets.get('appkey');
    const token = await ctx.secrets.get('token');
    if (!appkey || !token) {
      throw new BadRequestException('Credenciais Altarede ausentes no Cofre de Segredos.');
    }
    return { appkey, token };
  }

  private baseUrl(ctx: ProviderContext): string {
    const config = (ctx.connection.config ?? {}) as Record<string, unknown>;
    const baseUrl = typeof config['base_url'] === 'string' ? (config['base_url'] as string) : '';
    if (!baseUrl) {
      throw new BadRequestException('Conexão Altarede sem base_url configurada.');
    }
    return baseUrl.replace(/\/+$/, '');
  }

  private asEnvelope(data: unknown): AltaredeEnvelope {
    return data && typeof data === 'object' ? (data as AltaredeEnvelope) : {};
  }

  private looksLikeAuthError(env: AltaredeEnvelope): boolean {
    const msg = (env.error ?? env.message ?? '').toLowerCase();
    return /appkey|token|autoriza|autentic|inválid|invalido|credencial/.test(msg);
  }

  /**
   * Normaliza o envelope Altarede: `{data}` → data; `{message}` (sem resultados)
   * → array vazio; `{error}` ou HTTP !=2xx → BadRequestException.
   */
  private unwrap(status: number, raw: unknown, path: string): unknown {
    const env = this.asEnvelope(raw);
    if (env.error) {
      throw new BadRequestException(`Altarede (${path}): ${env.error}`);
    }
    if (status < 200 || status >= 300) {
      throw new BadRequestException(`Altarede respondeu HTTP ${status} em ${path}.`);
    }
    if (env.message !== undefined && env.data === undefined) {
      // "Sem resultados." — 404 logico, nao e erro: retorna vazio com o aviso.
      return { data: [], message: env.message };
    }
    return env.data !== undefined ? { data: env.data } : raw;
  }

  private async discoverList(
    ctx: ProviderContext,
    path: string,
    kind: string,
    appkey: string,
    token: string,
  ): Promise<DiscoveredResource[]> {
    try {
      const res = await httpRequest(`${this.baseUrl(ctx)}/${path}`, {
        method: 'POST',
        body: { appkey, token },
        timeoutMs: 12_000,
      });
      const env = this.asEnvelope(res.data);
      const rows = Array.isArray(env.data) ? (env.data as Record<string, unknown>[]) : [];
      return rows.map((row, i) => {
        const id = String(row['ID'] ?? row['id'] ?? row['CODIGO'] ?? i);
        const name = String(row['NOME'] ?? row['nome'] ?? row['DESCRICAO'] ?? row['descricao'] ?? id);
        return { kind, id, name, meta: row };
      });
    } catch {
      // discover nunca derruba a UI — recurso indisponivel = lista vazia.
      return [];
    }
  }
}
