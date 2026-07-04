# CLAUDE.md — REGRA MÁXIMA DO PROJETO IA STUDIO

> Plataforma SaaS multi-tenant de Automação Empresarial, Integrações, IA e Comunicação.
> Toda IA/desenvolvedor que atuar neste projeto DEVE seguir estas regras sem exceção.
> Documentos normativos: `docs/plano-de-execucao.md`, `docs/diretrizes-arquiteturais.md` (58 diretrizes), `docs/deploy-e-versionamento.md`, `RELATORIO-ANALISE-E-ARQUITETURA.md`.

## 🇧🇷 IDIOMA
Sempre responder em pt-BR. Identificadores de código em inglês (kebab-case arquivos, PascalCase classes, camelCase funções, snake_case tabelas). Mensagens de UI/log em pt-BR.

## ⚖️ PRINCÍPIO REITOR
A plataforma é totalmente genérica e orientada a integrações. A primeira solução oficial é para provedores (ISP) com o Altarede como primeiro Provider ERP. **Nenhuma decisão arquitetural pode depender de segmento específico** — funcionalidade de negócio entra via Providers, Tools, Resource Extensions e Templates. A plataforma NUNCA é dona de dados de negócio.

## 🏗️ ESTRUTURA DO MONOREPO
```
├── CLAUDE.md / CHANGELOG.md / README.md
├── docs/                    # specs, diretrizes, checkpoints
├── scripts/                 # install/uninstall/upgrade/backup (fase final)
├── platform-api/            # NestJS 10 + Fastify + Prisma (monolito modular + workers)
├── platform-admin/          # React 18 + Vite + Tailwind — PAINEL DO CLIENTE
└── platform-console/        # React 18 + Vite + Tailwind — CONSOLE do SaaS (NUNCA compartilha componentes de negócio com o admin; só UI kit básico)
```

## 🔒 BANCO DE DADOS
- PostgreSQL único `iastudio_db` + pgvector. `schema.prisma` é a fonte única da verdade.
- **PROIBIDO** migrations/`ALTER TABLE`. Evolução = editar schema + `npx prisma db push --accept-data-loss`.
- **PROIBIDO** esconder campo com forma definida em `metadata: Json` — coluna explícita.
- Namespacing: `core_*`, `licensing_*`, `billing_*`, `integration_*`, `comm_*`, `automation_*`, `ai_*`, `system_*`.
- **TODA tabela operacional carrega `organization_id` (tenant) e, quando aplicável, `workspace_id` + `environment_id`.** Hierarquia: Organization → Workspace → Environment (diretrizes 4/36).

## 📦 ARQUITETURA
- Monolito modular NestJS + **workers BullMQ em processos separados** (estado em Redis/Postgres, nunca em memória do processo — diretriz 33).
- Comunicação entre módulos: injeção de dependência + **Event Bus** (diretriz 7; envelope: event, organization_id, workspace_id, environment_id, trace_id, source_event_id, payload mínimo). Broker via `IMessageBroker` (BullMQ na V1) — nenhum módulo importa BullMQ direto.
- Providers só via **Provider Registry** com interface `IProvider` (metadata/connect/disconnect/health/execute/discover). **Provider** = tipo; **Instance** = conexão nomeada (diretriz 52). Instance nunca é excluída — só muda de estado.
- Secrets só via **Secrets Manager** (AES-256-GCM); conexões referenciam secret por id; export nunca inclui secrets.
- Arquivos só via **Storage Manager** (`IStorageDriver`).
- Billing → Licensing → Feature Flags → Sistema (diretriz 53). Módulos consultam Licensing/Flags, nunca Billing. Limites via `LimitsService`; consumo via `UsageService` (todo módulo novo registra consumo).
- IA/fluxos nunca chamam API externa direto — sempre SDK/Integration Manager.
- Camadas de API: Internal → SDK → Public (diretriz 57). OpenAPI/Swagger sempre atualizado.
- Logs separados por natureza: application/audit/integration/execution/security/billing (diretriz 55). Analytics só lê agregações.
- WhatsApp: **exclusivamente capacidades oficiais da Meta Cloud API**.
- Um arquivo responde UMA pergunta (regra de coesão do Aquapark). Lógica em service; DB só via repository; DTOs com class-validator; sem `any`; Logger do Nest (nunca console.log).

## 🔐 ACL
- Permissões `dominio.acao` em `permissions.constants.ts` (catálogo único). Guards: `JwtAuthGuard` global + `PermissionsGuard` + `@RequirePermissions`. Dois tipos de ator: `PLATFORM_ADMIN` (Console) e usuário de organization — endpoints do Console usam guard próprio.
- Todo endpoint sensível tem `@RequirePermissions`; todo botão tem `can()` no front; perm nova exige: constante + grupo + label no front + perfis de sistema.
- Mutations sensíveis: `@Auditable` com diff valor antigo→novo + IP + user-agent (redact de password/token/secret/api_key/cpf).

## 🎛️ FEATURE FLAGS E AUTOMATISMOS
- **Todo comportamento automático nasce OFF** e é ligado por toggle pelo usuário.
- Default de produção de flag técnica mora no código (env só override). Toggle de usuário mora no banco (`system_settings`/FeatureFlag), configurável por UI, viaja no backup.

## 🎨 UX (painéis)
- Erros/validações SEMPRE via toast (`toast.error/success/warn/info`) — nunca banner inline, nunca `confirm()/alert()/prompt()` nativos.
- Ações destrutivas: os **5 patrasques** — ConfirmDialog, disclaimer, tooltip, loading state, permission gate.
- Componentes de `components/ui/` (Modal, Tabs folder/pills, Table+Pagination, FormField, NumericInput, EmptyState, ConfirmDialog, StatCard). Cores via CSS vars `--ap-*` (dark+light). Sem libs de UI alternativas.
- Responsivo: Table desktop + Cards mobile; touch ≥44px; `100dvh`; testar 375px e 1920px.
- Shell do cliente tem seletor de workspace/ambiente. Página não duplica padding do `<main>`.

## 🚀 DEPLOY / VERSIONAMENTO
- Ver `docs/deploy-e-versionamento.md`. Produção: `/opt/iastudio`, PM2 `iastudio-api` (+ `iastudio-worker`), Debian root (sem sudo), build só no servidor (máquina do Robson não tem Node — NUNCA pedir build local).
- Release: entrada no `CHANGELOG.md` → commit → tag anotada `vX.Y.Z` (SEMPRE confirmar o número com o Robson; nunca reusar tag) → painel de Atualização aplica.
- Ao concluir mudança de código, entregar os comandos PowerShell de release; avisar quando `db push` for destrutivo.

## 🛡️ GOVERNANÇA
- 1 frente estrutural por vez; checkpoint + validação humana entre frentes; mudanças incrementais e reversíveis.
- Documentação DURANTE o desenvolvimento: README por módulo + CHANGELOG + docs/ de cada fase.
- Antes de implementar: mapear backend/frontend/ACL/licensing/metering/auditoria/eventos/estados de erro/empty/loading/mobile.
- Sinais de alarme: endpoint sem `@RequirePermissions`; tabela sem `organization_id`; módulo importando BullMQ/provider direto; secret fora do Secrets Manager; automatismo nascendo ON.

*Versão do documento: 1.0.0 — 02/07/2026 (Fase 0)*
