// Console do Desenvolvedor (diretriz 28) — "Postman interno". Testa
// IProvider.execute com payload livre, HTTP arbitrario, SQL read-only (via
// connection DATABASE), chamadas de IA e tools do catalogo — TUDO via conexoes
// do Integration Manager. Mutations auditadas (@Auditable no controller) e cada
// chamada gera IntegrationLog pelo ConnectionsService.execute. NADA de dado de
// negocio persistido: retornos sao respostas vivas, nao gravadas.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConnectionsService } from '../integration/connections/connections.service';
import { LlmProviderService } from '../ai/providers/llm-provider.service';
import { ToolRuntimeService } from '../ai/tools/tool-runtime.service';
import { httpRequest } from '../../shared/integration/http.util';
import { redactSensitive } from '../../shared/audit/audit-log.service';
import { ExecuteTestDto, SqlTestDto, HttpTestDto, AiTestDto, ToolTestDto } from './dto/devtools.dtos';

export interface DevtoolsRunResult {
  ok: boolean;
  duration_ms: number;
  result?: unknown;
  error?: string;
}

@Injectable()
export class DevtoolsService {
  private readonly logger = new Logger(DevtoolsService.name);

  constructor(
    private readonly connections: ConnectionsService,
    private readonly llm: LlmProviderService,
    private readonly tools: ToolRuntimeService,
  ) {}

  /** provider.execute com payload livre (via connection) — IntegrationLog no service. */
  async runExecute(organizationId: string, dto: ExecuteTestDto): Promise<DevtoolsRunResult> {
    const started = Date.now();
    try {
      const result = await this.connections.execute(
        organizationId,
        dto.connection_id,
        dto.operation,
        dto.params ?? {},
      );
      return { ok: true, duration_ms: Date.now() - started, result };
    } catch (e) {
      return { ok: false, duration_ms: Date.now() - started, error: (e as Error).message };
    }
  }

  /** SQL read-only via connection DATABASE (a validacao read-only mora no provider). */
  async runSql(organizationId: string, dto: SqlTestDto): Promise<DevtoolsRunResult> {
    const started = Date.now();
    try {
      const result = await this.connections.execute(
        organizationId,
        dto.connection_id,
        'sql.query',
        { sql: dto.sql },
      );
      return { ok: true, duration_ms: Date.now() - started, result };
    } catch (e) {
      return { ok: false, duration_ms: Date.now() - started, error: (e as Error).message };
    }
  }

  /**
   * HTTP livre (depuracao de integracoes). Nao passa por connection — e uma
   * chamada direta do desenvolvedor; segredos NUNCA sao injetados aqui.
   */
  async runHttp(_organizationId: string, dto: HttpTestDto): Promise<DevtoolsRunResult> {
    const started = Date.now();
    const headers: Record<string, string> = {};
    for (const h of dto.headers ?? []) headers[h.key] = h.value;
    try {
      const res = await httpRequest(dto.url, {
        method: dto.method,
        headers,
        body: dto.body,
        timeoutMs: dto.timeout_ms ?? 15000,
      });
      return {
        ok: res.ok,
        duration_ms: Date.now() - started,
        result: { status: res.status, data: res.data },
      };
    } catch (e) {
      return { ok: false, duration_ms: Date.now() - started, error: (e as Error).message };
    }
  }

  /** Chat de IA via connection AI (custo calculado pelo LlmProviderService). */
  async runAi(organizationId: string, dto: AiTestDto): Promise<DevtoolsRunResult> {
    const started = Date.now();
    try {
      const resolved = await this.llm.resolveConnection(organizationId, dto.connection_id);
      const result = await this.llm.chat(resolved, {
        model: dto.model,
        messages: [
          ...(dto.system ? [{ role: 'system' as const, content: dto.system }] : []),
          { role: 'user' as const, content: dto.prompt },
        ],
        temperature: dto.temperature,
        maxTokens: dto.max_tokens,
      });
      return {
        ok: true,
        duration_ms: Date.now() - started,
        result: {
          content: result.content,
          usage: result.usage,
          cost_usd: result.costUsd,
          provider_kind: result.providerKind,
        },
      };
    } catch (e) {
      return { ok: false, duration_ms: Date.now() - started, error: (e as Error).message };
    }
  }

  /**
   * Roda uma tool do catalogo com input livre. Usa um contexto de devtools
   * (agentId/agentRunId sinteticos) — respeita o gate de aprovacao das tools.
   */
  async runTool(
    organizationId: string,
    dto: ToolTestDto,
    scope: { workspaceId?: string | null; environmentId?: string | null },
  ): Promise<DevtoolsRunResult> {
    const started = Date.now();
    try {
      const res = await this.tools.executeTool(dto.tool_key, dto.input, {
        organizationId,
        workspaceId: scope.workspaceId ?? null,
        environmentId: scope.environmentId ?? null,
        agentId: 'devtools',
        agentRunId: `devtools-${randomUUID()}`,
        traceId: randomUUID(),
      });
      if (res.status === 'awaiting_approval') {
        throw new BadRequestException(
          `A ferramenta "${dto.tool_key}" exige aprovação (solicitação ${res.approvalId}). Aprove em IA → Aprovações.`,
        );
      }
      return {
        ok: res.status === 'ok',
        duration_ms: res.durationMs || Date.now() - started,
        result: res.output,
        error: res.error,
      };
    } catch (e) {
      return { ok: false, duration_ms: Date.now() - started, error: (e as Error).message };
    }
  }

  /** Resumo redactado para auditoria (nunca loga corpo/segredo cru). */
  auditParams(input: unknown): unknown {
    return redactSensitive(input);
  }
}
