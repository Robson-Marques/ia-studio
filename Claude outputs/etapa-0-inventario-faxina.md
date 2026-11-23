# Faxina — Etapa 0: inventário de código e arquivos mortos (read-only)

- **Data:** 2026-09-21
- **Especialidade:** `ia-studio.system-cleanup@1.0.0`
- **Natureza:** somente leitura. Nada foi removido nesta etapa. Este inventário é a base de decisão para as Etapas 1 (arquivos/módulos) e 2 (intra-código).
- **Método:** reachability sobre `platform-api/src` (333 arquivos) e `platform-admin/src` (114). Um item só é "morto" quando nenhuma superfície viva o alcança (import, rota, menu, ACL, seed, DI, controller, build). A evidência acompanha cada item.

## Resumo

| Classe | Itens | Ação |
|---|---|---|
| A. Mortos por reachability | 8 | Excluir de verdade (Etapa 1) — sem decisão pendente |
| B. Motores dormentes | 2 conjuntos | **Decisão do dono**: excluir de verdade vs arquivar |
| C. Cinza (vivo, porém resquício SaaS) | 1 | Decisão do dono — fora da faxina pura |
| D. Docs/repo | 3 | Corrigir referência / revisar não-versionados |

---

## A. Mortos por reachability — excluir de verdade (Etapa 1)

Diretórios de esqueleto vazios (zero arquivos `.ts`; nenhum import; herança da era SaaS). Não são rastreados pelo git enquanto vazios, então são resíduo do working tree que **engana** quem lê a árvore:

1. `platform-api/src/modules/billing/` (e `billing/dto/`) — vazio. Nenhuma referência; `app.module`/`worker.module` não citam.
2. `platform-api/src/modules/licensing/` (e `licensing/dto/`) — vazio. Idem.
3. `platform-api/src/modules/core/organizations/` (+ `domains/dto`, `dto`, `org-users`) — zero `.ts`. `OrganizationsModule` não é importado por ninguém.
4. `platform-api/src/modules/core/workspaces/` (+ `dto`) — zero `.ts`. `WorkspacesModule` não é importado por ninguém.
5. `platform-api/src/modules/ai/costs/` (+ `dto`) — vazio. Citado só no `ai/README.md`.

Arquivos órfãos (o stem nunca aparece como alvo de import em toda a árvore):

6. `platform-admin/src/services/account.js` — exporta `getSettings`/`updateSettings`; nenhum componente importa `services/account`.
7. `platform-api/src/modules/comm/whatsapp/template-catalog/catalog.seed.ts` — nenhuma referência a `catalog.seed`/`CatalogSeed`.
8. `platform-api/src/modules/integration/marketplace/dto/update-provider-definition.dto.ts` — nenhuma referência a `update-provider-definition`/`UpdateProviderDefinition`.

> Observação: itens 1–5 são pastas vazias; a "remoção" é apenas apagar o diretório no working tree (o git nem os vê). Itens 6–8 são arquivos versionados — removê-los é um commit real. O `ai/README.md` deve perder a menção a `costs` na Etapa 2.

---

## B. Motores dormentes — decisão do dono (excluir de verdade vs arquivar)

Estão **registrados e ligados** por baixo, mas foram retirados da vitrine (v0.11.11/v0.11.12) e não têm card no marketplace. Reachability não os marca como mortos (o boot ainda os instancia), então a remoção depende da sua política.

### B1. LLM Gemini / Ollama

- `platform-api/src/modules/ai/providers/impl/gemini.provider.ts`
- `platform-api/src/modules/ai/providers/impl/ollama.provider.ts`
- Ligações vivas: `ai.module.ts` (imports + DI, linhas 18-19/104-105); `ai-providers-seed.service.ts` (injeta `gemini`/`ollama` e os itera no laço de registro, linha 55); `AI_PROVIDER_RETIRED = ['gemini','ollama',...]` (desativa os cards). Menções em `orchestrator`, `analysis`, `content-review`, `pricing`, `llm-provider.service` (texto/erro).
- Se **excluir de verdade**: apagar os dois `impl/*.provider.ts`, remover imports/DI/entradas do laço, tirar `'gemini'`/`'ollama'` do `AI_PROVIDER_RETIRED`, limpar as menções em pricing/mensagens. Ficam só OpenAI e Anthropic no motor — coerente com o marketplace.
- Se **arquivar**: nada muda (seguem dormentes).

### B2. WhatsApp Baileys (interno + manual)

- API: `comm/whatsapp/whatsapp-baileys.runtime.ts` (em `connectors/`), `whatsapp-baileys-registry.service.ts`, `whatsapp-baileys-session.repository.ts`, `whatsapp-baileys.controller.ts`; `integration/registry/providers/whatsapp-baileys-internal.provider.ts`, `whatsapp-baileys-manual.provider.ts`.
- Admin: `platform-admin/src/services/whatsappBaileys.js` (importado por `Integracoes/ConexaoDetalhe.jsx`); ramos em `WhatsApp/ChatWindow.jsx`, `WhatsApp/MessageComposer.jsx`, `IA/ia.constants.js`, `services/whatsapp.js`.
- Ligações vivas: `RETIRED_KEYS` em `provider-seed.service.ts` desativa os cards; o `controller` ainda expõe rota; o admin ainda tem a tela de conexão manual (QR).
- Se **excluir de verdade**: apagar os arquivos dedicados de Baileys (API + admin service), remover as entradas de `RETIRED_KEYS`, o registro do controller no `comm.module`, e podar os ramos de UI que só existem para Baileys (Etapa 2). Meta Cloud API / YCloud (WhatsApp oficial) seguem intactos.
- Se **arquivar**: nada muda (seguem dormentes).

---

## C. Cinza — vivo, porém resquício SaaS (decisão do dono; não é faxina pura)

- `platform-admin/src/pages/PaginaPagamento.jsx` + rota pública `/pagar/:token` (App.jsx). É a tela de pagamento da era SaaS. O módulo `billing` do backend está **vazio** (item A1), então a tela provavelmente já não tem endpoint — está **funcionalmente quebrada** no dedicado. Mas é **alcançável** (rota + import), então por reachability não é "morta": remover é decisão de produto (o dedicado tem tela de pagamento?), não faxina. Recomendo tratar como frente à parte, com seu próprio alinhamento.

---

## D. Docs / repositório

- **Referência quebrada no catálogo:** `docs/prompt-framework/catalogo-especialidades.md` lista `ia-studio.tenant-domains` apontando para `especialidades/tenant-domains.md`, que **não existe** no disco. Ou o arquivo foi perdido, ou a linha deve sair. Precisa de decisão (recriar vs remover a linha) — integridade do catálogo, não código.
- **Não-versionados no working tree** (git `??`, provável lixo de trabalho): `Claude outputs/` e `docs/mapeamento-aquapark-menus-ia-studio-whatsapp.md`. Não fazem parte do repo; revisar e remover/ignorar.
- `.git/index.lock.orphan-safe-to-delete`: lock órfão renomeado (inofensivo); pode apagar.

---

## Decisões necessárias antes da Etapa 1

1. **Política dos motores dormentes (B1 e B2):** excluir de verdade ou arquivar? (Pode ser diferente para LLM e para Baileys.)
2. **PaginaPagamento (C):** manter, ou abrir frente própria para remover a cobrança SaaS?
3. **tenant-domains no catálogo (D):** recriar o arquivo ou remover a linha?

A Etapa 1 removerá apenas a Classe A (mortos por reachability) mais o que a política dormente liberar como *excluir de verdade*. Nada da Classe A depende de decisão.
