---
schema: prompt-framework/v1
id: ia-studio.capability.saas-to-dedicated-installation
kind: capability
version: 1.0.0
status: in-progress
title: Conversão de SaaS para instalação dedicada
policy_refs:
  - workflow.capability-contract@1.0.0
  - workflow.architecture-baseline@1.0.0
baseline_ref: docs/architecture-baseline.md
decision_ref: docs/rfcs/RFC-001-conversao-saas-instalacao-dedicada.md
owners:
  - robson
---

# Capability Contract — Conversão de SaaS para instalação dedicada

## Objetivo e fronteira

Entregar o IA Studio como aplicação dedicada por cliente: sem multi-tenancy,
Console SaaS ou comercialização/gestão compartilhada. Uma instância pode coexistir
com outras no mesmo host, mas é independente em aplicação, processo, banco, dados,
configuração, armazenamento, fila, backup e domínio.

Esta Capability transforma a estrutura-base. Ela não cria automaticamente uma
vertente de negócio; ISP/IXC será Capability dependente.

## Atores, entradas e saídas

| Elemento | Definição |
|---|---|
| Atores | Administrador local, usuários com perfis locais e administrador de infraestrutura. |
| Entradas | Credenciais/permissões/configurações locais, integrações da instância e identificador explícito de instância nos scripts. |
| Saídas | Operação dedicada e ciclo independente de instalação, upgrade, backup, restore e uninstall. |
| Não há | Ator de plataforma, organização/tenant, workspace/ambiente, plano, licença, trial, cobrança, consumo comercial, Console ou roteamento por tenant. |

## Estado alvo e fluxos

O estado é `in-progress`: Recovery, RFC e contrato estão concluídos; a conversão
ainda não. Só passa a `structurally-complete` quando os itens obrigatórios
existirem e a `accepted` após Capability Acceptance integrada.

**Uso local:** usuário → JWT local → ACL → rota; registros pertencem à instância;
eventos/jobs conservam trace e idempotência sem tenant.

**Infraestrutura:** ID de instância validado → recursos exclusivos resolvidos →
install/upgrade/backup/restore/uninstall dessa instância. Falha de A não afeta B.

## Dados, contratos e dependências

| Área | Obrigação de conversão |
|---|---|
| Schema | Retirar `Organization`, `PlatformDomain`, `Workspace`, `Environment`, memberships, FKs/índices/campos de escopo e planos/licenças/uso/assinaturas/charges/cupons. |
| Operação | Reescrever repositories, serviços, DTOs e queries sem filtros ou entradas de tenant. |
| Auth | Retirar `ActorType`, `PLATFORM_ADMIN`, `organization_id` no JWT e `PlatformAdminGuard`; preservar login, senha, sessão e ACL local. |
| API | Retirar headers `x-workspace-id`/`x-environment-id`, `tenant.util`, endpoints SaaS e contratos que recebem/devolvem escopo. |
| ACL | Retirar permissões de Console, billing, licensing, planos, tenants, workspaces e domínios; manter permissões funcionais. |
| Eventos/jobs | Retirar tenant dos envelopes/jobs, preservando correlação, idempotência e workers separados. |
| Painel | Remover `platform-console`, seletor/contexto de workspace e telas comerciais SaaS; preservar fluxos operacionais. |
| Integrações | Manter Providers, Connections, Secrets, Storage e logs; retirar install/curadoria SaaS e Limits/Usage. |
| Infra | Parametrizar scripts e PM2; nenhum recurso operacional tem nome global fixo. |

## Segurança, auditoria e observabilidade

- Segredos permanecem cifrados e não retornam decifrados por API.
- Toda mutation sensível continua ACL + auditoria; auditoria passa a ser local.
- Logs, filas, backups e artefatos usam identificadores exclusivos por instância;
  falhas são explícitas, nunca caem em recurso global/padrão.
- Scripts validam o identificador antes de compor caminho, processo, banco ou vhost.

## Slices e dependências

| Slice | Conteúdo | Depende de | Estado |
|---|---|---|---|
| S0 — Recovery e contrato | Baseline, Capability Map, RFC e contrato local | decisão do produto | concluído neste slice |
| S1 — núcleo dedicado | Modelo de dados alvo, exportação seletiva controlada, auth/ACL/eventos locais e retirada do tenant context | política de dados decidida | concluído — gate transversal 100%, sem bloqueantes nas cinco camadas |
| S2 — propagação operacional | Repositories, serviços, DTOs, módulos, jobs e integrações sem escopo SaaS; retirada de Licensing/Billing | S1 | concluído — gate local aprovado; exportação/importação é não aplicável à primeira instância sem clientes, conforme `migrations/s2-dev-data-disposition.md` |
| S3 — superfícies dedicadas | Migração de atualização/backup/restauração para a administração local; remoção de Console e UI/rotas/contextos SaaS | S1 | concluído — matriz e gate em `saas-to-dedicated-s3-console-matrix.md` |
| S4 — instâncias no mesmo host | Install/upgrade/backup/restore/uninstall isolados | S1 e contratos de runtime finais | em andamento — isolamento estático aprovado; primeira prova real revelou PostgreSQL local na porta 5433 contra instalador fixo em 5432. O preflight passa a descobrir/validar a porta antes de criar recursos; faltam instalação limpa de A e prova de B. |
| S5 — Acceptance | Evidência integrada e documentação viva | S1–S4 | pendente |

S1 é o corte estrutural concluído: dados, autenticação, ACL, API e eventos foram
reduzidos juntos ao escopo local. S2–S4 continuam necessários para a aceitação
da Capability, pois cobrem painéis, implantação, dados reais e operação isolada.

O corte S1 é tratado como uma única mudança transversal: schema, JWT, guards/ACL,
headers/API, auditoria de request e envelopes/producers/consumers de evento devem
ser atualizados no mesmo conjunto integrado. O gate
`scripts/migration/verify-dedicated-cut.sh --check` é a evidência mínima de que
essas superfícies não ficaram em estados mistos; enquanto ele falhar, S1 e a
Capability permanecem `in-progress`.

O encadeamento executável e os limites da alteração estão em
[`saas-to-dedicated-s1-cut-manifest.md`](saas-to-dedicated-s1-cut-manifest.md).
Ele registra o fan-out como uma única unidade de mudança; não substitui os
critérios de Acceptance nem segmenta a remoção por arquivo.

S2 usa `scripts/migration/verify-operational-dedicated.sh` para impedir que
contratos executáveis retomem organização/workspace/ambiente, tenant ou
Licensing/Billing. A única referência de organização permitida fica no
exportador histórico, que é somente leitura e é validado antes de revisão por
`verify-isp-operational-export.sh`; ela nunca entra na aplicação dedicada.
Na primeira instalação de desenvolvimento não há dados operacionais para mover:
essa parte é formalmente não aplicável em
[`s2-dev-data-disposition.md`](../migrations/s2-dev-data-disposition.md), não
substituída por backup vazio ou schema SaaS reutilizado.

S4 usa `scripts/migration/verify-instance-isolation.sh` como gate estático: ele
deriva recursos de dois IDs distintos e exige banco/role, Redis, PM2, diretório,
vhost e lock exclusivos, além de schema inicial `--from-empty` sob advisory
lock. A prova final ainda requer criar e operar duas instâncias reais no mesmo
host, sem cruzamento de dados ou processos.

## Critérios de Acceptance

1. O schema não contém modelos, campos, relações, índices ou consultas de
   organização, workspace, ambiente, domínio por tenant, plano, licença, uso,
   assinatura, cobrança ou cupom.
2. Login, convite, perfis, ACL e auditoria funcionam para usuários locais; JWT,
   headers, rotas e eventos não aceitam/resolvem tenant.
3. Integrações, segredos, storage, WhatsApp, IA, automação, ISP, developer tools,
   system e workers funcionam sem `LimitsService`, `UsageService` ou filtros SaaS.
4. Console, endpoints, guards, builds, dependências e permissões SaaS não existem;
   o painel local não mostra workspace/ambiente ou gestão comercial SaaS.
5. Duas instâncias são operáveis no mesmo host com bancos/roles, diretórios,
   storage, Redis, PM2, backups e vhosts distintos; operar A não altera B.
6. A instância ISP começa em base limpa. Quando existir dado operacional a
   preservar, há backup verificável, exportação seletiva e importação
   mapeada/auditável, sem perda silenciosa. Para a primeira instalação de
   desenvolvimento, sem clientes nem dados operacionais, a não aplicabilidade
   está registrada em `migrations/s2-dev-data-disposition.md`.
7. Segurança, ACL, auditoria, logs, Event Bus, jobs e erros têm evidência
   proporcional após a conversão.
8. README, CLAUDE, lock, deploy e documentos de módulo descrevem o modelo dedicado
   real; divergências SaaS foram removidas antes da aposentadoria.

## Fora de escopo

- Implementar a vertente ISP/IXC, identidade de um provedor ou regras desse cliente.
- Converter o Delivery System; ele exige Baseline e Capability próprios.
- Definir vertentes/branches sem decisão do dono.
- Apontar `db push --accept-data-loss` para a fonte SaaS histórica ou executá-lo
  antes de backup completo e exportação seletiva verificável.

## Matriz de rastreabilidade

| Regra | Dados | API/evento | Interface/infra | Evidência |
|---|---|---|---|---|
| Sem tenant | schema sem escopo | JWT/headers/envelope locais | painel sem seletor | schema, contratos e login/job |
| Um cliente por instalação | configuração/storage locais | sem resolução por organização | identidade local | duas instâncias isoladas |
| Operação segura | banco/backup exclusivos | scripts validam ID | PM2/Nginx/Redis por instância | operação cruzada sem efeito |
| Funções preservadas | registros locais | serviços sem Limits/Usage | painel funcional | regressão integrada |

## Política de validação

Cada slice recebe validação técnica mínima proporcional e atualiza esta Capability
sem antecipar homologação. Capability Acceptance ocorre uma vez, após S1–S4,
conforme `workflow.doctrine.testing`; até então o estado permanece `in-progress`.
