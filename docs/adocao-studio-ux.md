# Adoção do Studio UX no IA Studio

> Como o `platform-admin` consome o design system **Studio UX** (pacotes
> `@studio-ux-ds/*`, publicados no GitLab da Nivoo).
> Documento vivo — descreve o estado atual, não o histórico. A frente é
> governada por [`ia-studio.studio-ux-adoption@1.0.0`](prompt-framework/especialidades/adocao-studio-ux.md)
> (extends `workflow.consuming-system-adoption@1.0.0`).

## Estado atual — legado visual extinto (2026-07-27, v0.10.26 / DS ^1.2.49)

O `platform-admin` opera com a **casca AppShell do Studio UX** e o **Dashboard**
migrado para `PageHeader` + `StatCard` + `Card` do DS. O piloto isolado
`/studio-ux-demo` (fase v0.9.79) continua funcional dentro da casca nova — nada
foi removido dele.

**Famílias já no padrão DS:** IA Studio (6 telas), ISP (2 telas), **Automação
inteira** — sub-frentes A (os 3 logs + Agendamentos + Templates), B (Fluxos +
editor de passos + `editor/*`) e C (o canvas) —, **WhatsApp inteira** (11
arquivos, com o contact center) e **Integrações inteira** (v0.10.11: Marketplace,
Conexões, Cofre + as três rotas que nasceram dos modais), **Recursos** e
**Desenvolvedor** (v0.10.13) e **as 8 últimas telas** (v0.10.16: pessoas, perfis
— com editor em rota —, workspaces, auditoria, minha conta, mais as três públicas:
login, aceitar convite e página de pagamento).

**As telas de acesso e de aviso instanciam moldes do DS** (v0.10.21 / DS ^1.2.40):
login e aceitar convite usam `AuthScreen` (o molde `login`), 404 e sem-permissão
usam `MessageScreen` (o molde `empty` de tela inteira). Na v0.10.16/v0.10.20 essas
quatro nasceram escritas à mão — os moldes existiam especificados e materializados
em HTML, mas **não em React**, e nada me levou até eles. Antes de escrever qualquer
tela de classe recorrente, consultar a tabela de moldes materializados em
`STUDIO_UX_TEMPLATES` §Estado da implementação.

**Não resta tela nem componente no padrão antigo.** A pasta `components/ui/`
ficou sem consumidor na v0.10.17, quando o `PhoneInput` do DS ganhou o seletor de
país de verdade (DS v1.2.38) — era a última razão para mantê-la. O `--ap-*` vive
só no `index.css`, onde `--ap-accent` herda `--su-action` (e duas menções em
comentário, contando o que foi consertado). Desde a v0.10.3 a **cor de ação é
única** no painel todo.

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
| Deps | `@studio-ux-ds/tokens`, `@studio-ux-ds/components`, `@studio-ux-ds/icons`, `@studio-ux-ds/react` (`^1.2.49`) — o `icons` é **peerDependency** do `react` e passou a ser declarado na v0.10.18 |
| `.npmrc` | Aponta `@studio-ux-ds` para o GitLab da Nivoo, token via `GITLAB_PACKAGE_TOKEN`. **Sem BOM** — o arquivo começa em `@studio`. |
| `main.jsx` | Importa `tokens.css` + `components.css`, chama `configureTheme({ namespace: 'ia-studio' })` + `applyTheme()`, envolve o app com `<ToastProvider>` do DS |
| `ThemeContext.jsx` | Wrapper fino do mecanismo de tema do DS. Fonte única = DS (chaves namespaçadas `ia-studio_su_*`); espelha `.dark` no `<html>` para compatibilidade com telas Tailwind com `dark:`; `MutationObserver` sincroniza estado quando o AppShell/Customize trocam o tema |
| `Layout.jsx` | Casca via `AppShell` do DS. Slots: brand, nav (grupos com filtro por permissão), version, breadcrumb, topbarContext (seletor de workspace + badge de ambiente), user, userMenuItems (Minha conta, Trocar senha), `onNotifications` (redireciona pra `/automacao/notificacoes`), `notifications` (polling 30s), `customize` (painel embutido), `onLogout` |
| `Dashboard.jsx` | Primeira tela após login. `PageHeader` + 4 `StatCard` + `Card` com Badge de status do plano |
| `ContaSenha.jsx` (rota `/conta/senha`) | Nova. Substitui o modal de troca de senha que vivia no `Header` legado — elimina o empilhamento cross-tree modal-fora-do-outlet |
| Piloto `/studio-ux-demo` | Preservado sem alteração. Renderiza dentro do AppShell |

### Coexistência de padrões

- **CSS.** Não há mais coexistência: tudo em `--su-*`. O `--ap-*` sobreviveu apenas no `index.css`, onde `--ap-accent` herda `--su-action` (compatibilidade do Tailwind).
- **Toast.** Fonte única: `<ToastProvider>` do DS montado no `main.jsx`. Todos os 55 callsites do painel consomem `useToast()` diretamente. `lib/toast.js` e `UIToastContainer.jsx` foram esvaziados (marcados para remoção) — passo 5 concluído em 2026-07-24.
- **Tema.** O DS é a fonte única. `ThemeContext` reflete o estado do DS + espelha `.dark` no HTML. Telas com `dark:` do Tailwind continuam funcionando.
- **Ícones.** O mapa `LUCIDE_TO_DS` foi **eliminado** na v0.10.20: cada item do menu declara o glifo do DS direto (`icon: 'coin'`). O mapa traduzia "por proximidade semântica" e, sem vocabulário de navegação no catálogo, colapsava 30 itens em 7 glifos — sem nunca cair no `|| 'help'`, porque havia sempre um glifo "mais ou menos". Hoje: **38 glifos distintos em 40 itens**, as duas repetições deliberadas.

  **Nenhum arquivo do painel importa ícone de fora** (v0.10.22): a dependência `lucide-react` saiu do `package.json`. Era o resto mais teimoso da adoção — 62 arquivos, medidos em 2026-07-27, por dois motivos que não eram descuido: 57 desenhavam o próprio *spinner* porque o `Spinner` do DS não tinha `size` nem arranjo centrado, e o resto vivia no composer de áudio do WhatsApp, cujo vocabulário (gravar, pausar, foto, duração) o catálogo não cobria. As duas causas viraram DS v1.2.41 (`Spinner size`/`center` + 10 glifos de mídia/gravação) antes de qualquer troca aqui.

  **Remover a dependência foi três lugares, não dois** (v0.10.23): o código, o `package.json` e **tudo que a nomeia por string**. O `manualChunks: { 'vendor-icons': ['lucide-react'] }` do `vite.config.js` ficou para trás e **derrubou o build da v0.10.22** com `Could not resolve entry module` — `manualChunks` nomeia um módulo de *entrada*, e nenhuma busca por `import … from` o encontra. O `grep` certo é pelo **nome do pacote no repositório inteiro** (fora `node_modules` e `dist`). O Console SaaS citado nesta nota foi removido no S3.

  **Ícone é NOME, nunca componente.** `<CollapsedRail icon="layers" />` e `{ icon: 'camera' }` — não `icon={Layers}`. Guardar componente era exatamente o que obrigava dois arquivos a manter a outra biblioteca viva: precisavam de algo que se pudesse passar como valor. E foi onde o sweep quase quebrou o sistema: a troca mecânica removeu os `import` e deixou as referências vivas, o que daria tela em branco no trilho do canvas e no menu de anexo — sem erro de build.
- **Moldes de tela.** Os **9** existem em React (DS v1.2.46). Instanciados aqui: `ListScreen`, `AuthScreen` (login + convite), `MessageScreen` (404 + sem-permissão) e **`FormScreen` em 9 editores** (v0.10.24), mais **`FormRow` em 5 linhas de ação** (v0.10.25) e **`DetailScreen` em 5 telas de registro** (v0.10.26). Faltam adotar: `dashboard` (3), `wizard` (`ConexaoNova`), `list` em ~5 que ainda montam tabela à mão, e os 3 editores grandes com abas (`AgenteEditor`, `IncidenteEditor`, `AberturaChamado`).

  **A família `detail` foi a primeira a não pedir nada ao DS** — as cinco couberam no `DetailScreen` como ele já era. É o sinal que se procura numa adoção: quando o consumidor para de precisar evoluir o DS a cada família, o molde amadureceu.

  **"Voltar" é do molde, não das ações.** Nas cinco ele era um `Button variant="secondary"` no meio das ações do registro, competindo com Editar e Excluir — três botões cinzas em que o de sair parecia mais uma operação. No cabeçalho ficam só as ações que agem sobre o registro.

  **Dentro de um `FormScreen`, botão sem `type` envia o formulário.** O DS passou a nascer com `type="button"` (v1.2.47) exatamente por isso — foi achado na lixeira de "remover membro" do `EquipeEditor`, que salvaria a equipe e navegaria, sem erro nenhum. Diálogo e overlay ficam **fora** do `FormScreen`, senão o Enter deles submete tudo.

  **A adoção devolveu três coisas ao DS antes de qualquer improviso aqui:** o `type="button"`, o `canSubmit` (sem permissão o Salvar não aparece) e o `bare` (formulário cujas seções já são cartões). É o loop de sempre — onde o consumidor sairia do DS, o DS ganha a peça.

## ADR — decisões da fase 2

### 1. `.npmrc` era doc-adiante, agora é doc-alinhado

A fase 1 (v0.9.79) documentava `.npmrc` como existente, mas o arquivo não estava versionado. O `.npmrc` é versionado; o **valor** do token nunca é commitado (fica em `GITLAB_PACKAGE_TOKEN` no ambiente do build).

> **Nota operacional (2026-07-24):** o `.npmrc` deve conter exatamente:
>
> ```
> @studio-ux-ds:registry=https://git.nivoo.dev.br/api/v4/projects/1/packages/npm/
> //git.nivoo.dev.br/api/v4/projects/1/packages/npm/:_authToken=${GITLAB_PACKAGE_TOKEN}
> ```
>
> Criado em 2026-07-24. **Nota de 2026-07-26:** o arquivo está gravado **com BOM**
> (`EF BB BF` antes do `@`), o que pode fazer o npm ignorar a linha do `registry`,
> cair no registry público e devolver 404 nos pacotes `@studio-ux-ds`. Hoje
> funciona (o npm tolera), mas é frágil — reescrever em UTF-8 sem BOM. O caminho é
> protegido para o assistente, então é ação manual.

### 2. Rota `/studio-ux-demo` sempre esteve dentro do Layout — mudou de casca legada para AppShell

A leitura pré-frente presumia que a rota era isolada. Grep mostrou que ela sempre viveu dentro do `<ProtectedRoute><Layout /></ProtectedRoute>`. A "isolação" era só visual (`--su-*` vs `--ap-*`). Isso deixou de importar: agora a casca é a AppShell do DS, e a rota do piloto vive nela sem alteração.

### 3. Sino de notificação vira sinal + link, não dropdown

O AppShell tem `onNotifications` (callback ao clicar) + `notifications` (contador). Optamos por:

- `notifications` = contador de não-lidas (polling 30s no `Layout.jsx` via `useNotificationsUnread`, mesma fonte do sino legado).
- `onNotifications` → `navigate('/automacao/notificacoes')`.
- Nenhuma tentativa de recriar o dropdown do sino legado (`NotificationsBell`) no AppShell — a tela de notificações tem tudo. Regressão consciente para reduzir escopo.

**Decidido por ação em 2026-07-26:** o `NotificationsBell.jsx` foi excluído junto dos demais órfãos, então o sino segue como sinal + link. Trazer o dropdown de volta significa recuperar o conteúdo do histórico do git e pô-lo num `Drawer` — sub-frente própria, se você quiser.

### 4. Troca de senha migrou de modal-cross-tree para rota `/conta/senha`

O `Header` legado montava um `<Modal>` de troca de senha **fora do `<Outlet/>`**. Isso permitia empilhamento cross-tree com qualquer modal aberto na página filha — quebra da regra do DS (§283 do `COMPONENT_LIBRARY`). Rota dedicada elimina o empilhamento e limpa o menu de conta.

### 5. Sweep de Toast — exceção deliberada ao `workflow.consuming-system-adoption`

O `workflow.consuming-system-adoption@1.0.0` (herdado) proíbe adoção em lote — recomendação seria substituir a implementação de `lib/toast` **por dentro** (delegando ao `useToast()` do DS) sem tocar callsites. O dono do produto aprovou **sweep total** dos callsites como decisão consciente: 

> "Sweep total agora (exceção registrada) — Reescrever todos os callsites que importam de `lib/toast` para `useToast` do DS. Registrar exceção explícita ao `workflow.consuming-system-adoption` no ADR. Você assume o custo/risco."

Sweep concluído em 2026-07-24; `lib/toast.js` e `UIToastContainer.jsx` foram excluídos com os demais órfãos em 2026-07-26.

### 6. Multi-tenant branding — fora do escopo desta frente

Nenhum resolver de branding por organização existe no `platform-admin` hoje. O `AuthContext` recebe `organization` mas só usa `.name` no Dashboard. O AppShell foi configurado com `customize={true}` para permitir personalização local pelo usuário (accent/tema/idioma/layout), mas a integração com branding por org fica para uma frente futura — quando o backend expuser essas preferências.

### 7. Ícones — mapeamento por proximidade, com fallback

O AppShell usa `DSIcon` interno, cuja biblioteca é curada e menor que a `lucide-react`. Mapeamento manual `lucide-react → DSIcon` em `Layout.jsx` (`LUCIDE_TO_DS`). Ícones sem equivalente exato caem em nomes razoáveis (ex.: `Zap → check`, `BrainCircuit → settings`, `Compass → search`). O DSIcon tem fallback próprio (`help`) — nada quebra. Ficará esteticamente genérico até a curadoria dos ícones evoluir junto com o próprio Studio UX.

## Pendências / dívida técnica registrada

| # | Item | Frente/momento |
|---|---|---|
| 1 | ~~Criar `.npmrc`~~ ✅ **criado** (2026-07-24). **MAS o arquivo tem BOM (`EF BB BF`) na primeira linha** — o npm pode ignorar a linha do `registry`, cair no registry público e falhar com 404 nos pacotes `@studio-ux-ds`. Funciona hoje porque o npm tolera, mas é frágil: reescrever sem BOM (comando entregue em 2026-07-26). O caminho é protegido para o assistente | Robson: reescrever sem BOM |
| 2 | ~~Sweep de `lib/toast` → `useToast()` do DS + remover `UIToastContainer`~~ | ✅ Concluído em 2026-07-24 (55 arquivos migrados; `lib/toast.js` e `UIToastContainer.jsx` esvaziados) |
| 3 | ~~9 páginas com modais siblings + estados independentes~~ → **as 3 do grupo IA foram resolvidas** pela regra do Modal (`IA/Ferramentas`, `IA/BasesConhecimento`, `IA/Aprovacoes`: os modais com `TextArea` viraram rota, o que dissolveu os estados concorrentes). Resolvidas também nas famílias seguintes; `Integracoes/Conexoes` era o caso extremo (**quatro** modais siblings) e caiu na v0.10.11 — detalhe, edição e passo a passo viraram rota, e a escolha do conector virou o primeiro passo | Cada uma resolve na migração da sua família — a regra do Modal (DS v1.2.12) já dá o caminho |
| 4 | ~~Instalação do `@studio-ux-ds/icons`~~ ✅ **declarado na v0.10.18**. Ele é **peerDependency** do `@studio-ux-ds/react`, então o npm 7+ instalava por conta — funcionava por tolerância do gerenciador, não por declaração. Agora está explícito | — |
| 5 | ~~Migração das famílias de tela~~ ✅ **CONCLUÍDA** (v0.9.84 → v0.10.17). Todas as famílias no DS, mais as 3 telas públicas. `components/ui/` extinta; nenhum `--ap-*` em código vivo (só no `index.css`, onde `--ap-accent` herda `--su-action`) | — |
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
| v1.2.49 | **`FormRow`** — a linha de ação de um formulário (campos + botão). O `flex items-end` à mão alinhava pela BASE (dica empurrava o controle do vizinho), `flex:1` esticava o campo até a borda, e a dica embaixo torcia a linha. Agora os campos alinham pelo **topo** e a ação usa uma **etiqueta fantasma** — cai na linha dos controles **por medição**. `<Field grow>` marca o campo principal, que cresce até um teto de leitura. **`marginBottom` cravado num botão é sintoma de arranjo errado, não de botão errado.** Junto dela veio (na v1.2.47) **`Button` e `IconButton` nascendo `type="button"`** — em HTML, botão sem `type` dentro de `<form>` é **submit**, então a lixeira de "remover membro" salvaria a equipe e navegaria. Nada avisa: é HTML correto. Também `FormScreen.canSubmit` (sem permissão o Salvar não é renderizado) e `FormScreen.bare` (formulário cujas seções já são cartões). **Envolver algo num `<form>` muda o significado do que já estava dentro** |
| v1.2.47 | **`Button` e `IconButton` nascem `type="button"`** + `FormScreen.canSubmit` + `FormScreen.bare` (a linha acima resume as duas releases; a v1.2.47 é esta parte) |
| v1.2.46 | **Os 6 moldes que faltavam** (`DetailScreen`, `FormScreen`, `DashboardScreen`, `SearchScreen`, `SettingsScreen`+`SettingsSection`, `WizardScreen`) — os 9 de `TEMPLATES` §2 agora existem em React. Cada um com o **"quando NÃO usar"** na spec, que é parte do molde: passo a passo para campos independentes PIORA a tela |
| v1.2.41 | **10 glifos de MÍDIA/GRAVAÇÃO** (`mic`, `pause`, `music`, `image`, `camera`, `file-text`, `clock`, `sliders`, `rotate`, `check-double`) + **`Spinner` com `size` (`sm`/padrão/`lg`) e `center`**. A cor do spinner segue **não-configurável** de propósito. `ICONOGRAPHY` §4.1 ganhou o Corolário II: a falta de glifo também se mede pelo **`import`** de outra biblioteca no consumidor, não só pela repetição no menu — o diagnóstico é um `grep` |
| v1.2.40 | **`AuthScreen` (+ `AuthLink`) e `MessageScreen`** — os moldes `login` e `empty`-de-tela-inteira em React. Existiam especificados em `STUDIO_UX_TEMPLATES` §2 e materializados no gerador HTML, mas **não na camada que este painel consome**, então eu escrevi as quatro telas à mão. **Especificação sem materialização na camada do consumidor não é adotada** — ela só existe para quem já sabe que existe. A tabela de moldes materializados em React agora é explícita na §Estado da implementação, e consultá-la é passo obrigatório |
| v1.2.35 | **`FormGrid`** — o arranjo de um formulário (colunas por `auto-fill`, sem media query; `columns` é **teto**) + `Field wide` para o campo de texto longo. Alinha pelo **TOPO**: campo com dica é mais alto, e alinhar pela base empurra o controle de quem tem dica para cima. Numa linha de busca, a dica vira `placeholder` e o botão fica **dentro** do campo. Nasceu de 20 grids à mão em 12 arquivos e 16 larguras máximas diferentes |
| v1.2.34 | **Nome de ícone dentro do próprio DS é verificado no gate de publicação.** O `DSIcon` degrada de propósito (nome inválido → "?" + aviso no console), o que protege o consumidor mas **inverte quem descobre o erro**: o aviso sai no console de quem usa, e o build de quem publica passa limpo. Foram 4 nomes inexistentes de uma vez — `circle-check`/`alert-triangle` no `Banner` e `adjustments`/`menu-2` (o hambúrguer do mobile!) no `AppShell`. Consumidor pode errar e ser avisado; o DS não pode errar o próprio vocabulário |
| v1.2.33 | **`Tabs` avisa quando um item vem sem `id`** — item é `{ id, label }`; `value` é a prop da aba ATIVA. Sem `id` nenhuma aba casa, o `onChange` devolve `undefined` e o conteúdo some ao clicar. Prop morta **dentro de um array de dados**, que a assinatura do componente não protege |
| v1.2.32 | **`CopyButton`** (+ glifo `copy`) — "valor técnico + botão de copiar" é um par recorrente, e copiar são **três** coisas: o `try/catch`, o **fallback** para contexto sem Clipboard API e o aviso. Cada tela acertava a primeira e esquecia a segunda; sem fallback o clique não faz nada e não diz nada. A confirmação é **no próprio botão** (ícone vira ✓, rótulo vira "Copiado" por 2 s), não em toast no canto |
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
- **Cor traduzida por um mapa "de/para" engole o que não conhece.** A ponte `lib/tone.js` converte o `variant` legado em `tone`, com `|| 'neutral'` no fim. `TOKEN_EXPIRED` era `'orange'`, que não está no mapa — resultado: o estado mais urgente da tela de Conexões (credencial vencida) era o único cinza, e ninguém percebeu porque cinza é uma cor plausível. Ao migrar uma família, **faça o mapa dela declarar `tone` direto** em vez de passar pela ponte: aí não existe "papel desconhecido" para engolir.
- **Um `catch` que chama `toast` sem `useToast()` no arquivo troca o erro por outro erro.** Dois casos vivos foram encontrados na família Integrações (`Marketplace.load` e o modal de rotação do Cofre): o `ReferenceError: toast is not defined` só acontece quando a chamada falha, que é exatamente quando ninguém está com o console aberto. Ao migrar, confira se **todo** componente do arquivo — inclusive os auxiliares no fim — tem o hook, e não só o componente principal.
- **`Switch` do DS não tem rótulo, e o `onChange` dele entrega o BOOLEANO, não o evento.** Escrever `onChange={(e) => patch({ x: e.target.checked })}` num `Switch` lança exceção ao clicar (`e.target` é `undefined`). Mas antes disso: campo de formulário que só vale ao salvar é **`Checkbox variant="card"`** com `label` + `meta` (padrão da v1.2.20), não `Switch` — `Switch` é para alternância de efeito imediato.
- **Antes de escrever uma tela de classe recorrente (acesso, aviso, lista, detalhe, formulário, busca, assistente de passos), confira a tabela de moldes** em `STUDIO_UX_TEMPLATES` §Estado da implementação. Só 3 dos 9 estão em React; os outros 6 existem como HTML no gerador — e "existe em HTML" foi exatamente o que não me impediu de escrever login, aceitar convite, 404 e sem-permissão do zero. **Componente que falta você percebe por erro; molde que falta você não percebe por nada** — a tela sai plausível.
- **Antes de improvisar um estado ou variante**, pergunte: *"a spec já prevê isso e o adapter não expõe?"* Nos 8 casos desta adoção a resposta foi sim — e em 3 deles a spec estava certa desde a v1.0.0 (inclusive o anti-padrão "breadcrumb que não navega", que estava escrito e acontecendo).
| 6 | Multi-tenant branding via Customize (accent/tema por organização) | Quando o backend expuser as preferências por org |
| 7 | ~~Aposentar `Header.jsx` + `NotificationsBell.jsx`~~ ✅ **excluídos** (2026-07-26), junto dos 13 órfãos. Com isso o item 8 foi decidido por ação: o dropdown do sino **não volta** por enquanto — o conteúdo dele vive só no histórico do git | — |
| 8 | **Dropdown do sino — decidido por ação:** o `NotificationsBell.jsx` foi excluído, então hoje o sino é sinal + link para `/automacao/notificacoes` (ADR §3) e assim fica. Se um dia voltar, é sub-frente própria que recupera o conteúdo do git e o põe num `Drawer` do DS | Fechado (reabre se você quiser o dropdown) |
| 9 | ~~`DELETE` de base de conhecimento não existe no backend~~ → **movido para [`docs/divida-tecnica.md`](divida-tecnica.md) como `DT-003`**. Não é do DS: é buraco de backend que a migração só revelou. Critério do Robson em 2026-07-25: *o que não é responsabilidade do DS vive na dívida técnica do IA Studio* | — |
| 11 | ~~`upgrade.sh` movia o marcador de versão antes de construir~~ ✅ **Resolvido na v0.9.96** (2026-07-25): `revert_checkout()` volta o repo para a versão de origem quando a falha acontece depois do checkout, com duas linhas `[ROLLBACK]` no log; e o script passou a se copiar para `/tmp` antes de tocar no git (o `git checkout` reescrevia o próprio `upgrade.sh` em execução). Registro completo em [`docs/divida-tecnica.md`](divida-tecnica.md) → Resolvidos | — |
| 12 | ~~Limpeza dos órfãos~~ ✅ **FEITA** (2026-07-26). 20 `.legacy.jsx` + 13 arquivos (os 8 de `components/ui/`, `Header`/`Sidebar`/`NotificationsBell` e os 2 modais de assistente). Conferido depois: **nenhum import quebrado** em toda a `src`. `AgentVersionsModal.jsx` ficou de propósito — é vivo (usado por `AgenteEditor` e `Agentes`) | — |
| 10 | ~~`is_active` no cadastro de servidor MCP é recusado pelo backend~~ → **movido para [`docs/divida-tecnica.md`](divida-tecnica.md) como `DT-004`**. Decisão de produto, não do DS | — |

## Rollback

Se qualquer parte desta frente causar regressão em produção, o rollback é
trocar o import correspondente em `App.jsx`:

- Casca: `import Layout from './components/Layout/Layout.legacy';` (arquivo importa `Sidebar.legacy` + `Header.legacy` — cadeia completa).
- Dashboard: `import Dashboard from './pages/Dashboard.legacy';`.
- Rota `/conta/senha`: excluir a rota do `App.jsx`. O modal de troca de senha volta a viver no `Header.legacy` (que só é usado se o Layout legado for reativado).
- `.npmrc` e `main.jsx`: reversão dos dois é 5 linhas cada — vale documentar caso a caso, não vale duplicar aqui.

## Pré-requisito operacional — autenticar no GitLab da Nivoo

Os pacotes são **privados** (org `studio-ux-ds`). Para o `npm install` baixá-los, o ambiente precisa de um token do GitHub com escopo **`read:packages`**.

**Fonte única do token:** `${API_DIR}/.env`, variável `GITLAB_PACKAGE_TOKEN`. Nada de `.bashrc`, nada de `ecosystem.config.js`, nada de export manual — o `upgrade.sh` faz `source .env` antes de qualquer `npm install`, então o valor fica visível para os builds do platform-api e platform-admin.

1. Gere um token clássico no GitHub (Settings → Developer settings → Personal access tokens → Classic) com o escopo **`read:packages`**. Copie o `ghp_...` (só aparece uma vez).

2. O `.npmrc` do `platform-admin` (versionado) referencia esse token por variável de ambiente (não guarda segredo):

   ```
   @studio-ux-ds:registry=https://git.nivoo.dev.br/api/v4/projects/1/packages/npm/
   //git.nivoo.dev.br/api/v4/projects/1/packages/npm/:_authToken=${GITLAB_PACKAGE_TOKEN}
   ```

3. **Adicionar o token no `.env` do platform-api** — o `install.sh` pergunta durante instalação limpa (`--gitlab-package-token=...` também aceito em modo headless). Em instalação já existente, adicionar manualmente:

   ```bash
   echo "GITLAB_PACKAGE_TOKEN=seu_token_de_leitura" >> /opt/iastudio/platform-api/.env
   ```

   Reiniciar o backend para o Nest recarregar `.env` (o painel de Atualização lê a var via `source .env` do upgrade.sh — mas se você aplicar antes do reload, o backend passa env do PM2 já herdada; garante-se com `pm2 delete + pm2 start ecosystem.config.js`):

   ```bash
   cd /opt/iastudio/platform-api
   pm2 delete iastudio-api iastudio-worker && pm2 start ecosystem.config.js && pm2 save
   ```

   Sem essa variável, o `npm install` dos `@studio-ux-ds/*` retorna **401** e o build aborta (fail-safe — a produção fica na versão anterior).

## Nota sobre o build (Vite)

O adapter `@studio-ux-ds/react` é distribuído como **fonte JSX** (runtime descartável — o produto transpila). O Vite 5 + `@vitejs/plugin-react` pré-empacota dependências com esbuild, que lida com `.jsx` automaticamente. Se algum dia o pré-empacotamento reclamar, a alternativa é adicionar `optimizeDeps: { include: ['@studio-ux-ds/react'] }` no `vite.config.js`.
