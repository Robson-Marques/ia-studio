# Módulo ISP — Solução para provedores (Fase 6)

Primeira solução vertical oficial da plataforma (provedores/ISP), implementada
como módulo vertical: **nada de ISP no core**. Toda a
funcionalidade de negócio mora aqui, nos **providers de ERP**
(`integration/registry/providers/ixc.provider.ts`) e nas **tools ISP**
(registradas no catálogo `ai_tools` da Fase 5). A plataforma nunca é dona de
dados de negócio — os dados vivem no ERP do provedor.

## Contrato canônico do IXC

O IXC implementa as chaves de operação consumidas por tools, serviços e crons
do módulo. Eles nunca chamam a API HTTP diretamente e a IA nunca escolhe uma
conexão.

| Operação | IXC Soft |
| --- | --- |
| `cliente.dados` | `cliente` filtrado por `cnpj_cpf` |
| `cliente.planos` | `cliente_contrato` |
| `cliente.acesso` | `radusuarios` (campo `online` S/N) |
| `cliente.desbloqueio` | rota `desbloqueio_confianca` (id do contrato) |
| `financeiro.boleto_aberto` | `fn_areceber` status `A`, vencimento asc, 1 registro |
| `financeiro.boleto_aberto_todos` | `fn_areceber` status `A` |
| `financeiro.historico` | `fn_areceber` do cliente (desc) |
| `financeiro.boleto_base64` | rota `get_boleto` (base64) |
| `conectividade.listar_com_status` | `radusuarios` + lote de `cliente` (nome/telefone) |
| `os.cadastrar` | insert em `su_oss_chamado` (exige `id_assunto`) |
| `atendimento.listar_chamados_recentes` | até 5 `su_ticket` do cliente, por id desc; não infere encerramento por status ou data ausente |
| `atendimento.listar_setor` | `su_oss_setor` |
| `atendimento.listar_motivo_atendimento` | `su_oss_assunto` |

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

- **Sem envio de boleto por e-mail** pela API → `segunda_via_boleto` aceita
  somente `linha` ou `pdf`. E **não há PIX copia-e-cola**: `fn_areceber` traz
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
| `isp.repository.ts` | Porta única ao banco (`isp_incidents`, `isp_incident_targets`, `isp_incident_dispatches`, `isp_incident_team_alerts`) + destinatários do plantão (membros com telefone+opt-in) e dedup por `scope_hash`. |
| `isp-connection.resolver.ts` | Resolve uma Connection IXC ACTIVE do escopo (matriz/filiais). Nunca expõe a conexão à IA. |
| `isp-connectivity.service.ts` | Lê `conectividade.listar_com_status` via `ConnectionsService.execute` e agrega % offline. |
| `isp-diagnosis.service.ts` | **Diagnóstico determinístico contrato→login** (spec §2). Compõe `cliente.dados`+`cliente.planos`+`cliente.acesso`, suprime contratos/logins inativos e devolve a próxima etapa (`escolher_contrato`/`escolher_login`/`resolvido`) — o sistema decide, o modelo só apresenta. Rótulo por plano (contrato) e login+referência (login); endereço só quando é próprio (senão herda o do cliente). |
| `incident-lookup.service.ts` | **Modo reativo**: `activeFor(customer)` que as tools `abrir_os`/`status_regiao` consultam. |
| `isp-dispatch.service.ts` | **Modo proativo**: disparo em massa por WhatsApp aos CLIENTES (Meta Orchestrator) com confirmação + rate limit + log. |
| `isp-team-alert.service.ts` | **Alerta INTERNO à equipe de plantão** (frente 6): resolve destinatários (membros da equipe configurada com telefone + opt-in), dispara via `whatsapp-smart-send` (template HSM fora da janela, 1:1), loga o job pendente em `isp_incident_team_alerts`; sem equipe/elegível/template aprovado → degrada pro aviso in-app. O catálogo nativo do WhatsApp oferece um rascunho pronto para revisão/publicação. |
| `isp-scope.util.ts` | Helpers puros do escopo: `scopeLabel` (rótulo humano p/ a equipe) + `scopeHash` (dedup determinístico "um escopo, um rascunho"). |
| `isp-incidents.service.ts` | CRUD de incidentes, resolver afetados, ativar/encerrar, orquestra o disparo aos clientes. **`registerDetectedAnomaly`** (find-or-create rascunho por escopo + cooldown + aciona o plantão) e **`alertTeamForIncident`** (usado pelo cron). Mutations sensíveis auditadas. |
| `isp-outage-detection.cron.ts` | **Detecção automática de outage — OFF por default**. Sugere rascunho + alerta in-app **e** aciona o plantão (mesmo cooldown); nunca dispara aos clientes sozinho. |
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

## Alerta de incidente à equipe de plantão (frente 6)

Duas fontes detectam uma anomalia de rede e **acionam a equipe interna por WhatsApp**
(sem avisar o cliente em massa — isso é o modo proativo do `IspDispatchService`):

1. **Reativa (na conversa):** a tool `status_regiao` calcula o % offline do escopo.
   Se **não** há incidente ativo cobrindo o cliente **e** o % ≥ `isp.incidente.limiar_pct`
   (config, não o modelo), o sistema chama `registerDetectedAnomaly` e devolve ao modelo
   uma `situacao` higienizada (`anomalia_regiao`) — **sem** percentual cru. O assistente só
   diz que há instabilidade na região e que a equipe foi acionada; não abre chamado.
2. **Proativa (cron):** o `isp-outage-detection.cron` (dupla-OFF) chama `alertTeamForIncident`
   além do aviso in-app.

`registerDetectedAnomaly` faz find-or-create de um rascunho DRAFT por `scope_hash` (dedup:
um escopo, um rascunho aberto; o 2º cliente da região não cria outro) e aciona o
`IspTeamAlertService` respeitando o **cooldown** (`isp.incidente.cooldown_min`). O rascunho
nasce inerte — a equipe promove a ACTIVE na tela de Incidentes.

**Destinatários (o modelo nunca escolhe):** membros da equipe `isp.equipe.incidente` com
`core_users.whatsapp_phone` preenchido **e** `comm_attendance_members.receive_incident_alerts=true`.
Envio via `whatsapp-smart-send` (template `isp.incidente.template` fora da janela de 24h; 1:1,
nunca grupo). Sem equipe/elegível/template → **degradação graciosa**: aviso in-app (o cliente
nunca vê erro). Config na tela **ISP → Abertura de chamado** (card "Equipe de plantão").

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
| `status_regiao` | `conectividade.listar_com_status` (+ incidente ativo + **detecção de anomalia**) | — |
| `segunda_via_boleto` | `financeiro.boleto_aberto` / `boleto_base64` | — |
| `desbloqueio_confianca` | `cliente.desbloqueio` | ✅ requires_approval |
| `abrir_os` | `os.cadastrar` (suprime OS se incidente ativo) | ✅ requires_approval |
| `consultar_chamados_recentes` | `atendimento.listar_chamados_recentes` (somente IXC) | — |

`consultar_chamados_recentes` é leitura limitada para o assistente analisar
histórico e fechamento com cautela. A conexão IXC é resolvida pelo
`IspConnectionResolver` e nunca é escolhida pelo modelo; o provider fixa cinco
linhas de `su_ticket`, filtradas pelo cliente e ordenadas pelo identificador
decrescente. “Recente” significa essa ordem por ID: não há filtro temporal nem
inferência de encerramento por status ou data ausente. A tool projeta somente
campos úteis, avisa que os textos históricos são não confiáveis e não escreve
nem persiste o histórico no IXC.

Quando a instalação tem **mais de uma** conexão IXC, a escolha é do operador,
não do modelo: prioridade da Connection → tag/filial (`filial`) → `connection_id`
explícito no contexto curado do workflow. Esses valores não fazem parte do
schema exposto à IA.

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
