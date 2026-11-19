// MCP Client (diretriz 15). A plataforma atua como CLIENTE de servidores MCP
// externos: cadastra o servidor, sincroniza a lista de tools via JSON-RPC 2.0
// e cacheia o resultado em discovered_tools. Expor NOSSAS tools como servidor
// MCP esta FORA de escopo na V1.
//
// Transportes:
//  - HTTP/SSE: descoberta remota real (POST JSON-RPC method "tools/list").
//  - STDIO: apenas metadado — o comando roda no cliente local, entao a
//    sincronizacao remota nao descobre nada na V1.
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiMcpServer, McpTransport, Prisma } from '@prisma/client';
import { McpRepository } from './mcp.repository';
import { SecretsService } from '../../integration/secrets/secrets.service';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { httpRequest } from '../../../shared/integration/http.util';
import { CreateMcpServerDto, UpdateMcpServerDto } from './dto/mcp.dtos';

/** Tool descoberta no servidor MCP (forma minima persistida no cache). */
interface DiscoveredTool {
  name: string;
  description: string;
  inputSchema?: unknown;
}

/** Resposta JSON-RPC 2.0 esperada do method "tools/list" (tipada — sem any). */
interface McpToolsListResponse {
  jsonrpc?: string;
  id?: number | string;
  result?: {
    tools?: Array<{
      name?: string;
      description?: string;
      inputSchema?: unknown;
    }>;
  };
  error?: {
    code?: number;
    message?: string;
  };
}

export interface SyncResult {
  discovered: number;
  tools: Array<{ name: string; description: string }>;
  detail: string;
}

@Injectable()
export class McpClientService {
  private readonly logger = new Logger(McpClientService.name);

  constructor(
    private readonly repository: McpRepository,
    private readonly secrets: SecretsService,
    private readonly audit: AuditLogService,
  ) {}

  // ─── Leitura ────────────────────────────────────────

  list() {
    return this.repository.findAll();
  }

  async getServer(id: string): Promise<AiMcpServer> {
    const server = await this.repository.findById(id);
    if (!server) throw new NotFoundException('Servidor MCP não encontrado.');
    return server;
  }

  // ─── Escrita ────────────────────────────────────────

  async create(
    dto: CreateMcpServerDto,
    createdBy: string | null,
  ): Promise<AiMcpServer> {
    // Nasce OFF (is_active default false) — nao forcamos ativacao (diretriz de flags).
    const server = await this.repository.create({
      name: dto.name,
      transport: dto.transport,
      endpoint: dto.endpoint,
      secret_id: dto.secret_id,
      created_by: createdBy,
    } as Prisma.AiMcpServerUncheckedCreateInput);
    await this.audit.record({
      action: 'ai.mcp.create',
      entityType: 'AiMcpServer',
      entityId: server.id,
      newValue: {
        name: server.name,
        transport: server.transport,
      },
    });
    return server;
  }

  async update(id: string, dto: UpdateMcpServerDto): Promise<AiMcpServer> {
    const before = await this.getServer(id);
    const server = await this.repository.update(id, {
      name: dto.name ?? undefined,
      endpoint: dto.endpoint ?? undefined,
      secret_id: dto.secret_id ?? undefined,
      is_active: dto.is_active ?? undefined,
    });
    await this.audit.record({
      action: 'ai.mcp.update',
      entityType: 'AiMcpServer',
      entityId: id,
      oldValue: { name: before.name, endpoint: before.endpoint, is_active: before.is_active },
      newValue: { name: server.name, endpoint: server.endpoint, is_active: server.is_active },
    });
    return server;
  }

  // ─── Sincronizacao (descoberta de tools) ────────────

  /**
   * Sincroniza a lista de tools do servidor MCP.
   * - STDIO: nao descobre remotamente (comando roda no cliente local).
   * - HTTP/SSE: POST JSON-RPC 2.0 method "tools/list" ao endpoint.
   * Falha de rede NAO derruba: retorna detail com o erro e discovered 0 (sem gravar).
   */
  async sync(id: string): Promise<SyncResult> {
    const server = await this.getServer(id);

    if (server.transport === McpTransport.STDIO) {
      return {
        discovered: 0,
        tools: [],
        detail: 'Transporte STDIO só descobre no cliente local — sincronização remota indisponível na V1.',
      };
    }

    if (!server.endpoint) {
      return {
        discovered: 0,
        tools: [],
        detail: 'Servidor MCP sem endpoint configurado — nada a sincronizar.',
      };
    }

    // Auth opcional: token no campo 'token' ou, em fallback, 'api_key'.
    const accessor = this.secrets.accessorFor(server.secret_id);
    const token = (await accessor.get('token')) ?? (await accessor.get('api_key'));
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: McpToolsListResponse;
    try {
      const result = await httpRequest(server.endpoint, {
        method: 'POST',
        headers,
        body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      });
      response = (result.data ?? {}) as McpToolsListResponse;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'erro desconhecido';
      this.logger.warn(`Falha ao sincronizar servidor MCP ${id}: ${message}`);
      return {
        discovered: 0,
        tools: [],
        detail: `Falha ao contatar o servidor MCP: ${message}`,
      };
    }

    if (response.error) {
      return {
        discovered: 0,
        tools: [],
        detail: `Servidor MCP retornou erro JSON-RPC: ${response.error.message ?? 'sem mensagem'}`,
      };
    }

    const rawTools = response.result?.tools ?? [];
    const discovered: DiscoveredTool[] = rawTools.map((tool) => ({
      name: tool.name ?? '',
      description: tool.description ?? '',
      inputSchema: tool.inputSchema,
    }));

    await this.repository.update(id, {
      discovered_tools: discovered as unknown as Prisma.InputJsonValue,
      last_sync_at: new Date(),
    });
    await this.audit.record({
      action: 'ai.mcp.sync',
      entityType: 'AiMcpServer',
      entityId: id,
      newValue: { discovered: discovered.length },
    });

    return {
      discovered: discovered.length,
      tools: discovered.map((tool) => ({ name: tool.name, description: tool.description })),
      detail: `${discovered.length} tool(s) descoberta(s).`,
    };
  }

  /** Le o cache discovered_tools do servidor e normaliza (vazio se null). */
  async discoveredTools(
    id: string,
  ): Promise<Array<{ name: string; description: string }>> {
    const server = await this.getServer(id);
    if (!server.discovered_tools) return [];
    const cached = server.discovered_tools as unknown as DiscoveredTool[];
    if (!Array.isArray(cached)) return [];
    return cached.map((tool) => ({
      name: tool.name ?? '',
      description: tool.description ?? '',
    }));
  }
}
