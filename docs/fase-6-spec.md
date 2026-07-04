# Fase 6 — Solução ISP (Altarede) (spec de execução)

> Primeira solução oficial (provedores/ISP) — **como extensão, nada de ISP no core**. Segue RELATORIO Parte 2 (contrato Altarede) e diretriz 50 (Resource Extensions). Base: AltaredeProvider completo + tools do agente + módulo `isp/` (Manutenção/Incidentes). Data: 03/07/2026.

## 0. Convenções (iguais às fases 1–5)
Namespacing: o módulo ISP usa tabelas `@@map("isp_*")` (módulo de solução vertical, fora dos namespaces do core — respeita "nada de ISP no core"). Tenant `organization_id`+`workspace_id`+`environment_id`. Schema é fonte única (`db push`). Sem `any`, Logger, `@RequirePermissions`, `@Auditable`, DTOs class-validator, DB só em repositories. Automatismos nascem OFF. Provider só via Registry; IA nunca chama API direto (tools via ConnectionsService.execute).

## 1. AltaredeProvider — completar (já existe stub em `integration/registry/providers/altarede.provider.ts`)
- **CORREÇÃO IMPORTANTE:** a API Altarede autentica com `appkey`+`token` **no corpo JSON** de cada request (RELATORIO 2.2), não em headers. Corrigir o `execute()` para mesclar `{appkey, token, ...params}` no body.
- Ampliar o catálogo `OPERATIONS` com todos os endpoints usados pelas tools (ver §2): `cliente/dados`, `cliente/planos`, `cliente/acesso`, `cliente/desbloqueio`, `financeiro/boleto_aberto`, `financeiro/boleto_aberto_todos`, `financeiro/historico`, `financeiro/boleto_base64`, `financeiro/boleto_por_email`, `conectividade/listar/com_status`, `os/cadastrar`, `atendimento/cadastrar`, `atendimento/listar_setor`, `atendimento/listar_motivo_atendimento`.
- `discover()`: retornar recursos úteis pra UI de escopo (setores/motivos de OS via `atendimento/listar_setor` + `listar_motivo_atendimento`; e, se viável, cidades/bairros/OLTs a partir de `conectividade/listar/com_status`). Mapear pra `DiscoveredResource[]`.
- `health()`: manter, mas se possível validar credencial com uma chamada leve.
- Resposta Altarede: `{data:[...]}` (ok) | `{message:"Sem resultados."}` (404) | `{error}`. Tratar os três.

## 2. Tools do agente ISP (registradas no catálogo `ai_tools` da Fase 5, builtin da solução ISP)
Registrar via o mesmo mecanismo de `builtin-tools.ts` (ou um `isp-tools.ts` que injeta ConnectionsService + Meta Orchestrator). Cada tool resolve a **conexão Altarede** (por tag/categoria ERP via um resolvedor simples — reusar o padrão do Meta Orchestrator ou pedir connection_id na config da tool) e chama `ConnectionsService.execute(org, connectionId, operation, params)`. **A IA nunca chama a API direto.** Todas com input_schema, timeout, `requires_approval` onde destrutivo, auditoria.
- `identificar_cliente` (CPF/CNPJ → `cliente/dados`)
- `consultar_debitos` (→ `financeiro/boleto_aberto_todos` / `historico`)
- `status_conexao` (online/offline, IP/MAC/sessão → `cliente/acesso`)
- `status_regiao` (% offline por filtros cidade/bairro/ip_concentrador/interface_concentrador/id_olt/id_slot/id_cto → `conectividade/listar/com_status`) — **antes de abrir OS, o agente consulta incidente ativo** (ver §3).
- `segunda_via_boleto` (linha digitável + PIX copia-e-cola + PDF → `financeiro/boleto_aberto`/`boleto_base64`/`boleto_por_email`)
- `desbloqueio_confianca` (→ `cliente/desbloqueio`; `requires_approval` opcional por política)
- `abrir_os` (→ `os/cadastrar`; **checa incidente ativo no escopo do cliente e suprime OS duplicada** se a manutenção tiver toggle "suprimir OS")

## 3. Módulo `src/modules/isp/` — Manutenção/Incidentes (painel na plataforma, não no ERP)
### Schema (`isp_*`)
- `IspIncident` (`isp_incidents`): id, org/ws/env, title, message?, forecast? (previsão), status (DRAFT|ACTIVE|RESOLVED), scope Json (`{cidade?,bairro?,ip_concentrador?,interface_concentrador?,id_olt?,id_slot?,id_cto?}`), connection_id (Altarede), comm_mode (REACTIVE|PROACTIVE|COMBINED, default REACTIVE), toggles Json (`{suppress_os:true, inform_forecast:true, notify_normalization:true}`), template_active_id?, template_normalized_id?, auto_detect Boolean @default(false), created_by, timestamps. Índices tenant + status.
- `IspIncidentTarget` (`isp_incident_targets`): id, incident_id, org, customer_ref (login/cpf), name?, phone?, included Boolean @default(true) (checkbox incluir/excluir), source (SCOPE|MANUAL), last_status?. `@@index([incident_id])`.
- `IspIncidentDispatch` (`isp_incident_dispatches`): id, incident_id, org, target_id, channel (WHATSAPP), template_id?, status (PENDING|SENT|FAILED), sent_at?, error?. (log por destinatário do disparo proativo.)

### Serviços/regras
- CRUD de incidentes; **resolver afetados** via `status_regiao`/`conectividade/listar/com_status` no escopo → grava `IspIncidentTarget` (com checkbox include/exclude na UI); vínculos manuais (incluir cliente fora da região / excluir do disparo).
- **Reativo (default):** nenhum disparo. Serviço `IncidentLookupService.activeFor(customer)` que as tools `abrir_os`/`status_regiao` consultam: se cliente ∈ incidente ATIVO, retorna o informativo (message+forecast) e sinaliza suprimir OS (se toggle on).
- **Proativo (ativável):** disparo em massa de template HSM (via Meta Orchestrator da Fase 3 + Notification Center) para targets `included=true`, com **confirmação explícita**, **rate limit** configurável e log em `IspIncidentDispatch`. Nasce OFF.
- **Combinado:** proativo na ativação + reativo na vigência.
- **Detecção automática de outage:** OFF por default. Se ligada, um cron/nó amostra `conectividade/listar/com_status` por OLT/bairro; ao passar o limiar de % offline, **só sugere** rascunho de incidente + alerta ao operador (nunca dispara sozinho).
- Encerramento (RESOLVED): se toggle `notify_normalization`, dispara aviso de normalização (proativo) ou fica disponível no reativo.

## 4. ACL (grupo "ISP" em permissions.constants.ts)
`isp.incidents.read`, `isp.incidents.write`, `isp.incidents.activate`, `isp.incidents.dispatch` (disparo em massa — sensível), `isp.tools.use` (opcional). Labels pt-BR. `SYSTEM_PROFILES`: Administrador herda tudo; Operador herda `.read`. (Sem novo perfil obrigatório; opcional "Operador ISP".)

## 5. Frontend (`platform-admin/src/pages/ISP/`)
- `Incidentes.jsx` — lista + criar/editar (escopo selecionável por cidade/bairro/OLT/slot/CTO + conexão Altarede; mensagem/previsão; modo REACTIVE/PROACTIVE/COMBINED; toggles). Botão "Resolver afetados" → tabela de clientes com checkbox include/exclude + adicionar manual. Ativar/Encerrar (5 patrasques). Disparo proativo com ConfirmDialog + rate limit + progress.
- Serviço `src/services/isp.js` (padrão). Rotas `/isp/incidentes` com `<PermissionRoute perm="isp.incidents.read">`. Nav: grupo "ISP" (ícone lucide `Radio`/`Wrench`/`Network`) — ou item dentro de um grupo "Soluções". As tools ISP aparecem no catálogo de Ferramentas da IA (Fase 5) automaticamente.

## 6. Conector PHP de contingência (só documentar, não implementar agora)
`iastudio_connector.php` (arquivo único, Slim/PDO, auth appkey+token em INTEGRACAO_API) — criar apenas se a API não cobrir algo (ex.: catálogo de OLTs/CTOs para a UI). Documentar no README do módulo isp como plano de contingência; não implementar nesta fase salvo necessidade.

## 7. Verificação e fechamento
Mesmo gate estático (prisma generate + tsc + vite) — **rodar no servidor** (mount pode bloquear no sandbox). Revisão de seams via file tools. README do módulo isp; entrada no CHANGELOG; atualizar checkpoint/estado. `db push` destrutivo.

## 8. Fora de escopo
Nada de ISP no core (só no módulo `isp/` + provider + tools). Resource Model/Mapper genérico = Fase 7. Múltiplos ERPs ISP = futuro (Altarede é o primeiro).
