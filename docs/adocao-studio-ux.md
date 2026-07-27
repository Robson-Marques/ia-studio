# Adoção do Studio UX no IA Studio

> Como o `platform-admin` consome o design system **Studio UX** (pacotes
> `@studio-ux-ds/*`, publicados no GitHub Packages da org `studio-ux-ds`).
> Documento vivo — descreve o estado atual, não o histórico. A frente é
> governada por [`ia-studio.studio-ux-adoption@1.0.0`](prompt-framework/especialidades/adocao-studio-ux.md)
> (extends `workflow.consuming-system-adoption@1.0.0`).

## Estado atual — migração por família em curso (2026-07-25, v0.9.99 / DS ^1.2.22)

O `platform-admin` opera com a **casca AppShell do Studio UX** e o **Dashboard**
migrado para `PageHeader` + `StatCard` + `Card` do DS. O piloto isolado
`/studio-ux-demo` (fase v0.9.79) continua funcional dentro da casca nova — nada
foi removido dele.

**Famílias já no padrão DS:** IA Studio (6 telas), ISP (2 telas) e **Automação
inteira** — sub-frentes A (os 3 logs + Agendamentos + Templates), B (Fluxos +
editor de passos + `editor/*`) e C (o canvas). As demais (WhatsApp, Integrações,
Configurações, Recursos, Desenvolvedor) seguem com o padrão visual antigo
(`--ap-*` + Tailwind) dentro do AppShell, num regime de **coexistência
deliberada** — uma família por sub-frente, com validação humana entre elas. Desde
a v0.10.3 a **cor de ação é única** no painel todo: o legado herda o accent do DS.

**O inspetor tem duas formas, e as duas são legítimas** (DS v1.2.24 + v0.10.4):
`Drawer` quando não há contexto atrás para preservar (editor em lista, execução
manual) e **painel fixo recolhível** quando há (o canvas — cobrir o desenho tira
justamente as ligações do nó que se está configurando). O que **não** pode
divergir é o conteúdo: os campos do passo vivem em `editor/NodeFields.jsx`, usado
pelos dois. Antes eram dois renderizadores, e já tinham divergido — o tipo `agent`
existia só no canvas, e na lista o campo pedia o id do assistente na mão.

### O que o `platform-admin` tem hoje

| Item | Descrição |
|---|---|
| Deps | `@studio-ux-ds/tokens`, `@studio-ux-ds/components`, `@studio-ux-ds/react` (`^1.0.15`) |
| `.npmrc` | Aponta `@studio-ux-ds` para GitHub Packages, token via `NODE_AUTH_TOKEN` (ver abaixo) |
| `main.jsx` | Importa `tokens.css` + `components.css`, chama `configureTheme({ namespace: 'ia-studio' })` + `applyTheme()`, envolve o app com `<ToastProvider>` do DS |
| `ThemeContext.jsx` | Wrapper fino do mecanismo de tema do DS. Fonte única = DS (chaves namespaçadas `ia-studio_su_*`); espelha `.dark` no `<html>` para compatibilidade com telas Tailwind com `dark:`; `MutationObserver` sincroniza estado quando o AppShell/Customize trocam o tema |
| `Layout.jsx` | Casca via `AppShell` do DS. Slots: brand, nav (grupos com filtro por permissão), version, breadcrumb, topbarContext (seletor de workspace + badge de ambiente), user, userMenuItems (Minha conta, Trocar senha), `onNotifications` (redireciona pra `/automacao/notificacoes`), `notifications` (polling 30s), `customize` (painel embutido), `onLogout` |
| `Dashboard.jsx` | Primeira tela após login. `PageHeader` + 4 `StatCard` + `Card` com Badge de status do plano |
| `ContaSenha.jsx` (rota `/conta/senha`) | Nova. Substitui o modal de troca de senha que vivia no `Header` legado — elimina o empilhamento cross-tree modal-fora-do-outlet |
| `Layout.legacy.jsx`, `Sidebar.legacy.jsx`, `Header.legacy.jsx`, `Dashboard.legacy.jsx` | Backups da versão anterior. Não são importados em produção — servem só para rollback rápido (trocar o import no `App.jsx`) |
| Piloto `/studio-ux-demo` | Preservado sem alteração. Renderiza dentro do AppShell |

### Coexistência de padrões

- **CSS.** `--su-*` (Studio UX) e `--ap-*` (IA Studio) coexistem sem colisão de nome. As telas legadas continuam consumindo `--ap-*`; a casca (AppShell) usa `--su-*`. O container principal do AppShell não força fundo — a página filha continua controlando sua superfície interna.
- **Toast.** Fonte única: `<ToastProvider>` do DS montado no `main.jsx`. Todos os 55 callsites do painel consomem `useToast()` diretamente. `lib/toast.js` e `UIToastContainer.jsx` foram esvaziados (marcados para remoção) — passo 5 concluído em 2026-07-24.
- **Tema.** O DS é a fonte única. `ThemeContext` reflete o estado do DS + espelha `.dark` no HTML. Telas com `dark:` do Tailwind continuam funcionando.
- **Ícones.** Sidebar/menu de conta usam `DSIcon` (biblioteca curada do Studio UX) via mapa `LUCIDE_TO_DS` no `Layout.jsx` — proximidade semântica. Ícones dentro das páginas legadas continuam usando `lucide-react` (`Sun`, `Moon`, `LogOut` etc. — sem prejuízo).

## ADR — decisões da fase 2

### 1. `.npmrc` era doc-adiante, agora é doc-alinhado

A fase 1 (v0.9.79) documentava `.npmrc` como existente, mas o arquivo não estava versionado. Nesta fase 2, o `.npmrc` foi restabelecido no formato descrito abaixo — o **valor** do token nunca é commitado (fica em `NODE_AUTH_TOKEN` no ambiente do build).

> **Nota operacional (2026-07-24):** o `.npmrc` deve conter exatamente:
>
> ```
> @studio-ux-ds:registry=https://npm.pkg.github.com
> //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
> ```
>
> A sessão de execução desta frente não conseguiu escrever esse arquivo (path
> bloqueado pela sandbox) — Robson precisa criá-lo manualmente antes de qualquer
> `npm install` limpo. Sem ele, o `install.sh`/`upgrade.sh` vai retornar 401 na
> primeira execução em servidor novo.

### 2. Rota `/studio-ux-demo` sempre esteve dentro do Layout — mudou de casca legada para AppShell

A leitura pré-frente presumia que a rota era isolada. Grep mostrou que ela sempre viveu dentro do `<ProtectedRoute><Layout /></ProtectedRoute>`. A "isolação" era só visual (`--su-*` vs `--ap-*`). Isso deixou de importar: agora a casca é a AppShell do DS, e a rota do piloto vive nela sem alteração.

### 3. Sino de notificação vira sinal + link, não dropdown

O AppShell tem `onNotifications` (callback ao clicar) + `notifications` (contador). Optamos por:

- `notifications` = contador de não-lidas (polling 30s no `Layout.jsx` via `useNotificationsUnread`, mesma fonte do sino legado).
- `onNotifications` → `navigate('/automacao/notificacoes')`.
- Nenhuma tentativa de recriar o dropdown do sino legado (`NotificationsBell`) no AppShell — a tela de notificações tem tudo. Regressão consciente para reduzir escopo.

O `NotificationsBell.jsx` original foi mantido no repositório porque `Header.legacy.jsx` ainda o importa. Se `Layout.legacy` for definitivamente aposentado, o sino também sai.

### 4. Troca de senha migrou de modal-cross-tree para rota `/conta/senha`

O `Header` legado montava um `<Modal>` de troca de senha **fora do `<Outlet/>`**. Isso permitia empilhamento cross-tree com qualquer modal aberto na página filha — quebra da regra do DS (§283 do `COMPONENT_LIBRARY`). Rota dedicada elimina o empilhamento e limpa o menu de conta.

### 5. Sweep de Toast — exceção deliberada ao `workflow.consuming-system-adoption`

O `workflow.consuming-system-adoption@1.0.0` (herdado) proíbe adoção em lote — recomendação seria substituir a implementação de `lib/toast` **por dentro** (delegando ao `useToast()` do DS) sem tocar callsites. O dono do produto aprovou **sweep total** dos callsites como decisão consciente: 

> "Sweep total agora (exceção registrada) — Reescrever todos os callsites que importam de `lib/toast` para `useToast` do DS. Registrar exceção explícita ao `workflow.consuming-system-adoption` no ADR. Você assume o custo/risco."

O sweep será o passo 5 da frente. Até lá, o `UIToastContainer` local e o `lib/toast` seguem funcionais em coexistência com o `<ToastProvider>` do DS já montado.

### 6. Multi-tenant branding — fora do escopo desta frente

Nenhum resolver de branding por organização existe no `platform-admin` hoje. O `AuthContext` recebe `organization` mas só usa `.name` no Dashboard. O AppShell foi configurado com `customize={true}` para permitir personalização local pelo usuário (accent/tema/idioma/layout), mas a integração com branding por org fica para uma frente futura — quando o backend expuser essas preferências.

### 7. Ícones — mapeamento por proximidade, com fallback

O AppShell usa `DSIcon` interno, cuja biblioteca é curada e menor que a `lucide-react`. Mapeamento manual `lucide-react → DSIcon` em `Layout.jsx` (`LUCIDE_TO_DS`). Ícones sem equivalente exato caem em nomes razoáveis (ex.: `Zap → check`, `BrainCircuit → settings`, `Compass → search`). O DSIcon tem fallback próprio (`help`) — nada quebra. Ficará esteticamente genérico até a curadoria dos ícones evoluir junto com o próprio Studio UX.

## Pendências / dívida técnica registrada

| # | Item | Frente/momento |
|---|---|---|
| 1 | Criar `.npmrc` no `platform-admin/` (bloqueado pela sandbox nesta execução) | Robson faz manualmente — **antes do próximo deploy limpo** |
| 2 | ~~Sweep de `lib/toast` → `useToast()` do DS + remover `UIToastContainer`~~ | ✅ Concluído em 2026-07-24 (55 arquivos migrados; `lib/toast.js` e `UIToastContainer.jsx` esvaziados) |
| 3 | ~~9 páginas com modais siblings + estados independentes~~ → **as 3 do grupo IA foram resolvidas** pela regra do Modal (`IA/Ferramentas`, `IA/BasesConhecimento`, `IA/Aprovacoes`: os modais com `TextArea` viraram rota, o que dissolveu os estados concorrentes). Restam 6 fora do grupo IA: `WhatsApp/EquipesFilas`, `Automacao/FluxoCanvas`, `Automacao/FluxoEditor`, `Automacao/Fluxos`, `Integracoes/Conexoes`, `ISP/Incidentes` | Cada uma resolve na migração da sua família — a regra do Modal (DS v1.2.12) já dá o caminho |
| 4 | Instalação do `@studio-ux-ds/icons` (não está no `package.json`) | Quando a primeira família de tela migrar e precisar de ícones DS dentro do conteúdo |
| 5 | Migração das famílias de tela para o padrão visual do DS. **Concluídas: IA Studio** (v0.9.84→v0.9.91 — 6 telas + 2 sweeps), **ISP** (v0.9.92), **Automação inteira** (A: v0.9.99 · B: v0.10.2 · C: v0.10.4 — o canvas), **WhatsApp inteira** (v0.10.9 — 11 arquivos, com o contact center, o `fullBleed` do AppShell e o split do composer). Restam: **Configurações** (5), **Integrações** (6), **Recursos** (2), **Desenvolvedor** (2) — todas do padrão lista+form, sem layout especial | Uma sub-frente por família |
| 14 | **Infra de canvas/node-editor não existe no DS** — paleta de blocos, trilho recolhível, nó com conectores, inspetor persistente. Está escrita à mão em **dois** produtos (aqui e o `WorkflowCanvas` do AquaPark), então a divergência entre eles é garantida. O canvas daqui foi migrado usando os **tokens** do DS, mas a estrutura segue no consumidor. Registrado também no audit do DS (item G1 + B.1.1) | Decisão do dono do DS: entra como pattern do Studio UX ou fica sendo infra de produto? Não é bloqueio para nada agora |

### Regras do DS que nasceram desta adoção

A migração da família IA rendeu 5 releases do próprio Studio UX. Vale como referência ao migrar as próximas famílias — estas regras **já valem** e não precisam ser redescobertas:

| DS | O que passou a valer |
|---|---|
| v1.2.10 | `NumericInput` tem `fullWidth` (o default é largura natural) |
| v1.2.11 → v1.2.12 | **Modal não tem `TextArea`.** Teste mecânico, sem exceção de tamanho: se o form tem `TextArea`, é rota (`/…/nova`, `/…/:id/editar`). Modal aceita só `Input`/`NumericInput`/`Select`/`Combobox`/`Checkbox`/`Switch`/`RadioGroup`/`DatePicker`. `ConfirmDialog` (sem campo) segue Modal |
| v1.2.12 → v1.2.14 | **Taxonomia de ações em 3 lugares:** abre o registro → a linha (`onRowClick`, zero botão); age sobre 1+ registros → **barra de lote** (`bulkActions`); só existe dentro do registro → tela de destino. Ações **variam com a quantidade marcada**; `selectionMode="single"` quando nada pode ser feito em massa |
| v1.2.13 | `Button` tem `loading` (spinner real + `disabled` + `aria-busy`). Nunca fingir com `icon={saving ? 'loader-2' : …}` |
| v1.2.14 | `.su-input`/`.su-textarea`/`.su-select` preenchem o container (antes só dentro do `Field`); `.su-pagehead__actions` quebra linha |
| v1.2.15 → v1.2.16 | Seleção de linha do `DataTable` é `<input>` real: **quadrado = cabem vários, círculo = cabe um** (`selectionMode`). "Limpar" da barra de lote é `<button>`, não `<span onClick>` |
| v1.2.20 | **Opção em card** (`variant="card"` + `meta` no `Checkbox`/`Radio`): quando a opção tem explicação/condição própria, ela ganha moldura e a condição vai pro `meta` — não no meio do rótulo. Grade de opção usa `CheckGroup` (`columns` numérico = teto; `"auto"` = quantas couberem) |
| v1.2.21 | `Pagination` navegável por teclado, com **janela** de páginas (não só as 5 primeiras) + contagem via `total`/`itemLabel`. `itemLabel` aceita `[singular, plural]` — obrigatório em português (`execuçãos` não existe) |
| v1.2.22 | **`tone` é o nome do papel semântico em TODO componente** (`Badge`, `StatCard`, `Banner`) — `Badge status=` fica só como apelido legado. `Field` tem `required` (asterisco + "(obrigatório)" para leitor de tela) |
| v1.2.23 | **Rótulo de opção aceita `label` OU filho** — `<Checkbox>Segunda</Checkbox>` funciona (antes derrubava a página). `...rest` do DS nunca repassa `children` pro elemento |
| v1.2.31 | **`AppShell` tem `fullBleed`** — conteúdo sem espaçamento e sem rolagem própria, virando container flex de altura definida. É para **tela de trabalho contínuo** (conversa, canvas): sem ele o consumidor calcula altura à mão (`100dvh - 8.5rem`) com um número que erra quando a casca muda |
| v1.2.27 | **`StatCard` novo**: ícone à esquerda + degradê tonal; o `tone` pinta o entorno e **nunca o número**; `sub` para legenda neutra (o `delta` é a variação, e só ela leva cor). **Gradiente tonal e discreto passou a ser permitido** no DS (régua em `VISUAL_DNA` §6.4) |
| v1.2.26 | Glifos `power` e `zap` — o vocabulário de **operação** (ligar/desligar, gatilho), que faltava porque a curadoria de ícones nasceu vestindo tela de cadastro |
| v1.2.25 | **Accent também em canais RGB** (`--su-action-rgb`) — é o que permite o Tailwind do consumidor usar a cor do tema com opacidade, em vez de cravar hex. **`Breadcrumb` com `onNavigate`** (via `AppShell.onBreadcrumbNavigate`): item sem `href` não navega, `href` sem `onNavigate` recarrega a SPA — em app de página única os dois são obrigatórios |
| v1.2.24 | **Três containers, não dois:** Modal (leitura/campo curto) · **rota** (registro que existe por si) · **inspetor** = `Drawer` (propriedade de item dentro de um editor, sem URL própria, com o contexto precisando ficar à vista). `Drawer` tem `width` — 480+ para texto longo/JSON. Glifos `play`/`archive`/`save` |

**Armadilhas que custaram retrabalho e valem conferir antes de codar:**

- **Nome de ícone inexistente não quebra** — o `DSIcon` cai em `"help"` e renderiza um **"?"** silencioso. Confira contra `ICON_NAMES` + `ALIASES`. Não existem: `refresh-cw`, `server`, `loader-2` (este é alias pra `refresh` — ícone **estático**, não spinner).
- **CSS var inexistente não quebra** — não aplica e o elemento herda do pai. Os nomes certos são `--su-text-primary` e `--su-border-default` (**não** `--su-text`/`--su-border`).
- **`PageHeader` não tem `breadcrumb`** (ele vive na TopBar do AppShell, pelo mapa do `Layout`) e **`Card` não tem `title`** (viraria atributo HTML).
- **Campo "um por linha" com valor em array**: `join('\n')` no value + `split + filter(Boolean)` no onChange **apaga a quebra no mesmo keystroke** — o Enter não funciona. Guardar o texto cru em state local e converter no `blur` (ver `LinesTextArea` no `AgenteEditor.jsx`).
- **PROP MORTA é a armadilha mais cara — confira a assinatura real do componente antes de usar uma prop "óbvia".** React não avisa prop desconhecida em componente próprio: ela cai no `...rest` (virando atributo inválido no DOM) ou é simplesmente ignorada. O build passa, o console fica limpo, e **o resultado é plausível** — foi assim que 47 `<Badge tone=…>` ficaram cinza em 19 arquivos até a v1.2.22, atravessando validação visual. Casos já queimados: `Badge status` vs `tone` (resolvido), `Field required` (resolvido), `PageHeader breadcrumb` e `Card title` (não existem, nunca vão existir). O `Tabs` do DS usa **`value`**; o `Tabs` local usa `active` — trocar não dá erro, só nunca marca a aba.
  - **Pior variante: prop repassada cegamente pro DOM.** `<Checkbox>Segunda</Checkbox>` mandava `children` pro `<input>` (elemento vazio) → exceção no render → **página em branco**, sem casca nem menu (`/automacao/calendarios/novo`, v0.9.99). Resolvido no DS v1.2.23 (`label` e `children` equivalentes), mas a lição fica: **tela branca numa rota nova quase sempre é prop indo pro lugar errado**, não erro de dado nem de permissão. Abra o console antes de investigar API.
- **Coexistência de padrão visual pede uma FONTE de cor, não duas.** Enquanto telas migradas e não-migradas convivem, a cor de ação tem que sair de um lugar só: `--ap-accent` e a cor `brand` do Tailwind **herdam** `--su-action` (v0.10.3). Cravar hex no `tailwind.config` é o que produzia o botão verde numa tela e azul na do lado — e não se resolve tela por tela, se resolve na origem.
- **Não confie que o breadcrumb navega — confira.** Item sem `href` é texto; `href` sem `onNavigate` recarrega a SPA. Ao migrar uma tela de detalhe, **mantenha o Voltar/Cancelar visível** de qualquer jeito: é a saída que o usuário acha primeiro, e não depende de o topo estar certo.
- **Antes de improvisar um estado ou variante**, pergunte: *"a spec já prevê isso e o adapter não expõe?"* Nos 8 casos desta adoção a resposta foi sim — e em 3 deles a spec estava certa desde a v1.0.0 (inclusive o anti-padrão "breadcrumb que não navega", que estava escrito e acontecendo).
| 6 | Multi-tenant branding via Customize (accent/tema por organização) | Quando o backend expuser as preferências por org |
| 7 | Aposentar **`components/Layout/Header.jsx`** (288 linhas, ninguém importa) e **`components/Layout/NotificationsBell.jsx`** (135 linhas, importado *só* pelo Header). Ficaram **fora** da limpeza do item 12 de propósito: o `NotificationsBell` é a referência viva do item 8 (trazer o dropdown do sino de volta num `Drawer`) — apagando, ele só existe no git, o que é resgatável mas cobra atrito na hora. Decida junto do item 8: se o dropdown vai voltar, mantenha; se não vai, os dois caem juntos | Depende da decisão do item 8, não de validação |
| 8 | Regressão do dropdown do sino de notificações — hoje o AppShell só oferece um sinal + link direto para `/automacao/notificacoes` (ADR §3). Se você quiser o dropdown de volta, precisa de sub-frente que extraia o conteúdo do `NotificationsBell.jsx` para um `<Drawer>` do DS acionado pelo `onNotifications` | Sub-frente futura, opcional |
| 9 | ~~`DELETE` de base de conhecimento não existe no backend~~ → **movido para [`docs/divida-tecnica.md`](divida-tecnica.md) como `DT-003`**. Não é do DS: é buraco de backend que a migração só revelou. Critério do Robson em 2026-07-25: *o que não é responsabilidade do DS vive na dívida técnica do IA Studio* | — |
| 11 | ~~`upgrade.sh` movia o marcador de versão antes de construir~~ ✅ **Resolvido na v0.9.96** (2026-07-25): `revert_checkout()` volta o repo para a versão de origem quando a falha acontece depois do checkout, com duas linhas `[ROLLBACK]` no log; e o script passou a se copiar para `/tmp` antes de tocar no git (o `git checkout` reescrevia o próprio `upgrade.sh` em execução). Registro completo em [`docs/divida-tecnica.md`](divida-tecnica.md) → Resolvidos | — |
| 12 | **Limpeza dos backups e órfãos da migração — 24 arquivos.** Inventário conferido em 2026-07-25 (nenhum deles é importado por código vivo; as únicas menções eram 3 comentários, já corrigidos): **20 `*.legacy.jsx`** (backup de rollback das famílias migradas), **`editor/NodeConfigModal.jsx`** + **`editor/ExecuteModal.jsx`** (substituídos pelo `NodeInspector`/`ExecuteDrawer` na v0.10.2) e **`lib/toast.js`** + **`components/ui/UIToastContainer.jsx`** (esvaziados no sweep do toast — 4 e 5 linhas de nada). O histórico mora no git; `.legacy` ao lado do arquivo vivo é lixo, e o CLAUDE.md proíbe. **O comando PowerShell está pronto e foi entregue ao Robson** — o ambiente do assistente cria e edita arquivo no disco dele, mas não remove. Nota: as 3 telas de log da Automação **não** têm `.legacy.jsx` (foram reescritas no lugar). | `Remove-Item` único — depende só de você considerar as famílias IA + ISP + Automação A/B validadas |
| 10 | ~~`is_active` no cadastro de servidor MCP é recusado pelo backend~~ → **movido para [`docs/divida-tecnica.md`](divida-tecnica.md) como `DT-004`**. Decisão de produto, não do DS | — |

## Rollback

Se qualquer parte desta frente causar regressão em produção, o rollback é
trocar o import correspondente em `App.jsx`:

- Casca: `import Layout from './components/Layout/Layout.legacy';` (arquivo importa `Sidebar.legacy` + `Header.legacy` — cadeia completa).
- Dashboard: `import Dashboard from './pages/Dashboard.legacy';`.
- Rota `/conta/senha`: excluir a rota do `App.jsx`. O modal de troca de senha volta a viver no `Header.legacy` (que só é usado se o Layout legado for reativado).
- `.npmrc` e `main.jsx`: reversão dos dois é 5 linhas cada — vale documentar caso a caso, não vale duplicar aqui.

## Pré-requisito operacional — autenticar no GitHub Packages

Os pacotes são **privados** (org `studio-ux-ds`). Para o `npm install` baixá-los, o ambiente precisa de um token do GitHub com escopo **`read:packages`**.

**Fonte única do token:** `${API_DIR}/.env` (`/opt/iastudio/platform-api/.env`), variável `NODE_AUTH_TOKEN`. Nada de `.bashrc`, nada de `ecosystem.config.js`, nada de export manual — o `upgrade.sh` (a partir de v0.9.81) faz `source .env` antes de qualquer `npm install`, então o valor fica visível para os builds do platform-api, platform-admin e platform-console.

1. Gere um token clássico no GitHub (Settings → Developer settings → Personal access tokens → Classic) com o escopo **`read:packages`**. Copie o `ghp_...` (só aparece uma vez).

2. O `.npmrc` do `platform-admin` (versionado) referencia esse token por variável de ambiente (não guarda segredo):

   ```
   @studio-ux-ds:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   ```

3. **Adicionar o token no `.env` do platform-api** — o `install.sh` (a partir de v0.9.81) pergunta durante instalação limpa (`--npm-token=...` também aceito em modo headless). Em instalação já existente, adicionar manualmente:

   ```bash
   echo "NODE_AUTH_TOKEN=ghp_seu_token_read_packages" >> /opt/iastudio/platform-api/.env
   ```

   Reiniciar o backend para o Nest recarregar `.env` (o painel de Atualização lê a var via `source .env` do upgrade.sh — mas se você aplicar antes do reload, o backend passa env do PM2 já herdada; garante-se com `pm2 delete + pm2 start ecosystem.config.js`):

   ```bash
   cd /opt/iastudio/platform-api
   pm2 delete iastudio-api iastudio-worker && pm2 start ecosystem.config.js && pm2 save
   ```

   Sem essa variável, o `npm install` dos `@studio-ux-ds/*` retorna **401** e o build aborta (fail-safe — a produção fica na versão anterior).

## Nota sobre o build (Vite)

O adapter `@studio-ux-ds/react` é distribuído como **fonte JSX** (runtime descartável — o produto transpila). O Vite 5 + `@vitejs/plugin-react` pré-empacota dependências com esbuild, que lida com `.jsx` automaticamente. Se algum dia o pré-empacotamento reclamar, a alternativa é adicionar `optimizeDeps: { include: ['@studio-ux-ds/react'] }` no `vite.config.js`.
