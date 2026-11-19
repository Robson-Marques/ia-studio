# Framework de prompts — IA Studio

> **Método (agnóstico) vive fora deste projeto**, em `C:\Users\Flowspec\Documents\STUDIO-WORKFLOW\` (paradigma `prompt-framework/v1`). Este projeto ainda não tem catálogo local — a estrutura fica pronta pra quando fizer sentido.

## Método comum (STUDIO-WORKFLOW)

Leia sempre antes de qualquer pedido:

- [`STUDIO-WORKFLOW\README.md`](../../../STUDIO-WORKFLOW/README.md) — porta de entrada.
- [`STUDIO-WORKFLOW\framework.md`](../../../STUDIO-WORKFLOW/framework.md) — especificação normativa do paradigma (schema YAML, tipos, `extends`/`uses`, SemVer por ativo, ciclo de vida, template do ativo).
- [`STUDIO-WORKFLOW\prompt-alinhamento.md`](../../../STUDIO-WORKFLOW/prompt-alinhamento.md) — `workflow.prompt-alignment@2.0.0`. Bloco a colar + formato do relatório.
- [`STUDIO-WORKFLOW\shared\system-change-base.md`](../../../STUDIO-WORKFLOW/shared/system-change-base.md) — `workflow.system-change-base@1.1.0`. **Capability base** que toda especialidade local herda via `extends` direto ou derivado.
- [`STUDIO-WORKFLOW\architecture-review.md`](../../../STUDIO-WORKFLOW/architecture-review.md) — ADR do paradigma.
- [`STUDIO-WORKFLOW\COMO-INTERAGIR-COM-ROBSON.md`](../../../STUDIO-WORKFLOW/COMO-INTERAGIR-COM-ROBSON.md) — regras de comportamento com o Robson.

## Específico do IA Studio (fica aqui)

O catálogo local existe em
[`catalogo-especialidades.md`](catalogo-especialidades.md). Ele define as
especialidades liberadas para o IA Studio e aponta para seus contratos em
`especialidades/`. O alinhador deve escolher uma delas pela missão e fronteira
técnica; quando não houver cobertura, responde `especialidade não catalogada`,
registra a lacuna e aguarda a criação aprovada.

Uma nova especialidade só é criada quando a responsabilidade se repetir e não
for coberta pelo catálogo, seguindo o checklist de
`STUDIO-WORKFLOW\framework.md` §7 e §10. O ativo usa o namespace
`ia-studio.*`, `kind: task` e herda `workflow.system-change-base` na versão
vigente declarada pelo próprio contrato.

## Não confunda

Este framework governa **pedidos humanos de desenvolvimento** ao IA Studio (mudanças no código do produto). Ele **não** é o prompt runtime dos assistentes/agentes do próprio produto — esses vivem no runtime da plataforma e seguem regras próprias.

## Versão consumida

`STUDIO-WORKFLOW v3.0.0` (paradigma `prompt-framework/v1`).
