# IA Studio — Plano de Execução (o que será executado)

**Data:** 02/07/2026 · **Status:** aprovado para iniciar · **Local do código:** esta pasta (monorepo novo, nada legado importado)
**Referências:** `RELATORIO-ANALISE-E-ARQUITETURA.md` (análise/arquitetura), `docs/diretrizes-arquiteturais.md` (18 diretrizes + Connection Wizard — revisão do Robson) e `docs/deploy-e-versionamento.md` (fase final)

---

## 1. O que é o produto

Plataforma SaaS de Automação Empresarial, Integrações, IA e Comunicação (nome do produto a definir; **IA Studio é o módulo do editor visual** — diretriz 46), multi-tenant, desacoplada de qualquer ERP. Ela não é dona dos dados de negócio: consulta, transforma, decide e executa ações nos sistemas externos via Integration Manager.

> **Princípio reitor:** a plataforma é totalmente genérica e orientada a integrações. A primeira solução oficial entregue será para o segmento de provedores (ISP), utilizando o Altarede como primeiro Provider ERP. Nenhuma decisão arquitetural poderá depender de um segmento específico; funcionalidades de negócio deverão ser implementadas por meio de Providers, Tools, Resource Extensions e Templates.

## 2. Decisões técnicas aprovadas

| Item | Decisão |
|---|---|
| Stack | NestJS 10 + Fastify + Prisma 5 + PostgreSQL (mesma base madura do Aquapark) |
| Fila | Redis + BullMQ no Automation Engine (retry, DLQ, idempotência, concorrência) — aprovado |
| Vetores (RAG) | pgvector no PostgreSQL |
| Multi-tenant | Workspaces — `workspace_id` em todas as tabelas + guard de escopo |
| Frontend | React 18 + Vite + Tailwind (UI kit e telas WhatsApp/IA Studio portados do Aquapark) |
| Estrutura | Monorepo: `platform-api/` (backend) + `platform-admin/` (**painel do cliente**) + `platform-console/` (**painel administrativo do SaaS**) + `scripts/` + `docs/` |
| Modelo | **SaaS multi-tenant** (Organization → Workspace → Environment), com edição Enterprise/on-premise possível no futuro (diretriz 45) |
| Origem do código | Portar apenas código maduro em produção no Aquapark; reescrever o insuficiente; nada específico de negócio |

## 3. Fases de execução

### ▶️ Fase 0 — Fundação (começa agora)
Scaffold do monorepo, configs (tsconfig, nest-cli, vite, tailwind), `CLAUDE.md` da nova plataforma (regras), `CHANGELOG.md`, `README.md`, schema Prisma inicial.

### ▶️ Fase 1 — Core Platform SaaS (começa agora, junto)
**Entrega: os dois painéis com login funcionando.**
- Backend: auth JWT (portado do Aquapark) com dois tipos de ator (**PLATFORM_ADMIN** do Console vs usuário de organization), hierarquia **Organization → Workspace → Environment** (diretrizes 4 e 36), usuários + **convites (diretriz 37)**, perfis de permissão granular (`dominio.acao`), **Feature Flags com segmentação e validade (diretriz 6)**, **Licensing: planos (Starter/Professional/Enterprise), limites e recursos configuráveis, chave, trial, enforcement central (diretrizes 19/39)**, **schema de Billing: assinaturas, cupons, trial, upgrade/downgrade (diretriz 38; gateway pós-V1)**, **Usage Metering central (diretriz 40)**, **auditoria com diff/IP/user-agent (diretriz 18)**, **OpenAPI/Swagger (diretriz 14)**, crypto AES-256-GCM, seed do admin de plataforma.
- **Painel do Cliente** (`platform-admin`): Login, shell (sidebar + header, dark/light, **seletor de workspace/ambiente**), Usuários e Convites, Perfis de Acesso, Workspaces/Ambientes, **Minha Conta** (plano, licença, consumo — diretriz 42).
- **Console** (`platform-console`): Login de plataforma, gestão de clientes/organizations, planos e limites, licenças, consumo global, feature flags globais (diretriz 41).

### Fase 2 — Integration Manager: Marketplace + Registry + Secrets + Wizard
- **Marketplace de Conectores (diretriz 1):** galeria de providers instaláveis por categoria.
- **Provider Registry (diretriz 2):** interface única `IProvider` (metadata/connect/disconnect/health/execute/discover); nada hardcoded.
- **Secrets Manager como módulo próprio (diretriz 5):** API keys, OAuth com refresh/expiração/reautenticação automáticas, certificados, chaves — escopo workspace+ambiente; conexões referenciam secrets por id.
- **Connection Wizard padrão (spec no doc de diretrizes):** todo provider tem wizard próprio com a mesma UX (autenticar/configurar → testar → salvar).
- N conexões por provider (multi-instância), **máquina de estados** (ativa/desativada/manutenção/token expirado/erro/reconectando/sincronizando/aguardando autenticação — integração nunca é excluída), health check, retry/failover, dashboard.
- **Storage Manager (diretriz 21):** interface `IStorageDriver` com Local + S3-compatível (S3/R2/MinIO) na V1; qualquer módulo salva arquivos por ele.

### Fase 3 — Communication Hub / WhatsApp (Meta oficial-only)
Portado do Aquapark: orquestrador Meta Cloud API multi-número, janela de 24h + smart-send, catálogo de templates, webhook HMAC, inbox/conversas, central de atendimento (equipes, filas, claim/transfer/takeover). Somado (spec Connection Wizard Meta):
- **Wizard Meta com fluxo oficial** (Embedded Signup/OAuth: Facebook → BM → WABA → número → permissões; sem token manual quando o fluxo oficial permitir; modo manual só até a aprovação do App Meta).
- **Descoberta + sincronização contínua** (~10 min): templates bidirecionais, status, qualidade do número, limites, display name, webhooks auto-assinados.
- **Meta Orchestrator:** fluxo nunca conhece número — pede workspace/canal/**tag/departamento**/prioridade e o orchestrator resolve a conexão.
- **Diretriz oficial-only:** nenhuma funcionalidade dependente de recurso não oficial da Meta Cloud API.
- Painel da conexão com health detalhado (webhook/token/OAuth/número/Cloud API/templates) e mensagens do dia.
**Entrega: WhatsApp multi-número operacional.**

### Fase 4 — Automation Engine + Event Bus
- **Event Bus central (diretriz 7):** tudo é evento com envelope padrão (workspace, ambiente, trace_id, source_event_id); Automation/IA/WhatsApp/Email/Webhooks são assinantes; persistência + replay.
- **Broker abstraído (diretriz 8):** interface `IMessageBroker` com BullMQ na V1 (RabbitMQ/Kafka/SQS futuros).
- Motor de workflows (portado) com retry, DLQ, idempotência, concorrência, rate limit, janela de execução.
- **Scheduler Visual (diretriz 12):** "todo dia 08:00", "última sexta", "primeiro dia útil", "a cada 10 min", preview das próximas execuções, calendários personalizados; CRON só no modo avançado.
- **Versionamento de fluxos estilo git (diretriz 3):** v1→v2→v3→publicada→rollback, versões imutáveis, promoção entre ambientes.
- **Execution Monitor (diretriz 13):** módulo exclusivo — status, tempo, logs, retry, payload, resultado, erros, trace end-to-end.
- **Catálogo de Templates geral (diretriz 11):** WhatsApp/Email/SMS/Push/PDF/HTML/Markdown — automação troca só o canal.
- **Notification Center (diretriz 22):** automação chama "Enviar Notificação"; o hub resolve canal + fallback.
- **Sandbox/dry-run (diretriz 27):** execução em DEV/HML sem side effects.
- **Workers separados da API** desde o desenho (modo cluster — diretriz 33; V1 roda 1 worker).
- **Import/Export JSON** de fluxos/templates (diretriz 29; sem secrets no export).
- **Webhooks de saída** assináveis (API pública).

### Fase 5 — AI Platform + IA Studio (visual)
Agent framework portado (loop tool-calling, persona, aprovações humanas, prompt versionado, memória 4 escopos, RAG com pgvector) + providers estendidos (OpenAI, Anthropic, Gemini, Azure, Bedrock, Ollama, LM Studio, OpenRouter, Groq, DeepSeek, Cohere, Mistral) + AI Orchestrator + guardrails. Somado:
- **Biblioteca de Tools registradas (diretriz 10):** consultar cliente/financeiro, enviar WhatsApp/Email, criar OS, consultar estoque, executar SQL (read-only default), executar API, gerar documento, enviar arquivo — todas com schema, timeout, permissão, auditoria.
- **MCP como módulo (diretriz 15):** MCP Client (servers externos viram tools) e depois MCP Server (expor tools do IA Studio).
- **Agentes Colaborativos (diretriz 16):** Supervisor → Financeiro/Suporte/Comercial/Especialista ISP, canvas de equipe de agentes.
- **Custos de IA (diretriz 17):** workspace × provider × agente × mês, orçamento com alerta.
- **Política de Aprovação genérica (diretriz 31):** ação/condição → aprovadores; **Simulador de Custos pré-publicação (diretriz 32)**; **Test Center básico (diretriz 26):** payload de teste + replay; **Import/Export de agentes/tools (diretriz 29)**.
IA Studio = camada visual (canvas React Flow): editor, agentes, ferramentas, publicação, testes, versionamento. IA nunca chama API externa direto — sempre SDK/Integration Manager.

### Fase 6 (adições do bloco 2)
**Resource Explorer (diretriz 23):** navegar nos dados canônicos do ERP sem criar fluxo; **Schema Discovery (diretriz 24):** providers de banco descobrem tabelas/campos/relacionamentos; **Console do Desenvolvedor (diretriz 28):** "Postman interno" para providers/APIs/SQL/tools/IA, com auditoria e permissão própria.

### Fase 7–8 (adições do bloco 2)
**Mapper Inteligente com IA (diretriz 25, sugestão nunca aplica sozinha); Analytics separado de logs (diretriz 34).** Pós-V1 com arquitetura pronta: Billing (20), Biblioteca da Comunidade (30), cluster multi-worker (33), Plugins (35).

### Fase 6 — ⭐ Primeira solução oficial: Provedores (ISP), via Providers/Tools/Extensions (nada no core)
- **AltaredeProvider** (categoria ERP, multi-instância, appkey+token cifrados) consumindo a API existente (`cliente/dados`, `financeiro/boleto_aberto*`, `cliente/acesso`, `conectividade/listar/com_status` com filtros cidade/bairro/concentrador/OLT/slot/CTO, `cliente/desbloqueio`, `os/cadastrar`).
- **Tools do agente IA:** identificar cliente por CPF/CNPJ, analisar débitos, status online/offline, status da região, 2ª via boleto + PIX, desbloqueio por confiança, abertura autônoma de OS.
- **Painel de Manutenção/Incidentes** (nosso lado, cadastro manual): escopo selecionável (cidade/bairro/concentrador/OLT/slot/CTO), vínculos manuais de clientes (incluir/excluir com checkbox), ativação manual. Comunicação configurável por manutenção: **reativo (default)** — agente responde ciente do incidente quando o cliente contata e suprime OS duplicada; **proativo (opcional)** — disparo em massa de template HSM com confirmação e rate limit; ou combinado. Toggles por manutenção: suprimir OS, informar previsão, aviso de normalização, template. Detecção automática de outage **desligada por padrão** (quando ligada, só sugere rascunho).
- **Princípio:** quanto mais configurável melhor — todo automatismo nasce OFF e é ligado pelo usuário.
- Conector PHP de contingência (`iastudio_connector.php`) apenas se a API não cobrir algo.

### Fase 7 — Email + Mapper visual
Gmail/Google Workspace OAuth2 via Connection Wizard (envio, recebimento, pesquisa, rascunhos, anexos, labels, threads), arquitetura pronta para MS365/SMTP/IMAP; Mapper visual do **Resource Model genérico (diretriz 9):** Customer, Person, Company, Product, Order, Invoice, Payment, Contract, Ticket, ServiceOrder, Lead; SDK TypeScript publicável (API pública).

### Fase 8 — Fase final: deploy, painel de Atualização e Backup, dashboards e hardening
- `install.sh` / `uninstall.sh` / `upgrade.sh` (13 fases) / `backup-full.sh` / `restore-full.sh` — modelo Aquapark (detalhes em `docs/deploy-e-versionamento.md`).
- **Painel Configurações > Atualização e Backup:** aplicar versão por tag git com log ao vivo, notificação de versão nova, backup completo/download/upload/restauração.
- Versionamento git com tag anotada + `CHANGELOG.md` (release sempre confirmado com o Robson antes de taggear).
- Dashboards consolidados (integrações, IA, automações, WhatsApp, filas, execuções, custos, tokens, logs), testes E2E, documentação final.

## 4. Documentação contínua (compromisso)

- `CLAUDE.md` do projeto com as regras (criado na Fase 0).
- README por módulo, atualizado durante o desenvolvimento (não depois).
- `CHANGELOG.md` desde a v0.1.0.
- `docs/` com specs de cada fase e checkpoints de estabilização entre frentes estruturais.

## 5. O que NÃO será feito

- Nenhuma cópia automática de módulos do Aquapark (só porte deliberado de código maduro).
- Nada de Digisac (plataforma omnichannel de terceiros — fora do escopo).
- Nenhum dado de negócio armazenado na plataforma (sistemas externos permanecem donos dos dados).
- Nenhum automatismo ligado por padrão.

## 6. Sequência imediata (esta sessão)

1. Fase 0: scaffold completo do monorepo nesta pasta.
2. Fase 1 backend: schema Prisma core + auth + usuários + perfis + workspaces + auditoria + seed.
3. Fase 1 painel: login + shell + telas de usuários/perfis/workspaces.
4. Verificação: type-check do backend e build do painel em sandbox antes de entregar.
5. Checkpoint com o Robson antes de iniciar a Fase 2.
