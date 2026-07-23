# Framework de prompts — IA Studio

> **Método (agnóstico) vive fora deste projeto**, em `C:\Users\Flowspec\Documents\STUDIO-WORKFLOW\` (paradigma `prompt-framework/v1`). Este projeto ainda não tem catálogo local — a estrutura fica pronta pra quando fizer sentido.

## Método comum (STUDIO-WORKFLOW)

Leia sempre antes de qualquer pedido:

- [`STUDIO-WORKFLOW\README.md`](../../../STUDIO-WORKFLOW/README.md) — porta de entrada.
- [`STUDIO-WORKFLOW\framework.md`](../../../STUDIO-WORKFLOW/framework.md) — especificação normativa do paradigma (schema YAML, tipos, `extends`/`uses`, SemVer por ativo, ciclo de vida, template do ativo).
- [`STUDIO-WORKFLOW\prompt-alinhamento.md`](../../../STUDIO-WORKFLOW/prompt-alinhamento.md) — `workflow.prompt-alignment@2.0.0`. Bloco a colar + formato do relatório.
- [`STUDIO-WORKFLOW\shared\system-change-base.md`](../../../STUDIO-WORKFLOW/shared/system-change-base.md) — `workflow.system-change-base@1.0.0`. **Capability base** que toda especialidade local herda via `extends`.
- [`STUDIO-WORKFLOW\architecture-review.md`](../../../STUDIO-WORKFLOW/architecture-review.md) — ADR do paradigma.
- [`STUDIO-WORKFLOW\COMO-INTERAGIR-COM-ROBSON.md`](../../../STUDIO-WORKFLOW/COMO-INTERAGIR-COM-ROBSON.md) — regras de comportamento com o Robson.

## Específico do IA Studio (fica aqui)

**Ainda não existe** catálogo local nem especialidades. Enquanto as frentes puderem ser resolvidas com o alinhador genérico do STUDIO-WORKFLOW respondendo `especialidade não catalogada`, não há motivo para criar.

Quando uma responsabilidade se repetir o suficiente para justificar (checklist em `STUDIO-WORKFLOW\framework.md` §7 "Versionamento e ciclo de vida" + §10 "Checklist de liberação"), criar aqui:

- `catalogo-especialidades.md` — `kind: shared`, id `ia-studio.specialty-catalog`, lista das especialidades do projeto (namespace `ia-studio.*`; domínio: plataforma de assistentes IA — assistants, knowledge base, tools, memory, workflows, automações).
- `especialidades/<slug>.md` — uma por especialidade, `kind: task`, com `extends: workflow.system-change-base@1.0.0` no front matter.

## Não confunda

Este framework governa **pedidos humanos de desenvolvimento** ao IA Studio (mudanças no código do produto). Ele **não** é o prompt runtime dos assistentes/agentes do próprio produto — esses vivem no runtime da plataforma e seguem regras próprias.

## Versão consumida

`STUDIO-WORKFLOW v3.0.0` (paradigma `prompt-framework/v1`).
