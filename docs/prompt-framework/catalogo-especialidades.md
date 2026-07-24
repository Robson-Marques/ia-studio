---
schema: prompt-framework/v1
id: ia-studio.specialty-catalog
kind: shared
version: 1.0.0
status: released
title: Catálogo de especialidades do IA Studio
owners: [robson]
reviewers: [robson]
reviewed_at: "2026-07-23"
released_at: "2026-07-23"
change_reason: Primeira release. Cria o catálogo local do IA Studio no schema formal `prompt-framework/v1` (STUDIO-WORKFLOW v3.1.0), até agora inexistente — o repo só tinha o stub `README.md` apontando pro central. Nasce já com a primeira task local (`ia-studio.studio-ux-adoption@1.0.0`), criada nesta mesma leva pela `workflow.specialty-creation@1.0.0` após aprovação do relatório de alinhamento de 2026-07-23.
---

# Catálogo de especialidades do IA Studio

## Missão

Definir quais especialidades existem no IA Studio, suas fronteiras e o arquivo que o alinhador (`workflow.prompt-alignment@2.1.0`) deve selecionar.

## Regra de classificação

O alinhador classifica pela **missão, responsabilidade e fronteira técnica** — nunca só pelo cargo, tecnologia, tela ou incidente. Pode indicar uma especialidade secundária somente quando houver responsabilidade independente e justificativa explícita no relatório. Se o pedido tiver frentes independentes, ele as separa e pede prioridade. Sem cobertura, responde `especialidade não catalogada`, recomenda a lacuna e aguarda aprovação — a criação é executada por `workflow.specialty-creation@1.0.0`.

## Especialidades disponíveis

| Slug | Identidade operacional | Missão | Prompt |
|---|---|---|---|
| `ia-studio.studio-ux-adoption` | Engenheiro Frontend Sênior especializado em adoção controlada de Design Systems | Governar a adoção do Studio UX no `platform-admin` do IA Studio por famílias de tela, respeitando o piloto `/studio-ux-demo` já existente, o contexto multi-tenant e as regras do próprio DS. | [adocao-studio-ux.md](especialidades/adocao-studio-ux.md) |

## Critérios de aceite

- Todo slug aponta para um único arquivo `released` em `especialidades/`.
- Toda especialidade herda `workflow.system-change-base@1.0.0` — diretamente ou via capability derivada (ex.: `ia-studio.studio-ux-adoption` herda `workflow.consuming-system-adoption@1.0.0`, que por sua vez herda `workflow.system-change-base@1.0.0`).
- Nenhuma especialidade é escolhida apenas pela identidade profissional.
- Especialidade ausente exige novo relatório e aprovação explícita antes da criação (`workflow.specialty-creation@1.0.0` executa após `ok`).

## Fora do catálogo (ainda)

Estas responsabilidades **existem** no IA Studio mas ainda não têm especialidade catalogada — quando o próximo pedido tocar em uma delas, o alinhador retornará `especialidade não catalogada` e recomendará a criação. Ficam registradas aqui como lacuna conhecida:

- **Backend / API multi-tenant** (`platform-api`): modelagem de domínio, `organization_id`, ACL, eventos.
- **Console SaaS** (`platform-console`): backoffice interno (gestão de orgs, planos, uso).
- **Runtime de assistentes**: prompts operacionais, tools, knowledge base, memória, workflows — regras próprias, **não confundir** com este framework (que governa pedidos humanos de desenvolvimento).
- **Integrações externas** (Meta, Google, gateways, etc.) — se surgirem novas.
- **Segurança / privacidade** (LGPD, retenção, backup, ACL multi-tenant).
- **Documentação / continuidade** (handoff, changelog, dívida técnica).

## Registro de revisão

| Versão | Estado | Revisão | Impacto |
|---|---|---|---|
| 1.0.0 | released | Aprovado por Robson em 2026-07-23 | Primeira release. Catálogo local nasce simultaneamente à primeira task (`ia-studio.studio-ux-adoption@1.0.0`) pela mesma execução de `workflow.specialty-creation@1.0.0`. |
