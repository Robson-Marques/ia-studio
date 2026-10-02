# ESTADO DO TRABALHO — handoff entre sessões (LER PRIMEIRO)

> Este arquivo existe porque a memória do assistente é compactada em sessões
> longas e ele perde o fio (principalmente rastreando versão). **A fonte da
> verdade é o git + este doc, NUNCA a memória.** Toda sessão nova começa lendo:
> (1) `git log --oneline -3` e `git tag`, (2) este arquivo, (3) `CLAUDE.md`,
> (4) a spec da frente atual. Ao terminar uma frente, ATUALIZAR este arquivo.
>
> Última atualização: 2026-10-02 (alinhamento aprovado: IA Studio é
> estrutura-base; cada cliente recebe vertente e repositório próprios).

## Frente atual — vertentes próprias e reinício limpo do desenvolvimento

O modelo anterior de “duas instâncias do mesmo checkout” foi corrigido. A prova
com `ia-dev` e `ia-teste` demonstrou isolamento de recursos, mas essas instalações
são descartáveis e não representam clientes. O destino agora é:

- IA Studio permanece a estrutura-base conceitual;
- este repositório GitHub atual é a implementação Newnet ISP e sua fonte de
  instalação neste momento;
- uma futura loja ou outro cliente nasce em outro repositório/vertente, com os
  módulos pertinentes a seu negócio;
- o host somente coabita aplicações independentes, cada uma em `/opt/<app-id>`
  e com banco, Redis, PM2, domínio, storage e backup próprios.

S1 e S2 estão 100% concluídos; S4 e a Capability geral seguem `in-progress`. S4 foi
redefinido para provar instalação limpa da vertente Newnet e coexistência sem
cruzamento com Finanças, Mercado e os demais produtos reais do host — não exige
manter uma segunda cópia idêntica do IA Studio. A remoção de `ia-dev` e
`ia-teste` foi autorizada porque não há dados a preservar, mas só ocorre após a
tag que materializa este contrato. O backup que criou arquivo e permaneceu em
`RUNNING` ainda exige evidência de log do host; reinstalação não substitui esse
diagnóstico nem marca S4 como concluído.

Atualização de 2026-10-02: a vertente Newnet foi instalada limpa em
`/opt/newnet-ia-studio`, com banco/role, Redis, PM2, Nginx e HTTPS próprios; Ctrl
Leads e Finanças permaneceram online. A primeira prova de backup confirmou que
o pacote era criado e a unidade systemd concluía, mas `system_restores` ficava
`RUNNING`. O diagnóstico transacional identificou o motivo: o id físico da
tabela é `text` e o writer aplicava `::uuid`. A correção versionada remove esse
cast e deixa falha de persistência visível. O backup na `v0.11.30` chegou a
`SUCCESS`, com logs e arquivo persistidos; S2 foi concluído. A primeira
restauração revelou uma regressão operacional: o script removia `public`, perdia
`pgvector`, abortava antes de aplicar `db.sql` e o trap antigo religava
API/worker contra banco vazio. A correção `v0.11.31` aplica dumps
`--clean --if-exists` sem derrubar `public`, garante a extensão pelo
administrador do cluster, preserva snapshot para rollback e não inicia serviços
se o banco não estiver recuperável. S4 continua pendente até a recuperação real
do pacote Newnet e um ciclo novo de backup/restauração verde.

## Auditoria pós-faxina — 2026-09-30

Os gates de S1, S2 operacional, S3, S4 estático e removedor SaaS passaram com
o checkout `v0.11.28`. Não há resíduo funcional de tenant, Console, Baileys,
Gemini/Ollama, licensing ou billing. Foram corrigidos metadados e READMEs vivos
que ainda descreviam SaaS, e a especialidade WhatsApp que ordenava reintroduzir
Baileys/coexistência foi aposentada e retirada do catálogo ativo. O diretório
físico `platform-console/` foi confirmado vazio e fora do Git; sua remoção é
somente housekeeping local, sem impacto funcional. S1 permanece 100%; S2/S4 e a
Capability geral permanecem `in-progress` até a prova real da segunda instância
e a Acceptance integrada.

Atualização `v0.11.26`: os wrappers públicos de instalação e desinstalação
chamam explicitamente o Bash antes de delegar. Isso elimina a dependência do bit
executável que bloqueou a primeira tentativa de criar a segunda instância; o
gate S4 verifica esse contrato.

Atualização `v0.11.27`: a instalação dedicada força ambiente de build antes do
`npm install`, mesmo quando iniciada após carregar o `.env` de uma instância
existente. Também foram removidas crases que o heredoc SQL expansível tentava
executar como comando. A tentativa parcial de `ia-teste` deve ser removida pelo
desinstalador dedicado antes de nova execução; S4 continua `in-progress` até a
prova com as duas instâncias ativas.

Atualização `v0.11.28`: a primeira prova real de backup do `ia-teste` criou o
pacote mas revelou que a row do painel dependia de callback em memória da API e
ficava presa em `RUNNING`. O backup passa a rodar via unidade systemd e a
auto-reportar logs/estado terminal na base local; linhas órfãs por mais de 30
minutos são marcadas `FAILED`. S4 permanece `in-progress` até repetir backup e
restauração isolados com o novo mecanismo e confirmar que `ia-dev` não muda.

## Checkpoint S3 — Console SaaS → administração local

S3 está **concluído**. A matriz de decisão e a evidência do corte estão em
[`docs/capabilities/saas-to-dedicated-s3-console-matrix.md`](capabilities/saas-to-dedicated-s3-console-matrix.md): as funções operacionais de atualização,
backup e restauração foram migradas para `platform-admin` em
**Configurações → Administração da instalação**, com autorização local
`system.maintain`; as superfícies comerciais e de plataforma foram removidas.
O gate `scripts/migration/verify-console-retirement.sh` passou, sem
`platform-console`, rota, menu, endpoint, build, publicação ou vhost `/console/`
ativo. Não houve tag, release ou deploy.

S1 permanece **100% concluído**. A Capability geral segue **`in-progress`**:
o próximo slice é S2, PostgreSQL dedicado limpo e migração seletiva auditável;
S4 (instalação e isolamento de múltiplas instâncias) continua pendente e não
integra este checkpoint.

Atualização de 2026-09-15 (S2 em andamento): runtime, auditoria e respondente
WhatsApp não conservam mais contratos SaaS residuais; o gate
`verify-operational-dedicated.sh` passa. A exportação da fonte histórica agora
registra seleção, contagem e checksum por tabela e o verificador independente
recusa NDJSON com campos sensíveis. A importação permanece deliberadamente
inexecutada: faltam backup completo verificável, seleção operacional aprovada
e o artefato exportado real da instância ISP. Não há importação automática,
SQL de restauração ou inferência de relações filhas.

O procedimento de S2 já separa `backup-saas-historical.sh` do backup da nova
instalação: o snapshot histórico, incluindo segredos, é verificável e serve
somente a rollback da fonte SaaS; sua política proíbe restore no dedicado.

Atualização de 2026-09-15 (S4 em andamento): install, provisionamento, upgrade,
backup, restore e uninstall recebem lock por instância; banco/role, Redis,
processos PM2, diretório, storage, backup e vhost são derivados do
`instance-id`. O antigo uninstall global foi substituído por remoção confirmada
da instância indicada, sem apagar dependências do host ou outros clientes. O
gate estático `verify-instance-isolation.sh` passou para `isp-a` e `loja-b`.
Ainda falta a prova no servidor de duas instalações reais e operações cruzadas
sem efeito.

Atualização de 2026-09-18 (S2): o responsável confirmou que não há clientes nem
dados operacionais na instalação de desenvolvimento. A migração seletiva não é
necessária para a primeira instância; isso foi registrado em
`docs/migrations/s2-dev-data-disposition.md`, sem backup vazio ou conversão do
schema SaaS. O corte de código e a disposição de dados de S2 foram aprovados
pelo gate operacional; ver a reclassificação de estado abaixo (v0.11.6).

Atualização de 2026-09-18 (S4, evidência real): o SaaS legado foi removido pelo
removedor restrito sem afetar os processos PM2 de Ctrl Leads ou Finanças. A
primeira criação de `ia-dev` revelou um cluster PostgreSQL 17 ativo em
`localhost:5433`; o instalador fixava `127.0.0.1:5432`, criando uma instância
parcial antes do provisionamento. A correção em andamento descobre a porta do
cluster e valida TCP antes de criar recursos. S4 permanece 50%: falta remover
somente `ia-dev`, instalar A limpa e provar B no mesmo host.

Atualização de 2026-09-21 (S4 — instalação limpa comprovada + upgrade validado):
a `ia-dev` foi instalada do zero em host real, ponta a ponta — schema
provisionado, `platform-api` (nest build) e `platform-admin` (vite build,
autenticando no registry privado `@studio-ux-ds`) compilados, PM2
`iastudio-ia-dev-api`/`-worker` online, vhost e HTTPS (Let's Encrypt) ativos em
`chat-studio.newnettelecom.com.br`. Ctrl Leads e Finanças seguiram online sem
cruzamento. A atualização pelo painel (Administração da instalação) também foi
exercida com sucesso — primeira atualização dedicada de ponta a ponta.

O caminho exigiu uma sequência de correções de fonte, todas permanentes nos
scripts/código (sem patch manual recorrente):
- v0.11.6 — normalização da `DATABASE_URL` para psql em upgrade/backup/restore
  (o `?schema=public` do Prisma quebrava o libpq);
- v0.11.7 — 26 erros de TypeScript no build da API (SettingsService renomeado,
  imports de auth/Prisma, `agentId`);
- v0.11.8 — token do registry privado `@studio-ux-ds` na instalação (401 no
  build do platform-admin);
- v0.11.9 — permissão do web root do painel para o nginx (umask 077 → 500);
- v0.11.10 — bookkeeping do provisionamento fora do schema `public` (o `db push`
  do upgrade exigia `--accept-data-loss` para dropar a tabela de controle);
  destravou a atualização pelo painel;
- v0.11.11 / v0.11.12 — curadoria do Marketplace (IA só com OpenAI e Anthropic;
  WhatsApp Baileys interno e manual retirados da vitrine).

Falta apenas a prova de B para fechar o S4: uma segunda instância isolada no
mesmo host, sem cruzamento de banco/role, Redis, PM2, diretório, backup ou vhost.

Reclassificação de estado (alinha ESTADO e contrato): S2 fica **em andamento** —
o corte de código está aprovado pelo gate e a migração de dados é não aplicável
(`s2-dev-data-disposition.md`), permanecendo in-progress até a Acceptance
integrada, como já consta no contrato da Capability.

Progresso da Capability (S1–S5; S0 é Recovery e não entra no denominador):
S1 100%, S2 **em andamento**, S3 100%, S4 **75%** (instalação limpa de A e
upgrade comprovados; falta a prova de B), S5 0%; geral **in-progress** (gated por
S2/S4). A instalação limpa de A já passou em host real; faltam a prova de duas
instâncias e a Acceptance integrada.

Atualização de 2026-09-21 (Faxina de código e arquivos mortos — CONCLUÍDA):
frente executada pela especialidade `ia-studio.system-cleanup@1.0.0`, em etapas,
para o repo passar a representar só o que está em uso. Inventário read-only em
[`docs/faxina/etapa-0-inventario.md`](faxina/etapa-0-inventario.md).
- v0.11.16 — cria a especialidade + inventário Etapa 0 (catálogo local → 1.5.0
  na v0.11.17).
- v0.11.17 (Etapa 1) — remove mortos por reachability: pastas-esqueleto SaaS
  vazias (`billing`, `licensing`, `core/organizations`, `core/workspaces`,
  `ai/costs`), arquivos órfãos (`account.js`, `catalog.seed.ts`, um DTO), a tela
  de pagamento SaaS (`PaginaPagamento` + rota `/pagar`) e a linha morta
  `ia-studio.tenant-domains` do catálogo.
- v0.11.18 (Etapa 2a) — remove os motores LLM Gemini/Ollama (arquivos + fiação +
  deps). Enum `AiProviderKind` (Prisma) preservado. `nest build` verde.
- v0.11.19 (Etapa 2b/API) + v0.11.20 (Etapa 2b/admin) — removem o subsistema
  WhatsApp Baileys por completo (modo manual/coexistência + pareamento por QR):
  7 arquivos de API + a pasta `connectors/`, a fiação no inbox/orquestrador/
  responder/seed, os endpoints do controller, as deps npm (`@whiskeysockets/
  baileys`, `qrcode`), e no painel o `whatsappBaileys.js` + a UI em
  `ChatWindow`/`MessageComposer`/`ConexaoDetalhe`/`whatsapp.js`.

- v0.11.22 — limpa também o schema (a pedido do dono, sem órfãos): remove a
  coluna `WhatsappChat.manual_connection_id`, a tabela `WhatsappBaileysSession` e
  os valores de enum `AiProviderKind.GEMINI/OLLAMA`. Como é destrutivo e o upgrade
  usa `db push`, o `upgrade.sh` ganhou o passo idempotente `SCHEMA_HOUSEKEEPING`
  (antes do `db push`) que dropa os objetos e recria o enum quando ainda existem —
  no-op em instalação nova, recuperável (backup roda antes). `nest build` verde com
  o client já sem os campos.

WhatsApp oficial (Meta/YCloud), OpenAI e
Anthropic seguem intactos. Verificação: `nest build` real da API verde no estado
pós-remoção; admin conferido por parser JSX (esbuild) + grep; os quatro gates
verdes em todas as etapas. A prova de build final do admin é a atualização pelo
painel.

## 🏗️ Conversão SaaS → instalação dedicada — Capability ativa

O modelo aprovado é uma instância independente por cliente, não SaaS
multi-tenant. O Architecture Recovery concluiu que a base é suficiente para esta
frente e materializou:

- Baseline: [`docs/architecture-baseline.md`](architecture-baseline.md).
- Decisão: [`docs/rfcs/RFC-001-conversao-saas-instalacao-dedicada.md`](rfcs/RFC-001-conversao-saas-instalacao-dedicada.md).
- Capability Contract em estado **`in-progress`**:
  [`docs/capabilities/saas-to-dedicated-installation.md`](capabilities/saas-to-dedicated-installation.md).
- Manifesto do corte atômico de S1:
  [`docs/capabilities/saas-to-dedicated-s1-cut-manifest.md`](capabilities/saas-to-dedicated-s1-cut-manifest.md).

O primeiro slice técnico é **S1 — núcleo dedicado**: schema, auth, ACL, API e
eventos deixam de depender de organização/workspace/ambiente. A decisão foi
tomada: a instância ISP nasce em banco limpo, a fonte SaaS é preservada e somente
dados operacionais aprovados seguem por exportação NDJSON seletiva e auditável
(sem secrets e sem SQL de restauração); ver
`docs/migrations/isp-dedicated-operational-data-export.md`. A vertical ISP/IXC é
Capability posterior, dependente desta conversão; Delivery System é outro projeto
e não entra nesta frente.

O gate transversal `scripts/migration/verify-dedicated-cut.sh --check` ainda
falha na baseline recuperada (schema 209 referências; auth 68; ACL 53; API 1.254;
eventos 735). Isto impede a conclusão de S1 e da Capability; a próxima alteração
de código deve substituir essas cinco superfícies no mesmo conjunto coeso, sem
compatibilidade de tenant ou correções avulsas.

Atualização de 2026-09-15 (gate estrutural de S1): o corte transversal passou
com `schema 0`, `auth 0`, `ACL 0`, `API 0` e `eventos 0` referências bloqueantes
contra a baseline de 2.319; `git diff --check` também passou. Schema, JWT,
ACL, API e Event Bus não carregam tenant, billing/licensing e os modelos
Organization/Workspace/Environment foram retirados do alvo. O administrador da
instalação é agora um usuário local com perfil ACL completo, sem bypass de
plataforma. S1 e a Capability continuam **`in-progress`**: ainda faltam a prova
em PostgreSQL da base limpa, exportação/importação seletiva auditável, painel
dedicado e isolamento operacional de instâncias dos slices seguintes.

Atualização de 2026-09-15: o lote de IA consolidou knowledge/RAG, memória,
colaboração, revisão de conteúdo, análise de atendimento, tools/seed e MCP como
portas locais. O módulo de custos/orçamentos e seus consumidores foi removido
por constituir metering comercial. Depois de desacoplar todos os consumidores
diretos, os campos/índices desses fluxos foram retirados do schema; não houve
fallback, UUID sentinela, `undefined` artificial ou reclassificação de
referência ativa. Gate atual: `schema 164 ativos`; `auth 0 ativos + 12
temporários bloqueantes`; `ACL 0 ativos + 12 temporários bloqueantes`; `API 372
ativos`; `eventos 70 ativos`; `S1 72,8%` (630/2.319 bloqueantes restantes).
S1 e a Capability seguem **`in-progress`**. O próximo corte é identidade
administrativa local (usuários, perfis, convites e relações de
workspace/organização), pois é o consumidor real dos 12 adaptadores temporários
de Auth e ACL.

Atualização de 2026-09-15 (lote administrativo local): Settings, Resource
Mapping/Explorer/Suggest, API Keys, Developer Tools, OAuth Google e as portas
administrativas de WhatsApp passaram a usar contratos locais. Sessões Baileys,
estado de sync, vínculo canal→agente e IntegrationLog tiveram seus campos
físicos de tenant removidos após a limpeza dos consumidores diretos. O
`tenant.util` foi removido, sem fallback de header/UUID. Flags, auditoria e
dashboards são locais; a API de conta/licença e a gestão de usuários por
organização foram retiradas. Gate: `schema 137 ativos`; `auth 0 ativos + 4
temporários bloqueantes`; `ACL 0 ativos + 4 temporários bloqueantes`; `API 126
ativos`; `eventos 20 ativos`; `S1 87,5%` (291/2.319). O próximo bloco é retirar
organização/licenciamento/billing e substituir o último guard administrativo
SaaS por autorização local, antes da limpeza física restante. S1 e Capability
seguem **`in-progress`**.

O corte de identidade foi concluído no código de origem: usuários, perfis,
convites, ACL local e auditoria agora trabalham sem organização/workspace;
memberships e a API/módulo de workspaces foram removidos junto com a relação
física `WorkspaceMember`. Gate: `schema 161 ativos`; `auth 0 ativos + 12
temporários bloqueantes`; `ACL 0 ativos + 12 temporários bloqueantes`; `API 275
ativos`; `eventos 70 ativos`; `S1 77,1%` (530/2.319). Os adaptadores continuam
porque ainda são chamados por consumidores reais externos a essa cadeia (core
SaaS remanescente, recursos, settings, WhatsApp e Developer Tools); não foram
removidos prematuramente nem convertidos em fallback. S1 e Capability seguem
**`in-progress`**.

O bloco Auth/ACL/API de borda foi iniciado: o login/JWT/ACL agora seguem o
contrato local e headers/resolvedores SaaS falham explicitamente. O gate separa
resíduos ativos dos adaptadores temporários bloqueantes. Última leitura: schema
209 ativos; auth 0 ativos + 12 temporários; ACL 0 ativos + 12 temporários; API
1.204 ativos; eventos 701 ativos. O Event Bus, log persistido, producers,
consumer direto e worker já não carregam tenant no envelope. S1 continua
`in-progress`; falta propagar o corte para schema, repositories, serviços, DTOs
e módulos SaaS antes de qualquer aceite.

A cadeia dispatcher → workflow → execução foi iniciada antes do schema: APIs,
DTOs, services, repositories e motor não recebem escopo e não usam
Limits/Usage. `ConnectionsService.execute`, renderização de templates,
orquestradores de e-mail/WhatsApp e Notification Center agora expõem contratos
locais, e os nós os consomem sem escopo. Worker de notificação, scheduler,
conexões, marketplace, cofre de segredos e logs de integração também passaram a
operar localmente. As demais chamadas/modelos SaaS seguem ativas e bloqueantes
até sua remoção real; schema permanece intacto nesta etapa. Última leitura:
schema 205 ativos; auth 0 ativos + 12 temporários; ACL 0 ativos + 12
temporários; API 942 ativos; eventos 531 ativos. S1 continua
`in-progress`.

O sub-slice WhatsApp eliminou tenant dos templates HSM (CRUD, replicação e sync
Meta), webhook inbound, repositório de chats, inbox HTTP e consumidores diretos
de IA/ISP. O gate agora registra schema 205 ativos; auth 0 ativos + 12
temporários; ACL 0 ativos + 12 temporários; API 753 ativos; eventos 434 ativos.
A atribuição completa de atendimento segue como dependência ativa e não foi
classificada como temporária. S1 e a Capability seguem `in-progress`.

O sub-slice seguinte consolidou a cadeia de atendimento: claim, release,
transfer, close, reopen, takeover, timeline, equipes, filas, membros e o
encaminhamento ISP usam contratos locais e persistência sem tenant. O CRUD de
agentes (incluindo versões, importação/exportação e execução HTTP) também foi
reduzido a uma instância dedicada e retirou limites/licensing/metering. Gate
atual: `schema: 205 ativas`, `API: 638 ativas`, `eventos: 319 ativas`; Auth e
ACL têm 12 adaptadores temporários bloqueantes cada. O runner de agentes e suas
portas de provider, ferramentas, RAG e colaboração ainda são dependências
ativas reais. S1 e a Capability seguem `in-progress`.

O mesmo fluxo avançou por catálogo de tools do agente, consulta RAG e
colaboração: essas portas agora usam apenas IDs locais de ferramenta, base,
agente, run e correlação. O gate registra `schema: 205 ativas`, `API: 620
ativas`, `eventos: 303 ativas`; Auth/ACL têm 12 temporárias bloqueantes cada.
`ToolExecutionContext`, runtime de tools, aprovações, logs e persistência de
runs seguem bloqueantes reais e serão removidos antes do schema. S1 e a
Capability seguem `in-progress`.

O runner agora persiste e retoma runs por agente, execução, correlação e
contexto conversacional locais; budget, metering e licensing saíram desse
caminho. Gate: `schema: 205 ativas`, `API: 610 ativas`, `eventos: 293 ativas`;
Auth/ACL seguem com 12 temporárias bloqueantes cada. `ToolExecutionContext`,
runtime, logs e aprovações são o concentrador ativo restante desse fluxo. S1 e
a Capability seguem `in-progress`.

Storage (gravação, listagem e download) passou a ser uma porta local, sem
metering, e os handlers de histórico, diagnóstico ISP e configuração de fila
usam contratos locais. O gerador de link de pagamento ISP ainda persiste escopo
e permanece bloqueante para a reconstrução aprovada. Gate: `schema: 205
ativas`, `API: 597 ativas`, `eventos: 292 ativas`; Auth/ACL têm 12 temporárias
bloqueantes cada. S1 e a Capability seguem `in-progress`.

O corte de execução aprovada está local: storage, links de pagamento ISP,
handlers, `ToolExecutionContext`, runtime, logs, aprovações e reconstrução após
decisão preservam somente IDs operacionais de agente, run, execução,
correlação, memória e conversa. Não há tenant reconstituído nesse caminho.
Administração de políticas/aprovações ainda é consumidora ativa, portanto o
schema continua preservado. Gate: `schema: 205 ativas`, `API: 587 ativas`,
`eventos: 285 ativas`; Auth/ACL mantêm 12 temporárias bloqueantes cada. S1 e a
Capability seguem `in-progress`.

Dentro desse mesmo fluxo, provider e orquestrador de conexão de IA agora são
portas locais; embeddings, Console de Desenvolvedor, sugestão de recursos,
análise de atendimento e revisão de conteúdo já as consomem sem escopo SaaS.
Gate atual: `schema: 205 ativas`, `API: 626 ativas`, `eventos: 309 ativas`;
Auth/ACL continuam com 12 adaptadores temporários bloqueantes cada. Tools, RAG,
colaboração, aprovações e a persistência do runner continuam dependências
ativas reais. S1 e a Capability seguem `in-progress`.

O sub-slice ISP de incidentes consolidou contratos locais para incidentes,
targets, dispatches, plantão, resolvedor de ERP, configuração operacional,
cron de outage e tools correlatas. O gate agora registra schema 205 ativos;
auth 0 ativos + 12 temporários; ACL 0 ativos + 12 temporários; API 850 ativos;
eventos 531 ativos. Templates e inbound/inbox de WhatsApp são o próximo bloco
ativo; não foram classificados como temporários. S1 e a Capability seguem
`in-progress`.

## 🔴 REGRA DE OURO (o furo recorrente)

- **NUNCA cravar número de versão ou "o que está no ar" de cabeça.** Rodar
  `git tag | sort -V | tail` e `git log --oneline -3` ANTES de falar de versão.
- **Produção deploya por TAG** (painel Configurações > Atualização aplica `vX.Y.Z`).
  O working tree local do assistente NÃO é a produção. Confirmar sempre pela tag.
- **Nunca taggear sem o Robson confirmar o número.** Tag é imutável — nunca reusar.
- **Build falho = fail-safe:** o painel aborta e mantém a versão anterior. Antes de
  entregar comando de release, revisar estático (ler interface/DTO INTEIRO antes de
  construir objeto — já queimou a v0.9.47 por não ler `ToolExecutionContext` todo).
- **Bump `CONTENT_VERSION`** no seed do assistente sempre que mudar o prompt/roteiro,
  senão não re-aplica no assistente já semeado.

## ✅ Versão em produção

> Detalhe por versão está no `CHANGELOG.md` (fonte da verdade por tag). Aqui só o ESTADO vigente.
> Confirmar a versão real SEMPRE com `git tag | sort -V | tail`.

> ⚠️ **Destravamento de release (2026-07-19):** a produção ficou presa em `c7afd43` (era v0.9.74) porque
> a **Frente 6 nunca foi commitada** e as tags **v0.9.75/v0.9.76/v0.9.77 foram empurradas no commit errado**
> (apontam pro `c7afd43`, sem código novo — **queimadas, não reusar**). A v0.9.77 queimou numa 2ª tentativa
> em que o `.git/index.lock` travado bloqueou o commit mas a tag saiu mesmo assim. Destravado seguindo pra
> frente: **v0.9.78 = Frente 6 + fundação do catálogo HSM** (com `db push`); **v0.9.79 = piloto Studio UX**
> (isolado). Ao aplicar pelo painel, a produção sai da era v0.9.74 direto pra v0.9.79.

- **v0.9.74 era a última NO AR** até o destravamento acima. O assistente ISP (**NETE**) está completo e
  validado em produção até a **frente 5**:
  - Identifica (documento > telefone) → **diagnóstico determinístico** contrato→login → status online/offline.
  - **Abre OS** via atendimento (`su_ticket` + processo do assunto) → **encaminha pra fila de Suporte**.
  - **Bloqueado por inadimplência** → **desbloqueio de confiança AUTÔNOMO** (o ERP é o porteiro) → 2ª via → **fila Financeiro**.
  - **Link público de pagamento** `/pagar/:token` (gerado na hora, expira, sem login) com valor/vencimento,
    boleto **vencido marcado**, linha digitável copiável e botão "Abrir boleto ou pagar com QR Code".
- **Prompt: `CONTENT_VERSION v29`** (`isp-example-assistant.seed.ts`). **Bump SEMPRE** que mexer no
  roteiro/persona/system_prompt, senão não re-aplica no assistente já semeado.
- **PIX inline DEFERIDO** (decisão do Robson: "quero trabalhar outra realidade depois; por ora está bom").
  O `get_boleto tipo=dados` do IXC **NÃO** carrega o EMV — a op `financeiro.boleto_pix` + `findPixEmv`
  (detecção pelo FORMATO do BR Code) está pronta mas volta vazio. Falta o endpoint certo do
  "Copiar código PIX" do IXC (recon: F12→Network no botão, ou doc da API). Por ora o PIX vem pela
  página da Efí (botão do boleto). **Não é bloqueio.**

### 🎨 Adoção do Studio UX — onde está (2026-07-27)

Frente de UI em curso, **paralela e independente** do backend/assistente acima. Estado completo em
[`docs/adocao-studio-ux.md`](adocao-studio-ux.md) (documento vivo, com a tabela de regras do DS e as
armadilhas). Resumo para re-ancorar:

- **Casca `AppShell` + Dashboard** no DS desde a v0.9.80; toast global do DS desde a v0.9.84.
- **Famílias migradas:** IA Studio (v0.9.84→v0.9.91), ISP (v0.9.92), **Automação INTEIRA**
  (A: v0.9.99 · B: v0.10.2 · C: v0.10.4), **WhatsApp INTEIRA** (v0.10.9 — 11 arquivos) e
  **Integrações INTEIRA** (v0.10.11 — 6 arquivos viraram 9), **Recursos** e
  **Desenvolvedor** (v0.10.13) e **as 8 últimas** (v0.10.16 — pessoas, perfis, workspaces,
  auditoria, minha conta + login, aceitar convite e página de pagamento) — mais a **auditoria do
  conjunto** (v0.10.20: ícones, marca, logout, 404/sem-permissão) e as **telas de acesso vindas do
  molde** (v0.10.21).
- **A FRENTE ESTÁ FECHADA.** Todas as telas no DS, `components/ui/` **excluída**, 33 órfãos removidos
  (20 `.legacy` + 13), nenhum import quebrado. O `--ap-*` vive só no `index.css` (`--ap-accent` herda
  `--su-action`). O dropdown do sino **não volta** (decidido por ação: `NotificationsBell.jsx` foi
  excluído; o conteúdo está no git se um dia quiser).
- **Infra: o `.npmrc` já está sem BOM** (conferido em 2026-07-27 — o arquivo começa em `@studio`, sem
  `EF BB BF`). Era o único resto de infra da frente; está fechado.
- **A conexão tem rota própria** (v0.10.11): `/integracoes/conexoes/:id`, `/:id/editar` e `/nova`
  (que aceita `?provider=<chave>`, é assim que o Marketplace manda para lá). O `?open=<id>` da
  v0.10.10 sobrevive só como encaminhamento. "Descobrir recursos" é **aba** da conexão, não modal.
- **Os mapas de estado de Integrações declaram `tone` direto**, sem `lib/tone.js`. É o caminho de
  saída da ponte: cada família que migrar deve fazer o mesmo. A ponte engole papel desconhecido no
  `|| 'neutral'` — foi assim que "credencial vencida" ficou cinza por meses.
- **DS consumido: `^1.2.49`.** A migração rendeu 40 releases do próprio Studio UX — a regra é
  **evoluir o DS primeiro** e só então o consumidor; nunca improvisar no `platform-admin`.
- **Auditoria do conjunto (v0.10.20/v0.10.21), cobrada pelo Robson.** Migrar tela por tela deixou de
  fora o que atravessa todas: **ícones** (30 itens, 7 glifos próprios — o mapa `LUCIDE_TO_DS` foi
  eliminado, hoje 38 glifos em 40 itens), **a marca** (eram três representações — ponto no menu, raio
  no login, faísca no favicon; hoje é o glifo `spark` do DS, mesmo path do favicon), **o logout** (agora
  passa por `ConfirmDialog`) e **os estados globais** (404 e sem-permissão têm tela; antes
  redirecionavam calados pra raiz).
- **UMA SÓ BIBLIOTECA DE ÍCONES** (v0.10.22, com o build corrigido na **v0.10.23**): o `lucide-react`
  saiu do `package.json` e nenhum dos 113 arquivos importa ícone de fora. **Remover dependência é três
  lugares:** código, `package.json` e **tudo que a nomeia por string** — o `manualChunks` do
  `vite.config.js` ficou para trás e derrubou o `ADMIN_BUILD` da v0.10.22 (`Could not resolve entry
  module`). O `grep` certo é pelo **nome do pacote no repo inteiro**, não por `import … from`. O
  `platform-console` mantém a dependência de propósito (não foi migrado ao DS). As duas causas eram do DS e foram resolvidas lá primeiro
  (v1.2.41: `Spinner` com `size`/`center` + 10 glifos de mídia/gravação). **Ícone é NOME, nunca
  componente** — `icon="layers"`, não `icon={Layers}`; guardar componente era o que obrigava o canvas
  e o seletor de anexo a manter a outra biblioteca viva, e foi onde o sweep quase deixou dois
  identificadores órfãos (tela em branco no clique, sem erro de build).
- **OS 9 MOLDES DE TELA EXISTEM EM REACT** (DS v1.2.46). A lacuna que estava aberta era do **DS**, e
  foi fechada lá: `DetailScreen`, `FormScreen`, `DashboardScreen`, `SearchScreen`,
  `SettingsScreen`(+`SettingsSection`) e `WizardScreen` se juntaram a `ListScreen`, `AuthScreen` e
  `MessageScreen`. Cada um com spec no Grupo G da `COMPONENT_LIBRARY` e story com os estados reais.
  **Antes de escrever tela de classe recorrente, instanciar o molde** — e ler o "quando NÃO usar",
  que é parte dele (passo a passo para campos independentes PIORA a tela).
- **ADOÇÃO DOS MOLDES: família `form` FEITA** (v0.10.24) — 9 editores em rota instanciam `FormScreen`, e as **5 linhas de ação** (campo+campo+botão) do painel usam `FormRow` (v0.10.25)
  (FilaEditor, EquipeEditor, CalendarioEditor, TemplateEditor, MemoriaPerfilEditor, FerramentaEditor,
  ConexaoEditar, PerfilEditor, MapeamentoEditor). **O Enter passou a enviar** (nenhum era `<form>`), as
  ações desceram do cabeçalho para o rodapé do cartão, sem permissão o Salvar não aparece.
  **Fora de propósito:** `AgenteEditor`, `IncidenteEditor` e `AberturaChamado` (abas + fluxo próprio =
  `form`+`detail`, exige leitura tela a tela).
- **ADOÇÃO DOS MOLDES: família `detail` FEITA** (v0.10.26) — `ConexaoDetalhe`, `BaseConhecimentoDetalhe`,
  `ExecucaoDetalhe`, `AprovacaoDetalhe`, `MemoriaEntradas` instanciam `DetailScreen`. **Primeira família
  que NÃO pediu nada ao DS** — sinal de que o molde amadureceu. Achou um bug vivo: `AprovacaoDetalhe`
  tinha `breadcrumb={breadcrumb}` no `PageHeader` (prop inexistente **com variável inexistente**) →
  `ReferenceError`, tela em branco — quatro linhas abaixo de um comentário meu dizendo que essa prop não
  existe. **Documentar a regra não impede de quebrá-la.**
  **Ficam:** `dashboard` (3), `wizard` (`ConexaoNova`), `list` (~5 que montam tabela à mão).
- **CUIDADO AO PÔR ALGO DENTRO DE UM `FormScreen`:** botão sem `type` dentro de `<form>` **envia o
  formulário**. O DS passou a nascer com `type="button"` (v1.2.47) por causa disso — foi achado na
  lixeira de "remover membro" do `EquipeEditor`, que salvaria a equipe e navegaria. Diálogo/overlay
  vive **fora** do `FormScreen` (o Enter dele submeteria o formulário inteiro).
- **Histórico da adoção (antes da família `form`):** As telas foram migradas para os
  *componentes* do DS, não para os *moldes* — então cada uma tem o seu arranjo, o seu jeito de mostrar
  carregando e a sua decisão sobre onde fica o "voltar". Triagem automática (heurística, **confere
  tela a tela antes de agir**): ~5 de detalhe, ~17 de formulário/editor, 3 de painel, 1 passo a passo
  (`Integracoes/ConexaoNova`), 5 de lista que ainda não usam `ListScreen`. `Login`, `AcceptInvite` e
  `Aviso` **já** instanciam molde. Fazer **por família**, como o resto da migração — não num sweep só.
- **As telas de acesso e de aviso instanciam MOLDES do DS** (v0.10.21): `AuthScreen` no login e no
  aceite de convite, `MessageScreen` no 404 e no sem-permissão. As quatro nasceram escritas à mão
  porque os moldes existiam só como HTML no gerador — **especificação sem materialização na camada do
  consumidor não é adotada**. Antes de escrever tela de classe recorrente, ler a tabela de moldes em
  `STUDIO_UX_TEMPLATES` §Estado da implementação (só `list`, `login` e `empty` estão em React).
- **Tela de trabalho contínuo usa `fullBleed`** do AppShell (v1.2.31) e `flex: 1` — **nunca**
  `calc(100dvh - Xrem)`. A lista de rotas full-bleed vive no `Layout.jsx` (`FULL_BLEED_PATHS`).
- **A conversa do WhatsApp tem cores fixas de propósito** (convenção do aplicativo). No escuro ela
  fica clara — decisão pendente em `docs/divida-tecnica.md` (`DT-005`). Não "conserte" achando que é
  sobra do padrão antigo.
- **Campos do composer de WhatsApp** vivem em `pages/WhatsApp/composer/` (gravador de áudio, barra de
  gravação, anexo). Coisa nova de composer entra ali, não no `MessageComposer`.
- **Uma cor de ação no painel todo** (v0.10.3): `--ap-accent` e a cor `brand` do Tailwind herdam
  `--su-action`. Não cravar hex de cor de ação em lugar nenhum — trocar o accent tem que mudar
  tela migrada e não-migrada junto.
- **Conteúdo compartilhado entre as duas vistas do fluxo:** os campos de configuração de um passo
  vivem em `pages/Automacao/editor/NodeFields.jsx`. Eram dois renderizadores e **já tinham
  divergido** (o tipo `agent` só existia no canvas). Campo novo entra ali, não na tela.
- **Três containers, não dois** (DS v1.2.24): **Modal** = leitura/campo curto · **rota** = registro que
  existe por si · **inspetor** (`Drawer`) = propriedade de item dentro de um editor, sem URL própria,
  com o contexto precisando ficar à vista. Foi assim que a configuração de um passo do fluxo saiu do
  Modal sem virar rota (ela é rascunho da sessão até salvar uma versão).
- **Armadilha que mais custou: PROP MORTA.** React não avisa prop desconhecida em componente próprio.
  `<Badge tone>` ficou 47 vezes sem efeito (badge cinza em 19 arquivos, telas já validadas) até o DS
  v1.2.22 aceitar o nome. **Conferir a assinatura real do componente antes de usar prop "óbvia".**
  Variante pior: prop repassada pro DOM — `<Checkbox>rótulo</Checkbox>` mandava `children` pro
  `<input>` e derrubava a página inteira (tela branca em `/automacao/calendarios/novo`, DS v1.2.23).
  **Tela branca em rota nova = prop no lugar errado; abra o console antes de investigar API.**
- **Quatro `toast` sem `useToast()` foram achados e consertados** (v0.10.11 e v0.10.13): o `catch`
  estourava `ReferenceError` em vez de mostrar o erro. Um verificador passou em toda a `src` e não
  sobrou nenhum — se aparecer de novo, é código novo. Confira **todo** componente do arquivo, não só
  o principal: os quatro estavam em auxiliares no fim do arquivo.
- **Onde o consumidor sai do DS, há lacuna do DS.** Método de descoberta que se provou: `<input>` cru,
  hex por faixa, `width: 100%`, nome de ícone inventado — cada contorno era um pedido. Renderam
  `Checkbox indeterminate`, `ProgressBar tone`, `Button block` e 2 glifos numa frente só (v1.2.37).
- **Dívida técnica do produto agora tem casa própria:** [`docs/divida-tecnica.md`](divida-tecnica.md)
  (DT-001…DT-004). Critério do Robson (2026-07-25): **o que não é responsabilidade do DS sai do doc
  de adoção e vive na dívida técnica do IA Studio.** Abertos hoje: ajuda de variáveis no editor de
  template, assimetria `workflow`/`env`/`now` no template, `DELETE` de base de conhecimento,
  "Ativar imediatamente" do MCP.

### 🧠 Lições que se repetem (re-ancorar antes de codar)
- **ID de infra a IA NUNCA escolhe** (conexão/setor/assunto/fila) — vem da CONFIG curada ou auto-resolve
  pelo escopo. Regra no CLAUDE.md (Governança). Bugs que vieram de violar isso: conexão="torre3pratinha"
  (login), setor="suporte" (palavra), "Departamento destino".
- **Gotcha de NULL no SQL:** `{ not: X }`/`NOT` em campo ANULÁVEL exclui os NULOS (`NULL=X`→NULL→falso).
  Sempre OR com `null` explícito. Queimou o marcador da IA (v0.9.66→v0.9.71: conversa nova, owner nulo).
- **IXC erra calado:** `IN` grande devolve vazio; `rp` trunca sem avisar; `online` vem "SS"; `get_boleto
  dados` não traz PIX. Validar contra dado real; nunca presumir número plausível.
- **Deploy worker-first:** o `upgrade.sh` reinicia `iastudio-worker` ANTES do `iastudio-api` — tool nova
  só existe no worker após restart. `db push` destrutivo roda sozinho na fase PRISMA_PUSH.
- **Git do sandbox às vezes STALE** (working-tree diverge dos canônicos, diff falso): confiar no
  **Read/Edit** pro conteúdo e nos **tags/log** do git pra versão.
- **Config de OS:** setor = `su_ticket_setor` (departamento: Financeiro=1, Suporte=2), NÃO `empresa_setor`;
  assunto = um com processo (`id_processo`) vinculado. Recon base Newnet (cliente id 2): contrato ativo
  `status='A'`, login ativo `radusuarios.ativo='S'`, endereço quase sempre herdado do cliente.

## 🎯 O que estamos construindo agora

Redesenho do comportamento do assistente ISP, guiado por
`docs/spec-assistente-isp-atendimento.md` (spec travada com o Robson).
**Uma frente por vez, com plano aprovado antes de codar e diff mostrado antes do deploy.**

Decisões travadas: **A** = endereço do login se houver, senão do contrato ·
**B** = criar filas "Setor Financeiro" e "Setor de Suporte" por config (evitar
"supervisão") · **C** = página de pagamento entra junto com o financeiro.

## 📋 Frentes (ordem aprovada)

1. **Diagnóstico determinístico (contrato→login)** — ✅ **FEITA E VALIDADA no WhatsApp de ponta a
   ponta** (v0.9.50→v0.9.56). Tool `diagnosticar_conexao` + `IspDiagnosisService`: sistema decide
   as etapas, modelo só apresenta. Fluxo completo confirmado: saudação reconhece o número →
   identifica (documento manda sobre telefone) → escolhe contrato (plano+nº+endereço) → escolhe
   login → status offline/desde → abre OS (login/setor/status certos, origem=Cliente). Ver README
   isp + CHANGELOG v0.9.50–v0.9.56. **Recon fixado (base Newnet, cliente id 2):** contrato ativo =
   `status='A'`; login ativo = `radusuarios.ativo='S'`; login→contrato via `id_contrato`; endereço
   quase sempre HERDADO (`endereco_padrao_cliente='S'`); `online` erra calado ("SS").
2. **Abrir OS via ATENDIMENTO do IXC** — ✅ **FEITA E VALIDADA** (v0.9.57–59; chamado 3935 abriu com
   contrato+endereço+tudo certo no IXC). O
   `os.cadastrar` do IXC agora faz `gerar_protocolo_atendimento` → insere `su_ticket` com o
   **assunto que tem processo vinculado** ("O.S. OPA SUITE") → o processo abre a OS com contrato+
   endereço. **Recon fixado:** o processo NÃO vem em `id_wfl_processo` (nem é exposto `su_wfl_processo`)
   — vem do ASSUNTO (`su_oss_assunto.id_processo` + `obrigar_processo_atendimento`; ex.: assunto 27
   LENTIDÃO → processo 1 O.S. OPA SUITE). **Setor = `su_ticket_setor`** (departamento: Financeiro=1,
   Suporte=2), NÃO `empresa_setor`. Métodos: `abrirAtendimento` + `gerarProtocolo` no ixc.provider.
   **PENDÊNCIA de config:** re-descobrir recursos + re-escolher setor(departamento)+assunto(com processo).
3. **Filas de setor (Financeiro/Suporte) + handoff do bot para a fila** — ✅ **FEITA E VALIDADA**
   (v0.9.60–64; chamado 3943 abriu + IA encaminhou pra fila de Suporte). `encaminhar_para_fila` +
   `handoffToQueue` (bot-autorizado) + seed das filas + mapa setor→fila em `system_settings` + UI de
   mapeamento (ISP → Abertura de chamado). LIÇÃO: a config de OS **não tem cache** (lê do banco), mas
   o "Departamento destino" que travou era o **worker com estado antigo** (config `setor=4` de antes do
   re-pick) — o restart do deploy resolveu. Config de OS: setor = `su_ticket_setor` (departamento), não
   `empresa_setor`; assunto = um com processo (id_processo) vinculado.
4. **Desbloqueio de confiança + bloqueado → fila financeiro** — ✅ **FEITA E VALIDADA** (v0.9.71;
   Carleia bloqueada → desbloqueio autônomo 5 dias → 2ª via → fila Financeiro). Rotina PROATIVA na
   identificação (roda o diagnóstico, não menu genérico). `desbloqueio_confianca` autônomo
   (`requires_approval:false`, ERP é o porteiro). Diagnóstico expõe `contrato.bloqueado`
   (`status_internet`≠'A'). **PIX inline ficou deferido** (ver "Versão em produção").
5. **Página pública de 2ª via/pagamento (porte Aquapark)** — ✅ **FEITA E VALIDADA** (v0.9.73–74;
   `/pagar/:token` abriu com os boletos da Carleia). Modelo `IspPaymentLink` (token+snapshot+TTL, sem
   sessão JWT), `@Public GET /isp/pagamento/:token` (410 genérico), tool `gerar_link_pagamento`, config
   na tela ISP (`isp.pagamento.*`). Decisões: janela + TTL 24h configurável + snapshot.
6. **Alerta de incidentes** (registrar + previsão + notificar equipe via WhatsApp) — ✅ **IMPLEMENTADA**
   (aguardando `db push` + deploy + validação humana; ver CHANGELOG v0.9.75). O que faltava era a perna
   **alerta à EQUIPE** (a infra pré-existente avisava cliente/operador in-app). Feito: `IspTeamAlertService`
   (destinatários = membros da equipe de plantão com telefone + opt-in; envio via `whatsapp-smart-send`,
   template fora da janela, 1:1) + `isp-scope.util` (rótulo + hash de dedup) + `registerDetectedAnomaly`/
   `alertTeamForIncident`/`fireTeamAlert` no `isp-incidents.service`. Gatilho REATIVO na `status_regiao`
   (agora devolve `situacao` higienizada, limiar da config; sem % cru) + o cron reusa o mesmo alerta. Config
   `isp.equipe.incidente`/`limiar_pct`/`template`/`cooldown_min` (tela ISP → Abertura de chamado). Roteiro:
   nova situação "anomalia_regiao" (CONTENT_VERSION **v30**). **PENDÊNCIA operacional:** criar/publicar na
   Meta o template HSM do alerta e apontá-lo na config; cadastrar telefones dos usuários e ligar o opt-in.

**Padrão de telefone (transversal, entrou junto na v0.9.75):** `components/ui/PhoneInput` (seletor de país,
E.164 sem `+`) agora OBRIGATÓRIO em todo campo de telefone; backend com `normalizePhoneFromUser`/
`normalizePhoneFromWhatsApp` (troca da heurística ingênua que corrompia estrangeiro). Porte do delivery-system.
Pendência do Robson: rodar o mesmo ajuste nos outros sistemas (prompt de propagação entregue).

## 🌐 Frente de ENDEREÇOS (tenancy por Host) — implementada, não implantada

Especialidade: `ia-studio.tenant-domains@1.0.0`. Runbook/desenho: **`docs/dominios-e-subdominios.md`**.
Fases 1–4 escritas (registro · resolução por Host · tela no Console · script de operação) +
login white-label. **Nada muda em produção até cadastrar endereço** (registro vazio → resolve
`null` → comportamento de domínio único de hoje).

- Exige **`db push`** (só adição: `core_platform_domains` + 5 enums).
- Depois do deploy: Console → **Endereços** define o domínio-base e cadastra; DNS aponta;
  então, **no servidor**, `bash scripts/domains-sync.sh` (fora do deploy por tag — o
  `upgrade.sh` não toca no nginx).
- Pendências desta frente: verificação automática do token TXT de posse (modelada, não
  conferida); migrar os valores legados de `Organization.custom_domain` para o registro novo;
  disparo do sync pelo painel (hoje é operação no servidor) — cada uma é frente própria.

## 🧹 Pendências técnicas conhecidas (não urgentes)

- **Catálogo de templates HSM (padrão do Aquapark) — IA Studio NÃO tem.** A regra nova no `CLAUDE.md`
  exige um catálogo nativo de templates prontos-pra-publicar (seed no boot + `resolveButtonUrl` das ações
  de botão/links de acesso). O IA Studio hoje só tem CRUD manual de template (`WhatsappTemplate`). **Frente
  própria:** portar o subsistema `whatsapp-template-catalog/` do Aquapark (`catalog.seed.ts` +
  `template-actions.ts` + mapper/service/controller + aba "Templates do Sistema"), semeando os templates do
  ISP como padrões (inclusive o **alerta de incidente** da frente 6). Enquanto não vier, o template do alerta
  é criado manual na Meta e apontado no card "Equipe de plantão".

- **PIX inline** na página de pagamento: falta o endpoint IXC do "Copiar código PIX" (o `get_boleto
  dados` não traz o EMV). Op `financeiro.boleto_pix` + `findPixEmv` prontas — só trocar a chamada.
  Deferido pelo Robson ("outra realidade depois").
- **Backlog do provider IXC** (docs que o Robson subiu, mapear em frentes futuras): viabilidade por
  endereço + inserir LEAD (venda/cobertura); desconectar login + limpar MAC (troubleshooting técnico);
  criar tarefa/interações/disparar-finalizar (atendimento); receber título (baixa manual — admin, não
  é da IA); consultar dados do boleto com juro/multa (valor atualizado — refino da 2ª via).
- Varredura de contratos front↔back: faltam MCP/Política/Memória (campo a mais no
  create/update), Incidente (`auto_detect`), Ambiente (`type`→`kind`), Workspace
  (`slug` obrigatório sem campo na UI). Todos 400 de whitelist. (Custos já corrigido.)
- UX: a Política de aprovação pede "Condição (JSON)" cru — trocar por campos amigáveis.
- `/console` no domínio único: se voltar a redirecionar, é o nginx do servidor sem o
  bloco `location /console/` (o `upgrade.sh` não toca no nginx — é edição no servidor).

## 🔗 Mapa da documentação (o que ler e para quê)

Regras e estado:
- `CLAUDE.md` (raiz) — regra máxima (auto-carregada toda sessão). Inclui doc/código-vivos-sem-lixo e porte-não-reinvente-Aquapark.
- `docs/ESTADO-e-handoff.md` (este) — índice do estado vigente para re-ancorar.
- `CHANGELOG.md` — histórico por versão (a verdade do "o que roda", por tag).

Arquitetura viva:
- `docs/diretrizes-arquiteturais.md` — 58 diretrizes que governam o desenho.
- `docs/deploy-e-versionamento.md` — runbook de deploy/release/backup.
- `RELATORIO-ANALISE-E-ARQUITETURA.md` — **Parte 2** = contrato da API do ERP Altarede (referência viva da integração ISP). Parte 1 é histórico.
- `docs/base-doc-e-portes-aquapark.md` — backlog do que ainda falta portar do Aquapark.

Estado por módulo ("o que existe e como funciona hoje"):
- READMEs em `platform-api/src/modules/*/README.md` (ai, isp, automation, comm, integration, system).

Frente em andamento (andaimes — somem quando a frente conclui + é documentada no README/CLAUDE.md):
- `docs/spec-assistente-isp-atendimento.md` — comportamento do assistente ISP (frentes 1–6; 1–5 feitas, falta a 6 = incidentes).
- `docs/spec-painel-assistente-humanizado.md` — UI do editor do assistente (backlog de casca).

Referência externa (porte-não-reinvente): `../aquapark/`.
