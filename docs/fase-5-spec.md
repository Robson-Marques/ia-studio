# Fase 5 — AI Platform + Studio (spec de execução)

> Spec normativa da Fase 5. Segue `ARCHITECTURE_LOCK.md` (bloco 6 = AI Platform, bloco 9 = Studio), as diretrizes 10/15/16/17/26/29/31/32 e o princípio reitor (nada de segmento no core). Fonte de porte: `C:\Users\Flowspec\Documents\delivery-system\aquapark` (`aquapark-api/src/modules/automation/{agents,knowledge,memory,tools}`, canvas `admin-panel/src/pages/Configuracoes/Automacao/WorkflowCanvas.jsx`). **Portar = adaptar a organization_id/workspace_id/environment_id + credenciais via Connections do Integration Manager; nunca copiar cego.** Nada específico do Aquapark (SDR, CRM_LEAD, BILLING_*, examples de negócio) entra.

Data: 03/07/2026 · Status: aprovado (Robson decidiu concluir todas as fases em sequência, verificação estática).

---

## 0. Convenções obrigatórias (herdadas das fases 1–4)

- **Namespacing de tabelas:** todos os models novos usam `@@map("ai_*")`.
- **Tenant:** toda tabela operacional carrega `organization_id`; quando o recurso é escopado por ambiente (agente, base de conhecimento, conexão), carrega também `workspace_id` + `environment_id`. Índices `@@index([organization_id, workspace_id, environment_id])`.
- **Schema é a fonte única.** Editar `schema.prisma` + `npx prisma db push --accept-data-loss`. PROIBIDO migrations/ALTER TABLE. PROIBIDO esconder campo com forma definida em `metadata: Json` — coluna explícita.
- **Módulos NestJS:** um arquivo responde uma pergunta; lógica em `*.service.ts`; DB só em `*.repository.ts`; DTOs com class-validator; sem `any`; `Logger` do Nest (nunca `console.log`). Controllers com `@RequirePermissions`. Mutations sensíveis com `@Auditable` (diff, redact de token/api_key/secret).
- **Registries declarativos (diretriz 35):** providers de LLM registram-se num `LlmProviderRegistry` (espelha o `ProviderRegistryService`); tools num `ToolRegistryService`; o nó AGENT registra-se no `NodeRegistryService` existente. Proibido `switch` por tipo espalhado.
- **IA nunca chama API externa direto** (diretriz, CLAUDE.md): credenciais de LLM vivem em **Connections categoria `AI`** do Integration Manager (Secret AES-256-GCM). O `LlmProviderService` resolve a connection → secret → chamada HTTP. Sem SDK oficial de LLM (HTTP puro via `shared/integration/http.util`, padrão Aquapark).
- **Automatismo nasce OFF** (feature flags técnicas default no código; toggles de usuário em `system_settings`).
- **Licensing/Usage:** todo recurso novo consulta `LimitsService` ao criar (limites `ai_agents`, `ai_knowledge_bases`) e registra consumo em `UsageService` (`ai_tokens`, contadores de execução de agente). Métricas registradas no mapa de limites do plano.
- **Front:** React 18 + Vite + **JSX** (não TS). Cores via CSS vars `--ap-*`. Componentes de `components/ui/`. Erros/sucesso via `toast`. Ações destrutivas: 5 patrasques. Serviços em `src/services/*.js` (padrão `api` + `extractErrorMessage`, `normalizeList`). Rotas com `<PermissionRoute perm=...>`. Nav em `Sidebar.jsx` (grupo accordion). `can()` nos botões.

---

## 1. Schema Prisma — models `ai_*` (nascem nesta fase)

Adicionar ao final de `platform-api/prisma/schema.prisma`. **pgvector:** habilitar extensão no schema (ver §1.1).

### 1.1 Habilitar pgvector

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}
```

Coluna de embedding usa tipo nativo via `Unsupported("vector(1536)")` (Prisma não tipa vetores). A busca de similaridade é feita por `$queryRaw` com o operador `<=>` (distância cosseno). Índice HNSW/IVFFlat criado por SQL idempotente no boot do `EmbeddingsService`/`KnowledgeService` (`CREATE INDEX IF NOT EXISTS ... USING hnsw (embedding vector_cosine_ops)`), já que `db push` não cria índice em coluna Unsupported. Se a extensão não existir no banco (dev sem pgvector), o serviço loga warn e cai para similaridade cosseno em aplicação lendo o embedding de uma coluna espelho `embedding_json Json?` (fallback — mesma lógica do Aquapark). **Dimensão default 1536** (OpenAI text-embedding-3-small); configurável por base (`embedding_dim`).

### 1.2 Enums

```
enum AiProviderKind { OPENAI ANTHROPIC GEMINI OLLAMA OPENROUTER GROQ DEEPSEEK MISTRAL AZURE_OPENAI COHERE }
enum AiRunStatus { RUNNING COMPLETED ERROR AWAITING_APPROVAL CANCELLED }
enum AiMemoryScope { SESSION CONTACT WORKFLOW AGENT }
enum AiKnowledgeDocStatus { PENDING PROCESSING READY FAILED }
enum AiApprovalStatus { PENDING APPROVED REJECTED EXPIRED }
enum AiCollaborationOutputMode { CONSULTANT INTERNAL_NOTE }
enum AiCollaborationTriggerMode { ON_DEMAND ALWAYS }
enum McpTransport { STDIO HTTP SSE }
```

### 1.3 Models (campos essenciais — expandir com created_at/updated_at/created_by)

- **`ai_agents`** (`AiAgent`): id, organization_id, workspace_id, environment_id, name, description?, connection_id? (Connection AI — provider das chamadas; null = usa orchestrator), model (string), system_prompt?, persona Json? (`{tone,emojis,brevity,rules_always[],rules_never[]}`), goal?, temperature Float @default(0.3), max_steps Int @default(6), max_tokens Int?, allowed_tools String[] @default([]), knowledge_base_ids String[] @default([]), memory_profile_ids String[] @default([]), action_permissions String[] @default([]), guardrails Json? (`{max_cost_usd_per_run?, blocked_words?[], pii_redact?}`), current_version Int @default(0), is_active Boolean @default(true). Índice tenant. Relations: runs, prompt_versions, collaborations.
- **`ai_agent_prompt_versions`** (`AiAgentPromptVersion`): id, agent_id, version, snapshot Json (system_prompt+goal+model+temperature+persona+allowed_tools+knowledge_base_ids), note?, created_by?, published_at?. `@@unique([agent_id, version])`. (Versionamento git-like — diretriz 3; publicar = apontar current_version; rollback = repontar.)
- **`ai_agent_runs`** (`AiAgentRun`): id, organization_id, workspace_id?, environment_id?, agent_id, execution_id? (correlação com WorkflowExecution da Fase 4), trace_id, status AiRunStatus, input Json?, output String?, messages Json? (transcript completo), error?, provider_kind?, model?, prompt_tokens?, completion_tokens?, total_tokens?, cost_usd Float?, started_at?, finished_at?, created_by?. Índices `[agent_id, created_at desc]`, `[trace_id]`, `[organization_id, created_at]`.
- **`ai_tools`** (`AiTool`): id, organization_id, key (único por org), name, description, category (string: dados/comunicação/documento/sistema...), input_schema Json (JSON Schema), builtin Boolean @default(false), builtin_handler? (nome do handler registrado, p/ tools genéricas), connection_operation? (`{provider_key?, operation}` p/ tools que chamam connection execute), requires_approval Boolean @default(false), timeout_ms Int @default(20000), is_active Boolean. `@@unique([organization_id, key])`.
- **`ai_tool_call_logs`** (`AiToolCallLog`): id, organization_id, agent_run_id, tool_key, arguments Json, result Json?, error?, duration_ms, created_at. Retenção via cron (default 30 dias, configurável em system_settings). Índice `[agent_run_id]`, `[organization_id, created_at]`.
- **`ai_knowledge_bases`** (`AiKnowledgeBase`): id, organization_id, workspace_id, environment_id, name, description?, embedding_connection_id? (Connection AI p/ embeddings; null = orchestrator), embedding_model String @default("text-embedding-3-small"), embedding_dim Int @default(1536), chunk_size Int @default(800), chunk_overlap Int @default(120), is_active Boolean. Relations: documents, chunks, query_logs. Índice tenant.
- **`ai_knowledge_documents`** (`AiKnowledgeDocument`): id, base_id, organization_id, source_type (TXT|URL|PDF|DOCX|MARKDOWN), source_ref? (url/nome), storage_file_id? (via Storage Manager), extracted_text?, status AiKnowledgeDocStatus @default(PENDING), error?, chunk_count Int @default(0). Índice `[base_id]`.
- **`ai_knowledge_chunks`** (`AiKnowledgeChunk`): id, base_id, document_id, organization_id, idx Int, content String, embedding Unsupported("vector(1536)")?, embedding_json Json?, token_count Int?. Índice `[base_id]`, `[document_id]`. (HNSW criado por SQL idempotente.)
- **`ai_knowledge_query_logs`** (`AiKnowledgeQueryLog`): id, base_id, organization_id, trace_id?, agent_id?, query, top_score Float?, result_count Int, created_at. Índice `[base_id, created_at]`.
- **`ai_memory_profiles`** (`AiMemoryProfile`): id, organization_id, workspace_id, environment_id, name, scope AiMemoryScope, description?, max_items Int?, default_ttl_seconds Int?, is_active. Relations: entries.
- **`ai_memory_entries`** (`AiMemoryEntry`): id, profile_id, organization_id, scope_key (contact_id/session_id/agent_id/workflow_id), key, value Json, expires_at?, created_at, updated_at. `@@unique([profile_id, scope_key, key])`. Índice `[profile_id, scope_key]`.
- **`ai_approval_policies`** (`AiApprovalPolicy`, diretriz 31 genérica): id, organization_id, workspace_id?, environment_id?, name, description?, target_type (TOOL|SQL_WRITE|MASS_SEND|COST|ADMIN), condition Json (`{tool_key?, min_recipients?, min_cost_usd?, ...}`), approver_profile_ids String[] @default([]), approver_user_ids String[] @default([]), expires_after_seconds Int?, is_active Boolean @default(false). (Nasce OFF.)
- **`ai_action_approvals`** (`AiActionApproval`): id, organization_id, policy_id?, agent_run_id?, requested_by?, target (string), context Json, status AiApprovalStatus @default(PENDING), decided_by?, decided_at?, reject_reason?, expires_at?, result Json?. Índices `[organization_id, status]`, `[agent_run_id]`.
- **`ai_collaboration_rules`** (`AiCollaborationRule`, diretriz 16): id, organization_id, principal_agent_id, collaborator_agent_id, output_mode AiCollaborationOutputMode @default(CONSULTANT), trigger_mode AiCollaborationTriggerMode @default(ON_DEMAND), label?, is_active. Índice `[principal_agent_id]`.
- **`ai_cost_records`** (`AiCostRecord`, diretriz 17): id, organization_id, workspace_id, environment_id?, agent_id?, provider_kind, model, period (YYYY-MM), tokens_prompt Int @default(0), tokens_completion Int @default(0), cost_usd Float @default(0), updated_at. `@@unique([organization_id, workspace_id, agent_id, provider_kind, model, period])`. (Upsert agregado por run.)
- **`ai_budgets`** (`AiBudget`): id, organization_id, workspace_id, environment_id?, period_kind (MONTHLY), limit_usd Float, alert_threshold_pct Int @default(80), block_on_exceed Boolean @default(false), is_active Boolean @default(false). (Alerta liga OFF por default; bloqueio opcional.)
- **`ai_mcp_servers`** (`AiMcpServer`, diretriz 15 — MCP Client): id, organization_id, workspace_id, environment_id, name, transport McpTransport, endpoint? (url/command), secret_id? (auth), is_active Boolean @default(false), last_sync_at?, discovered_tools Json? (cache de tools/resources/prompts descobertos). (MCP Server = expor tools nossas: fica pós-V1, só o Client entra.)

### 1.4 Mapa de limites do plano (Licensing)

Acrescentar em `Plan.limits`/seed as métricas: `ai_agents` (Starter 2, Pro 20, Enterprise -1), `ai_knowledge_bases` (Starter 1, Pro 10, Enterprise -1), `ai_tokens_month` (Starter 500000, Pro 5000000, Enterprise -1). Features: `ai_studio`, `ai_rag`, `ai_mcp` liga por plano. Seguir o formato já usado na Fase 1 (não inventar novo).

---

## 2. Backend — módulo `src/modules/ai/`

Estrutura (espelha o padrão de `integration/` e `automation/`):

```
ai/
├── ai.module.ts                         # importa IntegrationModule, CommModule, AutomationModule (NodeRegistry/Notification)
├── providers/
│   ├── llm-provider-registry.service.ts # Map<AiProviderKind, ILlmProvider> (espelha ProviderRegistryService)
│   ├── llm.interface.ts                 # ILlmProvider {kind, chat(req), embed?(req)} + tipos LlmMessage/LlmTool/LlmResult
│   ├── llm-provider.service.ts          # fachada: resolve connection AI→secret→delega ao provider certo; normaliza mensagens/tools; calcula cost_usd por tabela de preços
│   ├── pricing.ts                        # tabela de preços por model (prompt/completion USD por 1k tokens) — dado, editável
│   ├── impl/openai.provider.ts           # OpenAI-compatible (serve tb OpenRouter/Groq/DeepSeek/Mistral/Azure via base_url)
│   ├── impl/anthropic.provider.ts
│   ├── impl/gemini.provider.ts
│   └── impl/ollama.provider.ts
│   # OpenRouter/Groq/DeepSeek/Mistral/Azure = OpenAI-compatible: reusam openai.provider com base_url próprio (config da connection).
├── agents/
│   ├── agents.repository.ts
│   ├── agents.service.ts                 # CRUD + versões (draft/publish/rollback) + export/import JSON (sem secrets)
│   ├── agents.controller.ts
│   ├── agent-runner.service.ts           # LOOP tool-calling (porta do Aquapark) — ver §2.1
│   ├── agent-persona.ts                   # compilePersona(persona)→fragmento de system prompt
│   ├── prompt-security.service.ts         # detecção básica de injeção (porta)
│   └── dto/agents.dtos.ts
├── tools/
│   ├── tools.repository.ts
│   ├── tool-registry.service.ts          # registra handlers builtin (in-memory) + resolve tool do catálogo
│   ├── tool-runtime.service.ts           # executeTool: resolve→valida args→executa→loga AiToolCallLog→approval gate
│   ├── builtin-tools.ts                   # handlers genéricos (§2.2)
│   ├── tools.service.ts / tools.controller.ts  # CRUD do catálogo (ai_tools)
│   └── tool-call-log-retention.cron.ts
├── knowledge/
│   ├── knowledge.repository.ts
│   ├── knowledge.service.ts               # CRUD bases/docs + ingest (parse→chunk→embed) + query (RAG)
│   ├── embeddings.service.ts              # gera embedding via LlmProviderService.embed; upsert vetor; busca $queryRaw <=> (fallback JSON cosine)
│   ├── parse-source.ts                     # extrai texto de TXT/MD/URL/PDF/DOCX (pdf-parse, mammoth, http.util)
│   ├── chunker.ts                          # split por chunk_size/overlap
│   └── knowledge.controller.ts
├── memory/
│   ├── memory.repository.ts
│   ├── memory.service.ts                  # read/write escopado + TTL + max_items
│   └── memory.controller.ts
├── orchestrator/
│   └── ai-orchestrator.service.ts         # resolve provider p/ um agente sem connection fixa: fallback + menor custo entre connections AI ativas (diretriz — "fallback/menor custo")
├── approvals/
│   ├── approvals.repository.ts
│   ├── approval-policy.service.ts         # avalia se uma ação exige aprovação (genérico — diretriz 31)
│   ├── approvals.service.ts               # criar/decidir; retoma run
│   └── approvals.controller.ts
├── costs/
│   ├── costs.repository.ts
│   ├── costs.service.ts                   # upsert AiCostRecord por run; consulta orçamento; simulador (diretriz 32)
│   └── costs.controller.ts
├── collaboration/
│   ├── collaboration.repository.ts
│   ├── collaboration.service.ts           # tool consultar_especialista → roda agente colaborador (CONSULTANT/INTERNAL_NOTE)
│   └── collaboration.controller.ts
├── mcp/
│   ├── mcp.repository.ts
│   ├── mcp-client.service.ts              # conecta server, descobre tools, registra como tools do agente (transporte HTTP/SSE; STDIO só metadado na V1)
│   └── mcp.controller.ts
├── nodes/
│   └── agent.nodes.ts                     # registra nó AGENT no NodeRegistryService (§2.3)
├── seed/
│   └── ai-providers-seed.service.ts       # ProviderDefinition categoria AI (openai, anthropic, gemini, ollama, openrouter, groq, deepseek, mistral) com wizardSchema (API key/base_url) + tools builtin no catálogo por org (idempotente)
└── README.md
```

### 2.1 AgentRunnerService — loop de tool-calling (porta do Aquapark, adaptado)

`run({agentId, input, executionId?, traceId, scopeKeys?})`:
1. Carrega `AiAgent` (versão publicada). Resolve provider: `connection_id` do agente OU `AiOrchestratorService.resolve(org, ws, env)`.
2. Compila system prompt = `system_prompt` + `compilePersona(persona)` + contexto RAG (se `knowledge_base_ids`: para a 1ª mensagem do usuário, `KnowledgeService.query` topK e injeta como contexto) + regras de memória.
3. Monta lista de tools = `allowed_tools` resolvidas do catálogo (`ai_tools`) → formato `LlmTool`. Inclui `consultar_faq`, `memory_read/write`, `consultar_especialista` se habilitadas.
4. Cria `AiAgentRun` (RUNNING). Loop até `max_steps`:
   - `LlmProviderService.chat({provider, model, messages, tools, temperature, maxTokens})`.
   - Acumula tokens/custo. Se `guardrails.max_cost_usd_per_run` estourar → encerra com erro.
   - Se `toolCalls[]`: para cada, `ToolRuntimeService.executeTool` (que checa `ApprovalPolicyService`; se exigir aprovação → cria `AiActionApproval`, seta run `AWAITING_APPROVAL`, retorna — retomada via `approvals.service`). Anexa resultado como mensagem `tool` e continua.
   - Senão: resposta final → break.
5. Persiste transcript, status, tokens, `cost_usd`. `CostsService.record(run)` (upsert `ai_cost_records`; checa `ai_budgets` → alerta via Notification Center se ≥ threshold; bloqueia se `block_on_exceed`). `UsageService` registra `ai_tokens`. Emite evento `ai.agent.run.completed` no Event Bus.
6. `resume(runId, approvalResult)`: retoma o loop após aprovação.

### 2.2 Tools genéricas builtin (diretriz 10 — nada de negócio)

`consultar_faq` (RAG: base_id+query→chunks), `memory_read`, `memory_write`, `http_request` (via `shared/integration/http.util`, anti-SSRF), `connection_execute` (porta execute de qualquer provider conectado — reusa `ConnectionsService.execute`), `enviar_whatsapp` (Meta Orchestrator da Fase 3 por tag/departamento), `enviar_notificacao` (Notification Center da Fase 4), `executar_sql` (via connection DATABASE, **read-only por default**, escrita exige ApprovalPolicy), `gerar_documento` (PDF/HTML simples via Storage Manager), `consultar_especialista` (colaboração). Toda tool: input_schema, timeout, `requires_approval`, auditoria (`AiToolCallLog`).

### 2.3 Nó AGENT no NodeRegistry (integra com a Fase 4)

`agent.nodes.ts` registra `type: 'AGENT'`, category `IA`, kind `action`, fields: `agent_id` (select de agentes ativos), `input` (json/textarea com `{{variáveis}}`), outputs `['success','error']`. Executor: `AgentRunnerService.run({agentId, input, executionId: ctx.executionId, traceId: ctx.traceId})`; em `dryRun`, loga e mocka. Registrar em `onModuleInit`, importando `AiModule` no `AutomationModule` **ou** (melhor, p/ evitar ciclo) registrando o nó a partir do `AiModule` que já importa `AutomationModule` e injeta `NodeRegistryService`. Decisão: `ai.module.ts` importa `AutomationModule` (que exporta `NodeRegistryService`? hoje não — **exportar `NodeRegistryService` no `AutomationModule`**) e `agent.nodes.ts` faz o register. Evitar dependência circular: `AutomationModule` NÃO importa `AiModule`.

### 2.4 ai.module.ts / app.module.ts

`AiModule` importa `IntegrationModule` (ConnectionsService/Secrets/Storage), `CommModule` (Meta Orchestrator), `AutomationModule` (NodeRegistry + NotificationCenterService + Event Bus). Exporta `AgentRunnerService`. Registrar `AiModule` em `app.module.ts` **depois** de `AutomationModule`. Seed de providers AI encaixa no fluxo de seed existente (idempotente) — ou `ai-providers-seed.service.ts` com `OnModuleInit` guardado por env/idempotência, seguindo o `provider-seed.service.ts` da Fase 2.

---

## 3. ACL — permissões novas (catálogo + grupo + perfis)

Adicionar em `permissions.constants.ts` (grupo `IA`, label "IA"):

```
ai.agents.read / ai.agents.write / ai.agents.publish / ai.agents.execute
ai.knowledge.read / ai.knowledge.write
ai.memory.read / ai.memory.write
ai.tools.read / ai.tools.write
ai.approvals.read / ai.approvals.decide
ai.costs.read / ai.costs.manage        (manage = orçamentos)
ai.mcp.read / ai.mcp.write
ai.providers.read                       (ver connections AI/health — reusa integrations quando possível)
```

Labels pt-BR de cada uma. `SYSTEM_PROFILES`: Administrador herda tudo (via ALL_PERMISSIONS). Operador (só `.read`) herda os `.read`. Novo perfil de sistema **"Operador de IA"**: `ai.agents.read/write/execute`, `ai.knowledge.read/write`, `ai.memory.read/write`, `ai.tools.read`, `ai.approvals.read`, `ai.costs.read` (sem publish/decide/manage/mcp.write).

---

## 4. Frontend — grupo "IA" + canvas React Flow

### 4.1 Dependência

Adicionar `@xyflow/react` ao `platform-admin/package.json` (canvas). Sem outras libs de UI.

### 4.2 Serviço `src/services/ai.js`

Padrão dos outros serviços (`api` + `extractErrorMessage` + `normalizeList`). Endpoints: agents CRUD/versions/publish/execute/export/import, knowledge bases/docs/ingest/query, memory profiles/entries, tools catalog, approvals list/decide, costs summary/budgets/simulate, mcp servers, providers (connections AI). Além disso `getNodesCatalog` já existe (o nó AGENT aparece automaticamente).

### 4.3 Páginas (`src/pages/IA/`)

- **Agentes.jsx** — lista + criar/editar (Modal com abas: Geral [nome, provider/connection AI, model, temperature, max_steps], Persona [tone/emojis/brevity/regras], Prompt & Objetivo, Ferramentas [multiselect do catálogo + requires_approval], Conhecimento [multiselect de bases], Memória [multiselect de perfis], Aprovações/Guardrails, Custos [orçamento/limite por run]). Ações: Publicar/Rollback (VersionsModal reaproveitando padrão da Fase 4), Testar (ExecuteModal: input → run → transcript + tokens + custo), Exportar/Importar.
- **BasesConhecimento.jsx** — lista bases; detalhe com documentos (upload/URL/texto), status de ingestão, botão "Testar consulta" (query→chunks+score).
- **Memoria.jsx** — perfis de memória (scope, TTL, max_items) + navegar entries por scope_key (read-only).
- **Aprovacoes.jsx** — fila de `AiActionApproval` PENDING; aprovar/rejeitar (com 5 patrasques na rejeição/ação destrutiva) + políticas (`AiApprovalPolicy`) CRUD (nascem OFF).
- **Custos.jsx** — consumo por provider×agente×mês (StatCards + tabela), orçamentos (criar/editar, alerta/bloqueio), simulador pré-publicação (diretriz 32).
- **Ferramentas.jsx** — catálogo de tools (builtin read-only + custom CRUD) e **MCP Servers** (aba): cadastrar server, sincronizar/descobrir tools.
- **Canvas do Studio** — `src/pages/Automacao/FluxoCanvas.jsx` com `@xyflow/react` substituindo o editor em lista vertical (`FluxoEditor.jsx`). Mesmo grafo JSON `{nodes:[{id,type,name,config}], edges:[{from,to,when}]}`. Paleta = `getNodesCatalog()` (inclui AGENT, HTTP_REQUEST, CONDITION, etc.). Nó custom renderiza label + handles por `outputs`. Duplo-clique abre o `NodeConfigModal` existente (reusar). Salvar = nova versão (mesmos endpoints). Referência de padrões: `aquapark/admin-panel/src/pages/Configuracoes/Automacao/WorkflowCanvas.jsx`. Manter `FluxoEditor` como fallback acessível (ou migrar rota). **Preservar** todo o fluxo de versões/publish/dry-run da Fase 4.

### 4.4 Rotas (`App.jsx`) + Nav (`Sidebar.jsx`)

Grupo **"IA"** (ícone `Sparkles`/`Bot`/`BrainCircuit` do lucide) acima de Automação. Itens: Agentes (`/ia/agentes`, `ai.agents.read`), Bases de Conhecimento (`/ia/conhecimento`, `ai.knowledge.read`), Memória (`/ia/memoria`, `ai.memory.read`), Ferramentas (`/ia/ferramentas`, `ai.tools.read`), Aprovações (`/ia/aprovacoes`, `ai.approvals.read`), Custos (`/ia/custos`, `ai.costs.read`). Rotas com `<PermissionRoute>`. Canvas: rota do editor de fluxo aponta pro canvas novo.

---

## 5. Verificação (obrigatória antes de fechar — sandbox Linux)

1. `cp -r` do projeto pra /tmp (evita mexer no mount durante build); `npm install` no api (cache warm; se ENOTEMPTY: `rm -rf node_modules`; timeout 45s → 2-3 tentativas retomando).
2. `npx prisma generate` ✅ (valida schema + Unsupported vector + previewFeatures).
3. `npx tsc --noEmit` → **0 erros** (corrigir NO REPO REAL, não no /tmp).
4. `npm run build` (`vite build`) dos dois fronts ✅ (admin com `@xyflow/react` instalado).
5. Boot da API opcional (falha só por banco inexistente = esperado).

> Nota conhecida: o mount às vezes serve versão truncada de arquivo recém-editado no bash; os arquivos reais no Windows (file tools) estão íntegros — reler via file tools se o build reclamar de conteúdo estranho.

## 6. Documentação de fechamento

`README.md` do módulo `ai/`; entrada no `CHANGELOG.md` (seção não lançada, versão a confirmar com o Robson); `docs/checkpoint-fase-5.md`; atualizar `docs/estado-sessao-*` (marcar Fase 5 ✅, próxima = Fase 6 ISP). Entregar comandos de release PowerShell + **aviso: `db push` desta fase é destrutivo e exige extensão pgvector no Postgres (`CREATE EXTENSION IF NOT EXISTS vector;`)** — documentar no deploy.

## 7. Fora de escopo (não fazer nesta fase)

MCP **Server** (expor nossas tools) = pós-V1. Voice, benchmark/suites de teste salvas, mocks de provider = pós-V1. Nada de SDR/CRM/Billing do Aquapark. Mapper/Resource Model = Fase 6/7. Gateway de pagamento = pós-V1.
