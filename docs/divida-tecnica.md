# Dívida técnica — IA Studio

> **Papel deste arquivo:** débito conhecido do produto — aberto, priorizado, com dono.
> O histórico do que mudou mora no `CHANGELOG.md`; o estado vigente em `docs/` e
> nos READMEs; o índice de re-ancoragem em `docs/ESTADO-e-handoff.md`. Aqui só o
> que **falta** e por quê.
>
> Documento vivo. Ao resolver um item, mover para "Resolvidos" com data + tag —
> não apagar (o motivo da decisão é a parte que se perde).

## Categorias

| Ícone | Categoria | Semântica |
|---|---|---|
| 🔴 | **CRÍTICA** | Risco operacional, de segurança ou de dado — entra no próximo bloco de trabalho sem negociação |
| 🟠 | **ALTA** | Aumenta débito rápido ou gera divergência — não pode virar 🔴 |
| 🟡 | **MÉDIA** | Tem workaround aceitável, mas cobra pedágio em cada uso |
| 🟢 | **BAIXA** | Melhoria incremental |

Cada item tem **ID imutável**, categoria, módulo, risco, esforço estimado, dono e
sprint-alvo (ou `backlog`).

---

## Abertos

### DT-001 🟡 Editor de template não diz quais variáveis existem

- **Módulo:** `automation/templates` (backend) + `platform-admin` (Automação → Templates)
- **Risco:** UX / mensagem enviada com buraco
- **Esforço:** 2–4h (só front, lista fixa) · 1–2d (se puxar variável real dos fluxos)
- **Dono:** Robson · **Sprint-alvo:** `backlog`
- **Nasceu em:** 2026-07-25, ao criar o primeiro template real (v0.10.1)

O editor traz dois exemplos na dica e nada mais. Quem já mexeu em template HSM do
WhatsApp escreve `{{1}}` por hábito — e o token **não resolve**: sai string vazia
na mensagem, sem aviso em lugar nenhum. O erro só aparece no texto que o cliente
recebeu.

O que o motor entende **no corpo de um template**:

| Token | O que é |
|---|---|
| `{{input.…}}` | o que o gatilho trouxe (payload do evento, do webhook, do agendamento) |
| `{{vars.<id-do-nó>.…}}` | saída de um passo anterior do fluxo |
| o que vier em "Dados extras (JSON)" | campos que o nó *Montar mensagem de um modelo* injeta na hora |

Não existe `{{1}}`, `{{2}}` — essa numeração é da Meta, do template HSM, e é outro
domínio (`comm/whatsapp/template-catalog`).

**Base pronta para resolver:** `automation/engine/variable-resolver.ts` já declara
`KNOWN_NAMESPACES` e tem `unknownTokens()`, usados na validação do publish do
fluxo. Falta expor isso ao editor.

**Decisão pendente antes de codar** (é decisão de produto, não de implementação):
a lista mostrada é **fixa** (os namespaces explicados em português, com exemplo
clicável que insere no texto), ou é **derivada dos fluxos publicados** (nomes reais
dos nós e campos do payload)? A segunda é mais útil e exige endpoint novo. Em
qualquer das duas, marcar em vermelho o token que não vai resolver é a parte que
paga mais rápido.

### DT-002 🟡 `{{workflow.…}}`, `{{env.…}}` e `{{now}}` valem no nó mas não no template

- **Módulo:** `automation/engine` (`platform.nodes.ts` / `templates.service.ts`)
- **Risco:** pegadinha silenciosa — mensagem sai com buraco
- **Esforço:** ~30min (uniformizar) + teste
- **Dono:** Robson · **Sprint-alvo:** `backlog`
- **Nasceu em:** 2026-07-25 (achado junto do DT-001)

O `variable-resolver` (config dos nós) resolve `input`, `vars`, `workflow`, `env`
e `now`. Já o nó `TEMPLATE_RENDER` monta o `data` do template com **só**
`{ input, vars, ...extras }` (`platform.nodes.ts`). Então o mesmo token funciona
num lugar e volta vazio no outro — e o sintoma aparece na mensagem entregue, não
na tela.

Dois caminhos: (a) passar `workflow`/`env`/`now` no contexto do `TEMPLATE_RENDER`,
uniformizando — mudança pequena, elimina a pegadinha; (b) manter restrito e dizer
na tela quais namespaces **não** valem ali. Resolve junto com o DT-001, porque é a
mesma tela que precisa contar a verdade ao usuário.

### DT-003 🟡 `DELETE` de base de conhecimento não existe no backend

- **Módulo:** `ai/knowledge`
- **Risco:** ação da UI que sempre falha
- **Esforço:** 1–2h (endpoint + decidir cascata dos documentos/embeddings)
- **Dono:** Robson · **Sprint-alvo:** `backlog`
- **Nasceu em:** 2026-07-24 (descoberto na migração da tela, decisão do Robson: resolver no backend depois)

O `knowledge.controller.ts` tem `GET`/`POST`/`PATCH` e nenhum `@Delete`, mas o
front chama `deleteKnowledgeBase()` → `Cannot DELETE /api/v1/ai/knowledge/bases/:id`.
**Não é regressão da migração do DS** — o botão existia no legado com a mesma
chamada, só nunca havia sido clicado. O botão "Excluir base" segue visível e segue
dando erro.

Ao implementar, decidir o que acontece com os documentos e os embeddings: apagar em
cascata, ou arquivar a base (`is_active=false`) preservando o histórico? A regra do
ecossistema é *arquivar ≠ excluir, por caso* — base que já indexou documento e
respondeu conversa tem histórico; base vazia não.

### DT-004 🟢 "Ativar imediatamente" no cadastro de servidor MCP não pode funcionar

- **Módulo:** `ai/mcp`
- **Risco:** UX — checkbox que causa 400
- **Esforço:** 15min (tirar o checkbox) — o que falta é a decisão
- **Dono:** Robson · **Sprint-alvo:** `backlog`
- **Nasceu em:** 2026-07-24 (decisão do Robson: deixar quieto)

O `CreateMcpServerDto` não declara `is_active` (só o `UpdateMcpServerDto`), e o
`ValidationPipe` com whitelist rejeita → `property is_active should not exist`. É
**deliberado**: o `mcp.repository.ts` documenta "Servidor MCP nasce OFF" e a
diretriz de flags proíbe automatismo nascendo ligado. Ou seja: a UI oferece o que a
arquitetura não permite.

O conserto é tirar o checkbox da tela de criação (o servidor se ativa depois, na
edição) — não abrir exceção na diretriz. Está 🟢 porque o caminho correto já
funciona.

---

### DT-005 🟡 A conversa do WhatsApp fica clara no tema escuro

- **Módulo:** `platform-admin` → `pages/WhatsApp/ChatWindow.jsx`
- **Risco:** UX / conforto visual
- **Esforço:** 1–2h (imitar o WhatsApp escuro) ou ~30min (tematizar o balão)
- **Dono:** Robson · **Sprint-alvo:** `backlog`
- **Nasceu em:** 2026-07-25 (migração da família WhatsApp, v0.10.9)

A área da conversa usa as cores do WhatsApp cravadas — balão `#d9fdd3` à direita, branco à esquerda, fundo `#efeae2`, tique `#53bdeb` — e isso é **deliberado**: é a convenção que o atendente vê no aplicativo o dia inteiro, e tematizar faria a mesma mensagem ter cor diferente aqui e lá. Tudo em volta (cabeçalho, ações, situação, composer) já é do tema.

O efeito colateral é que, no tema escuro, o painel fica escuro e a conversa continua clara. Três saídas, e a escolha é de produto:

1. **Imitar o WhatsApp escuro** — usar a paleta escura do próprio aplicativo (fundo `#0b141a`, balão enviado `#005c4b`, recebido `#202c33`). Mantém a convenção nos dois temas; é o que o WhatsApp Web faz.
2. **Tematizar o balão** — enviado no accent tonalizado, recebido na superfície. Coerência total com o painel, perda da convenção.
3. **Deixar como está** — aceitar a área clara como "a janela do WhatsApp dentro do painel".

Recomendação: (1) — resolve o desconforto sem abrir mão do reconhecimento.

## Resolvidos

| ID | Item | Resolvido em |
|---|---|---|
| — | `upgrade.sh` deixava o marcador de versão avançado após falha de build (bloqueava reaplicar) | v0.9.96 · 2026-07-25 |
