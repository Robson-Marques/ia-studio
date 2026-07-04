# RELATÓRIO TÉCNICO: BACKEND AQUAPARK - ANÁLISE PARA REUTILIZAÇÃO

**Data:** 02/07/2026  
**Escopo:** Exploração completa do backend NestJS/Prisma  
**Objetivo:** Identificar módulos reutilizáveis para nova plataforma (WhatsApp/Meta, IA Studio, Auth/Usuários)

---

## 1. DEPENDENCIES PRINCIPAIS (package.json v1.4.0)

### Stack Core
- **NestJS**: 10.0.0 (framework web)
- **Fastify**: 4.28.1 (HTTP server - substitui Express)
- **Prisma**: 5.0.0 (ORM PostgreSQL)
- **TypeScript**: 5.0.0

### Autenticação & Segurança
- **@nestjs/jwt**: 10.0.0
- **@nestjs/passport**: 10.0.0
- **passport-jwt**: 4.0.0
- **bcrypt**: 5.1.0 (hash de senhas)
- **@fastify/helmet**: 11.1.1 (HTTP security headers)

### IA & Automação
- ❌ Nenhuma biblioteca LLM importada (OpenAI/Anthropic integradas via HTTP/axios)
- **@nestjs/axios**: 3.0.0 (HTTP client)

### Observabilidade & Eventos
- **@nestjs/event-emitter**: 2.0.0 (em memória, sem RabbitMQ)
- **@nestjs/schedule**: 4.0.0 (cron jobs)
- **@nestjs/terminus**: 10.0.0 (health checks)
- **@nestjs/cache-manager**: 2.2.0 (cache em memória)
- **ioredis**: 5.3.0 (opcional - lista de compatibilidade)

### Notificações & Mídia
- **nodemailer**: 6.9.0 (SMTP)
- **imapflow**: 1.0.158 (IMAP - email inbox)
- **web-push**: 3.6.7 (push notifications)
- **socket.io**: 4.7.0 (WebSockets)

### Parsing & Documentos
- **pdf-parse**: 1.1.1 (extrair texto de PDF)
- **pdf-lib**: 1.17.1 (gerar/preencher PDFs)
- **mammoth**: 1.8.0 (converter DOCX para HTML)
- **mailparser**: 3.6.7 (parse de emails RFC 2822)

### Validação & Transformação
- **class-validator**: 0.14.0 (validação de DTOs)
- **class-transformer**: 0.5.1 (transformação de objetos)

### Utilitários
- **uuid**: 9.0.0
- **adm-zip**: 0.5.12 (ZIP/unzip)
- **form-data**: 4.0.0 (multipart form uploads)

**Observação Crítica**: Nenhuma dependência de SDK oficial do WhatsApp/Meta. Integração via Graph API HTTP directamente (axios).

---

## 2. ESTRUTURA DE MÓDULOS EM src/modules/

```
modules/
├── admin/                    [Autenticação + Usuários + Perfis]
│   ├── admin-auth/           (login, JWT, validação)
│   ├── company-profile/      (dados da empresa)
│   └── permission-profiles/  (controle de acesso granular)
│
├── integration/              [Integrações Externas]
│   ├── whatsapp/             (Meta Cloud API - envio/webhook)
│   ├── whatsapp-orchestrator/(multi-conexão, adapter abstrato)
│   ├── whatsapp-attendance/  (central de atendimento V1)
│   ├── whatsapp-template-catalog/ (HSM templates Meta)
│   ├── email/                (SMTP transacional)
│   ├── email-inbox/          (IMAP + lead capture)
│   ├── integrations/         (CRUD + crypto de credenciais)
│   ├── sicoob/               (banco cobrança/boleto)
│   ├── gateway-transactions/ (pagamentos)
│   ├── backup/               (Google Drive)
│   └── shared/               (crypto, helpers)
│
├── automation/               [IA Studio + Workflows]
│   ├── agents/               (IA com tool-calling)
│   ├── knowledge/            (RAG - embeddings)
│   ├── memory/               (perfis de memória)
│   ├── tools/                (registry + catalog de tools)
│   ├── action-nodes/         (nós de ação HTTP/Email/CRM)
│   ├── sdr/                  (gatilhos + automação SDR)
│   ├── examples/             (12 workflows pré-publicados)
│   ├── workflow-engine.service.ts (motor de execução)
│   └── node-registry.service.ts (registro extensível de nós)
│
├── sales/                    [ESPECÍFICO AQUAPARK - Vendas]
│   ├── sales/
│   ├── sellers/
│   ├── managers/
│   ├── plans/
│   ├── lots/
│   ├── channels/
│   ├── commissions/
│   ├── lead-checkout/        (checkout self-service)
│   └── relationship/         (regra de 7/30/60/90 dias)
│
├── billing/                  [ESPECÍFICO AQUAPARK - Faturamento]
│   ├── invoices/
│   ├── payment-records/
│   ├── payment-gateways/    (Sicoob, PaymentGatewayFactory)
│   ├── payment-conditions/
│   ├── conciliation/
│   ├── overdue/
│   └── collection/
│
├── crm/                      [ESPECÍFICO AQUAPARK - CRM]
│   ├── customers/
│   ├── leads/
│   ├── interactions/
│   ├── pipeline/
│   ├── tags/
│   ├── followups/
│   └── relationship/
│
├── contract/                 [ESPECÍFICO AQUAPARK]
│   └── D4Sign integration
│
├── notification/             [Notificações - Parcialmente Genérico]
│   ├── email/
│   ├── web-push/
│   ├── notification-template/ (triggers de eventos)
│   └── sms/ (planejado)
│
├── analytics/                [ESPECÍFICO AQUAPARK]
├── admin-tools/              [Ferramentas de Validação - REMOVÍVEL]
├── validation/               [Validação Manual - REMOVÍVEL]
├── help/                      [Central de Ajuda v1.8.28]
├── health/                    [Health checks + métricas Prometheus]
└── portal/                    [Portal de Usuários - ESPECÍFICO]
```

---

## 3. MÓDULO WHATSAPP: ANÁLISE PROFUNDA

### 3.1 Estrutura Física

**Diretórios principais:**
```
integration/
├── whatsapp/                     [20 arquivos]
│   ├── whatsapp-meta.service.ts  (cliente HTTP Meta Cloud API)
│   ├── whatsapp-inbox.service.ts (processamento inbound)
│   ├── whatsapp-smart-send.service.ts (orquestração de envio)
│   ├── whatsapp-templates.service.ts (CRUD de templates HSM)
│   ├── whatsapp-notifications.service.ts (outbound templates)
│   ├── whatsapp-webhook.controller.ts (webhook Meta POST)
│   ├── whatsapp-chats.repository.ts (queries WhatsappChat)
│   ├── whatsapp-config.service.ts (credenciais Meta)
│   ├── whatsapp-push.listener.ts (EventEmitter2 listener)
│   ├── whatsapp.module.ts        (injeção de deps)
│   ├── dto/whatsapp.dtos.ts      (request/response DTOs)
│   └── [controllers + repository]
│
├── whatsapp-orchestrator/        [9 arquivos]
│   ├── orchestrator.service.ts   (loadbalancer de conexões)
│   ├── meta-adapter.ts           (adapter Meta Cloud API)
│   ├── adapter.ts                (interface abstrata)
│   ├── types.ts                  (NormalizedMessage, RichMessage)
│   ├── helpers.ts                (utilitários)
│   ├── media-store.ts            (cache local de mídia)
│   └── [controller + module]
│
├── whatsapp-attendance/          [16 arquivos - CENTRAL V1]
│   ├── attendance.service.ts     (core de atendimento)
│   ├── chat-assignment.service.ts (round-robin, escopo)
│   ├── reply-gate.service.ts     (validar permissão de resposta)
│   ├── chat-scope.resolver.ts    (resolver acesso à conversa)
│   ├── attendance.repository.ts  (queries complexas)
│   └── [controllers, listeners, DTOs]
│
└── whatsapp-template-catalog/    [6 arquivos]
    ├── catalog.seed.ts           (seed 30+ templates)
    ├── catalog.service.ts        (CRUD templates)
    └── template-actions.ts       (resolver botões com ações)
```

### 3.2 Classes e Responsabilidades

#### **WhatsappMetaService** (`whatsapp-meta.service.ts`)
- **Responsabilidade**: Cliente HTTP da Meta Cloud API (Graph v25.0)
- **Métodos principais**:
  - `sendText(phone, text, replyTo?)` → POST /messages (texto)
  - `sendTemplate(phone, templateName, variables)` → POST /messages (HSM)
  - `sendMedia(phone, mediaUrl, type)` → POST /messages (imagem/vídeo/doc)
  - `getTemplates()` → GET /message_templates (listar HSM aprovadas)
  - `createTemplate(name, language, body, components)` → POST (novo template)

- **Config necessária**: `access_token`, `phone_number_id`, `business_id` (WABA ID)
- **Fonte de credenciais**: `Integration.config` (AES-256-GCM cifrado) OU `WhatsappConnection.config`
- **Fallback**: Legacy→ Integration WHATSAPP; novo→ WhatsappConnection provider='meta'

#### **WhatsappOrchestratorService** (`whatsapp-orchestrator/orchestrator.service.ts`)
- **Responsabilidade**: Multi-conexão (N números WhatsApp)
- **Ciclo de vida**: `onModuleInit()` carrega todas as conexões ativas
- **Manutenção**: 1 `MetaAdapter` por `WhatsappConnection` em memória
- **Routing**: `chatId` → resolve `connection_id` → resolve adapter → delega send/receive
- **Eventos emitidos**: `message` (inbound), `messageStatus` (ACK), `status` (conectado/erro), `error`
- **Persistência de status**: Atualiza `WhatsappConnection.status` no banco (disconnected/connecting/connected/error)

#### **MetaAdapter** (`whatsapp-orchestrator/meta-adapter.ts`)
- **Responsabilidade**: Encapsular protocolo Meta Cloud API (provider-specific)
- **Entrada**: `RichMessage` (abstrata)
- **Saída**: `NormalizedMessage` (normalizada)
- **Capacidades declaradas** (`ProviderCapabilities`):
  - ✅ Suportado: CTA URL, reply buttons, list, quotedReply
  - ❌ Não suportado: catalog, location request, location, typing, edit, delete
  - Limites: 3 buttons, 10 list rows, 4096 chars de mensagem

#### **WhatsappSmartSendService** (`whatsapp/whatsapp-smart-send.service.ts`)
- **Responsabilidade**: Lógica de envio inteligente
- **Decisão de template**: Se > 24h do último inbound → força template HSM; se < 24h → texto livre
- **Retry**: Falhas salvam em `WhatsappNotification.status = 'FAILED'` (pode reenviar manualmente)
- **Deduplicação**: Evita ecos (Meta não ecoa; Baileys antigo ecoava)

#### **WhatsappAttendanceService** (`whatsapp-attendance/attendance.service.ts`)
- **Responsabilidade**: Central de Atendimento V1 (inerte até Fase 3)
- **Escopo de acesso** (permissões granulares):
  - `whatsapp.view.assigned` → ve as próprias conversas
  - `whatsapp.view.unassigned` → ve pool (não atribuidas)
  - `whatsapp.view.team` → ve conversas do time supervisionado
  - `whatsapp.view.all` → ve tudo
  - `whatsapp.reply.*` → análogo para envio
- **Mecanismo**: `AttendanceTeamMember` + `chat_assignment`
- **Round-robin**: Próximo agente é o com `last_assigned_at` mais antigo

#### **WhatsappChatRepository** (`whatsapp/whatsapp-chats.repository.ts`)
- **Responsabilidade**: Queries de conversa
- **Método especial**: `lookupCustomerName(phone)` → busca `Customer.phone` por digitos (sem index, best-effort)
- **Enriquecimento**: Tenta preencher `contact_name` vindo do `Customer` se vazio

#### **WhatsappNotificationsService** (`whatsapp/whatsapp-notifications.service.ts`)
- **Responsabilidade**: Disparar templates automáticos por evento
- **Gatilhos**: `INVOICE_GENERATED`, `CUSTOMER_CREATED`, `EMAIL_LEAD_ASSIGNED`, etc.
- **Configuração**: Template + variáveis (mapping no schema)
- **Retry**: `WhatsappNotification` persiste tentativas (failed/sent/delivered/read)

### 3.3 Modelos Prisma (WhatsApp)

```prisma
model WhatsappConnection {
  id            String    @id @default(uuid())
  name          String
  provider      String    @default("meta")        # sempre 'meta' (Baileys removido)
  status        String    @default("disconnected")# connected|connecting|error
  phone_number  String?
  config        Json      @default("{}")          # { accessToken, phoneNumberId, businessId, appSecret } (AES-256-GCM)
  is_default    Boolean   @default(false)
  is_receiving  Boolean   @default(true)
  active        Boolean   @default(true)
  @@map("whatsapp_connections")
}

model WhatsappChat {
  id            String    @id @default(uuid())
  phone_number  String    @unique
  contact_name  String?
  source        String    @default("meta")
  status        String    @default("active")
  last_message  String?
  last_at       DateTime  @default(now())
  last_inbound_at DateTime?  # janela 24h Meta (último inbound cliente)
  unread_count  Int       @default(0)
  @@map("whatsapp_chats")
}

model WhatsAppMessage {
  id              String    @id @default(uuid())
  chat_id         String    # Foreign Key para WhatsappChat
  phone_number    String
  direction       String    # 'incoming' | 'outgoing'
  type            String    # text|image|video|document|audio|interactive_reply|location|contact
  content         String?
  media_url       String?
  media_mime_type String?
  external_id     String?   # ID no provider (Meta)
  status          String    # sent|delivered|read|failed
  connection_id   String?   # FK WhatsappConnection (multi-conexão)
  created_at      DateTime  @default(now())
  @@map("integration_whatsapp_messages")
}

model WhatsappTemplateCatalog {
  id                 String   @id @default(uuid())
  event              String   # EVENT_KEY (EMAIL_LEAD_RECEIVED, INVOICE_GENERATED, ...)
  template_name      String   @unique
  category           String   # UTILITY|MARKETING|AUTHENTICATION
  language           String   @default("pt_BR")
  header_type        String?  # TEXT|IMAGE|VIDEO|DOCUMENT|null
  header_content     String?
  body               String
  footer_content     String?  # estático (Meta não aceita variável)
  variable_map_json  Json?    # { header:{1:"empresa_nome"}, body:{...} }
  buttons_json       Json?    # [{ type:'URL'|'QUICK_REPLY', text, action }]
  is_approved        Boolean  @default(false)
  @@map("whatsapp_template_catalog")
}

model WhatsappConfig {
  id                    String   @id @default(uuid())
  access_token          String?  # AES-256-GCM (base64)
  phone_number_id       String?
  business_account_id   String?
  webhook_verify_token  String?
  app_secret            String?  # AES-256-GCM (HMAC validação)
  is_active             Boolean  @default(false)
  @@map("whatsapp_config")
}

model Notification {  # genérico (email, sms, whatsapp, push)
  id              String           @id @default(uuid())
  template_id     String?          # FK NotificationTemplate
  channel         NotifyChannel    # 'whatsapp'|'email'|'sms'|'push'
  recipient_phone String?
  recipient_email String?
  recipient_user_id String?
  status          NotifStatus
  sent_at         DateTime?
  read_at         DateTime?
  failed_reason   String?
  @@map("notif_notifications")
}

model WhatsappNotification {
  id              String    @id @default(uuid())
  phone           String
  template_name   String?   # template Meta (HSM)
  meta_variable_mappings Json? # {header:{1:"João"}, body:{...}}
  status          String    # pending|sent|delivered|read|failed
  failed_reason   String?
  attempt_count   Int       @default(0)
  last_attempt_at DateTime?
  @@map("notif_whatsapp_notifications")
}

model NotificationTemplate {
  id              String           @id @default(uuid())
  event_key       String           # EMAIL_LEAD_RECEIVED, INVOICE_GENERATED, ...
  channel         NotifyChannel
  trigger_days    Int              # dias pós-evento (0 = imediato)
  whatsapp_template_name String?   # HSM Meta name
  whatsapp_template_lang String?   # pt_BR
  meta_variable_mappings Json?
  deleted_at      DateTime?        # F3-03 soft delete
  @@unique([event_key, channel, trigger_days])
  @@map("notif_templates")
}
```

### 3.4 Acoplamentos com Módulos de Negócio

**Imports evidentes** (grep WhatsApp em módulos de negócio):

1. **CRM** (`src/modules/crm/customers/`):
   - Busca `Customer.phone` para enriquecer nome do chat (via `lookupCustomerName()`)
   - Integralmente acoplado: Se remover WhatsApp, CRM continua funcionando

2. **Billing** (`src/modules/billing/invoices/`):
   - `NotificationTemplate` com `event_key: INVOICE_GENERATED`
   - Dispara WhatsApp template automaticamente quando fatura é criada
   - **Acoplamento**: EventEmitter `INVOICE_GENERATED` → `WhatsappNotificationService.onInvoiceGenerated()`

3. **Sales** (`src/modules/sales/commissions/`):
   - Sem acoplamento direto ao código WhatsApp
   - EventEmitter `SALE_COMPLETED` dispara notificação (genérica de email/WhatsApp)

4. **Automation** (`src/modules/automation/tools/`):
   - Tool "enviar WhatsApp" registrada no registry (usada por agents)
   - Runtime: `ToolRuntimeService` → `WhatsappSmartSendService.send()`

### 3.5 Maturidade & Produção

- ✅ **Ativo em produção** (v1.4.0 em uso)
- ✅ **Testes unitários**: 3 spec files (agent-actor, tool-runtime, prompt-security)
- ✅ **Multi-conexão implementado** (v2.1 Junho/2026) — N números WhatsApp
- ✅ **Templates HSM versionados** (seed de 30+ templates)
- ⚠️ **Central de Atendimento V1** (inerte até Fase 3, gating via flag `ATTENDANCE_CONTROL`)
- ✅ **Webhook validado** (HMAC com app_secret)
- ✅ **Orquestrador estável** (Baileys removido em 2026-06-27)

---

## 4. MÓDULO IA / IA STUDIO: ANÁLISE PROFUNDA

### 4.1 Estrutura Física

```
automation/
├── agents/                                [27 arquivos - CORE IA]
│   ├── agents.service.ts                 (CRUD agentes)
│   ├── agent-runner.service.ts           (executa loop tool-calling)
│   ├── llm-provider.service.ts           (abstração OpenAI/Anthropic)
│   ├── tool-registry.service.ts          (registry extensível)
│   ├── tool-runtime.service.ts           (executor de tools)
│   ├── agent-selector.service.ts         (multi-agent orchestration)
│   ├── agent-persona.helpers.ts          (compilar persona estruturada)
│   ├── agent-approvals.service.ts        (workflow de aprovação de ações)
│   ├── collaboration.service.ts          (multi-agent collaboration)
│   ├── prompt-security.service.ts        (validação de prompt injection)
│   ├── [controllers, repository, specs]
│   └── agents.module.ts
│
├── knowledge/                             [6 arquivos - RAG]
│   ├── knowledge.service.ts              (CRUD bases + chunks)
│   ├── embeddings.service.ts             (gerar embeddings)
│   ├── parse-source.ts                   (extrair texto PDF/DOCX/URL)
│   ├── knowledge.repository.ts
│   └── knowledge.module.ts
│
├── memory/                                [5 arquivos]
│   ├── memory.service.ts                 (CRUD perfis de memória)
│   ├── memory.repository.ts
│   └── memory.module.ts
│
├── tools/                                 [6 arquivos]
│   ├── tool-catalog.service.ts           (persistir tools no banco)
│   ├── tool-call-log-retention.cron.ts   (limpeza de logs antigos)
│   ├── tool.repository.ts
│   └── tools.module.ts
│
├── sdr/                                   [4 arquivos - Bot SDR]
│   ├── sdr-nodes.service.ts              (nós CRM_LEAD, HANDOFF)
│   ├── sdr-followup.cron.ts              (job de follow-up)
│   ├── sdr-trigger.listener.ts           (gatilho por evento)
│   └── sdr.module.ts
│
├── action-nodes/                          [3 arquivos]
│   ├── action-nodes.service.ts           (nós HTTP/Email/CRM/Billing/PIX)
│   ├── event-trigger.listener.ts         (emit de eventos globais)
│   └── action-nodes.module.ts
│
├── examples/                              [4 arquivos]
│   ├── automation-examples.service.ts    (seed 12 workflows publicados)
│   ├── automation-examples.repository.ts
│   └── automation-examples.module.ts
│
├── workflow-engine.service.ts             (motor genérico de workflows)
├── node-registry.service.ts              (registro extensível de nós)
├── global-context.service.ts             (contexto compartilhado execução)
├── automation-metrics.service.ts         (observabilidade)
├── automation.module.ts
├── automation.controller.ts
└── dto/automation.dtos.ts
```

### 4.2 Arquitetura de IA (Agent Framework v1.8.66)

#### **Conceito Fundamental: IA como Nó de Workflow**
```
Workflow (genérico) 
  → Nó AGENT (tipo de nó)
    → AgentRunner (dispara loop tool-calling)
      → LlmProviderService (OpenAI OU Anthropic)
        → Muliplica loop: {msg + tools} → {response + toolCalls[]}
      → ToolRuntimeService (executa cada tool call)
        → resolve resultado
      → reinicia loop até max_steps ou conclusão
```

#### **LlmProviderService** (`agents/llm-provider.service.ts`)

**Responsabilidade**: Abstração de provider LLM

**Suporte**:
- ✅ OpenAI (GPT-5.x, GPT-4o, GPT-4, GPT-3.5)
- ✅ Anthropic (Claude 3.5 Haiku/Sonnet/Opus)

**Interface única**:
```typescript
async chat(args: {
  provider: 'openai' | 'anthropic';
  model: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  temperature?: number;
  maxTokens?: number;  // P5: teto de resposta
}): Promise<LlmResult>
```

**Fonte de credenciais**:
- OpenAI: `Integration.type = 'OPENAI'`, config.api_key decifrado
- Anthropic: `Integration.type = 'ANTHROPIC'`, config.api_key decifrado

**Modelos recomendados** (defaults):
- OpenAI: `gpt-5.5` (reasoning)
- Anthropic: `claude-3-5-haiku-latest` (rápido, barato)

**Normalização**:
- Entrada: messages[] + tools[] → contrato único
- Saída: { content, toolCalls[] } → contrato único
- Gerenciamento de temperature: GPT-5/o só aceitam default (1.0)
- Token tracking: prompt_tokens, completion_tokens, total_tokens, cost_usd

#### **AgentRunnerService** (`agents/agent-runner.service.ts`)

**Responsabilidade**: Loop de execução com tool-calling

**Ciclo**:
1. Carrega `Agent` do banco (config: model, system_prompt, persona, temperature, max_steps, allowed_tools)
2. Compila `persona` estruturada → system_prompt final
3. Inicializa transcript: `[{ role: 'system', content: ... }]`
4. Loop (i < max_steps):
   - Chama `LlmProviderService.chat()`
   - Se response tem `toolCalls[]`:
     - Executa cada tool via `ToolRuntimeService`
     - Adiciona resultados ao transcript
     - Continua loop
   - Senão (resposta final):
     - Break
5. Salva `AgentRun` com transcript, status, tokens, custo

**Escopo de Ação** (v2.0-F1):
- Agent tem `action_permissions: string[]` (ex: `['sales.read', 'customers.write']`)
- Runtime: se `useActionScope: true`, valida tool call contra permissões
- Se permissão faltante e `AGENT_ACTIONS_ENFORCE: off` → permite (fallback)
- Senão lança erro de autorização

**Observabilidade**:
- ERA3 EH-Cost-1: custo + tokens salvos em `AgentRun` (modelo = 'gpt-4o', prompt_tokens=500, etc.)
- `trace_id` correla com workflow que disparou
- Logs no banco + timeline da execução

#### **ToolRegistryService** (`agents/tool-registry.service.ts`)

**Responsabilidade**: Catálogo global de tools (extensível)

**Registration Pattern**:
```typescript
toolRegistry.register({
  name: 'consultar_faq',
  description: 'Busca pergunta frequente no FAQ',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' }
    }
  }
});
```

**Tools Built-in** (registrados em automation.module.ts):
- `consultar_faq` - search Knowledge Base
- `memory_read` - ler variável de memória
- `memory_write` - escrever variável
- `http_request` - chamar endpoint HTTP
- `send_email` - enviar email transacional
- `send_whatsapp` - enviar WhatsApp via orquestrador
- `enviar_lead_crm` - criar/atualizar lead
- `consultar_especialista` - chamar agente colaborador (multi-agent)
- `pedir_aprovacao_humana` - workflow de aprovação

**Tools por Domínio** (registrados em módulos):
- **CRM**: `qualificar_lead`, `atribuir_lead`, `consultar_lead`
- **Billing**: `gerar_boleto`, `gerar_pix`, `criar_fatura`
- **Sales**: `criar_cliente`, `ver_vendas`

#### **ToolRuntimeService** (`agents/tool-runtime.service.ts`)

**Responsabilidade**: Executar tool call individual

**Lookup**: 
1. Query `ToolCatalog.name = 'foo'`
2. Se não achar, busca registrado em ToolRegistry
3. Se não achar, erro "tool not found"

**Execução**:
- Valida argumentos contra schema
- Chama handler correspondente (sync ou async)
- Retorna resultado ou erro
- Logs em `ToolCallLog` (opcional - limpeza via cron ERA3 EH-Logs-1)

#### **AgentPersonaHelpers** (`agents/agent-persona.helpers.ts`)

**Responsabilidade**: Compilar persona estruturada

**Entrada** (campo `Agent.persona` - JSON):
```json
{
  "name": "Maria",
  "tone": "amigável, profissional",
  "emojis": true,
  "brevity": "short",       // short|medium|detailed
  "rules_always": ["respeitar CPF", "confirmar email"],
  "rules_never": ["fazer diagnóstico médico", "vender seguro"]
}
```

**Saída**: Trecho de system_prompt compilado
```
Você é Maria, uma assistente amigável e profissional. ...
REGRAS SEMPRE SEGUIDAS: respeitar CPF, confirmar email.
REGRAS PROIBIDAS: fazer diagnóstico médico, vender seguro.
```

#### **AgentApprovalsService** (`agents/agent-approvals.service.ts`)

**Responsabilidade**: Workflow de aprovação humana para ações críticas

**Fluxo**:
1. Agent detecta ação crítica (ex: criar fatura de R$ 10k)
2. Cria `AgentActionApproval` com status=PENDING
3. Admin recebe notificação (webhook/notif)
4. Admin aprova/rejeita via UI
5. Agent retoma execução (callout síncrono ou async via listener)
6. Resultado salvo em `result_json`

**Gating**: Flag `AGENT_ACTIONS_ENFORCE` (on/off)

#### **CollaborationService** (`agents/collaboration.service.ts`)

**Responsabilidade**: Multi-agent collaboration (ERA3, v1.8.66)

**Regras**:
- `AgentCollaborationRule`: principal_agent + collaborator_agent
- `output_mode`: CONSULTANT (contribuição retorna como contexto) | INTERNAL_NOTE (vira nota)
- `trigger_mode`: ON_DEMAND (principal chama tool) | ALWAYS (colaborador participa todo turno)

**Exemplo**:
```
Principal Agent (Vendedor) + Collaborator Agent (Especialista técnico)
- ON_DEMAND: quando o vendedor usa ferramenta "consultar_especialista"
- CONSULTANT: resposta do especialista é contexto pro vendedor (cliente vê 1 voz)
```

### 4.3 Workflow Engine (Automação Genérica)

#### **WorkflowEngineService** (`workflow-engine.service.ts`)

**Responsabilidade**: Motor genérico de workflows (Event-Driven/Scheduled)

**Tipos de Nó**:

| Tipo | Categoria | Executor | Status |
|------|-----------|----------|--------|
| AGENT | IA | AgentRunnerService | ✅ Produção |
| HTTP | Integração | HttpService | ✅ Produção |
| EMAIL | Notificação | EmailService | ✅ Produção |
| MEMORY | Estado | MemoryService | ✅ Produção |
| CRM_LEAD | Domínio | LeadsService | ✅ Produção |
| CRM_CUSTOMER | Domínio | CustomersService | ✅ Produção |
| BILLING_INVOICE | Domínio | InvoicesService | ✅ Produção |
| BILLING_CHARGE | Domínio | ChargingService | ✅ Produção |
| BILLING_PIX | Domínio | PixService | ✅ Produção |
| SMS_SEND | Notificação | SmsService | ⏳ Planejado |
| CRM_OPPORTUNITY | Domínio | OpportunitiesService | ⏳ Planejado |
| WHATSAPP_SEND | Notificação | WhatsappService | ⏳ Planejado (existe tool) |

**Execução**:
1. `Workflow` (estado: DRAFT/PUBLISHED)
2. Disparado por: evento (CUSTOMER_CREATED), schedule (cron), manual (webhook)
3. Cria `WorkflowExecution` (trace_id único)
4. Para cada nó na ordem:
   - Resolve dependências (inputs de nós anteriores)
   - Chama handler registrado no NodeRegistry
   - Log em `WorkflowExecutionLog`
   - Decisão (erro → default/skip/abort)
5. Timeline completa salva

**Exemplo Seed**:
```
SDR · Lead novo → aborda no WhatsApp
├─ Trigger: EMAIL_LEAD_ASSIGNED
├─ Nó 1 (AGENT): SDR avalia lead (persona "avançado", tools: ["qualificar", "buscar_telefone"])
├─ Nó 2 (WHATSAPP_SEND): Enviar WhatsApp de abertura
├─ Nó 3 (CRM_LEAD): Atualizar status lead para IN_PROGRESS
└─ Nó 4 (MEMORY): Gravar timestamp de abordagem
```

### 4.4 Knowledge Base / RAG (v1.8.67)

#### **KnowledgeService** (`knowledge/knowledge.service.ts`)

**Responsabilidade**: Bases de conhecimento reutilizáveis

**Flow**:
1. Admin cria `KnowledgeBase` (nome, descrição)
2. Add `KnowledgeDocument` (URL/PDF/DOCX/TXT)
3. `parse-source.ts` extrai texto
4. Divide em `KnowledgeChunk` (chunks sobrepostos, ex: 500 tokens)
5. `embeddings.service.ts` gera vetor (embedding) — JSON float[]
6. Tool `consultar_faq` busca por similaridade cosseno

**Modelos**:
```prisma
model KnowledgeBase {
  id: String
  name: String
  description: String?
  is_active: Boolean
  documents: KnowledgeDocument[]
  chunks: KnowledgeChunk[]
}

model KnowledgeDocument {
  id: String
  base_id: String
  source_type: String  # TXT|TEXT|URL|PDF|DOCX
  source_ref: String?  # URL ou nome arquivo
  extracted_text: String?  # texto extraído (editável)
  status: KnowledgeDocStatus  # PENDING|READY|FAILED
  chunks: KnowledgeChunk[]
}

model KnowledgeChunk {
  id: String
  base_id: String
  document_id: String
  idx: Int          # índice no documento
  content: String
  embedding: Json?  # float[]
}

model KnowledgeQueryLog {
  id: String
  base_id: String
  trace_id: String?      # correlação com execução
  agent_id: String?
  query: String
  top_score: Float?      # similarity mais alta
  result_count: Int
  doc_ids: String[]      # docs retornados
}
```

**Observação**: Sem pgvector (banco de vetores). Similaridade em app (tolerável até escala média). pgvector entra em upgrade posterior.

### 4.5 Memory Profiles (v1.8.68)

#### **MemoryService** (`memory/memory.service.ts`)

**Responsabilidade**: Perfis de memória configurável

**Escopo**:
- SESSION: por execução/sessão
- CONTACT: por contato (persiste entre conversas)
- WORKFLOW: por automação
- AGENT: por agente

**TTL**: Opcional (expires_at)

**Max Items**: Limite por scope_key (null = ilimitado)

**Exemplo**:
```
MemoryProfile: "Histórico de Objetivos" (scope: CONTACT, ttl: 2592000 = 30 dias)
  Key: lead_123
    "objective_1": { desc: "conhecer plano", priority: "high" }
    "objective_2": { desc: "comparar preços", priority: "medium" }

Dentro de um workflow, agent lê com ferramenta memory_read("objective_1")
Escreve memória com memory_write("objective_1", {...})
```

### 4.6 SDR Bot (v1.8.69)

#### **SdrNodesService** (`sdr/sdr-nodes.service.ts`)

**Responsabilidade**: Nós de ação específicos do SDR

**Nós**:
- `CRM_LEAD`: Qualificar (COLD/WARM/HOT), atribuir, alterar status
- `HANDOFF`: Transferir para humano (Closer)

**Gatilho** (SdrTriggerListener):
- Evento `EMAIL_LEAD_ASSIGNED`
- Verifica se lead é HOT (score > 80)
- Dispara workflow "SDR · Lead novo → aborda"

**Follow-up** (SdrFollowupCron):
- Job rodando a cada 5 min
- Busca leads em IN_PROGRESS sem resposta há > 6 horas
- Re-dispara WhatsApp (template)

### 4.7 Modelos Prisma (Automation/IA)

```prisma
model Agent {
  id               String   @id @default(uuid())
  name             String
  description      String?
  provider         String   @default("openai")     # openai|anthropic
  model            String   @default("gpt-4o-mini")
  system_prompt    String?
  persona          Json?    # { name, tone, emojis, rules_always[], rules_never[] }
  goal             String?
  temperature      Float    @default(0.3)
  max_steps        Int      @default(6)           # iterações tool-calling
  max_tokens       Int?     # teto de resposta
  allowed_tools    String[] # nomes de tools
  knowledge_base_ids String[] @default([])         # bases RAG
  action_permissions String[] @default([])         # ex: ['sales.read', 'customers.write']
  is_active        Boolean  @default(true)
  created_by       String?
  runs             AgentRun[]
  prompt_versions  AgentPromptVersion[]
  @@map("automation_agents")
}

model AgentRun {
  id                String  @id @default(uuid())
  agent_id          String
  execution_id      String?         # workflow que disparou
  trace_id          String          # correlação
  status            AgentRunStatus  # RUNNING|COMPLETED|ERROR
  input_json        Json?
  output            String?
  messages          Json?           # transcript
  error             String?
  model             String?         # modelo efetivo usado
  prompt_tokens     Int?
  completion_tokens Int?
  total_tokens      Int?
  cost_usd          Float?          # custo estimado
  started_at        DateTime?
  finished_at       DateTime?
  created_by        String?
  created_at        DateTime @default(now())
  agent             Agent    @relation(fields: [agent_id], references: [id], onDelete: Cascade)
  @@index([agent_id, created_at(sort: Desc)])
  @@index([trace_id])
  @@map("automation_agent_runs")
}

model AgentPromptVersion {
  id            String   @id @default(uuid())
  agent_id      String
  version       Int               # incremental
  system_prompt String?
  goal          String?
  model         String?
  temperature   Float?
  note          String?           # contexto ("reverter", "edicao manual")
  created_by    String?
  created_at    DateTime @default(now())
  agent         Agent    @relation(fields: [agent_id], references: [id], onDelete: Cascade)
  @@unique([agent_id, version])
  @@map("automation_agent_prompt_versions")
}

model Workflow {
  id              String                 @id @default(uuid())
  name            String
  description     String?
  trigger_type    String                 # EVENT|SCHEDULE|MANUAL
  trigger_config  Json?
  is_published    Boolean                @default(false)
  is_active       Boolean                @default(true)
  created_by      String?
  nodes_json      Json                   # DAG serializado
  executions      WorkflowExecution[]
  @@map("automation_workflows")
}

model WorkflowExecution {
  id           String                 @id @default(uuid())
  workflow_id  String
  trace_id     String                 # correlação global
  status       ExecutionStatus        # RUNNING|COMPLETED|ERROR
  input_json   Json?
  output_json  Json?
  started_at   DateTime?
  finished_at  DateTime?
  created_at   DateTime               @default(now())
  logs         WorkflowExecutionLog[]
  @@index([workflow_id, created_at(sort: Desc)])
  @@index([trace_id])
  @@map("automation_workflow_executions")
}

model KnowledgeBase { ... }
model KnowledgeDocument { ... }
model KnowledgeChunk { ... }
model KnowledgeQueryLog { ... }

model MemoryProfile { ... }
model MemoryEntry { ... }

model AgentSelectionRule { ... }     # multi-agent orchestration
model AgentCollaborationRule { ... } # multi-agent collaboration
model AgentLearning { ... }          # learning engine (ERA3)
model AgentActionApproval { ... }    # approval workflow
```

### 4.8 Acoplamentos com Módulos de Negócio

**Automation importa**:
```typescript
import { CustomersService } from '../../crm/customers/customers.service';
import { EmailLeadsService } from '../../integration/email-inbox/email-leads.service';
import { LeadScoreService } from '../../integration/email-inbox/lead-score.service';
```

**Disparo de workflows por eventos**:
- `SALE_COMPLETED` → workflow "Pós-venda follow-up"
- `INVOICE_GENERATED` → workflow "Enviar fatura por WhatsApp"
- `INVOICE_OVERDUE` → workflow "Cobrar fatura vencida"
- `CUSTOMER_CREATED` → workflow "Enviar boas-vindas"
- `EMAIL_LEAD_ASSIGNED` → workflow "SDR qualificar lead"

**Nós de ação** (action-nodes.service.ts):
- CRM_LEAD: qualificar, atribuir, alterar status (acessa LeadsService, CustomerService)
- BILLING_INVOICE: criar fatura, gerar boleto (acessa BillingService)
- BILLING_CHARGE: cobrar (acessa ChargingService)
- BILLING_PIX: gerar PIX (acessa PixService)

### 4.9 Maturidade & Produção

- ✅ **Agent Framework v1.8.66** — em produção (Junho/2026)
- ✅ **Multi-LLM** (OpenAI + Anthropic) — abstração estável
- ✅ **Tool-calling** — loop 6 iterações máximo, tool-call-log persiste
- ✅ **Knowledge Base + RAG** v1.8.67 — embeddings em memória (escalável até ~10k chunks)
- ✅ **Memory Profiles** v1.8.68 — 4 escopos (SESSION/CONTACT/WORKFLOW/AGENT)
- ✅ **Workflow Engine** — 10 tipos de nó, 5 adicionais planejados
- ⚠️ **ERA3** (2026-06-26): Multi-agent, Collaboration, Learning, Handoff — fase experimental
- ✅ **Observabilidade**: AgentRun com tokens/custo, trace_id correlação, logs persistidos

---

## 5. AUTH / USUÁRIOS / PERFIS / PERMISSÕES

### 5.1 Estratégia de Autenticação

**Tipo**: JWT (HS256)

**Fonte**: `AdminUser.id` (UUID) → payload JWT

**Chave**: `process.env.JWT_SECRET` (>= 32 chars em prod)

**Duração**: `process.env.JWT_EXPIRES_IN` (default: 1 hour)

**Extração**:
```typescript
// src/shared/auth/jwt.strategy.ts
jwtFromRequest: ExtractJwt.fromExtractors([
  ExtractJwt.fromAuthHeaderAsBearerToken(),      // Authorization: Bearer <token>
  ExtractJwt.fromUrlQueryParameter('token'),     // ?token=<token> (PDFs)
])
```

### 5.2 Modelos Prisma (Auth)

```prisma
model AdminUser {
  id            String    @id @default(uuid())
  name          String
  email         String    @unique
  password_hash String    # scrypt (não bcrypt)
  role          AdminRole @default(OPERATOR)
  profile_id    String?   # FK PermissionProfile (novo Tier 1)
  seller_id     String?   # se admin = vendedor (escopo)
  manager_id    String?   # se admin = gerente (escopo)
  is_active     Boolean   @default(true)
  last_login_at DateTime?
  deleted_at    DateTime? # F3-03 soft delete
  jwt_revoked_at DateTime? # força re-login (sessões anteriores caem)
  created_by    String?
  updated_by    String?
  created_at    DateTime  @default(now())
  updated_at    DateTime  @updatedAt
  
  profile       PermissionProfile? @relation(fields: [profile_id], references: [id])
  seller        Seller?   @relation("AdminUserAsSeller", fields: [seller_id], references: [id], onDelete: SetNull)
  manager       Manager?  @relation("AdminUserAsManager", fields: [manager_id], references: [id], onDelete: SetNull)
  @@index([profile_id])
  @@index([seller_id])
  @@index([manager_id])
  @@index([deleted_at])
  @@map("admin_admin_users")
}

model PermissionProfile {
  id           String      @id @default(uuid())
  name         String      @unique
  description  String?
  permissions  String[]    @default([])  # chaves ex: ["customers.read", "sales.write"]
  is_system    Boolean     @default(false)
  created_by   String?
  updated_by   String?
  deleted_at   DateTime?   # F3-04 soft delete
  created_at   DateTime    @default(now())
  updated_at   DateTime    @updatedAt
  users        AdminUser[]
  @@index([deleted_at])
  @@map("admin_permission_profiles")
}

enum AdminRole {
  DEV       # super-usuário (super-only permissions + SYSTEM escalado)
  ADMIN     # bypass tudo EXCETO super-only
  OPERATOR  # vagas (vendedor, gerente com limited scope)
}
```

### 5.3 JWT Payload

```typescript
{
  sub: "admin_user_id",      // subject (claim padrão)
  email: "user@aquapark.com",
  role: "OPERATOR",          // legacy, perfil tem precedência
  seller_id: "seller_123",   // escopo (null = admin geral)
  manager_id: "manager_456", // escopo gerente (null)
  profile_id: "profile_xyz", // FK PermissionProfile
  iat: 1686123456,           // issued at (segundos)
  exp: 1686127056            // expiration
}
```

### 5.4 Permissões (999 linhas - permissions.constants.ts)

**Organização**: Espelha sidebar do admin

**Padrão**: `{domain}.{action}` ou `{domain}.{subdomain}.{action}`

**Exemplos**:
```typescript
CUSTOMERS_READ: 'customers.read'
CUSTOMERS_WRITE: 'customers.write'
CUSTOMERS_DELETE: 'customers.delete'   # PERMANENTE
CUSTOMERS_INACTIVATE: 'customers.inactivate'  # soft delete (F3-01)
CUSTOMERS_ACTIVATE: 'customers.activate'      # restore

SALES_READ: 'sales.read'
SALES_CANCEL: 'sales.cancel'
BILLING_GENERATE_BOLETO: 'billing.generate_boleto'
BILLING_MARK_PAID: 'billing.mark_paid'

WHATSAPP_READ: 'whatsapp.read'
WHATSAPP_SEND: 'whatsapp.send'
WHATSAPP_NOTIFICATIONS_READ: 'whatsapp.notifications.read'
WHATSAPP_NOTIFICATIONS_RETRY: 'whatsapp.notifications.retry'
WHATSAPP_VIEW_ASSIGNED: 'whatsapp.view.assigned'
WHATSAPP_REPLY_ASSIGNED: 'whatsapp.reply.assigned'

INTEGRATIONS_WRITE: 'integrations.write'      # meta (legado)
INTEGRATIONS_WHATSAPP_WRITE: 'integrations.whatsapp.write'  # granular (novo)
INTEGRATIONS_SICOOB_WRITE: 'integrations.sicoob.write'

EVENTS_READ: 'events.read'      # dispatch log
EVENTS_RETRY: 'events.retry'    # re-emit
```

**Super-only** (DEV access only):
```typescript
SUPER_ONLY_PERMISSIONS: [
  'dev.seed.*, dev.validate.*', 'dev.import.*',  // ferramentas de dev
  'system.settings.write',                       // configuração global
  'events.retry',                                // re-emit de eventos
  // ... (~15 perms)
]
```

### 5.5 Guards e Middleware de Auth

#### **JwtAuthGuard** (global, em AppModule)
```typescript
@Global()
@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard }
  ]
})
```

**Lógica**:
1. Extrai token (header OU query param)
2. Valida assinatura (JWT_SECRET)
3. Chama `JwtStrategy.validate(payload)`
4. Popula `req.user`
5. Se `@Public()`, permite; senão requer autenticado

**Timeout de 401**: Cache 10s em `JwtStrategy.authCache` (F3-03)

#### **PermissionsGuard** (por rota)
```typescript
@UseGuards(PermissionsGuard)
@RequirePermissions('customers.read', 'customers.write')
@Get('/')
async list() { ... }
```

**Lógica**:
1. Reflector extrai permissões do decorator
2. Lookup `AdminUser.profile.permissions[]`
3. Validação OR (um match basta)
4. Cache 60s em memória

**Bypass**:
- Role=DEV: acesso total (incluindo super-only)
- Role=ADMIN: acesso tudo EXCETO super-only

### 5.6 Escopagem de Dados

#### **ScopeInterceptor** (global)
```typescript
{ provide: APP_INTERCEPTOR, useClass: ScopeInterceptor }
```

**Lógica**:
- Se `AdminUser.seller_id` preenchido → popula `req.userSeller` → queries filtram por `seller_id = req.userSeller`
- Se `AdminUser.manager_id` preenchido → modo TEAM (v1.8.23) — ve dados dos vendedores sob esse gerente
- Admin sem seller_id/manager_id → sem filtro (ve tudo)

**Exemplo**:
```typescript
// GET /admin/leads?assigned_to_seller=true
// AdminUser.seller_id = 'seller_xyz'
// Query automática: WHERE seller_id = 'seller_xyz'
// (não precisa de ?seller_id=... no frontend)
```

### 5.7 Password Hashing

**Algoritmo**: scrypt (Node.js nativo - crypto.scryptSync)

**Salt**: 16 bytes random

**Derivação**: 64 bytes, max_mem=16MB, max_time=3, parallelization=1

```typescript
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
// salva: salt + hash concatenados
// valida: derivar novamente + comparar byte-by-byte
```

**NÃO bcrypt** (escolha deliberada para evitar nova lib)

---

## 6. MÓDULOS ESPECÍFICOS DO AQUAPARK (Não Reutilizáveis)

### Apenas Listar (sem detalhar)

| Módulo | Responsabilidade | Arquivos | Acoplamento |
|--------|-----------------|----------|------------|
| **sales/** | Vendas, distribuidores (canais), comissões, tracking de vendedor | 30+ | Alto (evento SALE_COMPLETED → Bill/Contract/Notif) |
| **billing/** | Faturas, pagamentos, inadimplência, conciliação, renegociação | 35+ | Alto (liga Sales/Contracts/Collections) |
| **crm/** | Clientes, leads, pipeline, tags, interações, follow-ups | 25+ | Médio (liga Sales/Notif) |
| **contract/** | Contratos PDF + D4Sign e-signature, preenchimento, envio | 15+ | Alto (liga Sales/Billing) |
| **notification/** | Canais email/SMS/WhatsApp, templates de eventos, dispatch | 20+ | Alto (observa eventos globais) |
| **analytics/** | Dashboards, métricas, snapshots de KPI | 12+ | Baixo (observa eventos) |
| **portal/** | Portal de usuários finais (checkout, histórico) | 10+ | Médio |
| **admin-tools/** | Validação manual, seed, imports | 8+ | **REMOVÍVEL pós-QA** |
| **validation/** | Ferramentas de validação de consistência | 5+ | **REMOVÍVEL pós-QA** |
| **help/** | Central de Ajuda (documentação Markdown) | 8+ | Baixo (standalone) |

---

## 7. CÓDIGO MORTO & EXPERIMENTAL

### 7.1 Baileys Removido

**Status**: ✅ Eliminado em 2026-06-27

**Resquício**: Comentário em `whatsapp-smart-send.service.ts` (linha 65):
```typescript
// A Meta NAO ecoa o que enviamos (o Baileys ecoava) — entao gravamos o
// outbound manualmente na conversa.
```

**Impact**: Nenhum (código limpo)

### 7.2 RabbitMQ Nunca Usado

**Status**: Nenhuma dependência. EventEmitter2 em memória apenas.

**Razão**: "Comunicação inter-modulo via injecao de dependencia + EventEmitter2" (README)

**Escalabilidade**: Upgrade planejado se necessário (não urgente)

### 7.3 Código Experimental/Fase Futura

| Feature | Status | Localização | Nota |
|---------|--------|-------------|------|
| **SMS_SEND** | ⏳ Planejado | node-registry.service.ts | tipo de nó registrado, sem executor |
| **ATTENDANCE_CONTROL** | ⏳ Flag-gated | whatsapp-attendance/ | lógica pronta, rota inerte até Fase 3 |
| **MULTI_AGENT_ORCHESTRATION** | ⏳ ERA3 | agents/agent-selector.service.ts | `AgentSelectionRule` pronto, sem decisor LLM ainda |
| **MULTI_AGENT_COLLABORATION** | ⏳ ERA3 | agents/collaboration.service.ts | `AgentCollaborationRule` pronto |
| **Agent Learning** | ⏳ ERA3 | agents/ | `AgentLearning` schema pronto, listener ausente |
| **AdminToolsModule** | 🗑️ DELETÁVEL | admin-tools/, validation/ | "removivel apos validacao" (README) |

### 7.4 Legacy/Deprecação Controlada

**PAYMENT_RECORDS_SYNC_CONDITION**:
```typescript
PAYMENT_RECORDS_SYNC_CONDITION: 'payment_records.sync_condition',  // DEPRECATED
PAYMENT_RECORDS_LEGACY_SYNC: 'payment_records.legacy_sync',        // novo (mesmo backend)
```
**Nota**: UI migrada, backend suporta ambas (retrocompat)

---

## 8. ACOPLAMENTOS CRÍTICOS

### 8.1 WhatsApp → Negócio

| Acoplamento | Tipo | Severidade | Alternativa |
|------------|------|-----------|------------|
| **WhatsappChat.phone_number** enriquece com `Customer.phone` | Query lookup | Média | Prefill nome manual, cache |
| **NotificationTemplate** dispara por evento (INVOICE_GENERATED) | Listener EventEmitter | Alta | Desacoplable: remover listener |
| **WhatsappSmartSendService** checa Customer para janela 24h | Lógica | Média | Remover check, sempre enviar template |
| **Tool "send_whatsapp"** em workflow → acessa `WhatsappOrchestratorService` | Dependency | Alta | Remover tool, desacoplar IA de WhatsApp |

**Conclusão**: Módulo WhatsApp é **isolável** se remover:
- Listeners EventEmitter (email auto → remove `WhatsappNotificationService.onInvoiceGenerated()`)
- Tool de WhatsApp (workflow desacoplado se remover "send_whatsapp")
- Enriquecimento de nome (degrada UX levemente)

### 8.2 IA Studio → Negócio

| Acoplamento | Tipo | Severidade | Alternativa |
|------------|------|-----------|------------|
| **Tools CRM_LEAD, CRM_CUSTOMER** acessam `LeadsService`, `CustomersService` | Dependency | Alta | Remover nós, agents só consultivos |
| **Tools BILLING_*** acessam `BillingService`, `PixService` | Dependency | Alta | Remover nós, agents só consultivos |
| **SdrNodesService** aciona `EmailLeadsService` | Dependency | Alta | Remover SDR, desabilitar workflows SDR |
| **Workflows de exemplo** criam Sales/Invoices | Hardcoded | Média | Remover examples/ (são seeds DEV) |

**Conclusão**: Automação é **desacoplável** se:
- Desabilitar todos os nós de ação (CRM_*, BILLING_*)
- Remover SDR (sdr/)
- Agents usam só tools leitura + IA pura

---

## 9. PRODUÇÃO & OBSERVABILIDADE

### 9.1 Health Checks

**Endpoints**:
- `GET /api/v1/health` → Status banco + uptime + integrations snapshot
- `GET /api/v1/metrics` → Prometheus text exposition
- `GET /api/v1/analytics-metrics` → Dashboard JSON (admin)
- `POST /api/v1/integrations/{id}/healthcheck` → Ping individual

### 9.2 Observabilidade

**Trace ID**:
- Gerado por `TraceInterceptor` global (`X-Trace-Id`)
- Propagado em AsyncLocalStorage (`RequestContext`)
- Correlaciona: HTTP request → eventos → agent run → banco

**Audit Trail**:
- `AuditLog` com actor, action, entity_id, diff
- `@Auditable` decorator (auto-capture antes/depois)
- Sensibles redacted (password, cpf, token, secret, api_key)

**Logs de IA**:
- `AgentRun.messages` — transcript completo
- `AgentRun.cost_usd` — custo estimado (baseado em modelo + tokens)
- `ToolCallLog` (opcional, limpeza via cron)
- `KnowledgeQueryLog` — cada busca RAG

### 9.3 Segurança

**Encriptação**:
- AES-256-GCM para `Integration.config` (credenciais)
- Fall-back CBC para legado
- Key: `process.env.ENCRYPTION_KEY` (>= 32 chars)

**HMAC**:
- Webhook Meta validado com `app_secret` (HMAC-SHA256)
- Fallback em `JwtStrategy` com cache 10s

**Headers de Segurança**:
- `@fastify/helmet` (CSP, X-Frame-Options, etc.)
- `@fastify/cors` (whitelist CORS_ORIGINS env)

**Rate Limiting**:
- Global: 1000 req/min por IP
- Endpoints sensíveis (login, password): @Throttle mais restritivo

---

## 10. CHECKLIST DE REUTILIZAÇÃO PARA NOVA PLATAFORMA

### ✅ REUTILIZÁVEL: WhatsApp/Meta

```
[X] Integration/whatsapp/ (20 arquivos)
    [X] WhatsappMetaService — cliente Graph API
    [X] WhatsappSmartSendService — orquestração envio
    [X] WhatsappTemplatesService — CRUD HSM
    [X] dto/ — request/response DTOs
    [X] Models Prisma: WhatsappConnection, WhatsappChat, WhatsAppMessage, WhatsappTemplateCatalog

[X] Integration/whatsapp-orchestrator/ (9 arquivos)
    [X] OrchestratorService — multi-conexão
    [X] MetaAdapter — adapter Cloud API
    [X] types.ts — NormalizedMessage, RichMessage

[X] Integration/whatsapp-attendance/ (OPCIONAL — 16 arquivos)
    [X] Attendance core — se quiser central de atendimento V1
    [X] Permissões granulares: whatsapp.view.*, whatsapp.reply.*

[⚠️] Remove:
    [ ] Listeners EventEmitter (WhatsappNotificationService, WhatsappPushListener)
    [ ] Acoplamento com PermissionProfiles se simplificar perms
    [ ] Enriquecimento de Customer.phone se novo sistema não tiver CRM
```

### ✅ REUTILIZÁVEL: IA Studio

```
[X] Automation/agents/ (27 arquivos)
    [X] AgentsService — CRUD agentes
    [X] AgentRunnerService — loop tool-calling
    [X] LlmProviderService — OpenAI/Anthropic abstração
    [X] ToolRegistryService — registry extensível
    [X] ToolRuntimeService — executor de tools
    [X] Models: Agent, AgentRun, AgentPromptVersion, ...

[X] Automation/knowledge/ (6 arquivos)
    [X] KnowledgeService — RAG + embeddings
    [X] parse-source.ts — extrator PDF/DOCX/URL
    [X] Models: KnowledgeBase, KnowledgeDocument, KnowledgeChunk

[X] Automation/memory/ (5 arquivos)
    [X] MemoryService — perfis de memória
    [X] 4 escopos (SESSION/CONTACT/WORKFLOW/AGENT)
    [X] Models: MemoryProfile, MemoryEntry

[X] Automation/tools/ (6 arquivos)
    [X] ToolCatalog persistido no banco
    [X] Tool-call-log retention cron

[X] Automation/workflow-engine.service.ts
    [X] Motor genérico (EVENT/SCHEDULE/MANUAL)
    [X] NodeRegistry extensível
    [X] Models: Workflow, WorkflowExecution, WorkflowExecutionLog

[⚠️] Remove/Adaptar:
    [ ] Automation/action-nodes/ — nós CRM_LEAD, BILLING_* acoplados
    [ ] Automation/sdr/ — bot específico Aquapark
    [ ] Automation/examples/ — seeds de 12 workflows (reusar ideia, não código)
    [ ] Imports de CustomersService, LeadsService, BillingService
```

### ✅ REUTILIZÁVEL: Auth/Usuários/Perfis/Permissões

```
[X] shared/auth/ (8 arquivos)
    [X] JwtStrategy — validação JWT com cache 10s
    [X] JwtAuthGuard — guard global
    [X] PermissionsGuard — ACL granular
    [X] ScopeInterceptor — escopagem de dados (seller/manager)
    [X] Decorators: @Public(), @RequirePermissions, @CurrentUser

[X] modules/admin/permission-profiles/ (5 arquivos)
    [X] PermissionProfilesService — CRUD profiles
    [X] permissons.constants.ts — 999 linhas de perms
    [X] Models: AdminUser, PermissionProfile

[X] modules/admin/admin-auth/ (6 arquivos)
    [X] AdminAuthService — login, password change, JWT emit
    [X] Models: AdminUser (senha com scrypt)

[⚠️] Simplificar:
    [ ] Remover perms específicas Aquapark (SALES_*, BILLING_*, CRM_*, CONTRACT_*)
    [ ] Redefinir PERMISSIONS constantes pro novo domínio
    [ ] Manter padrão: {domain}.{action}
```

---

## 11. ROADMAP DE REUTILIZAÇÃO

### Fase 1: Scaffolding Básico (1-2 semanas)
1. Copiar `shared/auth/`, `shared/prisma/`, `shared/events/`
2. Copiar `modules/admin/` (auth, permission-profiles)
3. Adaptar `src/app.module.ts` (remover módulos específicos Aquapark)
4. Versionar Prisma schema (novo modelo de dados)

### Fase 2: WhatsApp/Meta (2-3 semanas)
1. Copiar `modules/integration/whatsapp/`, `whatsapp-orchestrator/`
2. Adaptar models Prisma (remover campos específicos Aquapark)
3. Remover listeners EventEmitter (desacoplar de notificações)
4. Testar webhook Meta, envio de templates

### Fase 3: IA Studio (3-4 semanas)
1. Copiar `modules/automation/` (agents, knowledge, memory, tools, workflow-engine)
2. Remover action-nodes específicos (CRM_LEAD, BILLING_*)
3. Registrar tools genéricas (http_request, send_email, send_whatsapp)
4. Testar LlmProviderService (OpenAI + Anthropic)

### Fase 4: Adaptações + Tests (1-2 semanas)
1. Implementar permissões do novo domínio
2. Testes E2E (auth, WhatsApp send, IA agents)
3. Documentação de customização (como estender)

---

## 12. CONCLUSÕES

### Reutilizabilidade: 8/10

**Fortes**:
- ✅ Módulos WhatsApp/Meta bem isolados (poucos imports internos)
- ✅ IA Studio genérica (desacoplada de negócio via nó AGENT abstrato)
- ✅ Auth/Permissões standards (JWT, granular, escopável)
- ✅ Arquitetura modular (injeção de deps, EventEmitter desacoplador)
- ✅ Observabilidade built-in (trace_id, audit_log, AgentRun logs)

**Fracos**:
- ⚠️ Muitas integrações hardcoded (Sicoob, D4Sign, PaymentGateway)
- ⚠️ Seeds de exemplo com dados Aquapark (removível)
- ⚠️ Permissões enum AdminRole legacy (migrar para perfis)
- ⚠️ Sem testes E2E (29 spec files unitários, cobertura ~70%)

### Tempo Estimado de Reutilização: 8-10 semanas (3 pessoas)

---

**Relatório Compilado em**: 02/07/2026  
**Versão analisada**: aquapark-api v1.4.0  
**Database**: PostgreSQL 15 com Prisma 5

