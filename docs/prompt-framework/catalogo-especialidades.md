---
schema: prompt-framework/v1
id: ia-studio.specialty-catalog
kind: shared
version: 1.4.0
status: released
title: Catálogo de especialidades do IA Studio
owners: [robson]
reviewers: [robson]
reviewed_at: "2026-09-08"
released_at: "2026-09-08"
change_reason: MINOR. Adiciona `ia-studio.system-cleanup@1.0.0`, criada após aprovação do Robson para remover de verdade código e arquivos mortos em etapas, com o repo passando a representar só o que está em uso.
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
| `ia-studio.tenant-domains` | Engenheiro de plataforma multi-tenant (tenancy, domínios, resolução por Host) | Governar mudanças de tenancy no IA Studio — modelagem de domínio/organização, resolução de tenant por Host, branding white-label por domínio e gestão no Console — respeitando `organization_id`/workspace/environment e a fronteira app↔infra (Nginx/TLS fora do deploy por tag). | [tenant-domains.md](especialidades/tenant-domains.md) |
| `ia-studio.whatsapp-connectors` | Engenheiro de Plataforma de Integrações multi-tenant (conectores de mensageria e coexistência) | Portar para o IA Studio os conectores WhatsApp do Aquapark (Meta/YCloud/Baileys) e o vínculo de coexistência canal oficial↔manual, adaptado ao Provider Registry (`IProvider`) + Secrets Manager e ao contexto `organization_id`/workspace/environment. Conexões ficam em Integrações › Conexões. | [whatsapp-connectors.md](especialidades/whatsapp-connectors.md) |
| `ia-studio.dedicated-instance-operations` | Engenheiro de operações de instâncias dedicadas | Governar instalação, upgrade, backup, restauração e remoção por instância, com evidência real de host e sem afetar outros produtos. | [dedicated-instance-operations.md](especialidades/dedicated-instance-operations.md) |
| `ia-studio.system-cleanup` | Engenheiro de manutenção (faxina de código e arquivos mortos por reachability) | Remover de verdade código e arquivos mortos do IA Studio em etapas — sem quebrar build/gates/runtime — distinguindo *excluir de verdade* de *arquivar*, para o repo representar só o que está em uso. | [system-cleanup.md](especialidades/system-cleanup.md) |

## Critérios de aceite

- Todo slug aponta para um único arquivo `released` em `especialidades/`.
- Toda especialidade herda `workflow.system-change-base@1.0.0` — diretamente ou via capability derivada (ex.: `ia-studio.studio-ux-adoption` herda `workflow.consuming-system-adoption@1.0.0`, que por sua vez herda `workflow.system-change-base@1.0.0`).
- Nenhuma especialidade é escolhida apenas pela identidade profissional.
- Especialidade ausente exige novo relatório e aprovação explícita antes da criação (`workflow.specialty-creation@1.0.0` executa após `ok`).

## Fora do catálogo (ainda)

Estas responsabilidades **existem** no IA Studio mas ainda não têm especialidade catalogada — quando o próximo pedido tocar em uma delas, o alinhador retornará `especialidade não catalogada` e recomendará a criação. Ficam registradas aqui como lacuna conhecida:

- **Backend / API dedicada** (`platform-api`): modelagem de domínio local, ACL e eventos. Operação por instância é coberta por `ia-studio.dedicated-instance-operations@1.0.0`.
- **Runtime de assistentes**: prompts operacionais, tools, knowledge base, memória, workflows — regras próprias, **não confundir** com este framework (que governa pedidos humanos de desenvolvimento).
- **Integrações externas** (Meta, Google, gateways, etc.) — se surgirem novas. *(A fatia de **conectores WhatsApp** — Meta/YCloud/Baileys + coexistência — já está coberta por `ia-studio.whatsapp-connectors@1.0.0`.)*
- **Segurança / privacidade** (LGPD, retenção, backup, ACL local).
- **Documentação / continuidade** (handoff, changelog, dívida técnica).

## Registro de revisão

| Versão | Estado | Revisão | Impacto |
|---|---|---|---|
| 1.0.0 | released | Aprovado por Robson em 2026-07-23 | Primeira release. Catálogo local nasce simultaneamente à primeira task (`ia-studio.studio-ux-adoption@1.0.0`) pela mesma execução de `workflow.specialty-creation@1.0.0`. |
| 1.1.0 | released | Aprovado por Robson em 2026-08-07 | MINOR. Adiciona `ia-studio.tenant-domains@1.0.0` (tenancy/domínios/subdomínios por org), criada por `workflow.specialty-creation@1.0.0` após o relatório de alinhamento de 2026-08-07. |
| 1.2.0 | released | Aprovado por Robson em 2026-09-08 | MINOR. Adiciona `ia-studio.whatsapp-connectors@1.0.0` (porte dos conectores WhatsApp Meta/YCloud/Baileys + coexistência), criada por `workflow.specialty-creation@1.0.0` após o relatório de alinhamento de 2026-09-08. |
| 1.3.0 | released | Aprovado por Robson em 2026-09-18 | MINOR. Adiciona `ia-studio.dedicated-instance-operations@1.0.0` para S4: operação de instâncias dedicadas com recursos reais do host e isolamento entre produtos. |
| 1.4.0 | released | Aprovado por Robson em 2026-09-21 | MINOR. Adiciona `ia-studio.system-cleanup@1.0.0` (faxina de código/arquivos mortos em etapas), criada por `workflow.specialty-creation@1.0.0` após o relatório de alinhamento da frente de faxina. |
