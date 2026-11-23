# Mapeamento profundo — menus "IA Studio" e "WhatsApp" do Aquapark → porte para o IA Studio

> Andaime de porte (documento vivo temporário). Origem: pedido do Robson de portar
> ui/ux **e** comportamento dos dois menus do Aquapark (mais avançados), incluindo a
> arquitetura de conectores do WhatsApp (**Meta oficial + YCloud + Baileys**) com
> vínculo de coexistência. Base do método: `STUDIO-WORKFLOW` (alinhamento aprovado)
> + doutrina "porte, não reinvente" (`CLAUDE.md`).
>
> Especialidade executora da parte de UI/UX: `ia-studio.studio-ux-adoption@1.0.0`.
> A parte de **backend/conectores** ultrapassa o catálogo atual — ver §8 (governança):
> exige criar especialidade nova via `workflow.specialty-creation` antes de aplicar.
>
> **Decisão do Robson (fixa):** no IA Studio, as conexões do WhatsApp permanecem em
> **Integrações › Conexões** (fluxo genérico do Provider Registry + Cofre de segredos).
> NÃO se cria tela dedicada "WhatsApp › Conexões" como no Aquapark. O menu WhatsApp
> do IA Studio mantém Conversas/Templates/Equipes/Números. Todo o resto (ui/ux e
> comportamento dos dois menus, incluindo Baileys/YCloud + coexistência) é portado.

## 1. A diferença de arquitetura que rege TODO o porte

Não é copiar arquivo. O Aquapark é um produto **dedicado**; o IA Studio é uma
plataforma **genérica, multi-tenant e declarativa**. O mesmo comportamento precisa
ser reimplantado respeitando as regras do IA Studio (`CLAUDE.md`).

| Eixo | Aquapark (origem) | IA Studio (destino) | Consequência para o porte |
|---|---|---|---|
| WhatsApp | Módulo dedicado + tabela `whatsapp_connections` + orquestrador com adapters | Provider Registry genérico (`IProvider`), hoje só `whatsapp-meta.provider.ts` | Conector novo = provider no Registry + Secrets Manager, não uma tabela própria |
| Conexões/credenciais | `whatsapp_connections.config` (JSONB cifrado no próprio módulo) | Instância de conexão + **Secrets Manager** (AES-256-GCM), secret por id | Baileys/YCloud entram como conexões do Registry; segredos no cofre |
| Multi-tenant | Sem `organization_id` | `organization_id` + workspace + environment em toda tabela | Toda entidade portada nasce multi-tenant |
| Design System | Studio UX já adotado (100% das telas) | Studio UX já adotado nas 6 telas do IA Studio | UI porta 1:1 em componentes DS; sem padrão antigo dos dois lados |
| Permissões | namespace `whatsapp.*`, `automation.*` | namespace `comm.whatsapp.*`, `ai.*`, `automation.*` | Toda perm re-mapeada de namespace (não copiar a string) |
| Onde ficam as conexões no menu | WhatsApp › **Conexões** (dedicado) | Integrações › **Conexões** (genérico) | Decidir onde a coexistência WhatsApp aparece (ver §5 e §8) |

## 2. Visão dos dois menus — Aquapark vs IA Studio (hoje)

### Menu "IA Studio"

| Submenu Aquapark | Rota | Perm | Componente | Equivalente no IA Studio hoje | Ação |
|---|---|---|---|---|---|
| Assistentes | `/configuracoes/ia-assistentes` | `automation.agents.view` | `Automacao/Agentes.jsx` | Assistentes `/ia/agentes` (`ai.agents.read`) | Comparar editor/abas; portar diferenças |
| Conhecimento | `/configuracoes/ia-conhecimento` | `automation.knowledge.view` | `Automacao/Conhecimento.jsx` | Conhecimento `/ia/conhecimento` (`ai.knowledge.read`) | Comparar RAG/documentos; portar |
| Pendências | `/configuracoes/ia-pendencias` | `automation.view` | `Automacao/IAPendencias→AutomacaoAprovacoes.jsx` | Pendências `/ia/aprovacoes` (`ai.approvals.read`) | Comparar autorizações; portar |
| Análise de atendimento | `/configuracoes/ia-analise-atendimento` | `automation.agents.view` | `Automacao/Aprendizados.jsx` | **Não existe** | **Portar** (feature nova no IA Studio) |
| Painel | `/configuracoes/ia-painel` | `automation.agents.view` | `Automacao/IAPainel.jsx` | Custos `/ia/custos` (`ai.costs.read`) | Comparar; portar custo real OpenAI/gráfico |
| Ajustes gerais | `/configuracoes/ia-ajustes` | `automation.tools.view` | `Automacao/IAAjustes.jsx` (abas: Ferramentas · Ações da IA · Qualificação de leads) | Ajustes gerais `/ia/ajustes` (tools+memory) | Reconciliar abas; portar Ações da IA + Qualificação |

### Menu "WhatsApp"

| Submenu Aquapark | Rota | Perm | Componente | Equivalente no IA Studio hoje | Ação |
|---|---|---|---|---|---|
| Conversas | `/whatsapp` | `whatsapp.read` | `WhatsApp/WhatsAppPage.jsx` (+ ChatList/ChatWindow/MessageComposer/AudioPlayer/Transfer/Timeline) | Conversas `/whatsapp/conversas` (`comm.whatsapp.view.*`) | Comparar inbox/atendimento; portar controles de mídia, chamar assistente, acompanhante |
| Conexões | `/whatsapp/conexoes` | `integrations.whatsapp.write` | `WhatsApp/ConexoesWhatsApp.jsx` | **Genérico** em Integrações › Conexões (só Meta) | **Manter em Integrações › Conexões** (decisão do Robson); estender o genérico para multi-provider + coexistência, sem tela dedicada de WhatsApp (ver §5) |
| Templates | `/whatsapp/templates` | `whatsapp_templates.read` | `Integracoes/WhatsappTemplates.jsx` (1117 linhas) | Templates `/whatsapp/templates` (`comm.whatsapp.templates.read`) | Comparar catálogo HSM; portar |
| Mídias | `/whatsapp/midias` | `whatsapp.video_library.read` | `WhatsApp/VideoLibrary.jsx` | **Não existe** (há Números no lugar) | **Portar** (biblioteca de mídia) |
| Equipes | `/whatsapp/equipes` | `whatsapp.teams.read` | `Configuracoes/AtendimentoEquipes.jsx` | Equipes e Filas `/whatsapp/equipes` (`comm.whatsapp.teams.read`) | Comparar equipes/filas/tags; portar |

## 3. Menu "IA Studio" — detalhamento (Aquapark)

Padrão de casca comum: `IaStudioSection.jsx` (wrapper de abas com `?tab=` na URL,
deep-link) + `IaStudioSettingsScreen.jsx` (PageHeader + Tabs + Card + form com
`Button type="submit"`). Todas as telas em componentes DS: `ListScreen`, `FormScreen`,
`PageHeader`, `Tabs`, `Card`, `Modal`, `ConfirmDialog`, `EmptyState`, `DataTable`,
`Badge`, `SectionCard`.

### 3.1 Assistentes (`Agentes.jsx`, 546 linhas)
- **UI:** `ListScreen` (colunas: Assistente, Provedor, Modelo, Habilidades, Estado) + cartão mobile. Ação primária "Novo assistente" abre **wizard** (criação guiada, v2.0.55). Linha abre `AgentModal` com abas (persona, procedimento/`behavior_profile`, habilidades/`allowed_tools`, conhecimento/`knowledge_base_ids`, "quando atua"+"equipe" embutidas como abas — v2.0.50). `AgentPromptHistory` (versões de prompt + revert). `listAgentContentReviews`/`reviewAgentContent`/`export`.
- **Modelos por provedor (front):** OpenAI (gpt-5.5 / 5.4-mini / 5.4-nano), Anthropic (claude-opus-4-8 / sonnet-4-6 / haiku-4-5). Vazio = modelo padrão da integração.
- **Backend:** `automation/agents/agents.controller.ts` (`@Controller('automation/agents')`): `GET behavior-profiles`, `GET attendance-capabilities`, `GET metrics`, CRUD, `POST :id/run`, `content-reviews` (GET/POST/export), `:id/runs`, `runs/:runId`, `:id/prompt-versions` (+ `revert`). Perms `automation.agents.view|manage`.
- **Modelos Prisma:** `Agent`, `AgentLearning`, `AgentPromptVersion`, `AgentRun`, `AgentContentReview`, `AgentActionApproval`.
- **Regra de linguagem (CLAUDE.md UX):** "o que o assistente pode fazer", não `allowed_tools`; "quem é", não persona JSON. Jargão em "Ajustes avançados".

### 3.2 Conhecimento (`Conhecimento.jsx`, 237 linhas)
- **UI:** `ListScreen` "Conhecimento" (bases). Base tem categoria `INFO` vs `BEHAVIOR` (diretrizes de comportamento). `FormScreen` de edição; `DataTable` de documentos; "Testar busca" (RAG, mostra relevância %). `ConfirmDialog` para excluir base/documento (remove trechos indexados).
- **Backend:** `automation/knowledge/knowledge.controller.ts` (`@Controller('automation/knowledge')`): `bases` (CRUD), `bases/:id/documents`, `bases/:id/ingest`, `documents/:docId` (delete), `documents/:docId/text` (put), `bases/:id/search`, `faq` (get/put). Perms `automation.knowledge.view|manage`.
- **Modelos Prisma:** `KnowledgeBase`, `KnowledgeDocument`, `KnowledgeChunk`, `KnowledgeQueryLog`.

### 3.3 Pendências (`AutomacaoAprovacoes.jsx`, 102 linhas)
- **UI:** `PageHeader` "Autorizações da IA" + lista de pedidos sensíveis aguardando decisão humana; `EmptyState` "Nada para autorizar". Aprovação usa só o alcance concedido ao assistente.
- **Backend:** `automation/agents/agent-approvals.controller.ts` (`@Controller('automation/approvals')`): `GET`, `POST :id/approve`, `POST :id/reject`. Perm `automation.actions.approve`.
- **Modelo:** `AgentActionApproval`.

### 3.4 Análise de atendimento (`Aprendizados.jsx`, 167 linhas)
- **UI:** `PageHeader` "Análise de atendimento" + lista de análises (`improvement_target` AI/HUMAN). Modal "Analisar conversa" → diagnóstico de melhorias para IA e equipe.
- **Backend:** `automation/agents/learning.controller.ts` (`@Controller('automation/attendance-analysis')`): `GET`, `POST analyze-chat`. Perms `automation.agents.view|manage`.
- **Modelo:** `AgentLearning` (ligado a `WhatsappChat.learning_analyses`).

### 3.5 Painel (`IAPainel.jsx`, 146 linhas)
- **UI:** `PageHeader` "Painel da IA" + StatCards (Execuções, Concluídas, Falhas) + `BarChart` de custo por dia (custo real OpenAI quando configurado, senão estimado) + `DataTable` "Uso por recurso de IA". Distribui custo real por consumo registrado.
- **Backend:** custos/uso da IA (relacionado a `ai/costs` no IA Studio). Feature "custo real OpenAI" é recente (Aquapark v2.5.30–2.5.32).

### 3.6 Ajustes gerais (`IAAjustes.jsx` → `IaStudioSection` com 3 abas)
- **Aba Ferramentas** (`AutomacaoFerramentas.jsx`): `PageHeader` "Ferramentas da IA" + `Tabs` + `ListScreen` de habilidades (kind ACTION/QUERY, enabled). Histórico de chamadas por ferramenta.
- **Aba Ações da IA** (`AcoesIAConfig.jsx`): `IaStudioSettingsScreen` "Ações da IA" + `SettingsSection` "Permissões gerais". Perm `automation.actions.config`.
- **Aba Qualificação de leads** (`LeadAiQualificationConfig.jsx`): `IaStudioSettingsScreen` "Qualificação de leads" + leitura automática (só após resposta útil do cliente) + acompanhamento da fila (`RunCard`) + reprocessar classificações (preserva tags manuais). Backend `LeadAiQualification`/`LeadAiQualificationJob`.
- **Backend transversal:** `automation/tools/tools.controller.ts` (`@Controller('automation/tools')`: CRUD + `calls`), `automation/memory/memory.controller.ts` (perfis + entradas), `automation/system-help`, `automation/sdr/sdr-manual-attendance.controller.ts` (`chats/:id/assume`, perm `whatsapp.assistant.call`).

## 4. Menu "WhatsApp" — detalhamento (Aquapark)

### 4.1 Conversas / Atendimento (`WhatsAppPage.jsx`, 677 linhas + subcomponentes)
- **Subcomponentes:** `ChatList` (168), `ChatWindow` (607), `MessageComposer` (721), `AudioPlayer` (179), `TransferModal` (80), `TimelineModal` (80).
- **UI/comportamento:** abas de conversa ("Conversas", "Fora de 24 horas", "Finalizadas"); botão "Chamar assistente" (faz a IA assumir — perm própria `whatsapp.assistant.call`); "Acompanhante da IA" (vendedor que acompanha enquanto a IA atende — `supervisor_user_id`); modal "Escolher modelo para reabrir" (fora da janela 24h); tags; controles de mídia/áudio (composer com gravação); transcrição de áudio (`gpt-4o-transcribe`); bandeira do país pelo DDI.
- **Backend:** `whatsapp/whatsapp-meta.controller.ts` (`@Controller('whatsapp')`): `attendance/config`, `chats` (+ `:id/manual-channel`, `:id/manual-channels`, `:id/finish`, `:id/reopen`), `messages/:phone`, `send`, `review-draft`, `send-media/:phone`, `typing/:phone`, `video-library/watch/:id`, `subscribe-waba`, `register-number`. `whatsapp/whatsapp.controller.ts` (`@Controller('integrations/:integrationId/whatsapp')`: contacts/messages/send/test/webhook).
- **Modelos Prisma:** `WhatsappChat` (rico — atendimento V1: owner/handler/team/queue/attendance_status; SDR: `ai_handed_off`, `followup_count`, `current_agent_id`; acompanhante: `supervisor_user_id`; anúncio CTWA: `ad_*`; janela 24h: `last_inbound_at`), `WhatsappInboxMessage`, `WhatsappChatEvent`, `ConversationParticipant`, `WhatsappChatTag`.

### 4.2 Templates (`WhatsappTemplates.jsx`, 1117 linhas)
- **UI:** estados de aprovação Meta (NAO_PUBLICADO/APPROVED/PENDING/REJECTED/DISABLED/PAUSED/FLAGGED/LOCKED/IN_APPEAL/PENDING_DELETION/LIMIT_EXCEEDED/REINSTATED), qualidade (GREEN/YELLOW/RED). Eventos automáticos ligados (INVOICE_GENERATED, INVOICE_REMINDER, INVOICE_OVERDUE, PAYMENT_APPROVED, WELCOME_AFTER_SIGN, EMAIL_LEAD_OUTREACH...). Editor (`OutreachTemplateEditor.jsx`, `TemplatePreviewModal.jsx`, `TemplateVariablesPanel.jsx`). Importar/replicar entre conexões.
- **Backend:** `whatsapp/whatsapp-templates.controller.ts` (`@Controller('whatsapp/templates')`) + `whatsapp-template-catalog/catalog.controller.ts` (`@Controller('whatsapp/template-catalog')`): `GET/POST`, `importaveis`, `variaveis-uso-manual`, `importar`, `replicar-catalogo`, `:id` CRUD, `delete-official`, `header-media`, `duplicate`, `replicate`, `publish`, `push-edit`, `sync`, `bind`.
- **Catálogo HSM (regra de ouro do CLAUDE.md):** `catalog.seed.ts` (upsert idempotente por `template_name` no boot; `SEED_RENAMES`/`SEED_REMOVE`) + `template-actions.ts` (`resolveButtonUrl(action, base)`: ação simbólica `OPEN_INVOICE`/`OPEN_CHECKOUT`/`OPEN_PAYMENT_PAGE`/... → URL no domínio do sistema). Modelo `WhatsappTemplateCatalog` (design completo: header/body/footer/`buttons_json`/`variable_map_json`; escopo `provider`+`waba_id`; `event` vazio = só manual; `internal_name`).

### 4.3 Mídias (`VideoLibrary.jsx`, 204 linhas)
- **UI:** `PageHeader` "Mídias" + `ListScreen` de vídeos (envio manual no atendimento, até 16 MB) + `Modal` de categorias (CRUD com `IconButton`) + `ConfirmDialog`.
- **Backend:** `whatsapp/whatsapp-video-library.controller.ts` (`@Controller('whatsapp/video-library')`): `GET`, `available-in-chat`, `categories` (CRUD), `upload`, `:id` (put/delete), `:id/send`. Perms `whatsapp.video_library.*`. Modelos `WhatsappVideoLibrary`, `WhatsappVideoCategory`. Transcode: `whatsapp-media-transcode.service.ts`.

### 4.4 Equipes (`AtendimentoEquipes.jsx`, 469 linhas)
- **UI:** `PageHeader` "Equipes e filas" + `SectionCard` "Visão geral do atendimento" (métricas: CLAIMED/TRANSFERRED/TAKEOVER/CLOSED/REOPENED + reabertas por inbound) + "Movimentações recentes (7 dias)" + Equipes (atendentes/supervisores) + Filas (destino de transferência) + Tags das conversas.
- **Modelos Prisma:** `AttendanceTeam`, `AttendanceTeamMember`, `AttendanceTeamTemplate`, `AttendanceQueue`, `AttendanceTag`, `WhatsappChatTag`.

## 5. Conectores e coexistência (a peça central do pedido)

### 5.1 O modelo do Aquapark (`integration/whatsapp-orchestrator/`)
- **Tipos de provider** (`types.ts`): `meta` | `ycloud` | `baileys_internal` | `baileys_manual`.
  - `meta` / `ycloud`: oficiais; recebem conversas, `is_default`/`is_receiving`, capazes de template HSM.
  - `baileys_internal`: **isolado**, só notificações internas (sem inbox/webhook/atendimento); instância única.
  - `baileys_manual`: canal de **resposta manual** vinculado a uma conexão oficial.
- **Contrato do adapter** (`adapter.ts` → `ConnectionAdapter` / `BaseConnectionAdapter`): `connect/disconnect/reconnect`, `capabilities()`, `sendRich(to, RichMessage)`, `markRead?`, `setTyping?`, `getPairingQr?`; eventos `message`/`status`/`messageStatus`/`error`. **Sem fallback automático** — lança `UnsupportedMessageError`/`ConnectionNotReadyError`/`SendFailedError`. Adapters: `meta-adapter.ts` (692), `ycloud-adapter.ts` (185), `baileys-internal-adapter.ts` (296).
- **Orquestrador** (`orchestrator.service.ts`, 846): registro em memória (`Map<connectionId, adapter>`), consolida eventos, persiste status; cifra config por provider (Meta/YCloud) e serializa auth do Baileys; roteia envio (`send`/`sendVia`/`sendDefault`/`sendManual`/`sendInternalNotification`); `windowState`/`isWithin24h` (janela 24h → texto livre vs HSM).
- **Vínculo de coexistência (o "vínculo" que o Robson citou):**
  - `WhatsappChat.connection_id` = origem oficial (meta/ycloud), **nunca alterada**.
  - `WhatsappChat.manual_connection_id` = canal manual escolhido; enquanto setado, **IA, modelos e automações NÃO usam a conversa** (`ManualChannelOnlyError`).
  - Conexão `baileys_manual` guarda `config.officialConnectionId` apontando pra oficial.
  - `setManualConnection`, `listManualConnectionsForChat`, `resyncChatsToManualPair` (re-vincula chats), `resyncUnambiguousManualPairOnBoot` (auto-vincula quando há exatamente 1 manual + 1 oficial).
  - `NormalizedMessage.isHistory` = mensagem importada do histórico compartilhado (aparece na conversa mas **não dispara resposta automática**) — este é o mecanismo de coexistência com histórico da YCloud.
- **Endpoints** (`orchestrator.controller.ts`, `@Controller('whatsapp-orchestrator')`): `auto-send` (interruptor mestre get/put), `connections` (adapters em memória), `connections/db`, CRUD de conexão, `:id/pairing-qr`, `:id/reconnect`, `:id/restart-pairing`, `:id/resync-chats`, `test-send`. Flag `WHATSAPP_ORCHESTRATOR`. Webhook YCloud próprio: `ycloud-webhook.controller.ts`. Backfill multicanal: `multichannel-backfill.service.ts` (chave `(channel, external_id)`; WA=phone, IG=IGSID, FB=PSID).
- **UI (`ConexoesWhatsApp.jsx`, 432):** `PageHeader` com 4 ações (Notificações internas / Canal manual / YCloud / Meta) + `SectionCard` "Envio automático" (Switch mestre) + `ListScreen` de conexões (status ao vivo por polling 8s, badge Padrão/Alternativa). `ConnectionFormScreen` adapta os campos por provider: Meta (Phone Number ID, Access Token, Business Account ID, Catalog ID, App Secret, App ID, Verify Token, Webhook, registrar número com PIN), YCloud (número, WABA, API key, webhook secret, webhook com histórico compartilhado), Baileys (pareamento por QR com polling 5s; manual exige escolher `officialConnectionId` + "Sincronizar conversas").

### 5.2 Estado no IA Studio (destino) — hoje
- `grep baileys|ycloud` no IA Studio: **zero ocorrências**. Não há adapters, orquestrador multi-provider, nem coexistência.
- WhatsApp só via Meta: `integration/registry/providers/whatsapp-meta.provider.ts` (Provider Registry, `IProvider`), consumido por `comm/whatsapp/` (`whatsapp-orchestrator.service.ts` de provider único, `whatsapp-inbound/inbox/smart-send/sync/templates`, `whatsapp-numbers.controller.ts`, `template-catalog/{catalog.seed,template-actions}`). Já há paridade de conceito de catálogo HSM e "Números".
- Conexões são genéricas em **Integrações › Conexões** (`/integracoes/conexoes`) + **Cofre de segredos**, não uma tela dedicada de WhatsApp.

### 5.3 Estratégia de porte dos conectores (adaptada à arquitetura do IA Studio)
1. YCloud e Baileys entram como **providers do Registry** (`ycloud.provider.ts`, `baileys-internal`/`baileys_manual`), implementando `IProvider` + o contrato de adapter (portar `adapter.ts`/`types.ts` como o contrato interno do WhatsApp).
2. Credenciais via **Secrets Manager** (não JSONB cru); conexão referencia secret por id; export nunca inclui secret.
3. Multi-tenant: conexões e chats por `organization_id`/workspace/environment; o registro em memória do orquestrador precisa ser por-tenant.
4. Coexistência: portar `manual_connection_id` + `officialConnectionId` + `isHistory` + `ManualChannelOnlyError` para o modelo de conversa do IA Studio (`comm/whatsapp/whatsapp-chats`), mantendo o interruptor mestre `auto-send` como Feature Flag (regra "todo automatismo nasce OFF").
5. UI: **decidido (Robson) — a coexistência fica em Integrações › Conexões** (+ Cofre de segredos), sem tela dedicada de "WhatsApp › Conexões". O menu WhatsApp do IA Studio mantém Conversas/Templates/Equipes/Números. A `ConexoesWhatsApp.jsx` do Aquapark vira só **referência de UX** para os campos por provider (Meta/YCloud/Baileys + vínculo `officialConnectionId`/QR de pareamento), reimplantados no wizard genérico de Conexões, com o formulário adaptado por tipo de provider.

## 6. Ordem de porte proposta (uma família por checkpoint)

Frente de UI/UX (`ia-studio.studio-ux-adoption@1.0.0`) e frente de comportamento/conectores
(especialidade a criar) andam intercaladas, sempre 1 por vez com validação humana.

1. **Conectores + coexistência (backend, faseado):** contrato/adapters → YCloud → Baileys internal → Baileys manual + vínculo + `isHistory`. É o de maior valor e o que o Robson priorizou ("mais avançados... conector baileys e ycloud").
2. **Conexões (Integrações, UI):** estender a tela genérica de Conexões para os providers WhatsApp (Meta/YCloud/Baileys) + vínculo de coexistência + interruptor de envio automático (flag). Sem nova tela em WhatsApp — decisão do Robson.
3. **WhatsApp › Conversas:** controles de mídia/áudio, chamar assistente, acompanhante da IA, reabrir com modelo, janela 24h.
4. **WhatsApp › Templates:** catálogo HSM completo + estados Meta + importar/replicar/publish.
5. **WhatsApp › Mídias:** biblioteca de vídeo.
6. **WhatsApp › Equipes/Filas/Tags:** reconciliar com o que já existe.
7. **IA Studio › Análise de atendimento** (novo), **Painel/Custos** (custo real), **Ajustes gerais** (Ações da IA + Qualificação de leads), e diffs de Assistentes/Conhecimento/Pendências.

## 7. Diferenças de nomenclatura/perm a reconciliar (não copiar strings)

- Perms: `whatsapp.*`/`automation.*` (Aquapark) → `comm.whatsapp.*`/`ai.*`/`automation.*` (IA Studio). Perm nova segue os 5 passos do `CLAUDE.md` (constante + grupo + label + perfis + Administrador herda).
- i18n: Aquapark usa `menu.aiStudio.*`/`menu.whatsapp.*` com chaves; o IA Studio usa labels diretos no `Layout.jsx`.
- Modelos de IA no front (Agentes) já citam `claude-opus-4-8` etc. — conferir catálogo vigente antes de portar.

## 8. Governança (obrigatório antes de aplicar)

- **UI/UX** das telas do `platform-admin`: cabe em `ia-studio.studio-ux-adoption@1.0.0` (já catalogada) — ADR ampliando `docs/adocao-studio-ux.md`, mapa de callsites, coexistência, rollout por família.
- **Comportamento/backend + conectores WhatsApp:** fora do catálogo atual (só há `studio-ux-adoption` e `tenant-domains`). Recomendação: criar especialidade local nova via `workflow.specialty-creation@1.0.0` — proposta de id `ia-studio.whatsapp-connectors@1.0.0` (ou mais amplo `ia-studio.aquapark-behavior-port`), `extends: workflow.system-change-base@1.0.0`. Aprovar antes de escrever código de backend.
- **Blueprint:** projeto não adotou `docs/architecture/blueprint.md` → contexto estrutural resolvido por leitura direcionada de código (conduta C do alinhador). Alvo transversal (conectores tocam Provider Registry, Secrets, multi-tenant, eventos) — risco estrutural relevante; checkpoint rígido.
- **Versão/entrega:** nada é numerado aqui. Cada checkpoint aplicável entra com entrada no `CHANGELOG.md` + tag anotada `vX.Y.Z` conferida contra `git tag --sort=-creatordate` na hora (o Robson aplica a tag entre mensagens).

## 9. Fontes (paths reais)

- Aquapark front: `admin-panel/src/components/Layout/navigation.js`, `App.jsx`, `pages/Configuracoes/Automacao/*`, `pages/WhatsApp/*`, `pages/Integracoes/WhatsappTemplates.jsx`, `pages/Configuracoes/AtendimentoEquipes.jsx`.
- Aquapark back: `aquapark-api/src/modules/integration/whatsapp-orchestrator/*`, `integration/whatsapp/*`, `integration/whatsapp-template-catalog/*`, `modules/automation/*`, `prisma/schema.prisma`.
- IA Studio: `platform-admin/src/components/Layout/Layout.jsx`, `App.jsx`; `platform-api/src/modules/{ai,automation,comm/whatsapp,integration/registry}`; `CLAUDE.md`, `docs/adocao-studio-ux.md`, `docs/base-doc-e-portes-aquapark.md`.
- Método: `STUDIO-WORKFLOW/{framework.md,prompt-alinhamento.md,shared/*,doctrine/engineering-doctrine.md,COMO-INTERAGIR-COM-ROBSON.md}`.
