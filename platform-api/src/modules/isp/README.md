# Módulo ISP — Solução Altarede (Fase 6)

Primeira solução vertical oficial da plataforma (provedores/ISP), implementada
como **Resource Extension** (diretriz 50): **nada de ISP no core**. Toda a
funcionalidade de negócio mora aqui, no `AltaredeProvider`
(`integration/registry/providers/altarede.provider.ts`) e nas **tools ISP**
(registradas no catálogo `ai_tools` da Fase 5). A plataforma nunca é dona de
dados de negócio — os dados vivem no ERP Altarede.

## Componentes

| Arquivo | Responsabilidade |
| --- | --- |
| `isp.repository.ts` | Porta única ao banco (`isp_incidents`, `isp_incident_targets`, `isp_incident_dispatches`). |
| `isp-connection.resolver.ts` | Resolve a Connection Altarede ACTIVE do escopo (multi-instância: matriz/filiais). Nunca expõe a conexão à IA. |
| `isp-connectivity.service.ts` | Lê `conectividade/listar/com_status` via `ConnectionsService.execute` e agrega % offline. |
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
itera `toolRegistry.all()` por organização). Cada tool resolve a conexão
Altarede pelo `IspConnectionResolver` e chama `ConnectionsService.execute` — **a
IA nunca chama a API Altarede direto**.

| Tool | Operação Altarede | Aprovação |
| --- | --- | --- |
| `identificar_cliente` | `cliente/dados` | — |
| `consultar_debitos` | `financeiro/boleto_aberto_todos` + `historico` | — |
| `status_conexao` | `cliente/acesso` | — |
| `status_regiao` | `conectividade/listar/com_status` (+ checa incidente ativo) | — |
| `segunda_via_boleto` | `financeiro/boleto_aberto` / `boleto_base64` / `boleto_por_email` | — |
| `desbloqueio_confianca` | `cliente/desbloqueio` | ✅ requires_approval |
| `abrir_os` | `os/cadastrar` (suprime OS se incidente ativo) | ✅ requires_approval |

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
