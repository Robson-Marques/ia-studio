// Registry declarativo de handlers builtin (diretriz 35 — espelha
// NodeRegistryService/ProviderRegistry). O catalogo (ai_tools) referencia um
// builtin_handler por nome; aqui mora a implementacao in-memory. Proibido
// switch por tool_key espalhado.
import { Injectable, Logger } from '@nestjs/common';

/** Contexto de execucao de uma tool builtin (escopo do run). */
export interface ToolExecutionContext {
  agentId: string;
  agentRunId: string;
  /** Permitidas nesta execução; o runtime valida antes de despachar. */
  allowedToolKeys?: string[];
  traceId: string;
  executionId?: string | null;
  /** Escopos de memoria (contact_id/session_id/...). */
  scopeKeys?: Record<string, string>;
  /** Bases de conhecimento habilitadas no agente (RAG). */
  knowledgeBaseIds?: string[];
  /** Perfis de memoria habilitados no agente. */
  memoryProfileIds?: string[];
  /** Callback pro runner rodar um agente colaborador (evita ciclo de DI). */
  runAgent?: (args: { agentId: string; input: string; traceId: string; executionId?: string }) => Promise<{ output: string }>;
  dryRun?: boolean;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
) => Promise<unknown>;

export interface BuiltinToolDefinition {
  key: string;
  name: string;
  description: string;
  category: string;
  input_schema: Record<string, unknown>;
  requires_approval?: boolean;
  timeout_ms?: number;
  handler: ToolHandler;
}

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly handlers = new Map<string, BuiltinToolDefinition>();

  register(def: BuiltinToolDefinition): void {
    if (this.handlers.has(def.key)) {
      this.logger.warn(`Tool builtin "${def.key}" já registrada — sobrescrevendo.`);
    }
    this.handlers.set(def.key, def);
  }

  has(key: string): boolean {
    return this.handlers.has(key);
  }

  get(key: string): BuiltinToolDefinition | undefined {
    return this.handlers.get(key);
  }

  /** Definicoes builtin (usadas pelo seed pra popular o catalogo por org). */
  all(): BuiltinToolDefinition[] {
    return Array.from(this.handlers.values());
  }
}
