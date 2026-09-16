---
schema: prompt-framework/v1
id: ia-studio.capability.saas-to-dedicated-installation.s1-cut
kind: implementation-manifest
capability_ref: ia-studio.capability.saas-to-dedicated-installation
status: completed
updated_at: 2026-09-15
---

# S1 — Manifesto do corte transversal de tenant

Este documento amarra a implementação de S1. Ele não é uma aceitação, nem
autoriza conversão in-place: a fonte SaaS continua histórica, e o schema alvo
será aplicado somente na instalação ISP limpa após backup e exportação
verificáveis.

## Unidade de mudança

O corte é uma unidade transacional de código: não se pode remover uma claim do
JWT mantendo filtros Prisma, nem remover colunas mantendo envelopes/jobs ou
headers de escopo. A alteração entra no mesmo conjunto de revisão e só pode
avançar para S2 quando o gate transversal não detectar contrato SaaS em nenhuma
das superfícies abaixo.

| Fronteira | Retirada coordenada | Preservado no alvo |
|---|---|---|
| Schema | `Organization`, `PlatformDomain`, `Workspace`, `Environment`, `WorkspaceMember`, modelos comerciais e todos os campos/FKs/índices de `organization_id`, `workspace_id`, `environment_id` | Usuário, perfil local, convite local, logs, settings e entidades operacionais; pertencimento implícito à instância. |
| JWT/Auth | `ActorType`, `is_platform_admin`, `organization_id`, invalidação por organização e `tenant.util` | `sub`, sessão/versão de token, usuário local e autenticação por senha. |
| ACL | bypass `PLATFORM_ADMIN`, lookup de `WorkspaceMember` e validação de escopo por header | Perfil local e catálogo de permissões funcionais com `@RequirePermissions`. |
| API/Auditoria | headers `x-workspace-id`/`x-environment-id`, query/body de organização e endpoints de organização/workspace/domínio/comercial | Rotas funcionais locais, IP/user-agent/diff e identificador do usuário na auditoria. |
| Eventos/Workers | campos de escopo no envelope, `AutomationEventLog`, jobs e filtros de consumer | `event`, `trace_id`, `source_event_id`, payload mínimo, idempotência e processos API/worker separados. |

## Fan-out que precisa mudar junto

1. O schema é reduzido em conjunto com o Prisma Client esperado pelas camadas
   seguintes. Não há migration contra a base SaaS nem reaproveitamento de suas
   tabelas.
2. Repositories/serviços/DTOs que recebem ou propagam um dos três IDs passam a
   operar no contexto implícito da instância, incluindo core, integrações,
   comunicação, automação, IA, ISP, recursos e developer tools.
3. Producers e consumers usam o novo `EventEnvelope`; a reexecução por
   `source_event_id` mantém a garantia de idempotência sem identificar tenant.
4. `app.module.ts` e `worker.module.ts` deixam de importar módulos de
   organização/workspace/licensing/billing e nenhum consumidor usa
   `LimitsService`/`UsageService`.
5. Os contratos expostos removem campos/headers SaaS no mesmo change-set; não
   haverá modo de compatibilidade que aceite tenant silenciosamente.

## Gate e evidência de progresso

`scripts/migration/verify-dedicated-cut.sh` cobre schema, JWT/auth, ACL, API e
eventos. No estado recuperado, o relatório encontra resíduos em todas as cinco
superfícies; isso é baseline de bloqueio, não sucesso parcial. A condição de
saída técnica deste sub-slice é:

```bash
scripts/migration/verify-dedicated-cut.sh --check
```

com saída zero, seguida de validação estática e integração de login, ACL,
auditoria e job. Até essas provas existirem, S1 e a Capability mãe permanecem
`in-progress`.

Além das contagens, o gate calcula progresso com a linha de base S1 por camada.
O denominador inclui toda referência bloqueante inicial; adaptadores temporários
continuam como restantes até sair do código. Portanto uma camada com zero
ativas, mas temporárias, não é apresentada como concluída.

O gate classifica referências em três grupos, sem reduzir o critério de saída:

| Classe | Significado | Efeito em `--check` |
|---|---|---|
| Ativa/bloqueante | Código que ainda persiste, resolve, recebe ou propaga tenant em uma superfície de execução. | Falha. |
| Temporária/bloqueante | Adaptador de transição que só existe para recusar explicitamente o contrato SaaS (`tenant.util` e guard do Console). | Falha até a remoção do adaptador. |
| Legada/documental | Recovery, RFC, changelog e evidência histórica fora das superfícies executáveis do gate. | Não é varrida pelo gate; permanece apenas como documentação histórica. |

Não há referência funcional "permitida" para fins de aceite. A classificação
temporária evita priorização errada durante a transição, mas não flexibiliza a
saída zero.

### Linha de base aferida em 2026-09-14

| Superfície | Referências detectadas | Arquivos afetados |
|---|---:|---:|
| Schema | 209 | 1 |
| JWT/Auth | 68 | 8 |
| ACL | 53 | 7 |
| API/Auditoria | 1.254 | 182 |
| Eventos/Workers | 735 | 99 |

As superfícies se sobrepõem por desenho (por exemplo, `shared/auth` participa de
auth e ACL); os números não devem ser somados como contagem de arquivos. Eles
mostram que qualquer alteração parcial criaria contratos incompatíveis.

### Execução em curso — bloco Auth/ACL/API de borda

Aplicado neste sub-slice, ainda sem Acceptance:

- JWT e `/auth/login`/`/auth/me` agora expõem apenas identidade e perfil local;
  não emitem ator de plataforma, organização, workspaces, ambientes ou licença.
- `PermissionsGuard` resolve somente o perfil local; removidos bypass de
  plataforma, `WorkspaceMember` e leitura de `x-workspace-id`.
- O contexto de auditoria e os security logs não gravam escopo SaaS novo.
- Chamadas remanescentes a headers/resolvedores de tenant falham de modo
  explícito, sem fallback para uma organização implícita.

Após a retirada do registro global do guard de Console, o gate registra
`auth: 0 ativas + 12 temporárias`, `ACL: 0 ativas + 12 temporárias` e
`API: 1.227 ativas`; schema e eventos continuam na linha de base. Esses números
representam pendências de propagação, incluindo adaptadores SaaS que serão
eliminados, e não uma condição de aceite.

### Execução em curso — Event Bus, producers, consumers e worker

Aplicado no mesmo corte, ainda sem Acceptance:

- `EventEnvelope`, `AutomationEventLog`, persistência, replay e listagem de
  eventos não recebem, não persistem e não validam tenant.
- Os producers de inbound WhatsApp, YCloud, execução de agente e nó de evento
  da automação publicam somente evento, correlação, idempotência e payload.
- O dispatcher do worker busca os fluxos publicados da instância e não filtra
  pelo escopo do envelope.
- O consumer do assistente deixa de comparar ou ler tenant do envelope. As
  operações internas que ainda recebem IDs do agente permanecem referências
  **ativas/bloqueantes** de dados e serviços, não um fallback de evento.

Após essa propagação, a leitura é `schema: 205 ativas`, `API: 1.204 ativas` e
`eventos: 701 ativas`. A redução do envelope não autoriza considerar os modelos
operacionais que ainda carregam escopo como temporariamente permitidos.

### Execução em curso — cadeia dispatcher → workflow → execução

Aplicado antes da alteração do schema desses modelos:

- DTOs, controllers, services e repositories de workflows/execuções deixaram de
  receber, validar ou filtrar organização, workspace e ambiente.
- A criação de workflow/execução não registra mais esses campos e não depende de
  `LimitsService` ou `UsageService`.
- O motor não injeta o escopo em `NodeExecutionContext` e o resolvedor de
  variáveis não oferece o namespace `env` com IDs SaaS.

Os nós de integração, template, comunicação e notificação eram os consumidores
diretos que ainda exigiam escopo. A propagação começou pelas portas de origem:

- `ConnectionsService.execute`, `TemplatesService.render`, `EmailOrchestrator`
  e `WhatsappOrchestrator` agora recebem somente os dados operacionais locais;
  não existe sobrecarga que aceite organização, workspace ou ambiente.
- `NotificationCenter` e seus repositórios/controladores deixam de serializar
  escopo SaaS em jobs, renderização de template, entrega por WhatsApp/e-mail ou
  sino local.
- Os nós `HTTP_REQUEST`, `CONNECTION_EXECUTE`, `TEMPLATE_RENDER`, `EMAIL_SEND`,
  `WHATSAPP_SEND` e `NOTIFY` consomem as portas dedicadas. Uso, limites e
  metering comercial foram retirados do envio de e-mail e WhatsApp.

Os serviços, controllers e modelos que ainda leem ou persistem campos antigos
continuam dependências **ativas/bloqueantes**. Eles não recebem UUID sentinela,
valor padrão ou adaptador que reconstitua tenant. O schema de `Workflow` e
`WorkflowExecution` só será reduzido depois que essas superfícies e seus
consumidores estiverem desacoplados por completo.

A última leitura após esta propagação é `schema: 205 ativas`, `API: 942
ativas` e `eventos: 531 ativas`; Auth/ACL permanecem sem referências ativas,
com os 12 adaptadores temporários bloqueantes cada. O gate ainda falha, logo S1
e a Capability mãe seguem `in-progress`.

O sub-slice ISP de incidentes removeu o escopo dos contratos de incidente,
targets, dispatches, alertas de plantão, resolvedor de ERP, configuração
operacional, cron de outage e tools correlatas. A leitura seguinte é `schema:
205 ativas`, `API: 850 ativas` e `eventos: 531 ativas`; Auth/ACL ainda têm os
12 adaptadores temporários bloqueantes cada. Templates e inbound/inbox de
WhatsApp continuam referências ativas, não exceções de transição.

O sub-slice WhatsApp removeu tenant dos templates HSM (CRUD, replicação e sync
Meta), webhook inbound, repositório de chats, inbox HTTP e seus consumidores
diretos de IA/ISP. Os contratos continuam centrados em `connection_id`, chat e
usuário local. A leitura seguinte é `schema: 205 ativas`, `API: 753 ativas` e
`eventos: 434 ativas`; a atribuição completa de atendimento ainda é consumidor
ativo e permanece fora de qualquer lista temporariamente permitida.

O sub-slice de atendimento retirou escopo SaaS das ações de claim, release,
transfer, close, reopen e takeover, da timeline persistida, de equipes, filas,
membros e do encaminhamento de fila usado pelo ISP. Não há adaptador paralelo:
as portas canônicas e seus consumidores agora recebem somente chat, usuário,
fila ou equipe locais. Em seguida, o CRUD, versões, importação/exportação e
execução HTTP de agentes deixaram de aceitar organização, workspace ou ambiente
e não acionam licensing ou metering. A leitura atual é `schema: 205 ativas`,
`API: 638 ativas` e `eventos: 319 ativas`; o runner de agentes ainda depende
funcionalmente de provider, catálogo de ferramentas, RAG e colaboração, logo
permanece ativo/bloqueante. Auth/ACL continuam com 12 adaptadores temporários
bloqueantes cada; S1 e a Capability permanecem `in-progress`.

No fluxo de execução de agentes, a resolução de provider e o orquestrador de
conexões de IA passaram a operar na instalação local. Embeddings, Console de
Desenvolvedor, sugestão de recursos, análise de atendimento e revisão de
conteúdo consomem essa porta sem organização, workspace ou ambiente. O runner
continua bloqueado pelos contratos ainda ativos de tools, RAG, colaboração e
aprovações; eles não foram mascarados por contexto sintético. A leitura atual
é `schema: 205 ativas`, `API: 626 ativas` e `eventos: 309 ativas`; Auth/ACL
mantêm 12 adaptadores temporários bloqueantes cada e S1 segue `in-progress`.

Ainda no mesmo corte de execução, o catálogo consumido pelo agente, a consulta
RAG e a colaboração entre agentes passaram a receber somente IDs locais de
ferramenta, base, agente, run e correlação. O contexto SaaS não foi replicado
nessas portas. `ToolExecutionContext`, runtime de tools, aprovações, logs e a
persistência de runs ainda carregam referências ativas e permanecem no corte,
sem exceção temporária. Leitura atual: `schema: 205 ativas`, `API: 620 ativas`
e `eventos: 303 ativas`; Auth/ACL mantêm 12 temporárias bloqueantes cada.

O runner passou a persistir e retomar `AiAgentRun` somente por IDs locais de
agente, execução, correlação e contexto conversacional. Budget, metering e
licensing foram removidos desse caminho; o evento concluído continua carregando
somente run, agente, status e tokens. `ToolExecutionContext`, runtime, logs e
aprovações ainda são o concentrador ativo porque a retomada aprovada depende do
mesmo contrato. Leitura atual: `schema: 205 ativas`, `API: 610 ativas` e
`eventos: 293 ativas`; Auth/ACL mantêm 12 temporárias bloqueantes cada.

Storage foi convertido para gravação, listagem e download locais, sem metering;
os handlers de histórico, diagnóstico ISP e leitura de fila passaram a usar
portas locais. O gerador de link de pagamento ISP ainda persiste escopo e segue
ativo/bloqueante antes da limpeza definitiva de `ToolExecutionContext` e das
aprovações. Leitura atual: `schema: 205 ativas`, `API: 597 ativas` e `eventos:
292 ativas`; Auth/ACL mantêm 12 temporárias bloqueantes cada.

O corte de execução aprovada foi concluído no código de execução: storage,
links de pagamento ISP e handlers operam por instalação; `ToolExecutionContext`,
runtime, log de tool, política/solicitação de aprovação e reconstrução após a
decisão guardam apenas IDs de agente, run, execução, correlação, memória e
conversa. Não há `organization`, `workspace` ou `environment` reconstituído
após aprovação. Os fluxos administrativos de políticas/aprovações ainda são
consumidores ativos e mantêm o schema preservado. Leitura atual: `schema: 205
ativas`, `API: 587 ativas`, `eventos: 285 ativas`; Auth/ACL mantêm 12
temporárias bloqueantes cada.

## Execução em curso — lote de conhecimento, catálogo e MCP

O lote consolidou as superfícies administrativas e de execução de IA que ainda
propagavam tenant: CRUD e persistência de knowledge/RAG, memória, colaboração,
revisão de conteúdo, análise de atendimento, catálogo/seed de tools e MCP. As
portas agora operam com IDs locais; os modelos correspondentes tiveram campos e
índices de escopo removidos somente depois de a busca por consumidores diretos
ficar vazia. O módulo de custos/orçamentos e seus consumidores foi retirado por
ser metering comercial incompatível com a instalação dedicada.

Também foram removidos do schema os resíduos desses fluxos, inclusive
`AiCostRecord` e `AiBudget`, sem reaproveitar a base SaaS. Nenhum contrato usa
valor sentinela, `undefined` artificial ou adaptador de compatibilidade para
reconstruir o escopo.

Leitura objetiva atual do gate: `schema: 164 ativas`, `auth: 0 ativas + 12
temporárias bloqueantes`, `ACL: 0 ativas + 12 temporárias bloqueantes`, `API:
372 ativas`, `eventos: 70 ativas`. Isso equivale a `S1 72,8%` (630 de 2.319
referências bloqueantes ainda restantes). Logo o gate segue falhando de modo
esperado e S1/Capability continuam `in-progress`.

O corte de identidade administrativa local foi aplicado em usuários, perfis e
convites: CRUD, convite público, perfil ACL, auditoria e persistência não
originam nem validam organização/workspace. Memberships e a API/módulo de
workspaces foram removidos, incluindo a relação física `WorkspaceMember`, pois
não há conceito equivalente em uma instalação dedicada.

Os adaptadores temporários de Auth/ACL permanecem bloqueantes, corretamente:
há consumidores reais de `tenant.util` fora do fluxo de identidade (por exemplo,
organizações, recursos, settings, WhatsApp e Developer Tools). Eles não serão
apagados ou flexibilizados antes da remoção dessas chamadas de origem. Leitura
após este corte: `schema: 161 ativas`, `auth: 0 ativas + 12 temporárias`, `ACL:
0 ativas + 12 temporárias`, `API: 275 ativas`, `eventos: 70 ativas`; `S1 77,1%`
(530/2.319 bloqueantes restantes).

O próximo bloco coerente é remover as superfícies remanescentes de
organização/workspace e seus consumidores administrativos, preparando a retirada
dos adaptadores de Auth/ACL somente quando não houver chamada ativa.

## Lote administrativo local — em curso

Settings, Resource Mapping/Explorer/Suggest, API Keys, Console de Developer
Tools, OAuth Google e as portas administrativas de WhatsApp passaram a usar
contratos locais. A persistência de `IntegrationLog`, sessão Baileys, estado de
sync e vínculo canal→agente também teve os campos de tenant removidos somente
depois que seus consumidores diretos foram limpos. O resolvedor `tenant.util`
foi removido: não há chamada ativa, header de workspace/ambiente ou fallback
substituindo-o.

Feature flags, auditoria e dashboards agora operam na instalação local; o
endpoint de conta/licença foi retirado. A gestão de usuários por organização
também foi retirada. O gate registra: `schema: 137 ativas`, `auth: 0 ativas +
4 temporárias bloqueantes`, `ACL: 0 ativas + 4 temporárias bloqueantes`, `API:
126 ativas`, `eventos: 20 ativas`; `S1 87,5%` (291/2.319 bloqueantes restantes).
As quatro temporárias são exclusivamente o guard administrativo ainda consumido
por superfícies SaaS remanescentes; elas continuam bloqueantes. S1 e a
Capability mãe permanecem `in-progress`.

## Limites explícitos

- Não criar uma organização local de fachada, UUID sentinela, header opcional ou
  campo `metadata` para simular tenant.
- Não remover apenas o front, o JWT ou o schema isoladamente.
- Não importar NDJSON diretamente sem o mapeamento/auditoria previsto em
  `docs/migrations/isp-dedicated-operational-data-export.md`.
- Não incluir a vertical ISP/IXC neste corte de plataforma; ela continua
  Capability dependente.

## Gate transversal de S1 — evidência estrutural concluída

Em 2026-09-15, `scripts/migration/verify-dedicated-cut.sh --check` retornou
saída zero: Schema, Auth, ACL, API e Eventos registram cada um **0 referências
ativas**, **0 temporárias bloqueantes** e **100%** contra a linha de base de
2.319 referências. O `git diff --check` também retornou saída zero.

O resultado confirma a unidade transversal do corte: não há tenant no schema
alvo, JWT/ACL, contratos HTTP, persistência de eventos ou workers verificados.
O guard SaaS e `tenant.util` foram removidos; as rotas administrativas restantes
são autorizadas pela ACL local de um perfil administrativo criado no bootstrap
de uma base dedicada vazia.

Isto não encerra a Capability nem declara Acceptance integrado: a criação real
da base PostgreSQL limpa, a exportação/importação seletiva auditável, o painel
dedicado e a operação de múltiplas instâncias pertencem aos slices posteriores.
Por isso S1 e a Capability mãe permanecem `in-progress` até a evidência
operacional exigida no contrato.
