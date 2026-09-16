// AI Platform + Studio (Fase 5 — diretrizes 10/15/16/17/26/29/31/32):
// providers multi-LLM (registry declarativo), agents + AgentRunner (loop
// tool-calling), tools (registry/runtime/builtin), knowledge/RAG (pgvector +
// fallback JSON), memory, orchestrator (fallback/menor custo), approvals
// (diretriz 31), costs/budgets (diretriz 17), collaboration (diretriz 16),
// MCP Client (diretriz 15), no AGENT (integra a Fase 4) e seed de providers AI.
// Ver README.md deste diretorio.
import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { CommModule } from '../comm/comm.module';
import { AutomationModule } from '../automation/automation.module';

// Providers (LLM)
import { LlmProviderRegistryService } from './providers/llm-provider-registry.service';
import { LlmProviderService } from './providers/llm-provider.service';
import { OpenAiLlmProvider } from './providers/impl/openai.provider';
import { AnthropicLlmProvider } from './providers/impl/anthropic.provider';
import { GeminiLlmProvider } from './providers/impl/gemini.provider';
import { OllamaLlmProvider } from './providers/impl/ollama.provider';

// Orchestrator
import { AiOrchestratorService } from './orchestrator/ai-orchestrator.service';

// Memory
import { MemoryRepository } from './memory/memory.repository';
import { MemoryService } from './memory/memory.service';
import { MemoryController } from './memory/memory.controller';

// Knowledge
import { KnowledgeRepository } from './knowledge/knowledge.repository';
import { EmbeddingsService } from './knowledge/embeddings.service';
import { KnowledgeService } from './knowledge/knowledge.service';
import { KnowledgeController } from './knowledge/knowledge.controller';

// Tools
import { ToolsRepository } from './tools/tools.repository';
import { ToolRegistryService } from './tools/tool-registry.service';
import { ToolRuntimeService } from './tools/tool-runtime.service';
import { BuiltinTools } from './tools/builtin-tools';
import { ToolsService } from './tools/tools.service';
import { ToolsController } from './tools/tools.controller';
import { ToolCallLogRetentionCron } from './tools/tool-call-log-retention.cron';

// Approvals
import { ApprovalsRepository } from './approvals/approvals.repository';
import { ApprovalPolicyService } from './approvals/approval-policy.service';
import { ApprovalsService } from './approvals/approvals.service';
import { ApprovalsController } from './approvals/approvals.controller';

// Collaboration
import { CollaborationRepository } from './collaboration/collaboration.repository';
import { CollaborationService } from './collaboration/collaboration.service';
import { CollaborationController } from './collaboration/collaboration.controller';

// MCP
import { McpRepository } from './mcp/mcp.repository';
import { McpClientService } from './mcp/mcp-client.service';
import { McpController } from './mcp/mcp.controller';

// Agents
import { AgentsRepository } from './agents/agents.repository';
import { AgentsService } from './agents/agents.service';
import { AgentRunnerService } from './agents/agent-runner.service';
import { PromptSecurityService } from './agents/prompt-security.service';
import { AgentsController } from './agents/agents.controller';

// Análise de atendimento (Checkpoint 1a)
import { AttendanceAnalysisRepository } from './analysis/attendance-analysis.repository';
import { AttendanceAnalysisService } from './analysis/attendance-analysis.service';
import { AttendanceAnalysisController } from './analysis/attendance-analysis.controller';

// Revisão de conteúdo do assistente (diffs de Assistentes)
import { ContentReviewRepository } from './content-review/content-review.repository';
import { ContentReviewService } from './content-review/content-review.service';
import { ContentReviewExportService } from './content-review/content-review-export.service';
import { ContentReviewController } from './content-review/content-review.controller';

// Condutor embutido inbound → assistente (atende WhatsApp sem fluxo)
import { WhatsappAssistantResponderService } from './responders/whatsapp-assistant-responder.service';

// Seed
import { AiSeedRepository } from './seed/ai-seed.repository';
import { AiProvidersSeedService } from './seed/ai-providers-seed.service';

@Module({
  imports: [IntegrationModule, CommModule, AutomationModule],
  controllers: [
    MemoryController,
    KnowledgeController,
    ToolsController,
    ApprovalsController,
    CollaborationController,
    McpController,
    AgentsController,
    AttendanceAnalysisController,
    ContentReviewController,
  ],
  providers: [
    // Providers LLM
    LlmProviderRegistryService,
    LlmProviderService,
    OpenAiLlmProvider,
    AnthropicLlmProvider,
    GeminiLlmProvider,
    OllamaLlmProvider,
    // Orchestrator
    AiOrchestratorService,
    // Memory
    MemoryRepository,
    MemoryService,
    // Knowledge
    KnowledgeRepository,
    EmbeddingsService,
    KnowledgeService,
    // Tools
    ToolsRepository,
    ToolRegistryService,
    ToolRuntimeService,
    BuiltinTools,
    ToolsService,
    ToolCallLogRetentionCron,
    // Approvals
    ApprovalsRepository,
    ApprovalPolicyService,
    ApprovalsService,
    // Collaboration
    CollaborationRepository,
    CollaborationService,
    // MCP
    McpRepository,
    McpClientService,
    // Agents
    AgentsRepository,
    AgentsService,
    AgentRunnerService,
    PromptSecurityService,
    // Análise de atendimento
    AttendanceAnalysisRepository,
    AttendanceAnalysisService,
    // Revisão de conteúdo do assistente
    ContentReviewRepository,
    ContentReviewService,
    ContentReviewExportService,
    // Condutor embutido inbound → assistente (a IA atende por intenção, não por
    // nó de fluxo — o antigo nó AGENT foi removido: a IA não mora mais no fluxo).
    WhatsappAssistantResponderService,
    // Seed
    AiSeedRepository,
    AiProvidersSeedService,
  ],
  // AgentRunnerService exportado pra futura orquestracao externa (workers).
  // ToolRegistryService exportado pra Fase 6: o IspModule registra as tools ISP
  // no MESMO registry (sem que o AiModule importe o IspModule — evita ciclo).
  // Fase 7: LlmProviderService + AiOrchestratorService exportados pro Mapper
  // Inteligente (ResourceModule) e pro Console do Desenvolvedor (DevtoolsModule);
  // ToolRuntimeService exportado pro Console rodar tools do catalogo.
  exports: [AgentRunnerService, ToolRegistryService, LlmProviderService, AiOrchestratorService, ToolRuntimeService],
})
export class AiModule {}
