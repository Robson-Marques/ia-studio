# IA Studio — Diretrizes Arquiteturais (revisão do Robson, 02/07/2026)

> **Nota de vigência (S3, 2026-09-15):** este documento preserva decisões de
> recuperação anteriores. Todo conteúdo que descreve SaaS, `Organization`,
> `Workspace`, `Environment`, Console, licensing, billing, trial, consumo ou
> domínio por tenant está **revogado** pelo RFC-001 e pelo Capability Contract
> `saas-to-dedicated-installation`. O modelo vigente é uma instalação dedicada;
> as diretrizes históricas permanecem apenas para explicar a origem do corte e
> não autorizam novo código ou schema.

## 1. Marketplace de Conectores ⭐ (Fase 2)
O Integration Manager ganha vitrine de **Conectores instaláveis**: Altarede, Gmail, OpenAI, Meta, PostgreSQL, SQL Server, Omie, Bling, Tiny, Digisac, SAP, Protheus, Conta Azul... Instalar um provider novo não exige mudar o core — só registrar no Provider Registry. UI: galeria por categoria com busca, "Instalar/Conectar".

## 2. Provider Registry (Fase 2)
Providers **não são cadastrados em código espalhado** — registrados centralmente por categoria (ERP, Email, IA, Banco de Dados, Mensageria, Pagamento...). Todo provider implementa a interface única:

```typescript
interface IProvider {
  metadata(): ProviderMetadata;        // id, nome, categoria, ícone, wizard schema, capacidades
  connect(config): Promise<Connection>;
  disconnect(connectionId): Promise<void>;
  health(connectionId): Promise<HealthResult>;
  execute(connectionId, operation, params): Promise<Result>;  // porta única de operações
  discover(connectionId): Promise<DiscoveryResult>;           // recursos disponíveis (contas, números, tabelas, modelos)
}
```

Mesmo padrão do NodeRegistry do Aquapark (proibido switch por tipo espalhado).

## 3. Versionamento de fluxos estilo git (Fases 4–5; schema na Fase 4)
Todo fluxo/agente tem versões imutáveis: `v1 → v2 → v3 → Publicada → Rollback`. Editar = nova versão draft; publicar = aponta a versão ativa; rollback = repontar (nunca apagar versão). Tabelas `*_versions` com snapshot completo + diff visual na UI. (O Aquapark já tem `AgentPromptVersion` e `Workflow.version` — generalizar.)

## 4. Ambientes DEV / HOMOLOGAÇÃO / PRODUÇÃO ⭐ (schema na FASE 1)
Cada Workspace possui N **Environments** (default: Produção; opcionais: Homologação, Desenvolvimento). **Integrações, conexões, IA, WhatsApp, Email, Scheduler, fluxos e secrets são escopados por ambiente** — tudo independente. Impacto: coluna `environment_id` nas entidades operacionais desde o nascimento; seletor de ambiente no topo do painel; promover fluxo entre ambientes (DEV→HML→PROD) reutiliza o versionamento do item 3.

## 5. Secrets Manager como módulo próprio (Fase 2; base cripto na Fase 1)
Módulo independente do Integration Manager, usado por qualquer módulo: API Keys, OAuth (access+refresh+expiração), JWT, senhas, certificados, chaves privadas, encryption keys. AES-256-GCM (portado do Aquapark), redact automático em logs/auditoria, rotação, escopo workspace+ambiente. Conexões referenciam secrets por id — nunca guardam credencial no próprio registro.

## 6. Feature Flags — sistema completo (schema na FASE 1)
Não só toggles: entidade `FeatureFlag` com nome, descrição, status, **validade (expira em)** e segmentação por workspace, usuário e grupo/perfil. Avaliação em runtime com cache; UI de gestão; auditoria de mudança de flag. Regra do Aquapark mantida: default de produção mora no código, flag no banco é o override configurável.

## 7. Event Bus central ⭐⭐ (Fase 4; contrato na Fase 1)
**Tudo é evento.** Qualquer módulo publica (`customer.created`, `payment.received`, `whatsapp.inbound`, `connection.token_expired`...) e qualquer consumidor assina: Automation, IA, WhatsApp, Email, Webhooks, ERP. O Automation Engine é um assinante do bus — não o dono dos gatilhos. Envelope padrão: `{ event, workspace_id, environment_id, trace_id, source_event_id (idempotência), payload mínimo, occurred_at }`. Persistência + replay (dispatch log portado do Aquapark).

## 8. Message Broker abstraído (Fase 4)
Interface `IMessageBroker` (publish, subscribe, ack, dlq) com implementação **BullMQ** na V1. RabbitMQ/Kafka/SQS ficam como implementações futuras da mesma interface — nenhum módulo importa BullMQ diretamente.

## 9. Resource Model genérico (Fase 6)
Entidades canônicas: `Customer, Person, Company, Product, Order, Invoice, Payment, Contract, Ticket, ServiceOrder, Lead`. Providers mapeiam para elas via Mapper. Extensões verticais (ISP: Connection Status, Network Element) como atributos de extensão, não entidades hardcoded.

## 10. Biblioteca de Tools IA (Fase 5)
Catálogo registrado (padrão ToolRegistry do Aquapark) com tools genéricas: Consultar Cliente, Consultar Financeiro, Enviar WhatsApp, Enviar Email, Criar OS, Consultar Estoque, **Executar SQL** (via conexão de banco do Integration Manager, read-only por default), **Executar API** (HTTP via conexão), Gerar Documento (PDF/HTML), Enviar Arquivo. Toda tool: input/output schema, timeout, permissão, auditoria, `requires_approval` opcional.

## 11. Catálogo de Templates geral (Fases 3–4)
Um catálogo único multi-formato: WhatsApp (HSM), Email, SMS, Push, PDF, HTML, Markdown. Template = conteúdo + variáveis + canal; automação referencia o template e **troca só o canal**. O catálogo HSM do Aquapark vira o sub-tipo WhatsApp.

## 12. Scheduler Visual ⭐⭐ (Fase 4)
UI de agendamento sem CRON obrigatório: "Todo dia às 08:00", "Última sexta", "A cada 10 minutos", "Primeiro dia útil", datas específicas, recorrências compostas — com preview das próximas execuções e modo avançado CRON. Calendários personalizados (feriados, férias, sem expediente) por workspace.

## 13. Execution Monitor (Fase 4, evolui até a 8)
Módulo exclusivo de observabilidade de automações: execução, status, tempo, logs, retry, payload de entrada, resultado, erros e trace end-to-end (workflow → nó → tool → provider → mensagem). Filtros, replay e correlação por `trace_id`.

## 14. API Pública desde o início (Fase 1 em diante)
REST versionada (`/api/v1`) com **OpenAPI/Swagger gerado desde a Fase 1**; webhooks de saída assináveis (Fase 4, via Event Bus); SDK TypeScript publicável (Fase 6+); GraphQL avaliado depois da V1 (não bloqueia nada — a camada REST+OpenAPI vem primeiro).

## 15. MCP como módulo (Fase 5)
Não só citação: módulo `mcp/` com **MCP Client** (consumir servers externos como tools de agente — servers, tools, resources, prompts) e, na sequência, **MCP Server** (expor as tools do IA Studio para clientes MCP externos). Registrado no marketplace como categoria própria.

## 16. Agentes Colaborativos ⭐ (Fase 5)
Portar e promover a colaboração multi-agente do Aquapark (`AgentCollaborationRule`, tool `consultar_especialista`) a recurso de primeira classe: Supervisor → Financeiro / Suporte / Comercial / Especialista ISP, com papéis, roteamento por regra, modos CONSULTANT/INTERNAL_NOTE e orquestração visível no IA Studio (canvas de equipe de agentes).

## 17. Custos de IA (Fase 5)
Além de tokens: custo consolidado **por workspace × provider × agente × mês** (OpenAI, Claude, Gemini...), orçamento mensal configurável com **alerta** (e opcionalmente bloqueio) ao atingir limiar. Base: `AgentRun.cost_usd` do Aquapark + agregações + tela de custos.

## 18. Auditoria completa (FASE 1)
Todo evento administrativo grava: usuário, ação, entidade, **quando, IP, user-agent, valor antigo → valor novo (diff)**, com redact de sensíveis. Decorator `@Auditable` portado do Aquapark com captura de diff. UI de trilha de auditoria com filtros.

---

# Connection Wizard (padrão para TODAS as integrações — Fase 2)

Toda integração nasce por um **wizard guiado por provider** (o `metadata()` do IProvider descreve os passos). Mesma experiência sempre: escolher provider → autenticar/configurar → testar → salvar.

Exemplos: Google (Login Google → seleciona conta → autoriza → concluído); OpenAI (colar API Key → testar → salvar); SQL Server (servidor/banco/usuário/senha → testar → salvar); Altarede (base URL/appkey/token → testar → salvar); Meta (abaixo).

## Connection Wizard Meta (Fase 3) — fluxo oficial obrigatório

**Diretriz aprovada:** toda funcionalidade WhatsApp considera **exclusivamente as capacidades oficiais da Meta Cloud API**. Nada dependente de soluções não oficiais — garante conformidade, evita bloqueios e viabiliza uso corporativo/certificações.

Fluxo (Embedded Signup / OAuth oficial): Nova Conexão → Entrar com Facebook → OAuth Meta → selecionar Business Manager → selecionar WABA → selecionar número → conceder permissões → criar conexão → validar → sincronizar → pronto. **Nenhum token solicitado manualmente quando o fluxo oficial permitir obtê-lo.**

> Pré-requisito operacional: Embedded Signup exige um App Meta aprovado (Tech Provider/App Review). Até a aprovação, o wizard oferece o modo alternativo de credenciais manuais — mesma conexão, outro passo de entrada. A arquitetura já nasce no fluxo oficial.

**Pós-conexão — descoberta e sync automáticas:** Business Manager, WABA, números, display name, status, **qualidade do número**, limites de mensagens, catálogo de templates, webhooks, permissões, dados da conta.

**Webhook e assinaturas automáticos:** o sistema configura `https://dominio/meta/webhook` e assina `messages`, `message_template_status_update`, `message_deliveries`, `message_reads`, `phone_number_quality_update`, `account_update`...

**Validação final do wizard:** token válido ✓, número conectado ✓, webhook ativo ✓, permissões ✓, templates carregados ✓.

**Gestão da conexão:** nome amigável, workspace, ambiente, empresa, WABA, número, status, estado, data de conexão, última sincronização, última utilização, health check, logs. **Conexão nunca é excluída — só muda de estado**: Ativa, Desativada, Erro, Token expirado, Aguardando autenticação, Em manutenção, Sincronizando.

**Renovação automática:** plataforma controla OAuth, refresh token, expiração e reautenticação — sem o usuário lembrar.

**Sincronização contínua:** scheduler (ex.: a cada 10 min) atualiza templates, status, qualidade, limites, display name, webhooks. **Templates bidirecionais**: criou no painel → publica na Meta → atualiza status; criou na Meta → aparece no IA Studio.

**Multi-instância:** N conexões por workspace/ambiente (Empresa A: Comercial, Financeiro, Cobranças, Pós-venda; Empresa B: Comercial, Suporte) — todas simultâneas.

**Meta Orchestrator:** o fluxo **nunca conhece um número**. Ele pede: workspace, canal, **tag/departamento**, prioridade. O orchestrator resolve a conexão (ex.: "Enviar WhatsApp, tag Financeiro" → número Financeiro). Painel da conexão mostra: número, status, empresa, qualidade, mensagens do dia, templates, última sync, health (Webhook OK / Token OK / OAuth OK / Número OK / Cloud API OK / Templates OK).

---

# Bloco 2 — Diretrizes 19–35 (revisão do Robson, 2ª rodada)

## 19. Licenciamento ⭐⭐ (FASE 1 — produto comercial)
Módulo próprio `licensing/`: licenças, planos, recursos, **limites configuráveis sem alterar código** (usuários, workspaces, agentes, fluxos, execuções/mês, tokens IA, conexões, números WhatsApp, contas Google...), ativação por **chave de licença**, renovação, expiração, assinatura, auditoria. Enforcement central: `LicenseGuard`/`LimitsService` consultado pelos módulos ao criar recurso ("limite de agentes atingido"). Plano define o mapa de limites e features habilitadas (integra com Feature Flags — diretriz 6). Nasce na Fase 1 porque todo módulo posterior consulta limites desde o início.

## 20. Billing (arquitetura na Fase 1, implementação pós-V1)
Schema e contratos desde já (`Subscription`, `Charge`, `InvoiceRecord`, eventos de webhook de pagamento, PIX/cartão como providers de pagamento no marketplace) — sem gateway implementado na V1. Licenciamento funciona por chave/ativação manual até o Billing entrar.

## 21. Storage Manager ⭐ (Fase 2, junto do Integration Manager)
Módulo `storage/` com interface `IStorageDriver` (put/get/delete/list/signedUrl): **Local** (V1 default) e **S3-compatível** (AWS S3, Cloudflare R2, MinIO — mesmo driver) na V1; Google Drive, OneDrive, Azure Blob como drivers futuros do marketplace. Qualquer módulo salva arquivo por ele (mídia WhatsApp, documentos RAG, PDFs gerados, backups). Escopo workspace+ambiente, quotas via Licensing.

## 22. Notification Center (Fase 4)
Hub único: automação chama só `Enviar Notificação` (template + destinatário + prioridade); o hub resolve o canal (WhatsApp/Email/Push/SMS/Webhook) por configuração, preferência do destinatário e fallback (ex.: WhatsApp falhou → email). Usa o Catálogo de Templates (diretriz 11) e o Event Bus. Substitui o acoplamento por canal do Aquapark.

## 23. Resource Explorer (Fase 6)
Depois de conectar um ERP, navegar nos dados canônicos **sem criar fluxo**: Clientes, Produtos, Pedidos, Financeiro, OS... — listagem/busca/detalhe read-only via `IProvider.execute()` + Resource Model. Vira também a tela de teste vivo do Mapper.

## 24. Schema Discovery (Fase 6, contrato na Fase 2)
`IProvider.discover()` já previsto (diretriz 2) ganha implementação rica nos providers de banco: conectar SQL Server/PostgreSQL → descobrir tabelas, campos, tipos e relacionamentos automaticamente → alimentar o Mapper e o Resource Explorer.

## 25. Mapper Inteligente (Fase 7)
IA sugere o mapeamento (`customer_name → Customer.name`) combinando nome/tipo/amostra de dados; usuário revisa e confirma (sugestão nunca aplica sozinha — princípio "automatismo nasce OFF").

## 26. Test Center (Fase 5 básico; completo pós-V1)
V1: testar fluxo/agente com payload de exemplo + **replay** de execução real (Execution Monitor) + validação de publicação. Pós-V1: mocks de provider, benchmark, suites de teste salvas.

## 27. Sandbox (coberto pelas diretrizes 4 + 3)
Execução sem afetar produção = rodar no **ambiente DEV/HML** com conexões próprias + modo **dry-run** no engine (executa o grafo logando ações sem side effects). Não é módulo novo — é requisito do Automation Engine (Fase 4).

## 28. Console do Desenvolvedor (Fase 6)
"Postman interno": testar providers (`execute` com payload livre), APIs HTTP, SQL (read-only por default), tools e chamadas de IA — sempre via conexões do Integration Manager, com auditoria e permissão própria (`devtools.*`).

## 29. Importação / Exportação (Fases 4–5)
Exportar/importar **JSON versionado** (com versão de schema do export): fluxos, agentes, templates, ferramentas e integrações (integrações exportam SEM secrets — chaves nunca saem no JSON). Base para promoção entre ambientes e para a diretriz 30.

## 30. Biblioteca da Comunidade (pós-V1)
Marketplace público de fluxos, agentes, templates, tools e providers construído sobre o formato de export da diretriz 29. Arquitetura preparada; produto pós-V1.

## 31. Política de Aprovação genérica (Fase 5)
Generalizar o AgentApprovals: `ApprovalPolicy` = ação/tool/nó + condição (ex.: "Executar SQL de escrita", "disparo em massa > N destinatários", "custo estimado > X") + aprovadores (perfil/usuário) + expiração. Vale para IA, automações e ações administrativas.

## 32. Simulador de Custos (Fase 5)
Antes de publicar, estimativa por execução e projeção mensal: tokens IA (por modelo), mensagens WhatsApp (por categoria de template), emails, tempo estimado. Integra com orçamento/alerta (diretriz 17).

## 33. Modo Cluster (arquitetura na Fase 4; ativação pós-V1)
Workers BullMQ são processos separados da API desde o desenho (Worker 1..N horizontais). V1 roda 1 worker; escalar = subir mais workers sem mudar código. Estado em Redis/Postgres, nunca em memória do processo (diferença deliberada do Aquapark, que usa PM2 fork com estado em memória).

## 34. Analytics separado de Logs (Fase 8)
Módulo próprio de agregações: execuções, tempo, erros, custos, performance, uso por workspace — snapshots periódicos (não query nos logs crus). Execution Monitor = diagnóstico; Analytics = tendência/gestão.

## 35. Plugins (pós-V1; registries prontos desde o início)
Sistema de plugins (menus, widgets, painéis, nós, ferramentas) fica pós-V1, mas **todos os registries da V1 (nós, tools, providers, templates, wizards) já nascem como pontos de extensão declarativos** — plugin depois é empacotamento, não refatoração.

---

## Impacto no schema da Fase 1 (nasce agora)

| Entidade | Motivo |
|---|---|
| `Workspace` + `Environment` (default "Produção") | Diretriz 4 — tudo operacional referencia `workspace_id` + `environment_id` |
| `FeatureFlag` (+ segmentos) | Diretriz 6 |
| `AuditLog` com `old_value`/`new_value` (diff) + IP + user-agent | Diretriz 18 |
| `SystemSetting` (chave/valor por workspace) | Regra de toggles no banco |
| **`License`, `Plan`, `PlanLimit` + `LimitsService`** | Diretriz 19 — enforcement desde o 1º módulo |
| **Stubs `Subscription`/`Charge`** | Diretriz 20 — arquitetura Billing |
| Crypto util AES-256-GCM em `shared/` | Base do Secrets Manager (Fase 2) |
| Swagger/OpenAPI habilitado no bootstrap | Diretriz 14 |

# Bloco 3 — Evolução SaaS (revisão do Robson, 3ª rodada)

## 36. Hierarquia: Organization → Workspace → Environment (FASE 1)
Nível novo acima do Workspace: **Organization** (o cliente/tenant do SaaS). Organization possui assinatura, licença, billing, branding e N workspaces; workspace possui N ambientes. Usuário pertence à organization e é membro de workspaces (com perfil por workspace).

## 37. Convites de usuários (Fase 1)
Fluxo de convite por email: admin convida → token com expiração → aceite cria/vincula usuário com perfil pré-definido. (Envio real de email entra quando houver conexão de email; na V1 inicial o link de convite pode ser copiado manualmente.)

## 38. Billing completo — assinatura do cliente (schema na Fase 1; gateway PIX/cartão como provider do marketplace, Fase 8/pós-V1)
`billing/`: planos, assinaturas, cobranças, faturas, PIX, cartão, renovação, **cupons, trial, upgrade/downgrade**, histórico, webhooks de pagamento. **Billing não controla a plataforma — controla a assinatura**; quem habilita/restringe é o Licensing: `pagou → Licensing habilita` / `atrasou → Licensing entra em modo restrito` (grace period configurável, nunca apaga dados). Trial: 14 dias → expira → downgrade automático para o plano base.

## 39. Planos e recursos licenciáveis (Fase 1)
Planos exemplo: **Starter** (2 usuários, 1 workspace, 1 número WhatsApp, 1 conta Google, 2 agentes, 20 mil execuções, 500 mil tokens), **Professional** (10 usuários, 5 números, 20 agentes...), **Enterprise** (sem limites, White Label, domínio próprio). Recursos ligáveis por plano: WhatsApp, Email, Automation, IA Studio, MCP, Marketplace, API, White Label, RAG, Voice, Analytics — tudo dado configurável (diretriz 19), zero código para criar plano novo.

## 40. Medição de consumo (Usage Metering — FASE 1, contadores desde o 1º módulo)
`UsageService` central: execuções, tokens IA, mensagens WhatsApp, emails enviados, storage — agregado por organization/workspace/mês. Alimenta enforcement de limites (Licensing), dashboard financeiro e alertas. Todo módulo novo registra consumo ao nascer.

## 41. Dois painéis distintos ⭐⭐ (FASE 1)
- **Painel Administrativo ("Console")** — exclusivo da operação SaaS: gestão de clientes (tenants), planos, billing, licenças, consumo global, monitoramento, suporte, marketplace (curadoria), atualizações, feature flags globais, logs da plataforma, administração de workspaces.
- **Painel do Cliente** — o produto: IA Studio, WhatsApp, integrações, automações, agentes, usuários, configurações, billing da própria conta, consumo, API keys, ambientes, marketplace (instalar/configurar conectores).
Separação total de superfícies (apps distintos no monorepo, mesma API com guards por tipo de ator: `PLATFORM_ADMIN` vs usuário de organization). Prepara revendedores, parceiros, franquias sem tocar na experiência do cliente.

## 42. Portal do Cliente / Minha Conta (Fase 1 básico, completo com Billing)
Dentro do painel do cliente: plano, pagamento, usuários, consumo, licença, logs/faturas. (É a área "Minha Conta" do painel do cliente — não um 3º app.)

## 43. Marketplace online (Fase 2)
No modelo SaaS o fluxo é 100% online: Marketplace → Instalar → Conectar (wizard) — sem deploy por cliente. Curadoria/publicação de conectores pelo Console.

## 44. White Label + domínio próprio (Enterprise; arquitetura na V1, produto pós-V1)
Branding por organization (logo, cores, nome) e domínio próprio (`ia.empresa.com` / `cliente.seudominio.com`) apenas Enterprise. V1 prepara: branding dinâmico no shell (padrão `useDocumentBranding` do Aquapark) e roteamento por host.

## 45. Modelo de implantação (decisão)
**V1 = SaaS hospedado** (uma instância multi-tenant, operada pelo Console). Os scripts install/uninstall/upgrade e o painel de Atualização/Backup (docs/deploy-e-versionamento.md) passam a servir **à infraestrutura do próprio SaaS** — e habilitam, no futuro, a edição **Enterprise on-premise** (mesmo produto, uma organization, licença própria). Nada muda no mapeamento de deploy, só o público dele.

## Estrutura SaaS consolidada

```
IA Studio SaaS
├── Core Platform (orgs, workspaces, ambientes, usuários, convites, perfis, flags, auditoria)
├── Licensing (planos, limites, recursos, chave, enforcement)
├── Billing (assinaturas, trial, cupons, PIX/cartão, faturas, webhooks)
├── Integration Platform (marketplace, registry, secrets, wizard, storage)
├── Communication Platform (WhatsApp Meta, Email, futuros canais)
├── Automation Platform (event bus, engine, scheduler visual, monitor)
├── AI Platform (providers, agentes, RAG, memória, MCP, custos)
├── IA Studio (camada visual)
├── Console (painel administrativo da operação)
└── Painel do Cliente (produto + Minha Conta)
```

# Bloco 4 — Ajustes finais pré-código (revisão do Robson, 4ª rodada)

## 46. Nome (decidido): **IA Studio é a PLATAFORMA**; o editor visual é o módulo "Studio"
Estrutura: IA Studio (plataforma) → Core, Communication, Automation, Integration, AI Platform, Console, **Studio** (módulo do editor visual de fluxos/agentes).

## 47. Console 100% isolado (Fase 1)
`platform-console` **não compartilha componentes de negócio** com o painel do cliente — só UI kit básico. Console administra o SaaS (clientes, planos, billing, monitoramento, marketplace); `platform-admin` é somente o produto do cliente.

## 48. Marketplace universal (Fases 2+)
O marketplace instala qualquer tipo de item pela mesma infraestrutura: **Provider, Tool, Node, Template, Flow, Agent, Plugin** — um só modelo de item instalável (tipo + manifesto + versão), uma só UI, um só fluxo de curadoria no Console.

## 49. Pipeline interno do Automation Engine (Fase 4)
Camadas explícitas e independentes: `Scheduler → Event Bus → Queue → Workflow Runtime → Execution Monitor`. Cada camada com contrato próprio — é isso que permite escalar horizontalmente e trocar o broker (diretriz 8).

## 50. Resource Model: Generic + Extensions (Fase 6)
O core canônico nunca é poluído por segmento. Extensões por vertical: `Customer + ISP Extension` (status online, OLT, CTO, slot), `Customer + Hospital Extension` (convênio, prontuário), `Customer + Imobiliária Extension` (imóvel, contrato). Extension = pacote instalável (marketplace) que adiciona atributos/recursos sem tocar no core.

## 51. Taxonomia de Providers (Fase 2)
Categorias oficiais do marketplace: **Communication, ERP, CRM, AI, Storage, Database, Identity, Payments, Productivity, Developer, IoT**.

## 52. Nomenclatura: Provider → Instance (Fase 2)
Distinção formal: **Provider** = o tipo/conector (Meta, Google, Altarede); **Instance** (conexão) = a instância nomeada configurada (Meta → "Financeiro"; Google → "RH"). Toda UI e API usam essa linguagem.

## 53. Billing nunca fala com módulos (Fase 1)
Cadeia obrigatória: `Billing → Licensing → Feature Flags → Sistema`. Nenhum módulo consulta Billing; todos consultam Licensing/Flags. Gateway de pagamento trocável sem tocar em nada.

## 54. White Label: banco nasce preparado (FASE 1)
Campos de branding (logo, cores, nome, favicon) e domínio próprio na `Organization` desde o schema inicial — mesmo com o produto White Label vindo pós-V1.

## 55. Logs separados por natureza (transversal, começa na Fase 1)
Nunca misturar: **Application Logs** (técnico), **Audit Logs** (quem fez o quê), **Integration Logs** (chamadas a providers), **Execution Logs** (automações/IA), **Security Logs** (login, falhas, tokens), **Billing Logs**. Tabelas/retensões próprias; Analytics (diretriz 34) **só consulta agregações, nunca logs crus**.

## 56. Identity como módulo (arquitetura na Fase 1; SSO pós-V1)
Autenticação plugável: hoje login interno (email+senha); depois **Google, Microsoft, Facebook, GitHub, LDAP, SAML, OIDC** — principalmente Enterprise. Fase 1 já isola a estratégia de autenticação (`IdentityProvider` interno como 1ª implementação) para SSO entrar sem refatorar.

## 57. Camadas de API (Fase 1 em diante)
`Internal API → SDK → Public API`. A API pública é uma fachada versionada e estável; nunca expor endpoints internos diretamente. **Developer Center** no painel do cliente (Fase 6): API Keys, OAuth apps, webhooks, SDK, logs de uso da API.

## 58. Grace period no Billing (Fase 1, no schema)
`Venceu → N dias de graça (default 5) → Modo Restrito → Suspenso`. Estados explícitos na assinatura; **nunca apagar nada** em nenhum estado.

---

## ⚠️ PRINCÍPIO REITOR (substitui "V1 focada na vertical ISP" em todos os documentos)

> **A plataforma é totalmente genérica e orientada a integrações. A primeira solução oficial entregue será para o segmento de provedores (ISP), utilizando o Altarede como primeiro Provider ERP. Nenhuma decisão arquitetural poderá depender de um segmento específico; funcionalidades de negócio deverão ser implementadas por meio de Providers, Tools, Resource Extensions e Templates.**

---

## Mapa V1 × pós-V1 (blocos 1, 2 e 3)

- **V1:** diretrizes 1–19, 21–24, 26 (básico), 27–29, 31–34, 36–37, 39–43 (Billing manual: planos/trial/licença sem gateway), 45.
- **Arquitetura na V1, produto depois:** 20/38 (gateway PIX/cartão), 30 (Comunidade), 33 (cluster multi-worker), 35 (Plugins), 44 (White Label/domínio próprio).
