# CLAUDE.md — REGRA MÁXIMA DO PROJETO IA STUDIO

> Plataforma SaaS multi-tenant de Automação Empresarial, Integrações, IA e Comunicação.
> Toda IA/desenvolvedor que atuar neste projeto DEVE seguir estas regras sem exceção.
> Documentos normativos: `docs/plano-de-execucao.md`, `docs/diretrizes-arquiteturais.md` (58 diretrizes), `docs/deploy-e-versionamento.md`, `RELATORIO-ANALISE-E-ARQUITETURA.md`.

## 🇧🇷 IDIOMA
Sempre responder em pt-BR. Identificadores de código em inglês (kebab-case arquivos, PascalCase classes, camelCase funções, snake_case tabelas). Mensagens de UI/log em pt-BR.

## ⚖️ PRINCÍPIO REITOR
A plataforma é totalmente genérica e orientada a integrações. A primeira solução oficial é para provedores (ISP) com o Altarede como primeiro Provider ERP. **Nenhuma decisão arquitetural pode depender de segmento específico** — funcionalidade de negócio entra via Providers, Tools, Resource Extensions e Templates. A plataforma NUNCA é dona de dados de negócio.

## 🔁 REGRAS DE OURO DA EXECUÇÃO (lições caras — leia antes de codar)

- **PORTE, NÃO REINVENTE — E OLHE O AQUAPARK ANTES DE QUALQUER CORREÇÃO.** O Aquapark (`C:\Users\Flowspec\Documents\delivery-system\aquapark`) está à frente e tem muita coisa testada em produção. Antes de construir OU **corrigir** algo que ele já tem (upgrade/atualização, canvas de fluxo, composer/áudio do WhatsApp, tela de versão, backup, painel que mostra progresso/falha), **a PRIMEIRA ação é LER o equivalente lá** e portar o padrão — não remendar o meu nem refazer do zero. Isso é PRÁTICA OBRIGATÓRIA em toda correção, não só em feature nova: se o bug é numa área que o Aquapark tem, abrir o arquivo dele primeiro. Reinventar/remendar = repetir bug já resolvido lá. Só se constrói do zero o que é genuinamente novo do IA Studio (multi-tenant, Provider Registry, declarativo), e mesmo aí herdando os padrões de UX/estrutura.
- **DESCONFIE DE ERRO SILENCIOSO.** O pior bug é o que devolve resultado plausível em vez de estourar. Exemplos que já morderam: `try/catch` que engole a falha e cai num fallback (versão presa em v0.1.0); API do IXC que "erra calado" (`IN` grande devolve vazio, `rp` trunca sem avisar, `online` mal lido). Regra: nunca `catch` que engole e devolve fallback **sem sinal**; validar contra dado real; ao ver um número "plausível", confirmar que é o certo, não presumir.
- **ARQUIVAR ≠ EXCLUIR — por caso, não por dogma.** "Nunca excluir, só mudar de estado" vale para o que tem histórico/referência (conexão que processou dados, entidade central). Um **rascunho descartável** (fluxo/assistente sem uso) tem que poder ser **excluído de verdade** — forçar arquivar aí é dogma sem visão de negócio.
- **UX humana vale no CANVAS e nos editores também**, não só nas telas de lista/form. Auditar o editor de automação, o inspetor de nó e os modais — não só as tabelas.
- **CHECKPOINT entre frentes; sem empilhar.** 1 mudança estrutural por vez, validação humana, depois a próxima. Ver `docs/base-doc-e-portes-aquapark.md` para o backlog de porte da base.
- **PÓS-COMPACTAÇÃO = RE-ANCORAR ANTES DE AGIR.** Quando a conversa é compactada (resumo "This session is being continued…"), a memória fica não-confiável e começa a alucinar plausível (o próprio erro silencioso). Regra: a **primeira ação** após uma compactação é reground silencioso — reler este `CLAUDE.md` + o topo do `CHANGELOG.md` (= versão real atual) e conferir o estado real (`git`, `ls`, ler o arquivo) antes de recomendar comando ou tocar em código. **NUNCA** cravar número de versão, nome de arquivo/coluna ou "o que já foi aplicado no servidor" de cabeça — confirmar contra o arquivo real ou perguntar ao Robson. Tag nunca é reusada.

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
- **REGRA MÁXIMA DE UX — linguagem do usuário, nunca do desenvolvedor.** Todo texto de superfície (menu, aba, label, botão, dica, mensagem) fala a língua do dono do negócio, não a do código. "O que o assistente pode fazer", não "allowed_tools"; "Quem é", não "persona JSON"; "Assistentes", não "Agentes/LLM". O usuário descreve o que quer; o sistema traduz para os identificadores técnicos por baixo. Jargão (chaves, modelos, tokens, IDs) fica escondido em "Ajustes avançados" ou fora da tela. Vale para TODA tela nova.
- Erros/validações SEMPRE via toast (`toast.error/success/warn/info`) — nunca banner inline, nunca `confirm()/alert()/prompt()` nativos.
- Ações destrutivas: os **5 patrasques** — ConfirmDialog, disclaimer, tooltip, loading state, permission gate.
- Componentes de `components/ui/` (Modal, Tabs folder/pills, Table+Pagination, FormField, NumericInput, EmptyState, ConfirmDialog, StatCard). Cores via CSS vars `--ap-*` (dark+light). Sem libs de UI alternativas.
- Responsivo: Table desktop + Cards mobile; touch ≥44px; `100dvh`; testar 375px e 1920px.
- Shell do cliente tem seletor de workspace/ambiente. Página não duplica padding do `<main>`.

## 🚀 DEPLOY / VERSIONAMENTO
- Ver `docs/deploy-e-versionamento.md`. Produção: `/opt/iastudio`, PM2 `iastudio-api` (+ `iastudio-worker`), Debian root (sem sudo), build só no servidor (máquina do Robson não tem Node — NUNCA pedir build local).
- Release: entrada no `CHANGELOG.md` → commit → tag anotada `vX.Y.Z` (SEMPRE confirmar o número com o Robson; nunca reusar tag) → painel de Atualização aplica.
- Ao concluir mudança de código, entregar os comandos PowerShell de release; avisar quando `db push` for destrutivo.

## 🧠 PENSAR ANTES DE CODAR (obrigatório — porte do Aquapark)
Antes de implementar qualquer feature, mapear em prosa: **1)** módulo/service/repository/DTO/guard afetados; **2)** eventos emitidos/consumidos; **3)** ACL (perm nova? front `can()` + back `@RequirePermissions`); **4)** licensing/metering (registra consumo?); **5)** auditoria (`@Auditable` em mutation sensível?); **6)** multi-tenant (`organization_id`/workspace/environment); **7)** estados de erro (toast)/empty (`EmptyState`)/loading; **8)** mobile 375px + dark; **9)** navegação (sidebar/breadcrumb/rota); **10)** reutilização (existe componente/helper/porte do Aquapark?). Só codar depois de 1-10. **Proibido:** criar componente quando `components/ui/*` já tem; duplicar service; abstração sem 2+ consumidores; feature sem gating; refator estrutural junto com feature nova.

## ✅ DEFINIÇÃO DE PRONTO (porte do Aquapark)
Uma feature só está pronta se: service tem a regra (sem lógica em controller) · repository encapsula Prisma · DTO com class-validator · controller com `@RequirePermissions` · eventos críticos com `source_event_id` + idempotência · auditoria em mutation sensível · front com `can()` nos botões + toast de erro + `EmptyState` + loading · responsivo (Table desktop/Cards mobile, touch ≥44px) testado em 375px e dark · perm nova seguiu os 5 passos (constante + grupo + label + perfis + Administrador herda) · rota nova em breadcrumb + sidebar · CHANGELOG atualizado. **NÃO é pronto:** só desktop, só CRUD sem ACL granular, só front OU só back, sem dark, sem toast de erro, sem o CANVAS/editor auditado (quando aplicável).

## 🛡️ GOVERNANÇA
- 1 frente estrutural por vez; checkpoint + validação humana entre frentes; mudanças incrementais e reversíveis.
- **Sweeps mecânicos NÃO são triviais:** 1 arquivo por vez, validar antes do próximo; nunca assumir que um arquivo "parece truncado" sem conferir; parar e revisar a cada ~3 arquivos.
- Documentação DURANTE o desenvolvimento: README por módulo + CHANGELOG + docs/ de cada fase. `docs/base-doc-e-portes-aquapark.md` = backlog de amarração da base.
- Sinais de alarme: endpoint sem `@RequirePermissions`; tabela sem `organization_id`; módulo importando BullMQ/provider direto; secret fora do Secrets Manager; automatismo nascendo ON; `catch` que engole erro e devolve fallback sem sinal; tipo técnico (`TRIGGER_EVENT`, chave crua) renderizado na tela; feature que o Aquapark já tem sendo feita do zero.

*Versão do documento: 1.1.0 — 10/07/2026 (base amarrada via Aquapark: porte-não-reinvente, erro silencioso, arquivar≠excluir, pensar-antes-de-codar, definição-de-pronto)*
