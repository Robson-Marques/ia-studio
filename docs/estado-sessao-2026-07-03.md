# Estado da Sessão — 03/07/2026 (handoff para o próximo chat)

> **Instrução ao próximo Claude:** leia este arquivo, depois `CLAUDE.md`, `ARCHITECTURE_LOCK.md`, `docs/plano-de-execucao.md` e `docs/diretrizes-arquiteturais.md` (58 diretrizes) ANTES de qualquer código. A arquitetura está CONGELADA — mudança estrutural só via RFC em `docs/rfcs/`.

## O que é o projeto

**IA Studio** — plataforma SaaS multi-tenant de Automação Empresarial, Integrações, IA e Comunicação. Monorepo NESTA pasta: `platform-api` (NestJS 10 + Fastify + Prisma/PostgreSQL + BullMQ/Redis), `platform-admin` (painel do cliente, React 18 + Vite + Tailwind), `platform-console` (console do SaaS, isolado). Princípio reitor: plataforma 100% genérica; primeira solução oficial = provedores ISP com Altarede como primeiro Provider ERP; nada de segmento no core.

Código maduro é PORTADO do Aquapark (`C:\Users\Flowspec\Documents\delivery-system\aquapark`) — nunca copiado cegamente, sempre adaptado a organization_id/workspace_id/environment_id. A API do ERP Altarede está documentada em `RELATORIO-ANALISE-E-ARQUITETURA.md` Parte 2 (fonte: `C:\Users\Flowspec\erp\htdocs\altarede\api\telefonia\index.php`).

## Decisão do Robson nesta sessão

**Sem testes agora** — concluir TODAS as fases restantes em sequência (verificação apenas estática: `prisma generate` + `tsc --noEmit` 0 erros + `vite build`), terminando no **sistema de instalação** (fase final). Ajustes de runtime ficam para o primeiro deploy.

## Status das fases

| Fase | Status | Conteúdo |
|---|---|---|
| 0 — Fundação | ✅ | Monorepo, CLAUDE.md, docs, ARCHITECTURE_LOCK.md |
| 1 — Core SaaS | ✅ verificada | Auth 2 atores, Organization→Workspace→Environment, convites, perfis, flags, auditoria com diff, Licensing (planos/limites/trial/chave), Billing schema, UsageService, seed, 2 painéis logando |
| 2 — Integration Manager | ✅ verificada | Marketplace, ProviderRegistry (IProvider), Connections com 8 estados (nunca deleta), Secrets AES-256-GCM, Storage (Local+S3 SigV4), wizard declarativo, telas |
| 3 — WhatsApp Meta | ✅ verificada | Provider whatsapp-meta, Meta Orchestrator (por tag/departamento), janela 24h + fallback 131047, webhook HMAC multi-tenant, templates bidirecionais + sync 10min, Central de Atendimento completa, telas (Conversas/Templates/Equipes/Números) |
| 4 — Automation Platform | ✅ implementada (ver CHANGELOG "Não lançado") | Event Bus (envelope + dedup + replay), IMessageBroker/BullMQ (DLQ/retry/idempotência; fallback memória sem Redis), worker.ts separado (WORKER_INLINE default on em dev), Workflow Engine com versões imutáveis/rollback/dry-run, 13 nós no NodeRegistry, Scheduler visual (dia útil/calendários/preview), Execution Monitor, Templates multi-canal, Notification Center, webhook de fluxo, export/import, telas Automação + sino |
| 5 — AI Platform + Studio | ✅ implementada (⚠️ verificação estática PENDENTE — mount não serviu conteúdo; ver `docs/checkpoint-fase-5.md` e `docs/fase-5-spec.md`) | Módulo `ai/` (providers multi-LLM, agents+runner, RAG pgvector, memória, tools, orchestrator, approvals, custos, colaboração, MCP Client), nó AGENT, ACL grupo IA, front grupo IA + canvas React Flow |
| 6 — Solução ISP | ✅ implementada (⚠️ gate estático pendente — ver `docs/fase-6-spec.md`, CHANGELOG) | AltaredeProvider completo + tools do agente ISP + módulo `isp/` (Manutenção/Incidentes: reativo/proativo/combinado, OFF por default) + front |
| 7 — Email + Resource Model | ✅ implementada (⚠️ gate estático pendente — ver `docs/fase-7-spec.md`, CHANGELOG) | Gmail OAuth2 + SMTP real + EMAIL_SEND real; Resource Model + Mapper Inteligente + Explorer; Console do Desenvolvedor; Developer Center (Public API + API Keys) + front |
| 8 — FINAL: instalação | ✅ implementada (⚠️ gate estático roda no servidor via install/upgrade — ver `docs/fase-8-spec.md`, `docs/checkpoint-fase-8.md`) | scripts/ (install/uninstall/upgrade 13 fases/backup-full/restore), módulo `system/` + Console Atualização/Backup, dashboards consolidados |

> **TODAS AS 8 FASES IMPLEMENTADAS.** Falta apenas: (1) rodar o gate estático + `db push` no servidor (via `scripts/install.sh`), (2) confirmar o número da versão com o Robson e taggear o release. Ver `docs/checkpoint-fase-8.md`.

## Como as fases foram executadas (repetir o método)

1 subagente general-purpose por fase, com prompt contendo: repo + docs a ler + referência do Aquapark a portar + spec detalhada (schema com namespacing, módulos, permissões novas no catálogo + SYSTEM_PROFILES, telas) + **verificação obrigatória em sandbox** (`cp -r` do projeto pra /tmp, `npm install` — cache warm, se ENOTEMPTY: `rm -rf node_modules`; `npx prisma generate && npx tsc --noEmit` até 0 erros corrigindo NO REPO REAL; `npm run build` dos fronts). O bash do sandbox tem timeout de 45s — npm install grande precisa de 2-3 tentativas (retoma). Nota conhecida: o mount às vezes serve versão truncada de arquivo recém-editado no bash; os arquivos reais no Windows (file tools) estão íntegros.

## Specs das fases restantes (resumo — detalhes nos docs normativos)

**Fase 5 — AI Platform + Studio (diretrizes 10, 15, 16, 17, 26, 31, 32):** portar do Aquapark `aquapark-api/src/modules/automation/agents|knowledge|memory|tools` (LlmProviderService, AgentRunnerService loop tool-calling, ToolRegistry/Runtime, persona, approvals, prompt versions). Adaptar multi-tenant (`ai_*`). Providers: OpenAI + Anthropic portados; adicionar Gemini/Ollama/OpenRouter/Groq/DeepSeek/Mistral (contrato único; credenciais via Connections do Integration Manager categoria AI). AI Orchestrator (fallback/menor custo). RAG com **pgvector** (extensão; embeddings via provider). Memória 4 escopos. Tools genéricas (http/connection_execute/whatsapp/notify/consultar_faq/memory) com requires_approval + ApprovalPolicy genérica (diretriz 31). Custos por org×provider×agente×mês + orçamento com alerta (diretriz 17) + simulador pré-publicação (32). MCP Client como módulo (15). Agentes colaborativos (16, portar CollaborationService). Nó AGENT no NodeRegistry. Front: grupo "IA" (Agentes com persona/tools/aprovações/custos, Bases de Conhecimento, Memória, Aprovações pendentes) + **canvas React Flow** (@xyflow/react) substituindo o editor de lista da Fase 4 (mesmo grafo JSON; referência `aquapark/admin-panel/src/pages/Configuracoes/Automacao/WorkflowCanvas.jsx`).

**Fase 6 — ISP (RELATORIO Parte 2.4 + diretrizes 50):** completar AltaredeProvider (já tem stub HTTP na Fase 2 com 6 operações) com discover + mapeamento canônico básico; tools do agente: identificar_cliente (CPF/CNPJ), consultar_debitos, status_conexao, status_regiao (conectividade com filtros cidade/bairro/OLT/slot/CTO), segunda_via_boleto (+PIX), desbloqueio_confianca, abrir_os; **painel Manutenção/Incidentes** (module `incidents/`): cadastro manual, escopo selecionável, vínculos manuais com checkbox, modos reativo (default)/proativo (disparo em massa HSM com confirmação + rate limit)/combinado, toggles (suprimir OS/previsão/normalização/template), detecção automática OFF por default (só sugere rascunho); agente consulta incidente ativo antes de abrir OS. Tudo como extensão — nada de ISP no core.

**Fase 7 — Email + Resource Model (diretrizes 9, 23, 24, 25, 28):** provider google-workspace (OAuth2: envs GOOGLE_CLIENT_ID/SECRET; envio/leitura/busca/labels/threads via Gmail API) + smtp real (nodemailer); EMAIL_SEND real no engine + Notification Center; Resource Model canônico + mapper (Altarede→Customer/Invoice/Ticket); Resource Explorer read-only; Console do Desenvolvedor (Postman interno); Developer Center (API keys — diretriz 57).

**Fase 8 — FINAL (docs/deploy-e-versionamento.md tem a spec completa):** scripts/install.sh (Node 20, PostgreSQL 15+pgvector, Redis, Nginx, banco `iastudio_db`, .env gerado, db push, builds, seed com verificação, PM2 `iastudio-api` + `iastudio-worker`), uninstall.sh (PURGE), upgrade.sh (13 fases com log em system_upgrades), backup-full.sh/restore-full.sh (systemd-run, manifest com segredos), models SystemUpgrade/SystemRestore, **painel Console → Atualização e Backup** (aplicar tag git com log ao vivo via polling, backup/download/upload/restore com 5 patrasques), dashboards consolidados (execuções, custos IA, tokens, filas, health), CHANGELOG + tag `v1.0.0` (CONFIRMAR número com o Robson antes de taggear).

## Pendências conhecidas (além das fases)

- **Fase 5 sem gate estático executado** (mount não serviu conteúdo ao sandbox): rodar `prisma generate` + `tsc --noEmit` (api) e `vite build` (fronts) antes do release; corrigir erros pontuais de tipo/campo Prisma nos serviços `ai_*`. `db push` da Fase 5 exige `CREATE EXTENSION IF NOT EXISTS vector;`. Detalhes em `docs/checkpoint-fase-5.md`.
- Runtime nunca testado com Postgres/Redis reais (decisão consciente) — primeiro deploy vai exigir rodada de correções.
- Contratos front↔API de endpoints secundários tratados defensivamente no front (ver `docs/checkpoint-fase-1.md`).
- Embedded Signup Meta = passo informativo até existir App Meta aprovado (wizard manual funciona).
- EMAIL_SEND é stub até a Fase 7. `@fastify/static` foi adicionado ao package.json (necessário).
- Seeds: Console `admin@iastudio.local`/`admin123`; org demo `admin@demo.local`/`demo123`.
- CHANGELOG tem seção "Não lançado (Fases 3-4)" — versão a confirmar com o Robson no release.

## Regras de convivência com o Robson (importantes)

Responder sempre em pt-BR. Máquina dele não tem Node — nunca pedir build local. Confirmar número de versão antes de qualquer tag. Todo automatismo nasce OFF. Quanto mais configurável, melhor. Ele revisa arquitetura em blocos — mudanças novas viram RFC (ARCHITECTURE_LOCK.md).
