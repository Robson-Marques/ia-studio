# Checkpoint — Fase 5 (AI Platform + Studio) — 03/07/2026

## Entregue (código completo, conforme `docs/fase-5-spec.md`)

### Backend (`platform-api/src/modules/ai/` — 55 arquivos)
- **Schema:** pgvector habilitado; 16 models `ai_*` + 8 enums. Chunk com coluna `vector(1536)` (Unsupported) + espelho `embedding_json` (fallback cosseno em app).
- **Providers multi-LLM:** registry declarativo + fachada (Connection AI → Secret → HTTP puro; custo por tabela de preços). OpenAI, Anthropic, Gemini, Ollama; OpenRouter/Groq/DeepSeek/Mistral/Azure via OpenAI-compatible (`base_url`). AI Orchestrator (fallback/menor custo).
- **Agentes:** CRUD + versões imutáveis (publish/rollback) + export/import; `AgentRunnerService` (loop tool-calling, RAG, gate de aprovação com pausa/resume, guardrail de custo, custo/consumo/evento). Persona + prompt-security.
- **Tools genéricas** (diretriz 10) + registry/runtime + log com retenção. **RAG** pgvector com fallback. **Memória** 4 escopos. **Aprovações** genéricas (diretriz 31, OFF). **Custos/orçamento/simulador** (17/32). **Colaboração** (16). **MCP Client** (15). **Nó AGENT** no NodeRegistry (Automation exporta o registry).
- **ACL:** grupo "IA" (17 perms) + perfil "Operador de IA". Limites `ai_agents`/`ai_knowledge_bases`/`ai_tokens_month` + features `ai_studio`/`ai_rag`/`ai_mcp`.

### Frontend (`platform-admin`)
- `services/ai.js`; páginas `pages/IA/` (Agentes + editor multi-aba/versões/executar, BasesConhecimento, Memoria, Ferramentas+MCP, Aprovacoes, Custos); **canvas React Flow** `pages/Automacao/FluxoCanvas.jsx` (`@xyflow/react`, mesmo grafo JSON, editor em lista como fallback). Rotas `/ia/*` + grupo "IA" no Sidebar. `@xyflow/react` adicionado ao package.json.

## Verificação — ⚠️ PENDENTE (bloqueada por infra, não por decisão)
O gate estático exigido (`npx prisma generate`, `npx tsc --noEmit` 0 erros, `vite build` dos fronts) **não pôde ser executado nesta sessão**: o mount entre o workspace e o sandbox Linux serviu apenas metadados de diretório — leituras de conteúdo (`cat`/`head`) de arquivos pré-existentes retornaram "No such file", impossibilitando copiar o projeto pro sandbox e buildar. (Só arquivos escritos na própria sessão sincronizavam.)

**Revisão estática executada via file tools (o que deu pra conferir sem compilar):**
- Todos os imports cross-module do `ai/` resolvem a exports reais: `PrismaService`, `AuditLogService`, `EventBusService`, `RequirePermissions`, `CurrentUser`, `AuthenticatedUser`, `httpRequest`, `resolveOrganizationId`, `assertSameOrg`, `validateWorkspaceScope`, `WizardSchema`.
- Wiring de módulo coerente: `AutomationModule` exporta `NodeRegistryService`+`NotificationCenterService`; `AiModule` importa Integration/Comm/Automation e registra o nó AGENT; sem ciclo (Automation não importa Ai). `AiModule` registrado em `app.module.ts` após `AutomationModule`.
- Front: imports de `services/ai` batem com os exports; UI kit e classes CSS conferidos contra arquivos-modelo.

**Residual não verificável sem compilar:** erros de tipo internos aos serviços novos e nomes exatos de campos Prisma nas queries dos repositories/services `ai_*`. São a fonte mais provável de erros pontuais de `tsc`.

## Ação necessária antes do release
Rodar no servidor (ou máquina com Node) a partir de `platform-api`:
```
npm install
npx prisma generate
npx tsc --noEmit      # corrigir eventuais erros pontuais
```
e em `platform-admin`:
```
npm install           # baixa @xyflow/react
npm run build
```
No deploy/`db push`: **`CREATE EXTENSION IF NOT EXISTS vector;`** no `iastudio_db` antes do `npx prisma db push --accept-data-loss` (destrutivo). Sem a extensão, o RAG cai no fallback JSON (funciona, mais lento).

## Próxima frente
Fase 6 — Solução ISP (AltaredeProvider real + tools do agente + painel Manutenção/Incidentes), tudo como extensão (nada de ISP no core).
