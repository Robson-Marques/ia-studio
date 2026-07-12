# Módulo ISP — Solução para provedores (Fase 6)

Primeira solução vertical oficial da plataforma (provedores/ISP), implementada
como **Resource Extension** (diretriz 50): **nada de ISP no core**. Toda a
funcionalidade de negócio mora aqui, nos **providers de ERP**
(`integration/registry/providers/{altarede,ixc}.provider.ts`) e nas **tools ISP**
(registradas no catálogo `ai_tools` da Fase 5). A plataforma nunca é dona de
dados de negócio — os dados vivem no ERP do provedor.

## Contrato canônico de ERP (multi-ERP)

Os ERPs suportados (`altarede`, `ixc` — ver `ISP_ERP_PROVIDER_KEYS`) implementam
as **mesmas chaves de operação**, cada um traduzindo para a sua API. Trocar de
ERP é trocar a Connection: **nenhuma tool, serviço ou cron muda**.

| Operação canônica | Altarede | IXC Soft |
| --- | --- | --- |
| `cliente.dados` | `cliente/dados` | `cliente` filtrado por `cnpj_cpf` |
| `cliente.planos` | `cliente/planos` | `cliente_contrato` |
| `cliente.acesso` | `cliente/acesso` | `radusuarios` (campo `online` S/N) |
| `cliente.desbloqueio` | `cliente/desbloqueio` | rota `desbloqueio_confianca` (id do contrato) |
| `financeiro.boleto_aberto` | `financeiro/boleto_aberto` | `fn_areceber` status `A`, vencimento asc, 1 registro |
| `financeiro.boleto_aberto_todos` | idem `_todos` | `fn_areceber` status `A` |
| `financeiro.historico` | `financeiro/historico` | `fn_areceber` do cliente (desc) |
| `financeiro.boleto_base64` | `financeiro/boleto_base64` | rota `get_boleto` (base64) |
| `financeiro.boleto_por_email` | `financeiro/boleto_por_email` | ❌ não existe na API do IXC |
| `conectividade.listar_com_status` | `conectividade/listar/com_status` | `radusuarios` + lote de `cliente` (nome/telefone) |
| `os.cadastrar` | `os/cadastrar` | insert em `su_oss_chamado` (exige `id_assunto`) |
| `atendimento.listar_setor` | `atendimento/listar_setor` | `su_oss_setor` |
| `atendimento.listar_motivo_atendimento` | `atendimento/listar_motivo_atendimento` | `su_oss_assunto` |

> **Verificação:** todas as operações do IXC foram exercitadas contra uma base
> real em 09/07/2026 (leitura, abertura de OS e desbloqueio de confiança).
> Nenhuma continua apoiada em suposição.
>
> **A API do IXC erra calado.** Ela raramente levanta erro — devolve menos. Sete
> exemplos encontrados: `radusuarios.online` vale `"S"` (a collection mostra
> `"SS"`); `interface_transmissao_fibra` não existe na leitura; `"0"` significa
> "não configurado" e como filtro casa com a base toda; `radusuarios.bairro` só
> é preenchido para endereço próprio; `IN` com centenas de ids devolve
> `registros: []`; `rp` trunca sem avisar; e "boleto em aberto" **não** é
> `status = 'A'`. Ao mexer aqui, desconfie de todo número plausível.

Diferenças conhecidas do IXC (assumidas, não contornadas):

- **Sem envio de boleto por e-mail** pela API → `segunda_via_boleto` só aceita
  `linha` ou `pdf`. E **não há PIX copia-e-cola**: `fn_areceber` traz
  `linha_digitavel` e `gateway_link` (link do boleto no gateway); `pix_txid` vem
  vazio.
- **O operador `IN` falha em silêncio** com listas grandes: o IXC responde
  `registros: []` em vez de erro. Toda consulta com `IN` vai em lotes de 100
  (`IN_CHUNK_SIZE`). Um `IN` de 768 ids devolveu zero e quase passou por
  "bairro sem clientes".
- **Filtros de escopo** (conferidos contra a collection oficial `radusuarios`):
  `cidade`, `bairro`, `ip_concentrador`, `interface_concentrador` (→ `interface`),
  `id_olt` (→ `id_transmissor`) e `id_cto` (→ `id_caixa_ftth`) têm equivalente.
  Só `id_slot` fica de fora — não há coluna clara em `radusuarios`.
- **`abrir_os` exige `id_assunto`** (o IXC não aceita motivo em texto livre).
  Os ids vêm do **Descobrir recursos** da conexão (`su_oss_assunto`).
- A conexão exige que o **IP do servidor esteja em "Redes permitidas"** do grupo
  do usuário do token, senão a API responde erro de login.

Além do contrato canônico, o `IxcProvider` expõe operações **genéricas** sobre
qualquer tabela do IXC (`ixc.listar`, `ixc.inserir`, `ixc.editar`, `ixc.excluir`)
para nós de workflow e casos fora do escopo ISP. Elas não são usadas pelas tools
do agente.

## Componentes

| Arquivo | Responsabilidade |
| --- | --- |
| `isp.repository.ts` | Porta única ao banco (`isp_incidents`, `isp_incident_targets`, `isp_incident_dispatches`). |
| `isp-connection.resolver.ts` | Resolve a Connection de ERP ACTIVE do escopo (multi-instância: matriz/filiais; multi-ERP: Altarede/IXC). Nunca expõe a conexão à IA. |
| `isp-connectivity.service.ts` | Lê `conectividade.listar_com_status` via `ConnectionsService.execute` e agrega % offline. |
| `isp-diagnosis.service.ts` | **Diagnóstico determinístico contrato→login** (spec §2). Compõe `cliente.dados`+`cliente.planos`+`cliente.acesso`, suprime contratos/logins inativos e devolve a próxima etapa (`escolher_contrato`/`escolher_login`/`resolvido`) — o sistema decide, o modelo só apresenta. Rótulo por plano (contrato) e login+referência (login); endereço só quando é próprio (senão herda o do cliente). |
| `incident-lookup.service.ts` | **Modo reativo**: `activeFor(customer)` que as tools `abrir_os`/`status_regiao` consultam. |
| `isp-dispatch.service.ts` | **Modo proativo**: disparo em massa por WhatsApp (Meta Orchestrator) com confirmação + rate limit + log. |
| `isp-incidents.service.ts` | CRUD de incidentes, resolver afetados, ativar/encerrar, orquestra o disparo. Mutations sensíveis auditadas. |
| `isp-outage-detection.cron.ts` | **Detecção automática de outage — OFF por default**. Só *sugere* rascunho + alerta; nunca dispara sozinho. |
| `isp-tools.ts` | Registra as tools do agente ISP no `ToolRegistryService` (mesmo mecanismo das builtin). |
| `isp.controller.ts` | Endpoints `/isp/incidents/*` com `@RequirePermissions`. |

## Modos de comunicação (`comm_mode`)

- **REACTIVE** (default): nenhum disparo. As tools do agente informam a
  manutenção quando o cliente procura, e suprimem OS duplicada (toggle
  `suppress_os`).
- **PROACTIVE** (nasce OFF): disparo em massa na ativação, com **confirmação
  explícita**, **rate limit** e log em `isp_incident_dispatches`.
- **COMBINED**: proativo na ativação + reativo na vigência.

## Automatismos nascem OFF

- Modo proativo/combinado **exige confirmação** (`confirm: true`) para qualquer
  disparo em massa.
- Detecção automática de outage é dupla-OFF: flag técnica `ISP_AUTO_DETECT`
  (default `off`, env só override) **e** por incidente (`auto_detect=true`).
  Limiar configurável em `ISP_OUTAGE_THRESHOLD_PCT` (default 40%). Ao passar do
  limiar, **apenas alerta** o operador (notificação in-app) — a promoção a
  incidente ativo e o disparo continuam decisões humanas.

## Tools do agente ISP

Semeadas no catálogo `ai_tools` pelo seed da Fase 5 (o `AiProvidersSeedService`
itera `toolRegistry.all()` por organização). Cada tool resolve a conexão de ERP
pelo `IspConnectionResolver` e chama `ConnectionsService.execute` — **a IA nunca
chama a API do ERP direto e nunca sabe qual ERP está do outro lado**.

| Tool | Operação canônica | Aprovação |
| --- | --- | --- |
| `identificar_cliente` | `cliente.dados` | — |
| `diagnosticar_conexao` | `cliente.dados` + `cliente.planos` + `cliente.acesso` | — |
| `consultar_debitos` | `financeiro.boleto_aberto_todos` + `financeiro.historico` | — |
| `status_conexao` | `cliente.acesso` | — |
| `status_regiao` | `conectividade.listar_com_status` (+ checa incidente ativo) | — |
| `segunda_via_boleto` | `financeiro.boleto_aberto` / `boleto_base64` / `boleto_por_email` | — |
| `desbloqueio_confianca` | `cliente.desbloqueio` | ✅ requires_approval |
| `abrir_os` | `os.cadastrar` (suprime OS se incidente ativo) | ✅ requires_approval |

Quando a organização tem **mais de uma** conexão de ERP, a escolha é do operador,
não do modelo: prioridade da Connection → tag/filial (`filial`) → `connection_id`
explícito. Nós de workflow podem ainda fixar o ERP com `erp: "ixc" | "altarede"`.

### Diagnóstico determinístico contrato→login (`diagnosticar_conexao`)

A tool tira do modelo a lógica de vários passos (ver `isp-diagnosis.service.ts`).
Recebe `cpf` (+ opcionalmente `id_contrato` e `login`, as escolhas do cliente) e
devolve a **próxima etapa**:

1. `cliente_nao_encontrado` — CPF não localiza cadastro.
2. `sem_contrato_ativo` — nenhum contrato com `status='A'` (tratar como venda/cancelado).
3. `escolher_contrato` — >1 contrato ativo: opções rotuladas pelo **plano** (endereço
   só se próprio do contrato). O agente pergunta e re-chama com `id_contrato`.
4. `escolher_login` — >1 login ativo (`ativo='S'`) daquele contrato: opções por
   **login + referência** (endereço só se próprio). Traz `muitos=true` quando passa de
   5 — aí o agente pede um dado para estreitar em vez de listar tudo. Re-chama com `login`.
5. `resolvido` — login definido: `online` + desde quando + situação do contrato
   (`bloqueado` = contrato ativo com `status_internet ≠ 'A'`, heurística refinada na
   Frente Financeiro). O agente apresenta só o que está fora do normal.

**Endereço (DECISÃO A):** contratos/logins quase sempre herdam o endereço do cliente
(`endereco_padrao_cliente='S'`, campos vazios); só a minoria tem endereço próprio. O
endereço efetivo do ponto é: próprio do login → próprio do contrato → do cliente.

## ACL

Grupo **ISP** em `permissions.constants.ts`: `isp.incidents.read/write/activate/
dispatch` + `isp.tools.use`. Administrador herda tudo; Operador herda `.read`;
perfil opcional **Operador ISP** (gerencia sem disparo em massa).

## Conector PHP de contingência (`iastudio_connector.php`) — plano, não implementado

Arquivo único (Slim/PDO) autenticando por `appkey`+`token` contra
`INTEGRACAO_API`, a ser criado **apenas se a API oficial não cobrir algo** que a
UI precise — por exemplo, catálogos que a API atual não expõe (lista de OLTs/
CTOs/slots para preencher os filtros de escopo do incidente sem digitação
manual). Enquanto a API cobrir os fluxos, o conector **não é implementado**
(diretriz de não duplicar o que o provider oficial já resolve). Quando/se for
necessário, ele entra como uma segunda Connection Altarede (mesmo provider,
endpoint distinto) ou um provider `altarede-connector` dedicado — sem tocar o
core.
