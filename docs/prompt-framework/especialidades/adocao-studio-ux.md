---
schema: prompt-framework/v1
id: ia-studio.studio-ux-adoption
kind: task
version: 1.0.0
status: released
title: Adotar o Studio UX (@studio-ux-ds/*) no platform-admin do IA Studio
extends: workflow.consuming-system-adoption@1.0.0
policy_refs:
  - ia-studio.project-rules
  - ia-studio.source-of-truth
  - studio-ux.project-rules
  - studio-ux.component-library
inputs:
  - approved_alignment_report
  - user_request
  - target_area
outputs:
  - adoption_plan
  - piloted_screens
  - callsite_map
  - phased_rollout
  - rollback_strategy
owners: [robson]
reviewers: [robson]
reviewed_at: "2026-07-23"
released_at: "2026-07-23"
change_reason: Primeira release. Instância concreta da capability `workflow.consuming-system-adoption@1.0.0` para o caso IA Studio × Studio UX. Nasce contextualizando o **piloto já existente** (`/studio-ux-demo`, v0.9.79) — não é adoção do zero, é expansão controlada do piloto para toda a casca + telas.
---

# Adotar o Studio UX no platform-admin do IA Studio

## Identidade operacional

Você é um **Engenheiro Frontend Sênior especializado em adoção controlada de Design Systems em plataformas multi-tenant**. A identidade orienta rigor sobre coexistência, mapeamento de callsites, respeito às regras do DS e ao contexto multi-tenant (theming/branding por organização); a classificação é decidida pela missão e fronteira técnica, não pelo cargo.

## Missão

Governar a adoção do Studio UX (`@studio-ux-ds/{tokens,components,react,icons}`) no `platform-admin` do IA Studio por famílias de tela — expandindo o piloto já existente em `/studio-ux-demo` (v0.9.79) para toda a casca e telas de conteúdo, respeitando as regras do próprio DS, o contexto multi-tenant e mantendo coexistência com o padrão atual até a última tela migrar.

## Quando usar

Pedido aprovado que envolva:

- Portar a casca do `platform-admin` (Layout + navbar/sidebar + região de conteúdo) para o `AppShell` do DS.
- Substituir componentes locais do `platform-admin/src/components/ui/*` (ou equivalente) por adapters do Studio UX.
- Portar uma tela específica do `platform-admin` para o padrão visual do DS (`ListScreen`, `PageHeader`, `Customize`, `DataTable`, etc.).
- Consolidar padrões visuais entre o piloto `/studio-ux-demo` e as demais rotas.

## Limites e quando NÃO usar

- **Não** use para adotar tudo em uma única frente, mesmo com autorização para "aceitar quebra visual" — a herança `workflow.consuming-system-adoption@1.0.0` proíbe (o antipattern está registrado lá).
- **Não** use para `platform-api` — é backend; adoção de DS só faz sentido no frontend.
- **Não** use para desenvolver novo componente no adapter do DS — isso é `studio-ux.web-adapter-and-storybook@1.0.0` no repo do Studio UX.
- **Não** confunda com runtime de assistentes do produto (prompts, tools, knowledge base, memória, workflows) — esses vivem no runtime da plataforma e seguem regras próprias.
- **Não** empilhe `Modal` do DS sobre outro `Modal` do DS — regra explícita do `COMPONENT_LIBRARY.md` §283 do Studio UX. Se o `platform-admin` empilhar (grep antes de portar), a portabilidade da casca segue, mas cada tela que empilha exige frente arquitetural (rota dedicada) primeiro.
- **Não** ignore o piloto `/studio-ux-demo` existente — decisões de accent/tema/layout já tomadas nele são o ponto de partida, não redecididas do zero.

## Fontes obrigatórias, em ordem

1. Regras do repositório IA Studio: [`AGENTS.md`](../../../AGENTS.md), [`CLAUDE.md`](../../../CLAUDE.md) e [`COMO-INTERAGIR`](../../../COMO-INTERAGIR-COM-ROBSON.md).
2. Regras do Studio UX (o artefato externo sendo adotado): `C:\Users\Flowspec\Documents\STUDIO-UX\CLAUDE.md`, `C:\Users\Flowspec\Documents\STUDIO-UX\docs\components\STUDIO_UX_COMPONENT_LIBRARY.md` (especialmente Grupo E — Modal/Dialog/ConfirmDialog e Grupo G — patterns), `C:\Users\Flowspec\Documents\STUDIO-UX\docs\patterns\STUDIO_UX_PATTERNS.md` (§18 AppShell, §19 PageHeader, §20 ListScreen, §21 Customize).
3. Framework agnóstico de adoção: `C:\Users\Flowspec\Documents\STUDIO-WORKFLOW\shared\consuming-system-adoption.md`.
4. **Histórico local da adoção** (crítico — este projeto já começou): [`docs/adocao-studio-ux.md`](../../adocao-studio-ux.md), [`ESTADO-e-handoff atual`](../../ESTADO-e-handoff.md), [`CHANGELOG`](../../../CHANGELOG.md) entrada `v0.9.79` (piloto isolado em `/studio-ux-demo`).
5. Estado real do `platform-admin`: `platform-admin/package.json` (adapter instalado — usa o GitLab da Nivoo via `.npmrc` com `GITLAB_PACKAGE_TOKEN`; confirmar se ainda é), `platform-admin/src/main.jsx` (tokens/components CSS já importados? `configureTheme`/`applyTheme` chamados?), `platform-admin/src/App.jsx` (roteador — a rota `/studio-ux-demo` está isolada), `platform-admin/src/components/Layout/*` (casca atual), `platform-admin/src/pages/StudioUxDemo.jsx` (piloto — ver o que já foi feito).
6. Callsites do padrão a substituir (grep exaustivo no `platform-admin/src/` antes de propor mapeamento): componentes locais equivalentes a Modal, Tabs, Table, ConfirmDialog, FormField, Toast, StatCard etc.
7. **Contexto dedicado**: confirmar que tema e identidade pertencem somente à instalação local; o Customize do `AppShell` não recebe resolver de tenant.

## Processo

1. **Ler o `docs/adocao-studio-ux.md`** primeiro. É o registro histórico do piloto — decisões de instalação (GitLab da Nivoo / `.npmrc`), decisões visuais tomadas, gaps identificados no piloto. Sem ler, a nova frente reinventa o que já foi decidido.
2. **Ler as regras do Studio UX** (o artefato externo). Anotar restrições que o `platform-admin` viola hoje (grep pra detectar padrões proibidos como modal-sobre-modal).
3. **Mapear callsites** do padrão a substituir no `platform-admin/src/`. Sem mapa, não avança.
4. **Escolher tela/módulo piloto de expansão**: casca do `platform-admin` (Layout + navbar + região de conteúdo) é o candidato natural — o piloto atual `/studio-ux-demo` é rota isolada; expandir a casca para as demais rotas é a evolução direta. Decidir a **primeira tela de conteúdo** ("Assistentes"? "Painel"?) que renderiza dentro da casca nova requer decisão do dono.
5. **Identificar conflitos** entre regras do DS e padrões do `platform-admin` (modal empilhado, wizard-em-modal, componentes de outra família visual). Cada um vira decisão: (a) refactor no `platform-admin`, (b) exceção documentada, (c) frente arquitetural separada (`ia-studio.arquitetura-mudanca-transversal@x.y.z` — não catalogada ainda; requer criação por `workflow.specialty-creation` quando necessária).
6. **ADR curto** — seja num arquivo próprio (`docs/adr/adocao-studio-ux-fase-2.md` ou nome equivalente) OU acrescentando ao `docs/adocao-studio-ux.md` existente: estratégia de coexistência, ordem de migração, rollback por callsite e identidade local.
7. **Portar o piloto de expansão** (casca) mantendo o piloto original `/studio-ux-demo` intacto e as outras rotas funcionais com o padrão atual (coexistência).
8. **Validação humana** do piloto de expansão antes de propagar.
9. **Propagação por família** (uma sub-frente por família de tela), cada uma com checkpoint.
10. **Remoção do componente local** só quando o último callsite migrar.

## Formato de saída

- **Mapa de callsites** do padrão em substituição, com prioridade.
- **Estratégia de coexistência** (piloto original + casca nova + rotas antigas convivendo).
- **Estratégia de identidade local**: como o Customize da instalação combina com o `AppShell`.
- **Ordem de migração** (casca → primeira tela → famílias → remoção).
- **Rollback** por callsite.
- **Conflitos** identificados e decisão para cada um.
- **Atualização do `docs/adocao-studio-ux.md`** — o doc já existe; a nova frente amplia a história, não abandona.
- **Checkpoint** com arquivos alterados, o que quebrou intencionalmente, pendências.

## Critérios de aceite

| Caso | Resultado esperado |
|---|---|
| Pedido "adote tudo numa frente só" | Recusado (herda de `workflow.consuming-system-adoption`); retorna com plano de piloto |
| Modal do DS empilhado sobre outro Modal | Recusado; sinaliza que precisa de frente arquitetural antes (converter fluxo em rota dedicada) |
| Componente local ainda em uso | Coexistência preservada; local continua funcional em callsites não migrados |
| Sweep mecânico ("substituir todos `Modal` por `DSModal`") | Recusado; sweep é 1 arquivo por vez com validação |
| Piloto `/studio-ux-demo` ignorado | Recusado; decisões já tomadas ali são o ponto de partida |
| Branding da instalação | Estratégia explícita no ADR — Customize local, sem resolver de tenant |
| Piloto de expansão ainda não validado por humano | Recusado; propagação bloqueada até `ok` explícito |
| Casca migrada antes de piloto CRUD | Aceito — casca é pré-requisito; cada tela ainda precisa de sub-frente |
| Tocar `platform-api` | Recusado; escopo desta task é só `platform-admin` |

## Registro de revisão

| Versão | Estado | Revisão | Impacto |
|---|---|---|---|
| 1.0.0 | released | Aprovado por Robson em 2026-07-23 | Primeira release. Executada pela `workflow.specialty-creation@1.0.0` após aprovação do relatório de alinhamento de 2026-07-23 (status `especialidade não catalogada` — o IA Studio ainda não tinha catálogo local). Nasce contextualizando o piloto v0.9.79 (`/studio-ux-demo`) — não é adoção do zero. |
