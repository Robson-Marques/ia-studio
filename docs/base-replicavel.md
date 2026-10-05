---
schema: prompt-framework/v1
id: ia-studio.replicable-reference-base
kind: shared
version: 1.0.0
status: reviewed
title: Base replicável — referência Newnet e extração futura de vertente
policy_refs:
  - workflow.architecture-baseline@1.0.0
owners:
  - robson
reviewed_at: "2026-10-05"
scope: "Reuso seguro da base IA Studio sem alterar a vertente Newnet vigente"
---

# Base replicável — IA Studio

## Decisão vigente

Este repositório e a tag **`v0.11.42`** formam uma base de referência estável
para novas vertentes do IA Studio. A referência contém o sistema completo que
está em uso na Newnet, inclusive a vertical de ISP/IXC.

Isso **não** cria uma versão sem ISP/IXC, não remove código, não muda banco,
não desativa rotas e não altera o comportamento desta vertente. A Newnet
continua sendo a referência funcional de atendimento, gestão, automação, IA,
WhatsApp e integrações.

Quando houver um novo cliente, o responsável cria uma cópia em outro diretório
e repositório a partir de uma tag estável. Só nessa nova vertente, e mediante
alinhamento aprovado para o cliente, poderá existir uma tarefa própria para
manter, adaptar ou retirar módulos de negócio.

## Como usar a referência em uma nova vertente

1. Partir de uma tag estável deste repositório e criar o novo diretório e
   repositório da vertente. Esta operação é deliberada pelo responsável pela
   nova aplicação; ela não é executada pelos scripts do IA Studio.
2. Registrar o contrato de produto do novo cliente: identidade, integrações,
   automações, canais e módulos de negócio que ele realmente precisa.
3. Tratar a matriz abaixo como inventário de decisão. Ela nunca é uma lista de
   remoção automática.
4. Dar à nova vertente `app-id`, banco, Redis, storage, domínio, backups e
   processos próprios. Scripts de instalação, atualização, backup ou restore da
   Newnet não devem apontar para a nova aplicação.
5. Depois de qualquer ajuste estrutural na cópia, validar no servidor com build
   e smoke test da própria vertente antes de marcá-la como base estável dela.

## Núcleo que permanece reutilizável

| Área | Contrato a preservar na cópia |
|---|---|
| Plataforma | Instalação dedicada, identidade por `app-id`, isolamento de banco, Redis, storage, PM2, domínio e backup. |
| Integrações | Provider Registry, conexões, segredos, health checks e logs. Provider é uma extensão; não se remove o Integration Manager porque uma integração específica sai. |
| Comunicação | WhatsApp oficial da Meta, atendimento, templates HSM, catálogo de templates e regras de telefone. |
| Automação e IA | Assistentes, aprovações, fluxos, tools autorizadas, auditoria e análise de atendimento genérica. Uma tool específica pode sair sem retirar a plataforma de IA. |
| Gestão e segurança | Usuários, ACL, auditoria, configurações, administração da instalação, backup, atualização e observabilidade. |
| Painel | Shell, dashboard, componentes de interface e rotas das áreas que permanecerem no contrato do novo cliente. |

Em especial, **análise de atendimento** e o atendimento WhatsApp são
capacidades genéricas. Elas não devem ser confundidas com a consulta de
chamados do IXC nem com a gestão de incidentes ISP.

## Matriz de vertical Newnet — decisão futura na cópia

Esta matriz identifica o que é específico da operação ISP da Newnet. O estado
de todos os itens abaixo, nesta referência, é **preservar**. Em uma cópia para
outro segmento, o estado só pode mudar por tarefa aprovada, inventário de
dependências e validação da nova vertente.

| Grupo | Superfícies atuais | Decisão na referência | Tratamento possível em cópia não-ISP |
|---|---|---|---|
| Provider IXC | `platform-api/src/modules/integration/registry/providers/ixc.provider.ts`, `ixc.helpers.ts`, registros em `registry.module.ts` e `provider-seed.service.ts` | Preservar | Retirar somente o adaptador IXC e seus registros; manter o Registry, conexões, segredos e logs. |
| Módulo ISP | `platform-api/src/modules/isp/**`, importações `IspModule` em `app.module.ts` e `worker.module.ts` | Preservar | Retirar como uma unidade, incluindo consumidores e permissões, se o novo contrato não tiver operação ISP. |
| Dados ISP | Enums e tabelas `Isp*` em `platform-api/prisma/schema.prisma` | Preservar | Em banco novo da cópia, avaliar retirada junto com o módulo. Nunca aplicar `DROP`, `ALTER TABLE` manual ou perda automática no banco da Newnet. |
| Painel ISP | `platform-admin/src/pages/ISP/**`, `platform-admin/src/services/isp.js`, rotas, breadcrumbs e menu ISP | Preservar | Retirar junto com a API ISP; não deixar menu ou rota órfãos. |
| Chamados IXC | Tool `atendimento.listar_chamados_recentes`, Capability `ixc-ticket-analysis` e especialidade de análise de chamados | Preservar | Retirar ou substituir conforme a integração do novo cliente. A análise genérica de atendimento permanece. |
| Incidentes ISP | Incidentes, alertas de região, OS, 2ª via e ações de templates relacionadas a incidentes | Preservar | Revisar em conjunto com o módulo ISP, inclusive `OPEN_INCIDENTS` no catálogo de templates e campos de alerta de incidente. |
| Migração e evidências ISP | `export-isp-operational-data.sh`, `verify-isp-operational-export.sh`, `verify-operational-dedicated.sh`, `verify-instance-isolation.sh` e documentação ISP | Preservar | Classificar na cópia como evidência histórica, reescrever para exemplo genérico ou retirar, sem apagar o registro histórico da Newnet. |

Também exigem revisão coordenada nessa tarefa futura: permissões `ISP_*` e o
papel Operador ISP; labels IXC no painel de integrações; comentários e exemplos
que citam OS/IXC; DTOs e campos de alerta de incidente; e os documentos do
contrato ISP. São dependências a verificar, não autorização para alteração
isolada.

## Limites de segurança para a futura extração

- A nova vertente começa com sua própria decisão de produto. Não se usa esta
  matriz como script, busca-e-substituição ou checklist de exclusão cega.
- Se a cópia usar banco vazio, as entidades ISP podem ser revistas junto com
  todos os consumidores. Se ela começar com dados, a migração segura precisa de
  decisão explícita e plano próprio; não há perda automática de schema ou
  dados.
- A vertente Newnet não é modificada durante esse processo. Seu código, banco,
  documentos operacionais e evidências de migração continuam preservados.
- A remoção de uma integração específica nunca autoriza remover as capacidades
  genéricas que a hospedam: Registry, conexão, secret, log, IA, automação,
  atendimento ou WhatsApp.

## Fonte de verdade relacionada

- `docs/architecture-baseline.md` define a arquitetura dedicada.
- `docs/deploy-e-versionamento.md` define o isolamento e o ciclo de uma
  vertente.
- `platform-api/src/modules/isp/README.md` e
  `docs/capabilities/ixc-ticket-analysis.md` descrevem o contrato atualmente
  válido para a Newnet.
- `docs/ESTADO-e-handoff.md` registra o estado operacional e a sequência de
  entregas.
