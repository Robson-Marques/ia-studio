// Fachada de LLM (diretriz — IA nunca chama API externa direto): resolve uma
// Connection categoria AI → secret (api_key) → delega ao ILlmProvider certo do
// registry. Normaliza mensagens/tools e calcula cost_usd pela tabela de precos.
// Nenhum modulo de IA fala HTTP com provider — passa sempre por aqui.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiProviderKind, Connection } from '@prisma/client';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { SecretsService } from '../../integration/secrets/secrets.service';
import { LlmProviderRegistryService } from './llm-provider-registry.service';
import {
  LlmChatRequest,
  LlmChatResult,
  LlmEmbedRequest,
  LlmEmbedResult,
  LlmMessage,
  LlmTool,
} from './llm.interface';
import { computeCost } from './pricing';
import { CodexCliService } from '../../integration/registry/providers/codex-cli.service';

// provider_key da Connection AI → AiProviderKind. OpenRouter/Groq/DeepSeek/
// Mistral/Azure reusam o provider OpenAI-compatible via base_url da connection.
const KIND_BY_PROVIDER_KEY: Record<string, AiProviderKind> = {
  openai: AiProviderKind.OPENAI,
  anthropic: AiProviderKind.ANTHROPIC,
  openrouter: AiProviderKind.OPENAI,
  groq: AiProviderKind.OPENAI,
  deepseek: AiProviderKind.OPENAI,
  mistral: AiProviderKind.OPENAI,
  'azure-openai': AiProviderKind.OPENAI,
  cohere: AiProviderKind.COHERE,
  'codex-cli': AiProviderKind.OPENAI,
};

export interface ResolvedLlmConnection {
  connection: Connection;
  kind: AiProviderKind;
  baseUrl?: string;
  apiKey?: string;
  transport?: 'codex-cli' | 'api';
}

export interface ChatViaConnectionArgs {
  connectionId: string;
  model: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResultWithCost extends LlmChatResult {
  providerKind: AiProviderKind;
  costUsd: number;
}

@Injectable()
export class LlmProviderService {
  private readonly logger = new Logger(LlmProviderService.name);

  constructor(
    private readonly connections: ConnectionsService,
    private readonly secrets: SecretsService,
    private readonly registry: LlmProviderRegistryService,
    private readonly codexCli: CodexCliService,
  ) {}

  /** Mapeia provider_key da Connection AI pro AiProviderKind (ou 400). */
  kindForProviderKey(providerKey: string): AiProviderKind {
    const kind = KIND_BY_PROVIDER_KEY[providerKey];
    if (!kind) {
      throw new BadRequestException(`Conector "${providerKey}" não é um provedor de IA suportado.`);
    }
    return kind;
  }

  /** Resolve uma Connection AI local: le estado, base_url e api_key. */
  async resolveConnection(connectionId: string): Promise<ResolvedLlmConnection> {
    const connection = await this.connections.findById(connectionId);
    const kind = this.kindForProviderKey(connection.provider_key);
    const config = (connection.config ?? {}) as Record<string, unknown>;
    const accessor = this.secrets.accessorFor(connection.secret_id);
    const apiKey = connection.provider_key === 'codex-cli'
      ? undefined
      : (await accessor.get('api_key')) ?? undefined;
    const baseUrl = typeof config['base_url'] === 'string' && config['base_url']
      ? String(config['base_url'])
      : undefined;
    return { connection, kind, baseUrl, apiKey, transport: connection.provider_key === 'codex-cli' ? 'codex-cli' : 'api' };
  }

  /** Chat via connection resolvida: delega ao provider e calcula custo. */
  async chatViaConnection(args: ChatViaConnectionArgs): Promise<ChatResultWithCost> {
    const resolved = await this.resolveConnection(args.connectionId);
    return this.chat(resolved, {
      model: args.model,
      messages: args.messages,
      tools: args.tools,
      temperature: args.temperature,
      maxTokens: args.maxTokens,
    });
  }

  /** Chat com uma connection ja resolvida (usado pelo AgentRunner/orchestrator). */
  async chat(
    resolved: ResolvedLlmConnection,
    opts: { model: string; messages: LlmMessage[]; tools?: LlmTool[]; temperature?: number; maxTokens?: number },
  ): Promise<ChatResultWithCost> {
    const provider = resolved.transport === 'codex-cli' ? null : this.registry.get(resolved.kind);
    const req: LlmChatRequest = {
      model: opts.model,
      messages: opts.messages,
      tools: opts.tools,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey,
    };
    const result = resolved.transport === 'codex-cli'
      ? await this.codexCli.chat(resolved.connection.id, req)
      : await provider!.chat(req);
    // O login ChatGPT não usa faturamento por API: custo monetário aqui é zero,
    // mas continua sujeito aos limites do plano e ao volume de tokens.
    const costUsd = resolved.transport === 'codex-cli' ? 0
      : computeCost(opts.model, result.usage.promptTokens, result.usage.completionTokens);
    return { ...result, providerKind: resolved.kind, costUsd };
  }

  /** Embeddings via connection resolvida (provider deve suportar embed). */
  async embedViaConnection(
    connectionId: string,
    model: string,
    input: string[],
  ): Promise<{ result: LlmEmbedResult; providerKind: AiProviderKind }> {
    const resolved = await this.resolveConnection(connectionId);
    if (resolved.transport === 'codex-cli') {
      throw new BadRequestException('Codex CLI não fornece embeddings. Configure uma conexão de API para a base de conhecimento.');
    }
    const provider = this.registry.get(resolved.kind);
    if (!provider.embed) {
      throw new BadRequestException(`Provedor "${resolved.kind}" não gera embeddings — use OpenAI.`);
    }
    const req: LlmEmbedRequest = {
      model,
      input,
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey,
    };
    const result = await provider.embed(req);
    return { result, providerKind: resolved.kind };
  }
}
