# CLAUDE.md — REGRA MÁXIMA DO PROJETO IA STUDIO

> Estrutura-base de Automação Empresarial, Integrações, IA e Comunicação para
> instalações dedicadas por cliente.
> Toda IA/desenvolvedor que atuar neste projeto DEVE seguir estas regras sem exceção.
> Documentos normativos vivos: `docs/diretrizes-arquiteturais.md` (58 diretrizes), `docs/deploy-e-versionamento.md` (runbook de deploy), `RELATORIO-ANALISE-E-ARQUITETURA.md` (Parte 2 — contrato da API do ERP Altarede). Índice de estado/re-ancoragem: `docs/ESTADO-e-handoff.md`.
>
> **Conversão em andamento:** o código ainda contém a arquitetura SaaS recuperada.
> A fonte de verdade da transição é
> `docs/capabilities/saas-to-dedicated-installation.md`, com o Baseline em
> `docs/architecture-baseline.md` e a decisão em
> `docs/rfcs/RFC-001-conversao-saas-instalacao-dedicada.md`. Não criar, ampliar ou
> corrigir código no sentido de multi-tenancy, Console, billing, licensing ou
> domínios por tenant; cada slice deve reduzi-los até a remoção completa.
>
> **Como interagir com o Robson** (idioma, re-ancorar pós-compactação, erro silencioso, docs vivos, ambiente/deploy, governança de mudanças, tom de resposta) está em **`COMO-INTERAGIR-COM-ROBSON.md`** (raiz do projeto — mesmo conteúdo em todos os projetos do Robson). Este arquivo aqui é só regra técnica/de produto do IA Studio.

## ⚖️ PRINCÍPIO REITOR
A plataforma é totalmente genérica e orientada a integrações. A primeira solução oficial é para provedores (ISP) com o Altarede como primeiro Provider ERP. **Nenhuma decisão arquitetural pode depender de segmento específico** — funcionalidade de negócio entra via Providers, Tools, Resource Extensions e Templates. A plataforma NUNCA é dona de dados de negócio.

## 🔁 REGRAS DE OURO DA EXECUÇÃO (lições caras — leia antes de codar)

> Pós-compactação, erro silencioso e docs vivos estão em `COMO-INTERAGIR-COM-ROBSON.md`. Aqui só o específico do IA Studio:

- **PORTE, NÃO REINVENTE — E OLHE O AQUAPARK ANTES DE QUALQUER CORREÇÃO.** O Aquapark (`C:\Users\Flowspec\Documents\delivery-system\aquapark`) está à frente e tem muita coisa testada em produção. Antes de construir OU **corrigir** algo que ele já tem (upgrade/atualização, canvas de fluxo, composer/áudio do WhatsApp, tela de versão, backup, painel que mostra progresso/falha), **a PRIMEIRA ação é LER o equivalente lá** e portar o padrão — não remendar o meu nem refazer do zero. Isso é PRÁTICA OBRIGATÓRIA em toda correção, não só em feature nova: se o bug é numa área que o Aquapark tem, abrir o arquivo dele primeiro. Reinventar/remendar = repetir bug já resolvido lá. Só se constrói do zero o que é genuinamente novo do IA Studio (multi-tenant, Provider Registry, declarativo), e mesmo aí herdando os padrões de UX/estrutura.
- **ARQUIVAR ≠ EXCLUIR — por caso, não por dogma.** "Nunca excluir, só mudar de estado" vale para o que tem histórico/referência (conexão que processou dados, entidade central). Um **rascunho descartável** (fluxo/assistente sem uso) tem que poder ser **excluído de verdade** — forçar arquivar aí é dogma sem visão de negócio.
- **UX humana vale no CANVAS e nos editores também**, não só nas telas de lista/form. Auditar o editor de automação, o inspetor de nó e os modais — não só as tabelas.
- **CHECKPOINT entre frentes; sem empilhar.** 1 mudança estrutural por vez, validação humana, depois a próxima. Ver `docs/base-doc-e-portes-aquapark.md` para o backlog de porte da base.

## 🏗️ ESTRUTURA DO MONOREPO
```
├── CLAUDE.md / CHANGELOG.md / README.md
├── docs/                    # specs, diretrizes, checkpoints
├── scripts/                 # install/uninstall/upgrade/backup (fase final)
├── platform-api/            # NestJS 10 + Fastify + Prisma (monolito modular + workers)
└── platform-admin/          # React 18 + Vite + Tailwind — PAINEL DA INSTÂNCIA DEDICADA
```

O antigo `platform-console/` foi aposentado no S3 da Capability dedicada. Não
reintroduza telas comerciais ou uma segunda superfície administrativa.

## 🔒 BANCO DE DADOS
- Cada instância terá PostgreSQL + pgvector próprios. `schema.prisma` é a fonte única da verdade.
- **PROIBIDO** migrations/`ALTER TABLE`. Evolução = editar schema + `npx prisma db push --accept-data-loss`.
- **PROIBIDO** esconder campo com forma definida em `metadata: Json` — coluna explícita.
- Namespacing: `core_*`, `licensing_*`, `billing_*`, `integration_*`, `comm_*`, `automation_*`, `ai_*`, `system_*`.
- **Nenhuma tabela operacional nova recebe `organization_id`, `workspace_id` ou
  `environment_id`.** Esses campos pertencem ao modelo SaaS legado e saem pelo
  Capability Contract; o dado operacional pertence à instância dedicada.

## 📦 ARQUITETURA
- Monolito modular NestJS + **workers BullMQ em processos separados** (estado em Redis/Postgres, nunca em memória do processo — diretriz 33).
- Comunicação entre módulos: injeção de dependência + **Event Bus** (diretriz 7; envelope: `event`, `trace_id`, `source_event_id`, payload mínimo e idempotência). Organização, workspace e ambiente não são campos do envelope dedicado. Broker via `IMessageBroker` (BullMQ na V1) — nenhum módulo importa BullMQ direto.
- Providers só via **Provider Registry** com interface `IProvider` (metadata/connect/disconnect/health/execute/discover). **Provider** = tipo; **Instance** = conexão nomeada (diretriz 52). Instance nunca é excluída — só muda de estado.
- Secrets só via **Secrets Manager** (AES-256-GCM); conexões referenciam secret por id; export nunca inclui secrets.
- Arquivos só via **Storage Manager** (`IStorageDriver`).
- Feature flags são locais à instância. Billing, Licensing, `LimitsService` e
  `UsageService` são legado SaaS e nenhum módulo novo pode depender deles.
- IA/fluxos nunca chamam API externa direto — sempre SDK/Integration Manager.
- Camadas de API: Internal → SDK → Public (diretriz 57). OpenAPI/Swagger sempre atualizado.
- Logs separados por natureza: application/audit/integration/execution/security/billing (diretriz 55). Analytics só lê agregações.
- WhatsApp: **exclusivamente capacidades oficiais da Meta Cloud API**.
- **TEMPLATES HSM — REGRA OBRIGATÓRIA (padrão do Aquapark):** todo envio automático fora da janela de 24h exige um **template HSM aprovado**. O sistema **NUNCA** pode depender de o cliente criar o template do zero — tem que existir um **catálogo nativo de padrões prontos para publicar**, semeado no boot (upsert por `template_name`, idempotente), que o usuário só revisa e publica na Meta pela tela de Templates. Estrutura padronizada de cada template do catálogo: `event`, `template_name`, `category` (UTILITY/MARKETING/AUTHENTICATION), `header` (type+content), `body_content` com placeholders `{{n}}`, `footer_content`, `buttons_json` (`{ type: 'URL'|'QUICK_REPLY', text, action }`) e `variable_map_json` (posição→nome-da-variável por componente: header/body/footer/buttons). **Botões e links de acesso:** o template guarda só a **`action` simbólica** (ex.: `OPEN_INVOICE`, `OPEN_CHECKOUT`, `OPEN_PORTAL_VERIFY`, `OPEN_PAYMENT_PAGE`); um **resolvedor central** (`resolveButtonUrl(action, base)`) transforma a ação na URL final — sempre no domínio do próprio sistema (a Meta não aceita domínio dinâmico em botão), com `{{1}}` quando aponta pra uma entidade (id/token) e uma **URL de amostra** para a revisão da Meta. Base pública vem de configuração local da instância (`system.public_url`), nunca hardcoded nem env manual. Ciclo de vida: `SEED_RENAMES` (renomear a linha do catálogo quando a Meta bloqueia recriar nome recém-excluído) e `SEED_REMOVE` (aposentar). O usuário edita/publica; o código é a fonte do padrão (docs-as-code). **REGRA DE OURO:** todo **novo emissor automático fora da janela de 24h nasce COM a sua linha no catálogo** (avaliar/criar o template junto da feature — faz parte da Definição de Pronto) — nunca se pede pro cliente redigir o HSM; nova `action` de botão = nova entrada no `resolveButtonUrl` (com URL de amostra pra Meta). Referência viva da estrutura: `aquapark/.../whatsapp-template-catalog/` (`catalog.seed.ts` + `template-actions.ts`). No IA Studio o catálogo é semeado uma vez por instância no boot (o `WhatsappTemplate` mantém `is_system_template`/`event`/`buttons_json`/`variable_map_json`).
- Um arquivo responde UMA pergunta (regra de coesão do Aquapark). Lógica em service; DB só via repository; DTOs com class-validator; sem `any`; Logger do Nest (nunca console.log).

## 🔐 ACL
- Permissões `dominio.acao` em `permissions.constants.ts` (catálogo único). Guards: `JwtAuthGuard` global + `PermissionsGuard` + `@RequirePermissions`. Há um único ator: usuário local da instância; não reintroduzir `PLATFORM_ADMIN` nem guard de Console SaaS.
- Todo endpoint sensível tem `@RequirePermissions`; todo botão tem `can()` no front; perm nova exige: constante + grupo + label no front + perfis de sistema.
- Mutations sensíveis: `@Auditable` com diff valor antigo→novo + IP + user-agent (redact de password/token/secret/api_key/cpf).

## 🎛️ FEATURE FLAGS E AUTOMATISMOS
- **Todo comportamento automático nasce OFF** e é ligado por toggle pelo usuário.
- Default de produção de flag técnica mora no código (env só override). Toggle de usuário mora no banco (`system_settings`/FeatureFlag), configurável por UI, viaja no backup.

## 🎨 UX (painéis)
- **REGRA MÁXIMA DE UX — linguagem do usuário, nunca do desenvolvedor.** Todo texto de superfície (menu, aba, label, botão, dica, mensagem) fala a língua do dono do negócio, não a do código. "O que o assistente pode fazer", não "allowed_tools"; "Quem é", não "persona JSON"; "Assistentes", não "Agentes/LLM". O usuário descreve o que quer; o sistema traduz para os identificadores técnicos por baixo. Jargão (chaves, modelos, tokens, IDs) fica escondido em "Ajustes avançados" ou fora da tela. Vale para TODA tela nova.
- Erros/validações SEMPRE via toast (`toast.error/success/warn/info`) — nunca banner inline, nunca `confirm()/alert()/prompt()` nativos.
- Ações destrutivas: os **5 patrasques** — ConfirmDialog, disclaimer, tooltip, loading state, permission gate.
- Componentes de `components/ui/` (Modal, Tabs folder/pills, Table+Pagination, FormField, NumericInput, PhoneInput, EmptyState, ConfirmDialog, StatCard). Cores via CSS vars `--ap-*` (dark+light). Sem libs de UI alternativas.
- **TELEFONE — REGRA OBRIGATÓRIA:** todo campo de telefone usa `components/ui/PhoneInput` (seletor de país com bandeira+DDI+busca). NUNCA `<input>` cru de telefone nem máscara BR fixa. O valor é guardado SEMPRE em **E.164 só-dígitos, com DDI e SEM `+`** (ex.: `5527999998888`) — a mesma convenção do WhatsApp/back. No backend, normalizar com `normalizePhoneFromUser` (número digitado por humano — só prependa `55` se for celular BR: DDD 11-99 + "9"; estrangeiro é mantido) vs `normalizePhoneFromWhatsApp` (número que já vem do Meta — só limpa). NUNCA a heurística ingênua de "10/11 dígitos = BR" (corrompe número estrangeiro). Helpers em `comm/whatsapp/whatsapp.helpers.ts` (`normalizePhoneFromUser`/`normalizePhoneFromWhatsApp`/`isValidPhone`/`phoneVariants`). Padrão portado do delivery-system.
- **RODAPÉ DA SIDEBAR — REGRA DE LAYOUT (aviso de atualização; padrão portado do delivery-system).** O rodapé da sidebar do painel tem SEMPRE dois blocos verticais, nesta ordem: (1) **usuário** — avatar circular com iniciais (2 letras), nome (semibold ~13px), papel/role abaixo (~11px, `--ap-text-3`) e ícone de logout (`LogOut`) à direita; (2) **versão do sistema** — texto centralizado, ~10px, `--ap-text-4` (discreto): `v{X.Y.Z}` da versão atual e, **se houver atualização disponível**, acrescenta ` · nova versão disponível` numa cor de destaque discreta (info/accent). O bloco de versão é **passivo e NÃO clicável** — só avisa; o usuário navega manualmente até **Configurações > Atualização** quando quiser. Fonte da versão: hook que chama `GET /system/version` (VersionService: versão atual + disponível) uma vez no mount, com cache; fallback pra versão injetada no build. Motivo: avisa sem interromper nem forçar ação — é indicador de estado, não notificação. Vale pra todo painel admin.
- Responsivo: Table desktop + Cards mobile; touch ≥44px; `100dvh`; testar 375px e 1920px.
- O shell não possui seletor de workspace/ambiente. Página não duplica padding do `<main>`.

## 🚀 DEPLOY / VERSIONAMENTO
> Ambiente sem Node local + deploy via tag/painel: regra geral em `COMO-INTERAGIR-COM-ROBSON.md` §6.
- Ver `docs/deploy-e-versionamento.md`. Produção: `/opt/iastudio`, PM2 `iastudio-api` (+ `iastudio-worker`), Debian root (sem sudo).
- Release: entrada no `CHANGELOG.md` → commit → tag anotada `vX.Y.Z` → painel de Atualização aplica.

## 🧠 PENSAR ANTES DE CODAR (obrigatório — porte do Aquapark)
Antes de implementar qualquer feature, mapear em prosa: **1)** módulo/service/repository/DTO/guard afetados; **2)** eventos emitidos/consumidos; **3)** ACL (perm nova? front `can()` + back `@RequirePermissions`); **4)** dependências SaaS a remover, sem criar nova; **5)** auditoria (`@Auditable` em mutation sensível?); **6)** pertencimento à instância, sem tenant/workspace/environment; **7)** estados de erro (toast)/empty (`EmptyState`)/loading; **8)** mobile 375px + dark; **9)** navegação (sidebar/breadcrumb/rota); **10)** reutilização (existe componente/helper/porte do Aquapark?). Só codar depois de 1-10. **Proibido:** criar componente quando `components/ui/*` já tem; duplicar service; abstração sem 2+ consumidores; feature sem gating; refator estrutural junto com feature nova fora do Capability Contract.

## ✅ DEFINIÇÃO DE PRONTO (porte do Aquapark)
Uma feature só está pronta se: service tem a regra (sem lógica em controller) · repository encapsula Prisma · DTO com class-validator · controller com `@RequirePermissions` · eventos críticos com `source_event_id` + idempotência · auditoria em mutation sensível · front com `can()` nos botões + toast de erro + `EmptyState` + loading · responsivo (Table desktop/Cards mobile, touch ≥44px) testado em 375px e dark · perm nova seguiu os 5 passos (constante + grupo + label + perfis + Administrador herda) · rota nova em breadcrumb + sidebar · CHANGELOG atualizado. **NÃO é pronto:** só desktop, só CRUD sem ACL granular, só front OU só back, sem dark, sem toast de erro, sem o CANVAS/editor auditado (quando aplicável).

## 🛡️ GOVERNANÇA
> Regra geral (1 frente por vez, checkpoint, sweeps arquivo-por-arquivo, sem roadmap automático) em `COMO-INTERAGIR-COM-ROBSON.md` §7. Aqui só o específico:
- Documentação DURANTE o desenvolvimento: README por módulo + CHANGELOG + docs/ de cada fase. `docs/base-doc-e-portes-aquapark.md` = backlog de amarração da base.
- Sinais de alarme: endpoint sem `@RequirePermissions`; tabela operacional com `organization_id`, `workspace_id` ou `environment_id`; módulo importando BullMQ/provider direto; secret fora do Secrets Manager; automatismo nascendo ON; `catch` que engole erro e devolve fallback sem sinal; tipo técnico (`TRIGGER_EVENT`, chave crua) renderizado na tela; feature que o Aquapark já tem sendo feita do zero.
- **ID DE INFRA A IA NUNCA ESCOLHE (nem chuta, nem é chumbado).** Id de conexão/ERP, setor, assunto, fila e afins **não** entram no schema das tools do agente — o modelo confunde (passou o login "torre3pratinha" como conexão; passou a palavra "suporte" como setor) e o ERP recusa calado ("não está ativa nesta configuração"/"Departamento destino"). Esses ids vêm da **CONFIG curada** OU são **auto-resolvidos em runtime** pela configuração local da instância e prioridade/tag, sempre lidos do banco — **determinístico, não hardcoded** (trocar a conexão/filial no banco continua funcionando sozinho). As OPÇÕES que o operador vê na config vêm **filtradas da fonte** (só as utilizáveis — ex.: só assunto com processo de O.S. vinculado). O modelo decide só o que é dele (CPF, descrição, escolha do cliente). Infra/config quebrada → **degradação graciosa** (encaminha pra fila/avisa o operador), nunca erro críptico ao cliente.

## 🧾 DOCUMENTAÇÃO E CÓDIGO VIVOS — SEM LIXO (padrão obrigatório)
> Regra geral em `COMO-INTERAGIR-COM-ROBSON.md` §4. Aqui só o específico:

- **Papéis:** `CHANGELOG.md` = histórico (o que mudou e quando). `docs/` + READMEs + comentários = estado atual (o que existe e como funciona). `docs/ESTADO-e-handoff.md` = índice do estado vigente para re-ancorar entre sessões (a memória do assistente é compactada em sessões longas — a verdade mora no git + nos arquivos, nunca na memória).

*Versão do documento: 1.2.0 — 12/07/2026 (doc/código vivos sem lixo; ESTADO-e-handoff como índice de re-ancoragem). 1.1.0 — 10/07/2026 (base amarrada via Aquapark).*
