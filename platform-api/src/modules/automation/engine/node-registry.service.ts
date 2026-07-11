// Node Registry (diretriz 49): a engine e AGNOSTICA — nao conhece nenhum tipo
// concreto de no; pergunta ao registry como executar cada node_type. Proibido
// switch por tipo espalhado. Todo no = definition (metadados pro editor) +
// executor (comportamento) + validator (validacao de config).
//
// Nos NUNCA acessam Prisma/repositories — toda operacao passa por services
// injetados nos providers de nos (core/integration/comm/platform .nodes.ts).
import { Injectable, Logger } from '@nestjs/common';

// ─── Contexto de execucao de um no ──────────────────────────────────────

export interface NodeExecutionContext {
  organizationId: string;
  workspaceId: string;
  environmentId: string;
  /** Config do no com {{variaveis}} ja interpoladas. */
  config: Record<string, unknown>;
  /** Input da execucao (payload do gatilho). */
  input: unknown;
  /** Saidas dos nos anteriores (vars[nodeId]). */
  vars: Record<string, unknown>;
  /** Modo simulacao (diretriz 27): executores side-effect logam e mockam. */
  dryRun: boolean;
  traceId: string;
  executionId: string;
  log: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => Promise<void>;
}

export interface NodeResult {
  /** Saida escolhida ('success' | 'error' | 'true' | 'false'). Default 'success'. */
  handle?: string;
  /** Valor produzido — vai pro vars[nodeId] ({{vars.<nodeId>.*}}). */
  output?: unknown;
  /** Pausa a execucao e re-agenda a continuacao via broker (no DELAY). */
  pauseMs?: number;
}

export type NodeExecutor = (ctx: NodeExecutionContext) => Promise<NodeResult>;
export type NodeValidator = (config: Record<string, unknown>) => string[];

// ─── Definition (metadados pro editor renderizar o modal sem codigo) ────

export type NodeFieldType = 'text' | 'textarea' | 'number' | 'select' | 'json' | 'connection' | 'template' | 'agent';

export interface NodeField {
  key: string;
  label: string;
  type: NodeFieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  default?: string | number;
}

export interface NodeDefinition {
  type: string;
  label: string;
  description: string;
  /** Gatilhos | Lógica | Integrações | Comunicação | Plataforma */
  category: string;
  kind: 'trigger' | 'action';
  /** Saidas possiveis (edges `when`). */
  outputs: string[];
  fields: NodeField[];
}

export interface NodeType {
  definition: NodeDefinition;
  executor: NodeExecutor;
  validator?: NodeValidator;
}

@Injectable()
export class NodeRegistryService {
  private readonly logger = new Logger(NodeRegistryService.name);
  private readonly registry = new Map<string, NodeType>();

  register(node: NodeType): void {
    if (this.registry.has(node.definition.type)) {
      this.logger.warn(`node_type "${node.definition.type}" já registrado — sobrescrevendo.`);
    }
    this.registry.set(node.definition.type, node);
  }

  has(type: string): boolean {
    return this.registry.has(type);
  }

  get(type: string): NodeType | undefined {
    return this.registry.get(type);
  }

  /** Catalogo pro editor (paleta + modal declarativo). */
  catalog(): NodeDefinition[] {
    return Array.from(this.registry.values()).map((n) => n.definition);
  }

  /** Valida a config de um no (validator do tipo). */
  validate(type: string, config: Record<string, unknown>): string[] {
    const node = this.registry.get(type);
    if (!node) return [`Tipo de nó desconhecido: ${type}`];
    return node.validator ? node.validator(config) : [];
  }
}
