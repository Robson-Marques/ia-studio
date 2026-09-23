# Módulo `ai/` — AI Platform + Studio (Fase 5)

Plataforma de IA dedicada e orientada a integrações: agentes com loop de
tool-calling, RAG (pgvector), memória, aprovações, colaboração entre agentes e
MCP Client. **Nada de segmento** no core — as
capacidades de negócio entram por Providers/Tools/Templates.

## Princípios herdados
- Tabelas `ai_*` pertencem implicitamente à instalação dedicada.
- Credenciais de LLM vivem em **Connections categoria AI** (Secret AES-256-GCM). A IA nunca chama a API externa direto — passa pelo `LlmProviderService` (HTTP puro, sem SDK).
- Automatismos nascem OFF: `AiApprovalPolicy.is_active=false`, `AiMcpServer.is_active=false`.
- Registries declarativos (diretriz 35): `LlmProviderRegistryService`, `ToolRegistryService`, nó `AGENT` no `NodeRegistryService`.

## Submódulos
- **providers/** — `ILlmProvider` + registry; impl OpenAI-compatible (serve OpenRouter/Groq/DeepSeek/Mistral/Azure via `base_url`) e Anthropic; `LlmProviderService` (fachada connection→secret→provider).
- **orchestrator/** — `AiOrchestratorService`: resolve a melhor Connection AI ativa (fallback/menor custo) quando o agente não fixa `connection_id`.
- **agents/** — CRUD + versões (draft/publish/rollback) + export/import (sem secrets); `AgentRunnerService` (loop tool-calling); `agent-persona`, `prompt-security`.
- **tools/** — catálogo (`ai_tools`), `ToolRegistryService` (handlers builtin), `ToolRuntimeService` (resolve→gate de aprovação→executa→loga), `builtin-tools.ts` (genéricas: consultar_faq, memory_read/write, http_request, connection_execute, enviar_whatsapp, enviar_notificacao, executar_sql, gerar_documento, consultar_especialista), cron de retenção de logs.
- **knowledge/** — RAG: bases/documentos/chunks; `EmbeddingsService` (pgvector `<=>` + fallback cosseno em `embedding_json`; índice HNSW idempotente no boot); `parse-source` (TXT/MD/URL nativo; PDF/DOCX via libs opcionais), `chunker`.
- **memory/** — perfis escopados (SESSION/CONTACT/WORKFLOW/AGENT) com TTL/max_items.
- **approvals/** — política genérica (diretriz 31) + fila de aprovações; `ApprovalPolicyService.evaluate` decide se uma ação exige revisão.
- **collaboration/** — regras entre agentes (diretriz 16); `consult()` recebe o `runAgent` por parâmetro (evita ciclo com o runner).
- **mcp/** — MCP Client (diretriz 15): cadastra servidor, sincroniza/descobre tools (HTTP/SSE via JSON-RPC; STDIO só metadado na V1).
- **nodes/** — nó `AGENT` (integra com a Automação — Fase 4). O `AiModule` importa o `AutomationModule` (que exporta `NodeRegistryService`); a Automação NÃO importa o `AiModule`.
- **seed/** — registra os providers LLM (OpenAI, Anthropic) no boot e semeia as tools builtin no catálogo local. Marketplace de IA fica só com OpenAI e Anthropic.

## pgvector (deploy)
O `db push` desta fase exige a extensão no Postgres:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```
Sem ela, o RAG cai automaticamente para similaridade cosseno em aplicação
(lendo `embedding_json`) — mais lento, porém funcional.

## Rotas (para o front)
`ai/agents` (CRUD, `/:id/versions`, `/:id/publish`, `/:id/execute`, `/:id/runs`, `/:id/export`, `import`),
`ai/knowledge/bases` (+ `/:id/documents`, `/:id/query`),
`ai/memory/profiles` (+ `/:id/entries`),
`ai/tools`, `ai/approvals` (+ `/policies`, `/:id/decide`),
`ai/collaboration`, `ai/mcp` (+ `/:id/sync`, `/:id/tools`).
O nó `AGENT` aparece automaticamente em `automation/workflows/nodes/catalog`.
