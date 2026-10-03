---
schema: prompt-framework/v1
id: ia-studio.architecture-baseline
kind: shared
version: 1.1.0
status: reviewed
title: Architecture Baseline — IA Studio
policy_refs:
  - workflow.architecture-baseline@1.0.0
  - workflow.capability-contract@1.0.0
owners:
  - robson
reviewed_at: "2026-10-02"
scope: "Recovery proporcional à conversão de SaaS multi-tenant para estrutura-base e vertentes dedicadas"
---

# Architecture Baseline — IA Studio

## Decisão e maturidade

O IA Studio é uma estrutura-base de automação, comunicação, IA e integrações.
Cada cliente recebe uma **vertente e repositório próprios**, com aplicação,
banco, dados, configurações, identidade e integrações próprias. Aplicações de
vertentes distintas podem compartilhar um host, mas nunca processo, banco,
diretório de dados, fila, configuração ou aplicação.

O projeto é existente. Código, `CLAUDE.md`, `ARCHITECTURE_LOCK.md` e diretrizes
registravam SaaS; não havia Architecture Baseline nem Blueprint adotado. Este
Recovery é suficiente para a Capability de conversão, não uma reescrita exaustiva
do produto.

| Dimensão | Estado | Evidência | Leitura para a Capability |
|---|---|---|---|
| Visão e limites | existente | `README.md`, `CLAUDE.md`, decisão do produto | O destino dedicado estava definido; a divergência foi removida pela Capability aceita. |
| Módulos e fronteiras | existente | `platform-api/src/app.module.ts` | Monólito modular com API, workers e painel local. |
| Dados e relações | existente | `platform-api/prisma/schema.prisma` | A recuperação identificou hierarquia SaaS; o S1 a removeu do estado vigente. |
| Auth e ACL | existente | `shared/auth/*`, `permissions.constants.ts` | A recuperação identificou dois atores e tenant context; o S1 os reduziu ao usuário local. |
| Integrações/eventos | existente | `modules/integration`, `shared/events` | Registry, Secrets, Storage, Event Bus e BullMQ são preserváveis. |
| Superfícies | existente | `platform-admin` | O painel local é a única superfície administrativa da aplicação. |
| Infraestrutura | parcial | `scripts/*`, deploy | O contrato foi completado: recursos são derivados por aplicação no host. |
| Observabilidade/auditoria | existente | `shared/audit`, logs, system | Permanecem locais à aplicação após a conversão. |
| Estratégia de testes | parcial | documentação e código inspecionados | Cada slice exige evidência proporcional; Acceptance é integrada no fim. |
| Capability Map | existente para esta frente | seção abaixo | Outras capacidades ainda não foram avaliadas contractualmente. |

> A tabela acima é o diagnóstico do Recovery que originou a Capability. O estado
> vigente é o dedicado, comprovado pela Acceptance e detalhado nas diretrizes.

## Drift e gaps recuperados (histórico e resolução)

### DR-001 — arquitetura SaaS declarada vs. destino aprovado

As fontes e o código ainda declaram `Organization → Workspace → Environment`,
Console, licensing, billing, consumo e domínios por tenant. O produto aprovado é
uma instalação dedicada por cliente. O Capability Contract
`ia-studio.capability.saas-to-dedicated-installation` governa a transição; nenhuma
nova mudança pode ampliar o modelo SaaS.

**Resolução:** S1–S3 removeram o modelo, contratos e superfícies SaaS; o gate
transversal e o gate de aposentadoria do Console passaram na Acceptance.

### GAP-001 — transição dos dados existentes (decisão registrada)

A instância ISP dedicada começa com banco limpo; não haverá conversão in-place do
schema SaaS. A fonte histórica é preservada por backup completo e exportação
seletiva verificável de dados operacionais. A importação futura será mapeada e
auditável, sem secrets nem estruturas SaaS; ver
`docs/migrations/isp-dedicated-operational-data-export.md`.

**Resolução para o desenvolvimento Newnet:** não existiam dados operacionais;
essa não aplicabilidade foi registrada em `migrations/s2-dev-data-disposition.md`.

### GAP-002 — coabitação de vertentes independentes no mesmo host

Scripts, PM2, backups, banco e vhosts usam nomes globais (`/opt/iastudio`,
`iastudio_db`, `iastudio-api`, `iastudio-worker`). A Capability precisa substituir
todos por recursos parametrizados por aplicação e provar que operações de uma
vertente não atingem outros produtos do host.

**Resolução:** S4 comprovou recursos exclusivos em scripts e no host Newnet,
sem cruzamento com Ctrl Leads e Finanças.

### GAP-003 — governança das vertentes de cliente

A estratégia de branch/repositório e o momento de criar uma vertente ainda não
estão formalizados. Não bloqueia remover SaaS, mas bloqueia declarar uma
verticalização ISP (ou de outro cliente) concluída.

**Resolução de governança:** `docs/deploy-e-versionamento.md` formaliza que cada
vertente nasce em repositório próprio; a Capability ISP continua planejada e não
faz parte desta Acceptance.

## Mapa de capacidades relevante

| ID | Capability | Estado | Contrato / limite |
|---|---|---|---|
| `ia-studio.capability.saas-to-dedicated-installation` | Converter a plataforma compartilhada em aplicação dedicada | `accepted` | `docs/capabilities/saas-to-dedicated-installation.md` |
| `ia-studio.capability.isp-dedicated-product` | Consolidar uma vertente específica para provedor | `planned` | Depende da conversão; receberá contrato próprio antes de implementação. |

O mapa não afirma que capacidades preexistentes estão aceitas: elas ainda não
possuem Capability Contract e Acceptance registrados.

## Arquitetura recuperada e fronteiras alvo

| Área | Estado atual comprovado | Estado alvo |
|---|---|---|
| Core | Organizations, workspaces, environments, membros, perfis, convites, flags, settings e auditoria | Usuários, perfis, convites, flags, settings e auditoria locais; sem escopo técnico de tenant. |
| Auth | JWT distingue ator `org` e `platform`; headers selecionam escopo | JWT de usuário local e ACL sem ator de plataforma ou headers de tenant. |
| Dados | `organization_id` em quase todas as entidades e demais escopos onde há operação | Dados pertencem implicitamente à instância; relações SaaS saem. |
| Comercial | Licensing, plans, usage, subscriptions, charges e limites | Removido; configurações funcionais não dependem de plano ou billing. |
| Integrações | Curadoria Console e install por organização; connections, secrets e storage escopados | Registry, Connection, Secret e Storage locais; curadoria e install SaaS saem. |
| Eventos/workers | Envelope contém organização/workspace/ambiente; BullMQ separado | Correlação e idempotência ficam, sem tenant. |
| Painéis | Admin do cliente e Console SaaS | Apenas painel da aplicação dedicada. |
| Infra | Caminho, banco, PM2, backup e Nginx globais | Recursos exclusivos e parametrizados por aplicação da vertente. |

## Invariantes e fluxos críticos

1. Uma vertente atende um cliente e não recebe tenant em request, JWT, evento,
   fila ou persistência.
2. Install, upgrade, backup, restore e uninstall só afetam a aplicação informada.
3. Credenciais continuam cifradas e nunca aparecem em API, backup comum ou logs.
4. ACL, auditoria, Event Bus, workers e integrações mantêm suas responsabilidades
   depois da retirada do escopo SaaS.
5. ISP continua vertente posterior; nenhuma regra ISP retorna ao core como regra
   de tenant.

- **Login local:** usuário → JWT local → PermissionsGuard → rota.
- **Operação integrada:** painel → API → módulo → Connection/Secret/Provider →
  evento ou worker, com correlação local.
- **Operação da aplicação:** `app-id` validado → recursos exclusivos →
  instalação, atualização, backup, restore ou remoção dessa aplicação.

## Fontes de verdade

- Capability: `docs/capabilities/saas-to-dedicated-installation.md`.
- Decisão: `docs/rfcs/RFC-001-conversao-saas-instalacao-dedicada.md`.
- Estado real: `platform-api/`, `platform-admin/` e `scripts/`.
- ISP atual: `platform-api/src/modules/isp/README.md`.

Atualizar este Baseline a cada slice estrutural; ele descreve estado e fronteiras
vigentes, não histórico de correções.
