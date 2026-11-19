---
schema: prompt-framework/v1
id: ia-studio.specialty-catalog
kind: shared
version: 1.11.1
status: released
title: Catálogo de especialidades do IA Studio
owners: [robson]
reviewers: [robson]
reviewed_at: "2026-10-05"
released_at: "2026-10-05"
change_reason: PATCH. Corrige a especialidade ConnectChat para usar Connection e Secrets Manager do Integration Manager.
---

# Catálogo de especialidades do IA Studio

## Missão

Definir quais especialidades existem no IA Studio, suas fronteiras e o arquivo que o alinhador (`workflow.prompt-alignment@2.1.0`) deve selecionar.

## Regra de classificação

O alinhador classifica pela **missão, responsabilidade e fronteira técnica** — nunca só pelo cargo, tecnologia, tela ou incidente. Pode indicar uma especialidade secundária somente quando houver responsabilidade independente e justificativa explícita no relatório. Se o pedido tiver frentes independentes, ele as separa e pede prioridade. Sem cobertura, responde `especialidade não catalogada`, recomenda a lacuna e aguarda aprovação — a criação é executada por `workflow.specialty-creation@1.0.0`.

## Especialidades disponíveis

| Slug | Identidade operacional | Missão | Prompt |
|---|---|---|---|
| `ia-studio.studio-ux-adoption` | Engenheiro Frontend Sênior especializado em adoção controlada de Design Systems | Governar a adoção do Studio UX no `platform-admin` da instalação dedicada por famílias de tela, respeitando os componentes já adotados e as regras do próprio DS. | [adocao-studio-ux.md](especialidades/adocao-studio-ux.md) |
| `ia-studio.dedicated-instance-operations` | Engenheiro de operações de aplicações dedicadas | Governar instalação, upgrade, backup, restauração e remoção por vertente, com evidência real de host e sem afetar outros produtos. | [dedicated-instance-operations.md](especialidades/dedicated-instance-operations.md) |
| `ia-studio.system-cleanup` | Engenheiro de manutenção (faxina de código e arquivos mortos por reachability) | Remover de verdade código e arquivos mortos do IA Studio em etapas — sem quebrar build/gates/runtime — distinguindo *excluir de verdade* de *arquivar*, para o repo representar só o que está em uso. | [system-cleanup.md](especialidades/system-cleanup.md) |
| `ia-studio.local-integrations-configuration` | Engenheiro de integrações locais | Governar providers embarcados, catálogo interno e conexões da instalação dedicada, sem etapa de instalação SaaS. | [local-integrations-configuration.md](especialidades/local-integrations-configuration.md) |
| `ia-studio.assistant-ticket-analysis` | Engenheiro de runtime assistido e integrações operacionais | Governar consulta delimitada e análise rastreável de chamados IXC pelo assistente, sem mutações no ERP. | [assistant-ticket-analysis.md](especialidades/assistant-ticket-analysis.md) |
| `ia-studio.connectchat-channel` | Engenheiro de integração de canais de atendimento | Governar o consumo seguro da API ConnectChat no atendimento do IA Studio, sem expor a chave nem alterar o ConnectChat. | [connectchat-channel.md](especialidades/connectchat-channel.md) |

## Critérios de aceite

- Todo slug aponta para um único arquivo `released` em `especialidades/`.
- Toda especialidade herda uma versão compatível de `workflow.system-change-base` — diretamente ou via capability derivada (ex.: `ia-studio.studio-ux-adoption` herda `workflow.consuming-system-adoption@1.0.0`, que por sua vez herda `workflow.system-change-base@1.0.0`). As especialidades novas usam a base vigente `@1.1.0`.
- Nenhuma especialidade é escolhida apenas pela identidade profissional.
- Especialidade ausente exige novo relatório e aprovação explícita antes da criação (`workflow.specialty-creation@1.0.0` executa após `ok`).

## Fora do catálogo (ainda)

Estas responsabilidades **existem** no IA Studio mas ainda não têm especialidade catalogada — quando o próximo pedido tocar em uma delas, o alinhador retornará `especialidade não catalogada` e recomendará a criação. Ficam registradas aqui como lacuna conhecida:

- **Backend / API dedicada** (`platform-api`): modelagem de domínio local, ACL e eventos. Operação por aplicação/vertente é coberta por `ia-studio.dedicated-instance-operations@2.0.0`.
- **Runtime de assistentes**: prompts operacionais, tools, knowledge base, memória, workflows — regras próprias, **não confundir** com este framework (que governa pedidos humanos de desenvolvimento).
- **Novos conectores e contratos externos** (Meta, Google, gateways, etc.) — se surgirem. A decisão vigente de 2026-11-18 permite Meta oficial + WAHA por QR Code com aceite de risco; Baileys e coexistência manual continuam fora do produto.
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
| 1.5.0 | released | Aprovado por Robson em 2026-09-21 | MINOR. Remove a linha morta `ia-studio.tenant-domains` (o arquivo `especialidades/tenant-domains.md` não existe e a tenancy multi-tenant foi retirada no dedicado). Achado na faxina Etapa 0; a entrada 1.1.0 fica no histórico como registro. |
| 1.6.0 | released | Aprovado por Robson em 2026-09-30 | MINOR. Retira `ia-studio.whatsapp-connectors` do catálogo ativo: o contrato 1.0.0 mandava reintroduzir Baileys, QR, coexistência manual, metering e escopo SaaS, todos incompatíveis com a instalação dedicada. O arquivo é preservado apenas como registro aposentado. |
| 1.7.0 | released | Aprovado por Robson em 2026-10-02 | MINOR. A especialidade de operações passa a apontar para `ia-studio.dedicated-instance-operations@2.0.0`: IA Studio é a base; operações governam aplicações de vertentes/repositórios independentes no mesmo host, não cópias irmãs do mesmo checkout. |
| 1.8.0 | released | Aprovado por Robson em 2026-10-05 | MINOR. Adiciona `ia-studio.local-integrations-configuration@1.0.0`, criada após o alinhamento da remoção do Marketplace como etapa SaaS. |
| 1.9.0 | released | Aprovado por Robson em 2026-10-05 | MINOR. Adiciona `ia-studio.assistant-ticket-analysis@1.0.0`, criada após o alinhamento da análise assistida de chamados IXC. |
| 1.10.0 | released | Revisado em 2026-10-05 | MINOR. Atualiza `ia-studio.local-integrations-configuration@1.1.0` com a aposentadoria segura de provider sem remoção destrutiva de dados. |
| 1.11.0 | released | Aprovado por Robson em 2026-10-06 | MINOR. Adiciona `ia-studio.connectchat-channel@1.0.0`, criada após alinhamento aprovado para integrar o canal externo ConnectChat ao atendimento. |
| 1.11.1 | released | Revisado em 2026-10-06 | PATCH. Atualiza `ia-studio.connectchat-channel@1.0.1`: URL, actor e timeout ficam na Connection; chave técnica no Secrets Manager. |
