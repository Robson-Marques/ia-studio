# Relatório de Análise e Arquitetura — Nova Plataforma de Automação, Integrações, IA e Comunicação

**Data:** 02/07/2026
**Fontes analisadas:** `delivery-system/aquapark` (v1.4.0) e `C:\Users\Flowspec\erp` (htdocs)
**Status:** Aguardando aprovação — nenhum código foi copiado ou escrito.

---

## PARTE 1 — ANÁLISE DO AQUAPARK

### 1.1 Stack e arquitetura atual

| Camada | Tecnologia |
|---|---|
| Backend | NestJS 10 + Fastify 4.28, TypeScript 5, monolito modular |
| ORM/Banco | Prisma 5 + PostgreSQL (banco único `aquapark_db`, sem multi-tenant) |
| Eventos | EventEmitter2 em memória (sem RabbitMQ, sem Redis/BullMQ) |
| Auth | JWT HS256 (passport-jwt), senha com scrypt nativo |
| Frontend | React 18 + Vite + Tailwind, @xyflow/react (canvas), Socket.IO, Recharts |
| Deploy | PM2 modo `fork` (adapters WhatsApp em memória por processo) |
| Segurança | AES-256-GCM para credenciais, HMAC-SHA256 no webhook Meta, helmet, rate limit |

Não há SDK da Meta nem libs de LLM — tudo via HTTP/axios (Graph API v25.0, OpenAI e Anthropic REST). Isso é bom: zero lock-in de biblioteca.

### 1.2 Módulos existentes

**Genéricos (candidatos à nova plataforma):**

| Módulo | Local | Maturidade |
|---|---|---|
| WhatsApp Meta Cloud API | `integration/whatsapp/` (20 arquivos) | ✅ Produção |
| Orquestrador multi-conexão | `integration/whatsapp-orchestrator/` (9 arquivos) | ✅ Produção (Meta-only desde 27/06/2026) |
| Central de Atendimento V1 | `integration/whatsapp-attendance/` (16 arquivos) | ✅ Produção (flag ON default) |
| Catálogo de Templates HSM | `integration/whatsapp-template-catalog/` | ✅ Produção (30+ templates) |
| Agentes IA + tool-calling | `automation/agents/` (27 arquivos) | ✅ Produção (v1.8.66) |
| RAG / Knowledge Base | `automation/knowledge/` | ✅ Produção (embeddings em JSON, sem pgvector) |
| Memory Profiles | `automation/memory/` | ✅ Produção (4 escopos) |
| Workflow Engine + Node Registry | `automation/workflow-engine.service.ts`, `node-registry.service.ts` | ✅ Produção |
| Auth/JWT/Permissões | `shared/auth/` + `modules/admin/` | ✅ Produção (perfis + ~999 linhas de permissões) |
| Integrations (CRUD + crypto) | `integration/integrations/` | ✅ Produção (embrião do Integration Manager) |
| Observabilidade | TraceInterceptor, AuditLog, AgentRun (tokens/custo), health/Prometheus | ✅ Produção |

**Específicos do Aquapark (descartar):** `sales/`, `billing/`, `crm/`, `contract/` (D4Sign), `portal/`, `analytics/`, `notification/` (templates por evento de negócio), `integration/sicoob/`, `gateway-transactions/`, `email-inbox/` (lead capture), `admin-tools/`, `validation/`, `help/`, `dev-seed/`.

**Experimental / não levar:** ERA3 multi-agent orchestration/learning (`agent-selector`, `AgentLearning` — schema pronto, sem decisor), nó `SMS_SEND` (registrado sem executor), `automation/sdr/` (bot SDR do negócio), `automation/examples/` (12 seeds com dados Aquapark), `supervisor/`.

**Código morto:** Baileys totalmente removido (resta 1 comentário); RabbitMQ nunca usado; enum `AdminRole` legado (perfis têm precedência).

### 1.3 Acoplamentos que exigem desacoplamento

| Acoplamento | Onde | Ação na nova plataforma |
|---|---|---|
| `lookupCustomerName()` busca `Customer.phone` para enriquecer chat | `whatsapp-chats.repository.ts` | Substituir por Resource Model (`Pessoa`) via Integration Manager |
| Listeners de eventos de negócio (`INVOICE_GENERATED`, `EMAIL_LEAD_*`) disparam WhatsApp | `whatsapp-notifications.service.ts` | Remover — triggers virão do Automation Engine |
| Nós de ação `CRM_LEAD`, `CRM_CUSTOMER`, `BILLING_*` importam services de negócio | `automation/action-nodes/` | Reescrever como nós genéricos (`RESOURCE_ACTION` via SDK/Mapper) |
| Tools de domínio (`gerar_boleto`, `qualificar_lead`, `criar_cliente`) | tool registry | Descartar; manter só tools genéricas (`http_request`, `send_email`, `send_whatsapp`, `consultar_faq`, `memory_*`, `pedir_aprovacao_humana`, `consultar_especialista`) |
| `ScopeInterceptor` escopa por `seller_id`/`manager_id` | `shared/auth/` | Reescrever para escopar por `workspace_id` (multi-tenant) |
| JWT payload carrega `seller_id`/`manager_id` | `jwt.strategy.ts` | Trocar por `workspace_id` + `profile_id` |

### 1.4 Veredicto

**REUTILIZAR (código maduro, portar com adaptação):**
- Cliente Meta Cloud API (`WhatsappMetaService`), `MetaAdapter` + contrato `RichMessage`/`NormalizedMessage`/`ProviderCapabilities` — este contrato já é exatamente o desenho de Communication Hub multi-canal pedido.
- Orquestrador multi-conexão (N números, roteamento por conexão, status persistido) — base do WhatsApp Orchestrator multi-instância.
- Janela de 24h + Smart Send (texto livre vs template HSM, fallback no erro 131047).
- Catálogo/versionamento de templates HSM + webhook com validação HMAC.
- Central de Atendimento (equipes, filas, claim/transfer/takeover, state machine, escopo de visibilidade) — diferencial pronto.
- `LlmProviderService` (contrato único OpenAI/Anthropic com tokens/custo), `AgentRunnerService` (loop tool-calling), `ToolRegistry/ToolRuntime`, persona compiler, `AgentApprovals`, prompt versioning.
- Knowledge/RAG + Memory Profiles.
- Workflow Engine + Node Registry (motor genérico DAG com trace, logs, status).
- Auth completa: JwtStrategy/Guards, PermissionsGuard granular (`dominio.acao`), PermissionProfiles + editor visual do front, crypto AES-256-GCM de credenciais.
- Frontend: Login, shell (Sidebar permissions-aware, Header), 14 componentes de UI, páginas WhatsApp (10 arquivos), IA Studio (canvas React Flow + 15 telas em `Configuracoes/Automacao/`), UsuariosAdmin/PerfisAcesso/PermissionsEditor. Verificado: páginas WhatsApp e IA Studio não importam nada de páginas de negócio.

**DESCARTAR:** todos os módulos de negócio (sales, billing, crm, contract, portal, analytics, notification por evento de negócio, sicoob, gateway, email-inbox, sdr, examples, admin-tools, validation, dev-seed) e o experimental ERA3.

**REESCREVER (conceito bom, implementação insuficiente para a visão):**
- Integration Manager — o módulo `integrations/` atual tem CRUD + crypto + healthcheck, mas é single-instância por tipo e sem máquina de estados. Reescrever com: multi-conexão por provider, estados (ativa/desativada/manutenção/token expirado/erro/reconectando — nunca excluir), retry, failover, versionamento, monitoramento.
- Scheduler — `@nestjs/schedule` puro não atende CRON empresarial (dia útil, calendários, feriados, DLQ, idempotência, concorrência, rate limit). Reescrever sobre BullMQ/Redis.
- Email — só existe SMTP transacional + IMAP acoplado a leads. Criar módulo Google Workspace (Gmail OAuth2) do zero, com arquitetura para MS365/SMTP/IMAP.
- Multi-tenant/Workspaces — não existe no Aquapark. Base nova: `workspace_id` em todas as tabelas, isolamento total.
- AI Providers além de OpenAI/Anthropic (Gemini, Azure, Bedrock, Ollama, OpenRouter, Groq, DeepSeek, Cohere, Mistral) — estender o contrato existente do `LlmProviderService`.
- Vector DB — trocar embeddings JSON + cosseno em app por pgvector.

---

## PARTE 2 — INTEGRAÇÃO COM O ERP ALTAREDE

> **Nota de escopo:** o Digisac é uma plataforma omnichannel de terceiros e **não será importado nem integrado**. O código PHP encontrado em `htdocs/altarede/api/digisac/` serviu apenas como ponto de partida da análise — o que interessa dele é a API do **Altarede** que ele consumia. O objetivo real é: a nova plataforma integrar-se ao **ERP Altarede** como sistema externo dono dos dados.

### 2.1 O que existe na pasta `erp`

A pasta contém o **próprio sistema Altarede** (PHP, MySQL — tabelas `CLIENTE`, `INTEGRACAO_API`, etc.), incluindo **três APIs REST prontas** (Slim Framework v2) e **documentação oficial em PDF**:

| API | Local | Propósito |
|---|---|---|
| **Telefonia/Integração** | `htdocs/altarede/api/telefonia/index.php` (3.474 linhas) | API de integração para sistemas externos — **a principal para a nova plataforma** |
| Sistema | `htdocs/altarede/api/sistema/index.php` | Subconjunto: consulta cliente, envio de fatura, desbloqueio, notificação |
| Central do Assinante | `htdocs/altarede/api/central/index.php` (5.800+ linhas) | API do portal do assinante (login do cliente final, boletos, tickets, pedidos) |
| Documentação | `telefonia/API ALTAREDE SISTEMAS.pdf` + `documentacaotelefonia.pdf` | Docs oficiais dos endpoints |

### 2.2 Contrato da API de Integração (`/altarede/api/telefonia/`)

- **Autenticação:** `appkey` + `token` enviados no corpo JSON de cada request, validados contra a tabela `INTEGRACAO_API` (credencial por integração — já é multi-cliente por natureza).
- **Formato:** `POST` com JSON; resposta `{ "data": [...] }` ou `{ "message": "Sem resultados." }` (404) ou `{ "error": ... }`.

**Endpoints disponíveis (extraídos do código):**

| Grupo | Endpoints |
|---|---|
| Cliente | `POST /cliente/dados`, `/cliente/planos`, `/cliente/acesso` (status bloqueio + conexão), `/cliente/desbloqueio` (desbloqueio de confiança) |
| Financeiro | `POST /financeiro/listar`, `/financeiro/boleto_aberto` (retorna linha digitável, valor, vencimento, URL, PIX copia-e-cola), `/financeiro/boleto_base64`, `/financeiro/boleto_aberto_todos`, `/financeiro/historico`, `/financeiro/boleto_por_email`, `/financeiro/aberto/periodo` |
| Atendimento/OS | `POST /atendimento/cadastrar`, `/atendimento/listar`, `/atendimento/listar_setor`, `/atendimento/listar_motivo_atendimento`, `/atendimento/pesquisar`, `/os/cadastrar` |
| Rede | `POST /conectividade/conectados`, `/conectividade/listar/com_status`, `/conectividade/listar/sem_status`, `/viabilidade/cep` |

### 2.3 Proposta: AltaredeProvider (categoria ERP)

**Não copiar código PHP** — o que se reutiliza é o **contrato da API** (documentado acima + PDFs). Na nova plataforma:

1. **Provider `altarede`** no Integration Manager, categoria ERP. Conexão = `{ base_url, appkey, token }` cifrados (AES-256-GCM). Multi-instância nativa: matriz, filiais ou clientes distintos = N conexões Altarede simultâneas, selecionadas pelo **ERP Orchestrator**.
2. **Health check:** chamada leve (ex.: `/cliente/dados` com CPF de teste ou validação de credencial) alimentando a máquina de estados da conexão (`ACTIVE`/`TOKEN_EXPIRED`/`ERROR`/...).
3. **Mapeamento para o Resource Model** (a plataforma nunca vê campo do ERP):
   - `Pessoa` ← `/cliente/dados` (NOME, CPF, ENDERECO, EMAIL, telefones → campos canônicos via Mapper)
   - `Financeiro.fatura` ← `/financeiro/boleto_aberto*` (boleto, PIX, histórico)
   - `Pedido/Ticket` ← `/os/cadastrar`, `/atendimento/*`
   - `Produto` ← `/cliente/planos`
   - Extensões de domínio ISP: status de conexão (`/cliente/acesso`, `/conectividade/*`), desbloqueio de confiança, viabilidade por CEP
4. **SDK:** `sdk.customer.find({ cpf })`, `sdk.finance.openInvoices()`, `sdk.ticket.create()` → resolvidos pelo ERP Orchestrator → AltaredeProvider → API Altarede.
5. **Casos de uso imediatos de automação/IA** (replicando o que o bot Digisac fazia, agora dentro da nossa plataforma): agente IA no WhatsApp que valida CPF/CNPJ, envia 2ª via de boleto/PIX, executa desbloqueio de confiança, abre OS — tudo via SDK, sem a IA tocar a API diretamente.

O Altarede será o **primeiro provider real do Resource Model/ERP Orchestrator**, validando o Mapper visual com um caso concreto.

### 2.4 Primeira solução oficial — Provedores (ISP)

> **Princípio reitor:** a plataforma é totalmente genérica e orientada a integrações. A primeira solução oficial entregue será para o segmento de provedores (ISP), utilizando o Altarede como primeiro Provider ERP. Nenhuma decisão arquitetural poderá depender de um segmento específico; funcionalidades de negócio deverão ser implementadas por meio de Providers, Tools, Resource Extensions e Templates. O agente IA (via WhatsApp) deve executar, de forma autônoma e sempre via SDK/Integration Manager:

| Capacidade do agente | Endpoint Altarede | Cobertura |
|---|---|---|
| Identificar o cliente (CPF/CNPJ) | `POST /cliente/dados` | ✅ API atual |
| Analisar débitos (boletos em aberto, valores, vencimentos) | `POST /financeiro/boleto_aberto`, `/boleto_aberto_todos`, `/historico` | ✅ API atual |
| Verificar se está online/offline (login, IP, MAC, interface, início da sessão) | `POST /cliente/acesso` | ✅ API atual |
| Checar se a **região** tem problema (% de clientes offline por bairro/cidade/OLT/CTO) | `POST /conectividade/listar/com_status` — filtros: `cidade`, `bairro`, `ip_concentrador`, `interface_concentrador`, `id_olt`, `id_slot`, `id_cto`; retorna NOME, TELEFONE_CELULAR1/2, LOGIN, STATUS | ✅ API atual |
| Enviar 2ª via de boleto + PIX copia-e-cola (e PDF) | `POST /financeiro/boleto_aberto` (PIX/PIX_TXT), `/boleto_base64`, `/boleto_por_email` | ✅ API atual |
| Desbloqueio de conexão por confiança | `POST /cliente/desbloqueio` | ✅ API atual |
| Abrir ordem de serviço autonomamente | `POST /os/cadastrar`, `/atendimento/cadastrar` (+ `listar_setor`, `listar_motivo_atendimento`) | ✅ API atual |
| **Manutenção em massa com informativo** | — | 🏗️ Módulo da plataforma (abaixo) |

**Módulo de Incidentes/Manutenção (painel na plataforma, não no ERP) — tudo configurável e ativável pelo usuário:**

1. **Cadastro manual pelo usuário** no painel: o operador cria a manutenção/incidente escolhendo o **escopo de forma selecionável** — região (cidade/bairro) e/ou elemento de rede (concentrador, OLT, **slot**, CTO), com mensagem, previsão e status (rascunho → ativa → encerrada). Nada dispara sozinho: a manutenção só vale quando o usuário **ativa**.
2. **Vínculos manuais**: além do escopo por filtro, o usuário pode vincular/desvincular clientes específicos manualmente (incluir cliente fora da região, excluir cliente do disparo). A lista de afetados resolvida via `/conectividade/listar/com_status` é exibida com seleção por checkbox antes de qualquer ação.
3. **Modo de comunicação configurável por manutenção** (o padrão é o reativo):
   - **Reativo (recomendado/default):** nenhum disparo em massa — quando um cliente afetado **entra em contato**, o agente IA reconhece que ele está no escopo da manutenção ativa e responde com o informativo ("rede em reparo, previsão X"), suprimindo abertura de OS duplicada.
   - **Proativo (opcional, ativável):** disparo em massa de template HSM aprovado para os afetados selecionados, com confirmação explícita, rate limit configurável e log por destinatário.
   - **Combinado:** proativo na ativação + reativo durante a vigência.
4. **Comportamentos configuráveis por manutenção** (toggles): suprimir abertura de OS (on/off), informar previsão (on/off), avisar normalização no encerramento (on/off), template usado em cada situação (selecionável).
5. **Detecção automática de outage — opcional e desligada por padrão**: se o usuário ativar, o Automation Engine amostra `/conectividade/listar/com_status` por OLT/bairro e, ao passar o limiar configurado de % offline, apenas **sugere** um incidente (rascunho + alerta ao operador). Ativação e disparo continuam sendo decisões humanas.

Princípio da vertical: **quanto mais configurável, melhor** — todo comportamento automático nasce desligado e é ligado por toggle pelo usuário, no padrão já usado no Aquapark (flags com aprovação humana via AgentApprovals).

**Plano de contingência — conector PHP no servidor Altarede:** se surgir necessidade não coberta pela API (ex.: catálogo de OLTs/CTOs/bairros para a UI de escopo, eventos push/webhooks, ações administrativas não expostas), criaremos um **conector PHP simples de arquivo único** (`iastudio_connector.php`), no padrão da casa (Slim/PDO, auth por appkey+token na tabela `INTEGRACAO_API`), versionado no nosso repositório e implantado em `htdocs/altarede/api/iastudio/`. Regra: o conector só **expõe leitura/ação pontual**; nenhuma lógica de negócio da plataforma vive nele.

---

## PARTE 3 — ARQUITETURA DA NOVA PLATAFORMA

### 3.1 Princípios

1. A plataforma **não é dona de dados de negócio** — consulta, transforma, decide e executa via integrações.
2. Tudo é **Workspace-scoped** (multi-tenant lógico, `workspace_id` em toda tabela, isolamento em query + guard).
3. **Toda integração passa pelo Integration Manager**; integrações têm estado, nunca são excluídas.
4. **Fluxos nunca conhecem conexões** — pedem um recurso; o Orchestrator da categoria escolhe a conexão (prioridade, round-robin, custo, tags, disponibilidade, workspace).
5. **IA nunca chama API externa direto** — sempre via Integration Manager/SDK.
6. IA Studio é só a camada visual; execução é 100% Automation Engine.

### 3.2 Módulos

```
platform/
├── core/                    # Login, JWT, usuários, perfis, permissões, auditoria,
│   │                        # configurações, workspaces (multi-tenant)
│   └── (base: shared/auth + modules/admin do Aquapark, reescopado p/ workspace)
│
├── integration-manager/     # REESCRITO sobre o conceito de integrations/
│   ├── providers/           # catálogo de providers (whatsapp-meta, digisac, gmail, openai, ...)
│   ├── connections/         # N conexões por provider, config cifrada AES-256-GCM
│   ├── secrets/             # OAuth2, API keys, certificados, refresh automático
│   ├── state-machine/       # ACTIVE|DISABLED|MAINTENANCE|TOKEN_EXPIRED|ERROR|RECONNECTING
│   └── health/              # health check, retry, failover, logs, versionamento
│
├── communication-hub/
│   ├── channels/whatsapp/   # portado do Aquapark: MetaAdapter, orquestrador,
│   │   │                    # smart-send 24h, templates HSM, webhook HMAC, inbox
│   ├── channels/email/      # NOVO: Gmail OAuth2 (enviar/receber/buscar/rascunhos/
│   │   │                    # anexos/labels/threads); arquitetura p/ MS365/SMTP/IMAP
│   │   └── (telegram/instagram/messenger/sms/push/voz — interfaces reservadas)
│   ├── conversations/       # inbox unificado multi-canal
│   └── attendance/          # equipes, filas, claim/transfer/takeover (portado)
│
├── orchestrators/           # 1 por categoria: WhatsApp, Email, ERP, Database, AI, Webhook
│   └── (política: priority | round_robin | least_cost | least_used | tags | rules)
│
├── automation-engine/       # motor de execução (NÃO é o IA Studio)
│   ├── triggers/            # scheduler, webhook, API, whatsapp, email, banco, evento, manual, IA
│   ├── scheduler/           # CRON + dia útil, primeira segunda, última sexta,
│   │   │                    # calendários custom (feriados/férias), janelas de execução
│   ├── engine/              # portado: workflow-engine + node-registry (DAG, trace)
│   └── reliability/         # BullMQ/Redis: retry, DLQ, idempotência, concorrência,
│                            # rate limit, histórico de execução
│
├── ai-platform/             # separado do IA Studio
│   ├── providers/           # contrato único (portado do LlmProviderService) estendido:
│   │                        # OpenAI, Anthropic, Gemini, Azure, Bedrock, Ollama,
│   │                        # LM Studio, OpenRouter, Groq, DeepSeek, Cohere, Mistral
│   ├── orchestrator/        # AI Orchestrator (fallback, custo, disponibilidade)
│   ├── prompts/             # prompt management + versionamento (portado)
│   ├── memory/              # portado (SESSION/CONTACT/WORKFLOW/AGENT)
│   ├── rag/                 # portado + pgvector
│   ├── guardrails/          # prompt-security (portado) + policies
│   ├── mcp/                 # cliente MCP para tools externas
│   └── observability/       # tokens, custo, trace (portado do AgentRun)
│
├── ia-studio/               # SOMENTE visual: editor (React Flow portado), agentes,
│                            # ferramentas, publicação, testes, versionamento
│
├── resource-model/          # modelo canônico: Pessoa, Pedido, Produto, Financeiro,
│   │                        # Contrato, Fornecedor, Usuário
│   └── mapper/              # mapeamento visual campo-ERP → campo-canônico
│
├── sdk/                     # sdk.customer.find(), sdk.order.list(), sdk.email.send(),
│                            # sdk.whatsapp.send(), sdk.ai.chat() — cada provider
│                            # implementa sua versão; única porta de saída p/ IA e fluxos
│
└── dashboards/              # integrações, IA, automações, whatsapp, email, filas,
                             # execuções, health, custos, tokens, logs
```

### 3.3 Decisões técnicas propostas

| Decisão | Proposta | Racional |
|---|---|---|
| Stack | NestJS 10 + Fastify + Prisma + PostgreSQL (mesma do Aquapark) | Maximiza reuso do código maduro |
| Fila | **Redis + BullMQ** (divergência deliberada do Aquapark) | Retry/DLQ/idempotência/concorrência do Automation Engine não são viáveis só com EventEmitter2 em memória |
| Vetores | PostgreSQL + pgvector | RAG escalável sem novo banco |
| Multi-tenant | Banco único, `workspace_id` obrigatório + guard/interceptor de escopo | Reescrita do ScopeInterceptor atual |
| Front | React 18 + Vite + Tailwind + React Flow (portar shell, UI kit, páginas WhatsApp/IA Studio/usuários) | Já maduro e desacoplado de negócio |
| Repositório | Monorepo novo (`platform-api`, `platform-admin`) | Nada legado importado automaticamente |

---

## PARTE 4 — ROADMAP TÉCNICO

### Fase 0 — Fundação (1–2 semanas)
Monorepo, scaffolding NestJS/Prisma/Vite, CI, Redis/BullMQ, pgvector, convenções (CLAUDE.md da nova plataforma).

### Fase 1 — Core Platform (2–3 semanas)
Workspaces multi-tenant; portar auth (JWT, guards, perfis, permissões `dominio.acao` — redefinidas para o novo domínio); usuários; auditoria; tela de login + shell + UsuariosAdmin/PerfisAcesso/PermissionsEditor no front. **Entrega: painel com login, usuários e perfis funcionando.**

### Fase 2 — Integration Manager (2–3 semanas)
Providers, connections multi-instância, crypto de secrets (portada), OAuth2 framework, máquina de estados, health check, retry/failover, dashboard de integrações.

### Fase 3 — Communication Hub / WhatsApp (2–3 semanas)
Portar orquestrador Meta multi-conexão, smart-send/janela 24h, templates HSM, webhook, inbox/conversas, central de atendimento; conexões gerenciadas pelo Integration Manager; WhatsApp Orchestrator com políticas de seleção. **Entrega: WhatsApp multi-número operacional.**

### Fase 4 — Automation Engine (3–4 semanas)
Portar workflow engine/node registry sobre BullMQ; triggers (scheduler empresarial com calendários, webhook, API, evento, manual); retry/DLQ/idempotência/concorrência/rate limit; histórico de execuções + dashboard.

### Fase 5 — AI Platform + IA Studio (3–4 semanas)
Portar LlmProvider/AgentRunner/ToolRegistry/Memory/RAG (com pgvector); estender providers (Gemini, Ollama, OpenRouter, Groq, ...); AI Orchestrator; guardrails; portar canvas React Flow e telas do IA Studio; tools somente genéricas via SDK.

### Fase 6 — Vertical ISP: Altarede + agente de provedores (3–4 semanas) ⭐ foco da V1
**AltaredeProvider** (ERP Orchestrator, multi-instância); Resource Model mínimo (Pessoa, Financeiro, Ticket, Conectividade) + SDK; tools do agente ISP (identificar cliente, débitos, status online, status da região, 2ª via/PIX, desbloqueio de confiança, abrir OS); **módulo de Incidentes/Manutenção em massa** com informativo via WhatsApp e supressão de OS; detecção proativa de outage com aprovação humana; conector PHP se necessário (seção 2.4).

### Fase 7 — Email + Mapper visual completo (2–3 semanas)
Módulo Gmail/Google Workspace OAuth2; Email Orchestrator; Mapper visual genérico do Resource Model.

### Fase 8 — Dashboards, observabilidade e hardening (2 semanas)
Dashboards consolidados (custos, tokens, filas, health), trace end-to-end, testes E2E, documentação.

**Total estimado: 20–26 semanas.** Fases 1–3 entregam o escopo inicial (painel + WhatsApp) em ~7–9 semanas; a **V1 para provedores** fecha ao fim da Fase 6.

---

## PRÓXIMO PASSO

Aguardando sua aprovação (ou ajustes) sobre: (1) decisões técnicas da seção 3.3 — especialmente a adoção de Redis/BullMQ; (2) ordem das fases; (3) nome/estrutura do novo monorepo. Só depois disso inicia a codificação.

*Anexo: `ANEXO-ANALISE-BACKEND-AQUAPARK.md` (análise detalhada arquivo a arquivo do backend).*
