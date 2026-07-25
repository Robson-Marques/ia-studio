# Changelog — IA Studio

## v0.9.90 - 2026-07-24 (Assistentes migrado — família IA Studio 6/6 CONCLUÍDA)

Sem `db push`. Só frontend. **Última tela da família.** Era a maior: um Modal `size="xl"` com 8 abas e ~12 `TextArea` dentro.

### Assistentes (`pages/IA/Agentes.jsx`)

A tela virou **só listagem**. Tudo que era overlay ou state saiu:

- **`AgentEditorModal` (8 abas, ~12 `TextArea`) → rotas `/ia/agentes/nova` e `/ia/agentes/:id`** (`AgenteEditor.jsx`). Era o caso mais extremo da regra do Modal do DS: a pessoa escreve a personalidade (sempre/nunca), o objetivo, a descrição de cada passo, o "faça" de cada situação, as instruções adicionais e as palavras bloqueadas — o roteiro inteiro de um atendente — atrás de um scrim, sem ver nada do resto do sistema. Cada aba agora vive em `Card`s próprios, com os campos respirando (as regras de persona passaram de 3 para 4 linhas, as instruções adicionais de 4 para 6, a mensagem de teste de 2 para 4).
- **`ImportAgentModal` → rota `/ia/agentes/importar`** (`AgenteImportar.jsx`). `TextArea` de JSON passou de 12 para 18 linhas. O `hint` agora avisa que segredos não viajam no arquivo e a conexão de IA precisa ser reescolhida.
- **`AgentExecuteModal` foi ABSORVIDO pela aba Testar do editor.** Havia **duas** UIs de teste no código — o `AgentExecuteModal` (aberto pelo ▶ da linha) e o `TestTab` dentro do editor —, com o mesmo propósito e comportamentos diferentes. Agora é uma. Consequência de ACL: a rota `/ia/agentes/:id` ficou como **`ai.agents.read`** (não `write`), com o Salvar gateado por `can('ai.agents.write')` — assim quem só tem `ai.agents.execute` continua alcançando o teste. Antes, um usuário só-execute testava pelo ▶ da lista; se a rota fosse `write`, ele perderia o acesso.
- **`AgentVersionsModal` segue Modal**, de propósito: não tem campo nenhum (lista de versões + publicar/reverter), então respeita a regra — que é sobre `TextArea`/escrita reflexiva, não sobre overlay em si. Migrado pros componentes do DS e agora aberto pelo **cabeçalho do editor**, não pela linha.
- **Linha clicável:** a linha tinha **4 botões** (▶ Testar, Versões, Exportar, ✎ Editar) **mais** o nome clicável — cinco alvos disputando o mesmo clique. Sobrou um: a linha inteira abre o assistente. **Versões** e **Exportar** desceram pro cabeçalho do editor, onde têm contexto (regra do `STUDIO_UX_TABLES.md` §3, caso 2).
- O checkbox **"Salvar como nova versão"** saiu do rodapé do modal e ficou ao lado da **"Nota da versão"**, na aba Visão geral — é onde ele faz sentido, junto do campo que ele controla.
- **Versão publicada agora é lida de volta.** No legado, salvar uma versão nova ou publicar/reverter não atualizava nada na tela aberta (o modal recebia `current_version` da linha da lista, que ficava velha). Agora um `refreshVersionMeta()` relê só o metadado de versão — sem re-hidratar o formulário, para não descartar edições não salvas do usuário.
- Linguagem do usuário: "Versão ativa" → **"Versão publicada"** (`nenhuma ainda` em vez de `—`), "Ativa" → **"Em uso"**, "Reverter" → **"Voltar para esta"**, "Rollback aplicado" → "Voltou para a vN", "Nome que a IA usa" → "Nome que o assistente usa", "Quantas ações a IA encadeia" → "…o assistente encadeia".

### Também corrigido

- `MultiSelectList` (as listas de marcar habilidades / bases / memória) era um `<button>` com um `<input type="checkbox" readOnly>` dentro — clicável mas semanticamente errado, e o checkbox não era focável. Virou `<label>` + checkbox real: o rótulo inteiro continua clicável, o teclado funciona, e o leitor de tela anuncia o estado.
- Último resquício de `components/ui/*` local, `text-red-500`/`text-emerald-500` hardcoded e `var(--ap-*)` legada no grupo IA — todos removidos. **O grupo IA está 100% no DS.**

### Adicionado

- `pages/IA/AgenteEditor.jsx`, `pages/IA/AgenteImportar.jsx`, `pages/IA/Agentes.legacy.jsx` (backup).
- 3 rotas em `App.jsx` + 3 padrões de breadcrumb no `Layout.jsx`.

### Órfãos para a limpeza futura

`editor/AgentEditorModal.jsx` e `editor/AgentExecuteModal.jsx` **seguem no repo** porque o `Agentes.legacy.jsx` os importa — é o que faz o rollback funcionar. Entram na sub-frente de limpeza (item 7 da tabela de dívida em `docs/adocao-studio-ux.md`) junto com os outros `.legacy`, **depois** de a família estar validada em produção.

### Testar após aplicar

**Assistentes — lista**
1. Colunas Nome (com descrição embaixo) / Modelo / Versão publicada (`nenhuma ainda` quando não há) / Status / Atualizado. **Nenhum botão na linha** e o nome **não** é um link separado. Header com **Importar** e **Novo assistente**.
2. Clicar na linha → `/ia/agentes/<id>`, breadcrumb "IA Studio / Assistentes / Editar".

**Editor — abas**
3. **Visão geral**: card "Pronto para publicar?" com os 4 itens marcando ✓ conforme você preenche. Nome, Descrição, checkbox "Salvar como nova versão" e (se marcado) Nota da versão.
4. **Quem é**: nome do assistente, tom, emojis, tamanho das respostas + Sempre/Nunca (uma regra por linha).
5. **O que faz**: Objetivo + card de Passos (adicionar, subir, descer, remover) + card de Situações (adicionar, remover). Testar o **subir/descer** de um passo do meio.
6. **O que sabe** / **O que pode fazer**: listas de marcar. Clicar em **qualquer parte da linha** marca/desmarca; navegar por **Tab** e marcar com **Espaço** também. Sem a permissão de ações, as habilidades "grava dados" ficam esmaecidas com tooltip explicando.
7. **Testar**: sem salvar ainda → EmptyState "Salve antes de testar". Depois de salvo → mensagem de teste + botão com spinner + resultado com status, tokens, custo e a resposta.
8. **Ajustes avançados**: conexão, modelo, criatividade/passos/tokens, memória (se houver perfis), instruções adicionais, limites de segurança.

**Editor — ações do cabeçalho**
9. **Salvar** com "nova versão" marcado → toast com o número da versão. Abrir **Versões** logo depois: a nova versão tem que aparecer, e a badge **Em uso** tem que estar na versão certa (era isso que ficava velho no legado).
10. **Versões** → **Publicar** numa versão mais nova, ou **Voltar para esta** numa mais antiga (esta é vermelha, com ConfirmDialog explicando que nenhuma versão é apagada). Após confirmar, reabrir Versões: a badge "Em uso" tem que ter mudado.
11. **Exportar** → baixa o `.json`. **Importar** (pela lista) → cola o conteúdo, importa e **abre o assistente importado** para revisão.
12. **Novo assistente** → salvar pela primeira vez: a URL troca de `/nova` para `/ia/agentes/<id>` **sem recarregar**, e as abas Testar/Versões/Exportar ficam disponíveis na hora.
13. **F5** em `/ia/agentes/<id>` → recarrega o assistente certo.

### Família IA Studio — concluída

`v0.9.84 Custos` · `v0.9.85 Memória` · `v0.9.86 Pendências` · `v0.9.87 Habilidades` · `v0.9.88 padronização retroativa` · `v0.9.89 Conhecimento` · **`v0.9.90 Assistentes`**. Próximas famílias (Automação, WhatsApp, Integrações, ISP, Recursos, Desenvolvedor, Configurações) seguem no legado — cada uma é uma frente própria.

## v0.9.89 - 2026-07-24 (Conhecimento migrado + bump DS ^1.2.13 + 3 bugs silenciosos corrigidos; 5/6 da família IA Studio)

Sem `db push`. Só frontend. Quinta tela da família migrada — a primeira que **nasce** já alinhada às duas regras (não precisou de refactor retroativo).

### 1. Bump `@studio-ux-ds/*` para `^1.2.13`

Traz o **`Button` com prop `loading`** (spinner real + `disabled` + `aria-busy`), que a spec do DS já declarava e o adapter não expunha. Os 3 pacotes (`tokens`, `components`, `react`) sobem juntos por lockstep.

### 2. Conhecimento migrado (`pages/IA/BasesConhecimento.jsx`)

A tela virou **só listagem**, sem nenhum overlay. Tudo que era Modal ou state virou rota:

- **`CreateBaseModal` → rota `/ia/conhecimento/nova`** (`BaseConhecimentoEditor.jsx`). Tinha `TextArea` de Descrição. Além de migrar, os campos técnicos (conexão de embeddings, modelo, chunk size/overlap) foram para um segundo card **"Ajustes avançados"** com o aviso de que os padrões servem para a maioria dos casos — e renomeados para a língua do dono do negócio: "Onde gerar a indexação", "Tamanho do trecho", "Sobreposição entre trechos".
- **`AddDocumentModal` → rota `/ia/conhecimento/:id/documentos/novo`** (`BaseDocumentoEditor.jsx`). Era o pior caso da família: colar um documento inteiro num `TextArea` de 8 linhas dentro de um Modal, sem ver a base a que pertence. Agora o campo tem 18 linhas e o cabeçalho diz *"Vai entrar na base «X»"*. Rótulos em linguagem do usuário ("De onde vem o conteúdo", "Como chamar este documento", "Endereço da página").
- **Master-detail falso → rota `/ia/conhecimento/:id`** (`BaseConhecimentoDetalhe.jsx`), mesmo tratamento que a Memória levou na v0.9.88.
- **Linha clicável:** o legado tinha `onClick` na linha **e** uma lixeira "Excluir base" na mesma linha — dois alvos disputando o clique, com o destrutivo colado no navegacional (pedindo clique errado). O excluir mudou para o detalhe, onde o operador vê **quantos documentos vai perder**: a mensagem do `ConfirmDialog` agora diz o número e o efeito ("os assistentes que consultam esta base param de encontrar essas respostas").
- **`QueryModal` ("Testar consulta") virou ABA, não Modal.** Passaria no teste mecânico da regra (não tem `TextArea`), mas é uma bancada iterativa — digita, roda, lê os trechos, refina — e os trechos podem ser longos. Aba de tela de detalhe é o padrão do DS para "entidade com múltiplas dimensões" e dá a altura que os trechos precisam. Nada inventado: `Tabs` já é do catálogo. Também ficou mais claro: "relevância 0.842" em vez de "score", "trecho 1" em vez de "chunk #0", e um `EmptyState` explicando o que fazer quando nada é encontrado.
- Tabela de documentos **sem linha clicável de propósito**: não existe endpoint de leitura de documento individual, então a linha não tem destino (caso 3 da árvore de decisão do `STUDIO_UX_TABLES.md` — não inventar rota que não existe só para cumprir a regra). Registrado no código.

### 3. Três bugs silenciosos que eu vinha propagando desde a v0.9.84

Achados auditando os nomes que eu passava contra o que o DS realmente define. Nenhum deles quebra a tela — todos falham **em silêncio**, que é o que os tornou perigosos:

- **`var(--su-text)` e `var(--su-border)` não existem.** Os nomes reais são `--su-text-primary` e `--su-border-default`. CSS com variável inexistente não dá erro: só não aplica, e o elemento herda a cor do pai. Estavam em **9 lugares** de 6 arquivos (Custos, Memória, Pendências, Habilidades e as telas novas). Todos corrigidos, e agora **toda** var usada nas telas migradas foi conferida contra o `tokens.css`.
- **`icon="refresh-cw"` e `icon="server"` não existem** no `DSIcon` — nome não resolvido cai no fallback `"help"`, ou seja, renderiza um **"?"** na interface. Estavam no botão Sincronizar e no `EmptyState` do MCP (visíveis na v0.9.88 que está no ar). Corrigidos para `refresh` e `settings`.
- **`icon={saving ? 'loader-2' : X}` era um spinner falso.** `loader-2` existe como *alias* → `refresh`, então renderizava um ícone de refresh **estático**. Trocado em 6 call-sites por `loading={saving}` do DS, que é spinner de verdade. O `icon` volta a ser sempre o ícone real da ação.

**Causa comum dos três:** eu escrevia o nome que *parecia* certo (vindo de Tailwind/lucide/outros DS) em vez de conferir no DS. E os três falham calados. Registrado como dívida do DS: avaliar `console.warn` em dev para nome de ícone e/ou var não resolvido.

### 4. Correções de props mortas (arrastadas da v0.9.88)

- `Card` não tem prop `title` — os 2 usos em `AprovacaoDetalhe` viraram `<h2>` real (como prop, ia virar atributo HTML `title`, um tooltip no card inteiro).

### Adicionado

- `pages/IA/BaseConhecimentoDetalhe.jsx`, `pages/IA/BaseConhecimentoEditor.jsx`, `pages/IA/BaseDocumentoEditor.jsx`, `pages/IA/BasesConhecimento.legacy.jsx` (backup).
- 3 rotas em `App.jsx` (`/ia/conhecimento/nova`, `/ia/conhecimento/:id`, `/ia/conhecimento/:id/documentos/novo`) + 3 padrões de breadcrumb no `Layout.jsx`.

### Testar após aplicar

**Conhecimento**
1. Lista: colunas Nome (com descrição embaixo) / Documentos / Modelo de indexação / Atualizado. **Sem lixeira na linha.** Clicar na linha → `/ia/conhecimento/<id>`.
2. Detalhe: card com resumo (documentos, modelo, tamanho do trecho, atualizada em) + 2 abas. Header com **Voltar**, **Excluir base** (vermelho) e **Adicionar documento**.
3. **Excluir base** → ConfirmDialog dizendo o número de documentos que serão perdidos. Cancelar não faz nada; confirmar volta pra lista.
4. Aba **Documentos**: tabela sem linha clicável (correto). Documento com erro mostra a mensagem em vermelho embaixo do status.
5. Aba **Testar consulta**: digitar pergunta + Enter (ou botão) → trechos em cards com "relevância" e "trecho N". Sem resultado → EmptyState explicando. Botão mostra **spinner girando** durante a consulta.
6. **Adicionar documento** → rota nova; subtítulo diz em qual base vai entrar. Trocar "De onde vem o conteúdo" para URL troca o form; para Markdown, o campo fica mono com 18 linhas.
7. **Nova base** → rota nova; segundo card "Ajustes avançados" com os campos técnicos.
8. **F5** em qualquer uma das 3 rotas novas → carrega certo (todas têm `getKnowledgeBase`).

**Regressão das 4 telas anteriores (por causa dos bugs de var/ícone)**
9. Habilidades → MCP: botão **Sincronizar** agora tem ícone de refresh (era **"?"**) e gira durante a sincronização. EmptyState do MCP com ícone de engrenagem (era "?").
10. Qualquer botão de salvar (Custos, Memória, Pendências, Habilidades): durante o salvamento aparece **spinner girando** + rótulo no gerúndio.
11. Nomes em negrito nas tabelas (Habilidades, Memória, Conhecimento, detalhe de Pendência): devem estar na cor de texto principal, com contraste — antes a var não existia e herdavam a cor do pai.

### Restante na família (1 tela)

`v0.9.90 Agentes + 3 editors` — o maior: `AgentEditorModal` tem ~12 `TextArea` (persona, roteiro, passos, situações, prompt, guardrails), `AgentExecuteModal` e `AgentVersionsModal` também são overlays, e é o último lugar do grupo IA com `components/ui/*` local, cores hardcoded (`text-red-500`, `text-emerald-500`) e `var(--ap-*)` legada.

## v0.9.88 - 2026-07-24 (Padronização pós-auditoria — linha clicável + Modal→rota retroativo nas 4 telas migradas)

Sem `db push`. Só frontend. **Nenhuma tela nova** — esta release aplica retroativamente 2 regras do DS nas telas já migradas (Custos, Memória, Pendências, Habilidades), depois de uma auditoria que encontrou violações em todas as 4.

### As 2 regras aplicadas

1. **`STUDIO_UX_TABLES.md` §3 — a linha é o alvo.** "A ação mais comum de todas — abrir o detalhe do registro — costuma ser a própria linha clicável… a linha não precisa de um botão 'abrir' redundante quando ela inteira já é o alvo." Estava sendo violada em todas as tabelas (lápis por linha, ou 2 botões grandes competindo com a linha).
2. **Modal sem `TextArea` (regra registrada na v1.2.11 do DS, endurecida na v1.2.12).** Modal serve pra form curto com campos simples (Input / NumericInput / Select / Checkbox). **Qualquer** `TextArea` — descrição, JSON, motivo, mesmo curto e opcional — vai pra tela dedicada.

### Habilidades (`pages/IA/Ferramentas.jsx`)

- Aba **Catálogo**: lápis por linha removido; a linha inteira agora abre o editor (`/ia/ferramentas/tool/:id/editar`).
- Aba **Servidores MCP**: coluna de ações removida (tinha 2 botões); a linha abre "Habilidades de …", e o **Sincronizar** desceu pro footer desse modal — recarrega a lista de habilidades descobertas no mesmo lugar.

### Memória (`pages/IA/Memoria.jsx`)

- Lápis "Editar perfil" removido da linha (competia com o clique da linha, que já abria as entradas).
- `ProfileModal` (tinha `TextArea` de Descrição) → rotas **`/ia/memoria/perfis/nova`** e **`/ia/memoria/perfis/:id/editar`** (`MemoriaPerfilEditor.jsx`). Carrega por `getMemoryProfile(id)`, então refresh/deep-link funcionam.
- **Master-detail falso promovido a rota real.** As entradas do perfil eram um `useState('selected')` com botão "voltar" fabricado: a URL não mudava, F5 perdia o contexto e o botão voltar do navegador saía da tela em vez de subir um nível. Agora é **`/ia/memoria/:id`** (`MemoriaEntradas.jsx`) — destino do clique na linha, com "Editar perfil" no header.
- Colunas em linguagem do usuário: "TTL (s)" → **Validade** (`nunca expira` quando null), "Máx. itens" mostra `ilimitado` quando null (era `—` nos dois, ambíguo).

### Pendências (`pages/IA/Aprovacoes.jsx`)

- Aba **Fila**: os 2 botões por linha (Aprovar / Rejeitar) saíram. A linha abre **`/ia/aprovacoes/:id`** (`AprovacaoDetalhe.jsx`) — página onde a decisão é tomada **com o contexto da ação na frente**, em `DescriptionList` legível (era só um `JSON.stringify` truncado na linha). Decidir passou de 1 clique cego pra 2 cliques informados: mais coerente com o peso da ação (liberar execução real de um assistente).
- **`RejectModal` absorvido** pelo detalhe: o motivo é um `TextArea` inline na página, não mais overlay.
- Aprovar mantém os 5 patrasques (`ConfirmDialog` + disclaimer + tooltip + loading + gate `can()`).
- `PolicyModal` (tinha `TextArea` de Descrição + de Condição JSON) → rota **`/ia/aprovacoes/politicas/nova`** (`AprovacaoPoliticaEditor.jsx`). Só criação — o backend expõe `POST /ai/approvals/policies` e **não tem PATCH**; por isso a tabela de políticas fica sem linha clicável (não há destino). Registrado no código.
- Esta tela ficou sendo **só listagem** — zero overlay.

### Custos (`pages/IA/Custos.jsx`)

- Lápis removido; a linha do orçamento abre o editor. **`BudgetModal` continua Modal** — só tem `NumericInput` + `Checkbox`, nenhum `TextArea`: respeita a regra.

### Corrigido — 2 props mortas que eu passei na v0.9.87

- **`PageHeader` não tem prop `breadcrumb`.** Eu estava passando em `FerramentaEditor` (v0.9.87, já no ar) — era silenciosamente ignorada. O breadcrumb vive na TopBar do `AppShell`, alimentado pelo mapa do `Layout`. Prop removida dos editores + comentário no código pra não repetir.
- **`Card` não tem prop `title`.** Ia virar atributo HTML `title` (tooltip no card inteiro). Títulos de seção agora são `<h2>` real dentro do Card.

### Alterado — infra

- `Layout.jsx`: o mapa estático de breadcrumbs não cobre rota com `:id`, e os ternários encadeados estavam crescendo a cada release. Trocado por **`BREADCRUMB_PATTERNS`** — lista ordenada de `[regex, label]` + `resolveCrumb(pathname)`. Primeiro padrão que casa ganha; mais específico primeiro. Cobre as 7 rotas dinâmicas atuais.
- `ia.constants.js`: `friendlyTarget()` e `statusToTone()` promovidos de locais do `Aprovacoes.jsx` pra compartilhados (lista + detalhe usam os dois).
- `App.jsx`: 5 rotas novas — 2 de memória (perfil nova/editar) + 1 de entradas + 1 de detalhe de pendência + 1 de nova política. Todas sob `PermissionRoute` com a perm correta (`ai.memory.write`, `ai.memory.read`, `ai.approvals.read`, `ai.approvals.decide`).

### Testar após aplicar

**Habilidades**
1. Catálogo: passar o mouse na linha → linha inteira destacada, **sem lápis**. Clicar em qualquer ponto abre o editor. Habilidade "Da plataforma" abre em modo governança (nome/descrição/schema bloqueados).
2. MCP: linha clicável abre "Habilidades de …". Dentro do modal, botão **Sincronizar** roda e atualiza a lista ali mesmo.

**Memória**
3. Lista: colunas Validade (`nunca expira` quando vazio) e Máx. itens (`ilimitado` quando vazio). **Sem lápis**. Clicar na linha → URL vira `/ia/memoria/<id>`, breadcrumb "IA Studio / Memória / Entradas".
4. Na tela de entradas: **F5** mantém a tela (antes voltava pra lista). Botão **voltar do navegador** sobe pra lista. Filtro por chave de escopo funciona.
5. "Editar perfil" → `/ia/memoria/perfis/<id>/editar`, form com Descrição em TextArea grande, Escopo desabilitado. Salvar volta pras entradas.
6. "Novo perfil" na lista → `/ia/memoria/perfis/nova`. Salvar volta pra lista.

**Pendências**
7. Fila: **sem botões na linha**. Texto de ajuda "Clique numa pendência para ver…". Clicar → `/ia/aprovacoes/<id>`.
8. No detalhe: card "O que o assistente vai fazer" com o contexto em pares chave/valor legíveis (não JSON cru). Card "Sua decisão" com TextArea de motivo + Aprovar e Rejeitar.
9. **Aprovar** → ConfirmDialog, confirmar executa e volta pra fila com toast.
10. **Rejeitar** com motivo preenchido → executa direto (sem ConfirmDialog, é a ação não-destrutiva: nada é alterado) e volta pra fila.
11. **F5** na URL do detalhe → recarrega via `listApprovals + filter`. Pendência já decidida → toast "talvez já tenha sido decidida" + volta pra fila.
12. Usuário **sem** `ai.approvals.decide` → vê o detalhe mas com aviso "não tem permissão para decidir", sem os botões.
13. Políticas: **Nova política** → `/ia/aprovacoes/politicas/nova` (Descrição e Condição JSON em TextArea grandes). Tabela de políticas **não** tem linha clicável (sem edição no backend).

**Custos**
14. Orçamentos: **sem lápis**; clicar na linha abre o modal de edição (que continua Modal, corretamente).

### Restantes na família (2 telas)

`v0.9.89 BasesConhecimento` → `v0.9.90 Agentes + 3 editors` (o maior: ~12 `TextArea` em `AgentEditorModal`).

## v0.9.87 - 2026-07-24 (Migração visual — IA/Ferramentas pro Studio UX + refactor ToolModal→rota; 4/6 da família IA Studio)

Sem `db push`. Só frontend. Quarta tela da família IA Studio migrada, com **primeira aplicação retroativa** da regra de Modal que o DS acabou de registrar (v1.2.11): form com TextArea de descrição/escrita reflexiva vai pra rota, não pra Modal.

### Alterado

- `pages/IA/Ferramentas.jsx` — reescrito com componentes do DS: `PageHeader`, `Tabs`, `Card`, `DataTable`, `EmptyState`, `Badge` (tone), `Modal` (maxWidth), `Field`, `Input`, `Select`, `Checkbox`, `Button` (variant). `useToast` já vinha do sweep.
- **Refactor ToolModal → rota dedicada.** O form de habilidade tem `TextArea` de Descrição + `TextArea` de JSON schema (parâmetros de entrada — escrita reflexiva com formato mono e várias linhas). Segundo a regra que registramos no DS na v1.2.11, esse tipo de conteúdo NÃO cabe em Modal — vai pra tela dedicada com espaço, breadcrumb e URL própria. Botões "Nova habilidade" e "Editar" da CatalogTab agora fazem `navigate('/ia/ferramentas/tool/nova')` e `navigate('/ia/ferramentas/tool/:id/editar', { state: { tool } })`.
- `McpServerModal` **mantido como Modal**: form curto (Nome, Transporte, Endpoint, Checkbox) sem escrita reflexiva — respeita a regra.
- Modal "Habilidades de `<server>`" **mantido**: leitura curta em cards de descoberta, não é form.

### Adicionado

- `pages/IA/FerramentaEditor.jsx` — página nova para criar/editar habilidade. Recebe a tool via `location.state.tool` (navegação da lista); em refresh/deep-link, cai em `listTools + filter` (não há `GET /ai/tools/:id` no backend hoje). Header com breadcrumb "IA Studio / Habilidades / Nova" (ou / Editar) + ações **Cancelar** e **Salvar**. Governança preservada 1:1 (perms `ai.tools.write`, `requires_approval`, `timeout_ms`, `is_active`).
- `pages/IA/Ferramentas.legacy.jsx` — backup literal do arquivo antigo para rollback.
- Duas rotas novas em `App.jsx`:
  - `/ia/ferramentas/tool/nova` (perm `ai.tools.write`)
  - `/ia/ferramentas/tool/:id/editar` (perm `ai.tools.write`)
- Breadcrumbs correspondentes em `Layout.jsx` (pattern matching por regex pra rota com `:id`).

### Testar após aplicar

1. **IA Studio → Habilidades**, aba **Catálogo**: `DataTable` do DS com colunas Nome/Identificador/Categoria/Origem (Da plataforma × Personalizada)/Status/Aprovação. Botão "Nova habilidade" à direita (perm `ai.tools.write`).
2. Clicar em **Nova habilidade** → navega pra `/ia/ferramentas/tool/nova` (URL muda, breadcrumb "IA Studio / Habilidades / Nova"). Header com Cancelar/Salvar. Card com Identificador, Nome, Categoria, Descrição (TextArea), Parâmetros de entrada (TextArea mono), Checkbox de aprovação, Tempo limite. Cancelar volta pra lista; Salvar valida JSON + cria + volta.
3. Clicar em **⋯ Editar** numa linha de habilidade custom → navega pra `/ia/ferramentas/tool/:id/editar` (URL com id, breadcrumb "IA Studio / Habilidades / Editar"). Form pré-preenchido. Identificador desabilitado.
4. Clicar em **⋯ Ajustes de governança** numa habilidade da plataforma (linha com badge "Da plataforma") → mesma rota, mas só os campos de governança editáveis (nome/descrição/schema bloqueados). Badge "Habilidade da plataforma" no topo do card.
5. **F5 direto na URL de editar** → carrega via `listTools + filter` (loading, depois form). Tool inexistente → toast "Habilidade não encontrada" + volta pra lista.
6. Aba **Servidores MCP**: `DataTable` com colunas Nome/Transporte/Endpoint/Status/Última sincronização. Botão "Novo servidor" abre `Modal` do DS (curto, respeita a regra) com Nome/Transporte/Endpoint/Checkbox. Botão ⋯ da linha tem "Ver habilidades" (abre Modal de leitura com cards) e "Sincronizar" (spinner enquanto rola).

### Restantes na família (2 telas)

`v0.9.88 BasesConhecimento` → `v0.9.89 Agentes + 3 editors`.

## v0.9.86 - 2026-07-24 (Migração visual — IA/Aprovacoes pro Studio UX; 3/6 da família IA Studio)

Sem `db push`. Só frontend. Terceira tela da família IA Studio migrada.

### Alterado

- `pages/IA/Aprovacoes.jsx` — reescrito com componentes do DS: `PageHeader`, `Tabs`, `Card`, `DataTable`, `EmptyState`, `Badge` (tone), `Modal` (maxWidth), `ConfirmDialog`, `Field`, `Input`, `Select`, `TextArea`, `Button` (variant), `Checkbox`. `useToast` já vinha do sweep.
- **Fix registrado na dívida técnica do IA Studio**: os 2 botões inline com Tailwind hardcoded (`bg-emerald-600` no "Aprovar" e `bg-red-600` no "Rejeitar" nas linhas 111-124 do legado + `bg-red-600` no footer do `RejectModal` linha 196) — que fugiam do sistema de `.su-btn` — foram substituídos por `<Button variant="primary">` (Aprovar, ação primária positiva) e `<Button variant="danger">` (Rejeitar, ação destrutiva). Alinhado ao padrão do DS.
- Botões na linha do DataTable renderizados via `renderRowMenu` do DS (o "…" contextual). "Aprovar" e "Rejeitar" com `title` (tooltip) preservado do legado.
- `PolicyModal`: `Textarea` com estilo mono para JSON via `style` inline (o DS não tem prop `variant="mono"` no TextArea — se surgir necessidade recorrente, sub-frente própria pra evoluir DS). `<input type="checkbox">` inline substituído por `<Checkbox>` do DS.
- Helper `statusToTone` mapeia variantes do legado (`green`/`red`/`yellow`/`blue`/`purple`/`gray`) pros tones do DS (`success`/`danger`/`warning`/`info`/`info`/`neutral`) sem alterar `APPROVAL_STATUS` (fonte compartilhada em `ia.constants`).
- Comportamento e API preservados 1:1: mesmos endpoints, mesmos payloads, mesmo fluxo de 5 patrasques (ConfirmDialog para aprovar; Modal com motivo para rejeitar), mesmas permissões (`ai.approvals.decide`).

### Adicionado

- `pages/IA/Aprovacoes.legacy.jsx` — backup literal para rollback.

### Modais siblings — nota

`Aprovacoes` está na lista das 9 páginas com modais siblings (ConfirmDialog approve + RejectModal + PolicyModal, 3 states independentes). Como todos os 3 são excludentes na prática (só um se abre por vez) e não empilham, migrei tal como estão — dívida técnica de refactor arquitetural (rotas dedicadas ou máquina de estado explícita) segue registrada em `docs/adocao-studio-ux.md` como sub-frente futura.

### Testar após aplicar

1. **IA Studio → Pendências**, aba **Fila**: se vazio, `EmptyState` "Nada pendente". Se com dados, `DataTable` com colunas Alvo/Status/Solicitada + botões Aprovar (primário roxo) / Rejeitar (vermelho) por linha.
2. Clicar em **Aprovar** → abre `ConfirmDialog` com título "Aprovar ação" + mensagem explicativa + botão vermelho "Aprovar e executar". Confirmar chama backend, toast, recarrega.
3. Clicar em **Rejeitar** → abre `Modal` com mensagem explicativa + `TextArea` de motivo opcional + botão vermelho "Rejeitar". Confirmar chama backend, toast, recarrega.
4. Aba **Políticas**: header com botão "Nova política" à direita; `DataTable` com colunas Nome/Alvo/Condição/Status; ou `EmptyState` se vazio.
5. **Nova política** → Modal com Nome/Descrição/Alvo/Condição JSON (TextArea mono) + Checkbox "Ativar imediatamente". Validar JSON errado → toast "Condição: JSON inválido.". Salvar → toast + recarrega.

### Restantes na família (3 telas)

`v0.9.87 Ferramentas` → `v0.9.88 BasesConhecimento` → `v0.9.89 Agentes + 3 editors`.

## v0.9.85 - 2026-07-24 (Bump DS ^1.2.10 + Custos.fullWidth + Memoria migrada; 2/6 da família IA Studio)

Sem `db push`. Só frontend. Release combinado com 3 mudanças acopladas:

### 1. Bump `@studio-ux-ds/*` para `^1.2.10`

- `platform-admin/package.json` — 3 deps do DS de `^1.2.9` para `^1.2.10`. A v1.2.10 do Studio UX (2026-07-24) adicionou a prop `fullWidth` no `NumericInput`, que esta release aproveita.

### 2. Custos.jsx — `fullWidth` nos 5 NumericInputs (fix visual v0.9.84)

- `pages/IA/Custos.jsx` — os 5 `<NumericInput>` (2 em `BudgetModal`, 3 em `SimulatorTab`) passaram a receber `fullWidth`. Elimina o espaço vazio à direita reportado na aplicação de v0.9.84 (o `NumericInput` default é `inline-flex` com input de 72px fixo; nas células de `grid-cols-2`/`grid-cols-3` sobrava vazio à direita).

### 3. Migração visual — Memoria (2ª tela da família IA Studio)

- `pages/IA/Memoria.jsx` — reescrito com componentes do DS: `PageHeader` (com `actions={newProfileBtn}`), `Card`, `DataTable` (colunas declarativas + `onRowClick`+`getRowLabel` + `renderRowMenu` para editar), `EmptyState` (icon string DSIcon), `Badge` (tone `info`), `Modal` (usa `maxWidth={520}`, sem `size` nem `dismissable`), `Field`+`Input`+`Select`+`NumericInput`+`TextArea`+`Button`. `useToast` já vinha do sweep.
  - **Comportamento preservado 1:1** — mesmos endpoints, mesmo master-detail via state `selected` (a migração pra rota `?open=<id>` é sub-frente arquitetural futura, registrada em `docs/adocao-studio-ux.md`), mesmo filtro de `scope_key` na EntriesView, mesma semântica de campos opcionais (TTL/max_items vazio = `null`).
  - **Ajuste técnico do NumericInput**: o legado usava prop `allowEmpty` do `NumberInput` local (que aceitava `null`). O `NumericInput` do DS não tem essa prop, mas aceita string vazia (`""`) como valor intermediário no `value`/`onChange`. Adaptação: `form.default_ttl_seconds` e `form.max_items` inicializam com `''` em vez de `null`; helper `toNullable(v)` converte `""` para `null` antes de mandar pro backend. Semântica exposta ao usuário (vazio = sem limite) preservada.
  - **`fullWidth`** nos 2 NumericInputs do modal desde já — sem regressão desde o começo.
- `pages/IA/Memoria.legacy.jsx` — backup literal para rollback (trocar 1 import em `App.jsx`).

### Testar após aplicar

1. **IA Studio → Custos**, aba **Orçamentos** e **Simulador**: os NumericInputs agora ocupam toda a largura da célula da grid (input + botões +/− esticados). Sem espaço vazio à direita.
2. **IA Studio → Memória** (lista): `PageHeader` com botão "Novo perfil" à direita. Se vazio: `EmptyState` dentro de `Card`. Se com dados: `DataTable` do DS (clique numa linha abre entries; botão "..." de editar por linha).
3. **Memória → clicar em um perfil**: master-detail abre com botão voltar + PageHeader + filtro de scope_key + botão "Filtrar". Se sem entradas: EmptyState. Se com entradas: DataTable com 5 colunas.
4. **Memória → Novo perfil**: modal com Nome + Escopo (Select, desabilitado em edit) + Descrição (TextArea) + TTL + Máx.itens (ambos NumericInput com `fullWidth`, vazios significam null).

### Restantes na família (4 telas)

`v0.9.86 Aprovacoes` → `v0.9.87 Ferramentas` → `v0.9.88 BasesConhecimento` → `v0.9.89 Agentes + 3 editors`.

## v0.9.84 - 2026-07-24 (Migração visual — IA/Custos pro Studio UX; 1/6 da família IA Studio)

Sem `db push`. Só frontend. Primeira tela migrada visualmente na nova frente (família IA Studio). Escopo: `pages/IA/Custos.jsx` — casca `<h1>`+subtitle+Tabs+StatCards+Tabelas+Modal reescrita usando componentes do `@studio-ux-ds/react`.

### Alterado

- `pages/IA/Custos.jsx` — reescrito com:
  - `PageHeader` (título + subtitle) em vez de `<h1>` + `<p>` do legado.
  - `Tabs` do DS (`value`/`onChange` em vez de `active`; removidos os `Icon` das tabs — o DS aceita `icon` como string DSIcon mas removi por sobriedade nesta tela).
  - `StatCard` do DS com `tone` (`success`, `info`, `neutral`) substituindo as 4 chamadas do legado com `icon={Users}` + `color="brand/blue/green/purple"`. Removida a prop `icon` — o `StatCard` do DS coloca o ícone à direita do label, decisão foi manter mais sóbrio sem ícone (padrão Dashboard v0.9.80).
  - `DataTable` do DS substituindo `Table/Thead/Th/Tbody/Tr/Td` — colunas declaradas via `columns=[{key, header, align?, render?}]`. Botão "Editar" da tabela de orçamentos virou `renderRowMenu` (o "…" contextual do DS).
  - `Card` do DS envolvendo o `EmptyState` (quando não há dados) e o form do Simulador.
  - `EmptyState` do DS (`icon` como string DSIcon: `chart-bar`, `file`).
  - `Badge` do DS com `tone` (`info`, `success`, `danger`, `neutral`) substituindo `variant="blue|green|red|gray"` do legado.
  - `Modal` do DS (usa `maxWidth={520}` — não `size="md"` como o legado). Sem `dismissable`.
  - `Field` + `Input` + `Select` + `NumericInput` do DS substituindo `FormField/TextInput/Select/NumberInput` locais. `NumericInput` do DS recebe number direto no `onChange` (não `event.target.value`).
  - `Button` do DS com `variant="primary|secondary|ghost"`, `icon` string. Substituiu `<button className="btn-primary/secondary/ghost">` do legado.
  - `Checkbox` do DS substituindo os `<label><input type="checkbox">` inline do legado.
  - `useToast` do DS já estava (do sweep anterior).
- Comportamento e API preservados: mesmos handlers, mesmos endpoints, mesmos corpos de request (create vs update com whitelist do backend). Único ganho funcional: `DataTable` cuida do responsivo (cards mobile) sem código duplicado.

### Adicionado

- `pages/IA/Custos.legacy.jsx` — backup literal do arquivo anterior. Não é importado enquanto o novo estiver ativo. Rollback: trocar `import Custos from './pages/IA/Custos'` por `Custos.legacy` em `App.jsx`.

### Testar após aplicar

1. Aba **Consumo**: filtro de mês (`Input type="month"`); 3 `StatCard` mostrando total/tokens/assistentes; tabela quando há dados ou EmptyState "Sem consumo no período".
2. Aba **Orçamentos**: botão "Novo orçamento" abre modal; DataTable com botão "…" de editar por linha; EmptyState quando vazio; criar/editar salva e recarrega.
3. Aba **Simulador**: form com 5 campos, botão "Simular custo", ao clicar chama backend e mostra 2 StatCards com resultado.

### Restantes na família (5 telas)

`v0.9.85 Memoria` → `v0.9.86 Aprovacoes` → `v0.9.87 Ferramentas` → `v0.9.88 BasesConhecimento` → `v0.9.89 Agentes + 3 editors`.

## v0.9.83 - 2026-07-24 (Fix workspace picker — Portal + position fixed)

Sem `db push`. Só `platform-admin/src/components/Layout/Layout.jsx`. Nasce depois que Robson viu no painel v0.9.82 que o botão "Selecionar workspace" no topbar (com title tooltip funcionando) **não abria o dropdown quando clicado**.

Causa raiz: o `AppShell` do `@studio-ux-ds/react` tem `overflow: hidden` nos ancestrais (`.su-appshell` e `.su-appshell__main`, conforme `components.css`). O dropdown do picker era renderizado como `<div className="absolute ...">` dentro do `topbarContext` — o `overflow: hidden` dos pais recortava-o e ele nunca aparecia. O botão funcionava (`onClick` disparava, `setWsOpen(true)` mudava estado), mas o DOM do menu ficava invisível.

### Alterado

- `Layout.jsx` — 4 mudanças acopladas:
  - Novo import: `import { createPortal } from 'react-dom';` + `useRef`.
  - `wsButtonRef` (ref no botão do picker) + `wsMenuPos` (state com `{top, left}` calculados via `getBoundingClientRect` do botão no momento do toggle).
  - `toggleWsMenu()` — handler que calcula posição fixa antes de abrir; fecha se já aberto.
  - Menu extraído do `topbarContext` e renderizado via `createPortal(..., document.body)` como `position: fixed`. Ignora todos os `overflow: hidden` dos ancestrais.
  - `useEffect` de "clicar fora" reescrito: como o menu vive num portal fora do container do botão, o teste passou a verificar `btnRef.contains(target) || menu.contains(target)`. Também adiciona listeners de `scroll` (capturado) e `resize` que fecham o menu — a posição `fixed` calculada perde sinc se a janela mexer.
  - `return` do componente virou Fragment (`<>`) para renderizar `{workspaceMenu}` ao lado do `<AppShell>`.

### Impacto

Zero regressão de comportamento — apenas o dropdown agora aparece. Menu do usuário (Minha conta / Trocar senha / Sair / Personalizar / Claro/Escuro) continua funcionando porque é gerenciado internamente pelo AppShell (que já usa o padrão correto). Se aparecerem outros dropdowns/menus do IA Studio dentro do AppShell sofrendo o mesmo corte (ex.: hoje o `NotificationsBell` NÃO está mais no shell — o AppShell tem seu próprio sino), a solução é a mesma: Portal + fixed calculado.

### Como aplicar

Sequência normal (o upgrade.sh v0.9.82 já está no disco fazendo `source .env`; nenhuma alteração adicional no servidor):

1. Commit + tag + push v0.9.83.
2. **Configurações → Atualização → Atualizar na v0.9.83.** Vai passar direto (só toca 1 arquivo do frontend; nem `.env` nem package.json nem schema mudaram).
3. Hard reload no navegador (Ctrl+Shift+R).
4. Clicar no botão "Principal — Produção" no topbar. O dropdown deve aparecer logo abaixo com a lista de workspaces + badges de ambiente.

## v0.9.82 - 2026-07-24 (Fix build — bump @studio-ux-ds/* de ^1.0.15 para ^1.2.9)

Sem `db push`. Só `platform-admin/package.json`. Nasce depois que a aplicação de **v0.9.81** falhou em `ADMIN_BUILD` com:

```
src/context/ThemeContext.jsx (2:9): "isDark" is not exported by
"node_modules/@studio-ux-ds/react/index.js"
```

Causa: a v0.9.80 do IA Studio (adoção do Studio UX) usou `isDark`/`setTheme` do `@studio-ux-ds/react` no `ThemeContext.jsx` — mas esses símbolos só passaram a ser exportados pelo barrel `index.js` em versão posterior a 1.0.15. O `package.json` estava pinado em `^1.0.15` desde a fase 1 do piloto (v0.9.79); o `npm install` do upgrade continuava resolvendo 1.0.15, que não tinha `isDark`/`setTheme`. Erro meu (Claude) por não ter conferido a versão instalada antes de importar.

### Alterado

- `platform-admin/package.json` — bump das 3 deps do DS de `^1.0.15` para `^1.2.9`:
  - `@studio-ux-ds/tokens`, `@studio-ux-ds/components`, `@studio-ux-ds/react` sobem em lockstep.
- Impacto: com o `^1.2.9` (que permite qualquer 1.x.y), o `npm install` resolve para a versão mais recente compatível — que exporta `isDark`, `setTheme`, `AppShell`, `PageHeader`, `Customize`, `ToastProvider`, `useToast` e tudo o mais que a fase 2 depende.

### Como aplicar no servidor

Este commit também precisa do `upgrade.sh` v0.9.81+ (que faz `source .env`) já no disco. Se ainda não trouxe:

```bash
cd /opt/iastudio
git fetch --tags origin
# Trazer upgrade.sh v0.9.82 + package.json v0.9.82 pro disco (sem mexer no HEAD):
git checkout v0.9.82 -- scripts/upgrade.sh platform-admin/package.json

# Forçar reinstall do platform-admin (o package-lock antigo travava em 1.0.15):
rm -rf /opt/iastudio/platform-admin/node_modules /opt/iastudio/platform-admin/package-lock.json

# Aplicar v0.9.82 no painel: Configurações > Atualização > Atualizar
```

O upgrade.sh vai fazer `npm install` limpo (agora resolvendo 1.2.9), depois `vite build` — dessa vez o build **vai gerar dist novo** com `AppShell`, `PageHeader`, `StatCard` etc. do DS. Data do `/opt/iastudio/platform-admin/dist/assets/*.js` vai passar a ser 24/jul.

### Nota sobre v0.9.81

O painel mostra "v0.9.81" e "Instância atualizada" — é bug de UI do painel. A tabela `system_upgrades` confirma: `v0.9.81 status=FAILED error_step=ADMIN_BUILD`. Nenhum dist novo foi gerado. O que roda em produção é ainda o dist da v0.9.79 (19/jul). v0.9.82 é a primeira aplicação que realmente vai substituir o dist.

## v0.9.81 - 2026-07-24 (Fix deploy — upgrade.sh carrega .env antes do npm install; install.sh pergunta NODE_AUTH_TOKEN)

Sem `db push`. Só scripts + docs. Nasce depois que a aplicação de **v0.9.80** falhou em `ADMIN_BUILD` no painel com **npm E401** — o `.npmrc` versionado referencia `${NODE_AUTH_TOKEN}`, mas o `upgrade.sh` é spawnado detached pelo backend PM2 e não herdava `.bashrc` do root nem tinha a var no ambiente. Correção estrutural: **fonte única de segredos = `.env` do platform-api**, o `upgrade.sh` faz `source .env` antes de qualquer build, e o `install.sh` pergunta o token durante instalação (ou aceita `--npm-token=...` em modo headless).

### Alterado

- `scripts/upgrade.sh` — 4 linhas novas após a leitura de `DATABASE_URL`: `set -a; source "$ENV_FILE"; set +a`. Exporta o `.env` inteiro pro ambiente do bash — qualquer var (NODE_AUTH_TOKEN, GOOGLE_*, futuras) fica visível para os npm install/prisma/builds das fases seguintes sem depender de herança do PM2.
- `scripts/install.sh` — 4 mudanças acopladas:
  - Nova variável `NODE_AUTH_TOKEN=""` no bloco inicial de defaults.
  - Novo arg CLI `--npm-token=...` (modo headless).
  - Novo prompt no wizard interativo (após o admin, antes da opção de Demo) — pode ser vazio; usuário adiciona depois no `.env`.
  - Nova linha no heredoc que gera `${API_DIR}/.env`: `NODE_AUTH_TOKEN=${NODE_AUTH_TOKEN}`.
- `docs/adocao-studio-ux.md` — reescrita a seção "Pré-requisito operacional — autenticar no GitHub Packages": fonte única = `.env` do platform-api (não `.bashrc`, não `ecosystem.config.js`). Comando para adicionar em servidor existente + como reiniciar PM2 corretamente.
- `docs/deploy-e-versionamento.md` — nova seção "Segredos e credenciais de build — fonte única no `.env`" documenta a garantia dada pelo `source .env` do upgrade.sh + armadilha de untracked file vs. tag (a que causou a falha do `GIT_CHECKOUT` da v0.9.80).

### Como aplicar no servidor existente (pré-requisitos operacionais)

1. Se ainda tem o `.npmrc.pre-v0.9.80` como fallback: apagar (não faz mais sentido) — `rm /opt/iastudio/platform-admin/.npmrc.pre-v0.9.80`.
2. Adicionar o token no `.env`: `echo "NODE_AUTH_TOKEN=ghp_SEU_TOKEN" >> /opt/iastudio/platform-api/.env`.
3. Reiniciar PM2 relendo o `.env` (o `pm2 restart --update-env` não relê arquivo): `cd /opt/iastudio/platform-api && pm2 delete iastudio-api iastudio-worker && pm2 start ecosystem.config.js && pm2 save`.
4. Aplicar v0.9.81 no painel: **Configurações → Atualização → Atualizar na v0.9.81**. O upgrade que roda ainda é o `upgrade.sh` v0.9.79 do disco atual, mas com `NODE_AUTH_TOKEN` no env herdado do backend PM2 (que agora relê o `.env`), o `npm install` do platform-admin passa. Depois de v0.9.81 aplicada, o `upgrade.sh` novo (com `source .env`) fica versionado para todas as versões futuras — independente de PM2/ecosystem.

Nota: aplicar v0.9.80 diretamente também funciona com o mesmo pré-requisito (env no PM2), mas v0.9.81 já traz a correção estrutural — recomendado aplicar v0.9.81 direto (o painel lista as duas tags; pode pular v0.9.80).

## v0.9.80 - 2026-07-24 (Adoção do Studio UX no platform-admin — casca AppShell + Dashboard + rota /conta/senha + sweep de Toast)

Sem `db push`. Só frontend (`platform-admin`). Primeira aplicação prática da `ia-studio.studio-ux-adoption@1.0.0` (task criada em 2026-07-23). Casca do painel migrada para o `AppShell` do `@studio-ux-ds/react`, Dashboard (primeira tela após login) reescrito com `PageHeader` + `StatCard` + `Card` do DS, rota nova `/conta/senha` substituindo o modal cross-tree do Header, e **sweep total de 55 arquivos** migrando do bus de toast local (`lib/toast`) para o `useToast()` do DS. Piloto isolado v0.9.79 (`/studio-ux-demo`) preservado. Coexistência intencional das demais telas (Automação, WhatsApp, ISP, IA, Integrações, Configurações etc.) com o padrão `--ap-*` + Tailwind dentro da nova casca.

### Alterado (infra/casca)

- `platform-admin/src/main.jsx` — importa `configureTheme`/`applyTheme`/`ToastProvider` do DS. `configureTheme({ namespace: 'ia-studio' })` + `applyTheme()` chamados **antes** do 1º render (evita flash). `<ToastProvider>` envolve o app.
- `platform-admin/src/context/ThemeContext.jsx` — reescrito como wrapper fino do mecanismo de tema do DS. Fonte única = DS; API pública (`useTheme` → `{ theme, toggle, isDark }`) preservada. Espelha `.dark` no `<html>` para compatibilidade com telas Tailwind. `MutationObserver` sincroniza tudo quando o AppShell/Customize trocam o tema.
- `platform-admin/src/components/Layout/Layout.jsx` — reescrito com `AppShell`. Slots: brand, nav (grupos com filtro por permissão), version, breadcrumb, topbarContext (seletor de workspace + badge de ambiente), user, userMenuItems (Minha conta + Trocar senha), `onNotifications` (redireciona para `/automacao/notificacoes`), `notifications` (polling 30s via `useNotificationsUnread`), `customize=true` (painel embutido), `onLogout`.
- `platform-admin/src/pages/Dashboard.jsx` — reescrito com `PageHeader` + 4 `StatCard` (tones info/success/neutral) + `Card` do DS. Dados/lógica idênticos.
- `platform-admin/src/App.jsx` — nova rota `/conta/senha`, remoção do `<UIToastContainer />` (substituído pelo `<ToastProvider>` do DS no `main.jsx`).

### Adicionado

- `platform-admin/src/pages/ContaSenha.jsx` — rota `/conta/senha`. Substitui o modal de troca de senha que vivia no `Header` legado (elimina empilhamento cross-tree — o modal ficava fora do `<Outlet/>`). Usa `PageHeader` + `Card` + `Field` + `Input` + `Button` do DS.
- Backups para rollback rápido: `Layout.legacy.jsx`, `Sidebar.legacy.jsx`, `Header.legacy.jsx`, `Dashboard.legacy.jsx` (troca o import em `App.jsx` para reverter).

### Sweep de Toast (55 arquivos)

Cada `import { toast } from '<caminho>/lib/toast'` foi substituído por `import { useToast } from '@studio-ux-ds/react'` + `const toast = useToast()` como primeira linha do componente. Subcomponentes no mesmo arquivo que chamam `toast.*` receberam cada um seu próprio `useToast()`. Nenhuma chamada `toast.error/success/warn/info` teve texto ou semântica alterados. Distribuição:

- `pages/`: `Dashboard.jsx`, `Dashboard.legacy.jsx`, `ContaSenha.jsx`, `Login.jsx`, `AcceptInvite.jsx`, `MinhaConta.jsx`, `Auditoria.jsx`, `Usuarios.jsx`, `PerfisAcesso.jsx`, `Workspaces.jsx`
- `pages/Automacao/`: `Fluxos.jsx`, `FluxoEditor.jsx`, `FluxoCanvas.jsx`, `Agendamentos.jsx`, `Execucoes.jsx`, `TemplatesAutomacao.jsx`, `Eventos.jsx`, `Notificacoes.jsx`, `editor/VersionsModal.jsx`, `editor/NodeConfigModal.jsx`, `editor/ExecuteModal.jsx`, `editor/TriggerEditor.jsx`
- `pages/WhatsApp/`: `Conversas.jsx`, `Templates.jsx`, `EquipesFilas.jsx`, `Numeros.jsx`, `AtendimentoIA.jsx`, `MessageComposer.jsx`, `ChatWindow.jsx`, `TimelineModal.jsx`, `TransferModal.jsx`
- `pages/ISP/`: `Incidentes.jsx`, `AberturaChamado.jsx`
- `pages/IA/`: `Agentes.jsx`, `BasesConhecimento.jsx`, `Memoria.jsx`, `Ferramentas.jsx`, `Aprovacoes.jsx`, `Custos.jsx`, `editor/AgentEditorModal.jsx`, `editor/AgentVersionsModal.jsx`, `editor/AgentExecuteModal.jsx`
- `pages/Integracoes/`: `Marketplace.jsx`, `Conexoes.jsx`, `Segredos.jsx`, `ConnectionWizard.jsx`, `ConnectionFields.jsx`, `GoogleOAuthButton.jsx`
- `pages/Recursos/`: `Mapeamentos.jsx`, `Explorer.jsx`
- `pages/Desenvolvedor/`: `Console.jsx`, `ApiKeys.jsx`
- `components/Layout/`: `Header.legacy.jsx`, `NotificationsBell.jsx`

Total: 55.

### Refactor pontual (1 arquivo)

- `pages/Integracoes/ConnectionFields.jsx` — a função exportada `copyToClipboard(text)` chamava `toast.success/error` fora de contexto de componente (impossível com hook). Refatorada para retornar `Promise<boolean>` sem toast interno; os 2 callsites (`WebhookUrlBox`, `ConnectionField`) chamam `useToast()` e exibem o toast eles mesmos após o `await`. Sem mudança de UX.

### Removido do runtime

- `<UIToastContainer />` do `App.jsx` (import + JSX).
- `lib/toast.js` esvaziado (comentário-marcador). Nenhum arquivo importa mais.
- `components/ui/UIToastContainer.jsx` esvaziado. Nenhum arquivo importa mais.
- `components/Layout/Header.jsx` — órfão desde a substituição da casca (o `Layout` novo não o importa; apenas `Header.legacy.jsx` é importado via `Layout.legacy.jsx`).

### Governança

- Sweep de Toast executado como **exceção deliberada** à `workflow.consuming-system-adoption@1.0.0` — registrada no ADR `docs/adocao-studio-ux.md` §5. Custo real (56 arquivos, 399 chamadas) confirmado com o dono antes da execução; alternativa (bridge module-level de 3 arquivos, risco zero) foi apresentada e rejeitada em favor do sweep.
- 9 páginas com múltiplos `<Modal>` siblings + states independentes ficam registradas como dívida técnica antes de qualquer migração visual dessas telas: `WhatsApp/EquipesFilas`, `Automacao/FluxoCanvas`, `Automacao/FluxoEditor`, `Integracoes/Conexoes`, `IA/Ferramentas`, `IA/BasesConhecimento`, `Automacao/Fluxos`, `IA/Aprovacoes`, `ISP/Incidentes` (este último se defende manualmente).

### Pendências operacionais

- **`.npmrc`** no `platform-admin/` — a sandbox de execução recusou o `Write`. Robson precisa criar manualmente antes do próximo `npm install` limpo. Conteúdo (referenciando `NODE_AUTH_TOKEN` do ambiente): ver `docs/adocao-studio-ux.md`.
- **Arquivos mortos a remover do disco** quando a casca+Dashboard novos estiverem validados: `Header.jsx`, `NotificationsBell.jsx`, `Sidebar.legacy.jsx`, `Header.legacy.jsx`, `Layout.legacy.jsx`, `Dashboard.legacy.jsx`, `lib/toast.js`, `components/ui/UIToastContainer.jsx`. Sub-frente própria — pode ser um `rm` só.
- **Multi-tenant branding** (accent/tema por organização via Customize) — quando o backend expuser preferências por org.

### Piloto preservado

- `/studio-ux-demo` (v0.9.79) — renderiza dentro do AppShell novo sem alteração.

## docs - 2026-07-23 (Novo catálogo local + `ia-studio.studio-ux-adoption@1.0.0`)

Sem `db push`. Só documentação (`docs/prompt-framework/`). O projeto ganha **catálogo local próprio** — `ia-studio.specialty-catalog@1.0.0` (`kind: shared`) — até agora inexistente (só o stub `README.md` apontava pro STUDIO-WORKFLOW). Nasce já com a primeira task: `ia-studio.studio-ux-adoption@1.0.0` (`kind: task`, `extends: workflow.consuming-system-adoption@1.0.0` do STUDIO-WORKFLOW v3.1.0). A task governa a adoção do Studio UX no `platform-admin` **contextualizando o piloto v0.9.79** (rota `/studio-ux-demo` + `docs/adocao-studio-ux.md`) — não é adoção do zero, é expansão controlada por famílias de tela, respeitando as regras do próprio DS e o contexto multi-tenant.

Criação executada pela primeira aplicação real da `workflow.specialty-creation@1.0.0` (task nova do STUDIO-WORKFLOW v3.1.0 que fecha o loop deixado aberto pelo alinhador). Nenhuma linha de código no `platform-admin` foi tocada — a task é o método; a execução em qualquer tela precisa de novo alinhamento.

- Sem release taggeada. Puramente documental.

## docs - 2026-07-23 (Adota STUDIO-WORKFLOW v3.0.0)

Sem `db push`. Só documentação. O `COMO-INTERAGIR-COM-ROBSON.md` (raiz) virou stub apontando pro SSOT agnóstico em `C:\Users\Flowspec\Documents\STUDIO-WORKFLOW\`; criado `docs/prompt-framework/README.md` como stub explicando o consumo do método (paradigma `prompt-framework/v1`, v3.0.0). O projeto ainda não tem catálogo local — quando fizer sentido, cria como `ia-studio.*` no schema formal.

**Não confundir com o piloto de adoção visual do Studio UX (v0.9.79):** aquele é sobre consumir o **design system** (`@studio-ux-ds/*`); este é sobre consumir o **método de intake** (`STUDIO-WORKFLOW`). Dois trilhos distintos.

## v0.9.79 - 2026-07-19 (Piloto de adoção do Studio UX — rota isolada /studio-ux-demo)
Sem `db push`. Só frontend (`platform-admin`). Consome os pacotes publicados `@studio-ux-ds/{tokens,components,react}` (GitHub Packages, org `studio-ux-ds`) numa rota isolada `/studio-ux-demo` — nenhuma tela existente foi tocada. Os CSS do Studio UX (`--su-*`/`.su*`) coexistem com os `--ap-*` sem colisão; o tema segue o toggle do painel. **Pré-requisito de build:** o servidor precisa de `platform-admin/.npmrc` com token `read:packages` (ver `docs/adocao-studio-ux.md`) — sem ele o `npm install` dos pacotes privados falha. Novos arquivos: `src/pages/StudioUxDemo.jsx`, `docs/adocao-studio-ux.md`; ajustes em `App.jsx` (rota), `main.jsx` (imports CSS), `package.json` (deps).

## v0.9.78 - 2026-07-19 (Frente 6: alerta de incidente à equipe + padrão de telefone + fundação do catálogo HSM)

> Destrava a Frente 6, que estava escrita mas nunca commitada desde a era v0.9.74 (as tags v0.9.75/v0.9.76/v0.9.77 foram empurradas no commit errado — apontam pro `c7afd43`, queimadas; seguimos em v0.9.78).

⚠️ **`db push` (destrutivo, mas só adição)** — colunas novas (`core_users.whatsapp_phone`, `comm_attendance_members.receive_incident_alerts`, `isp_incidents.scope_hash`/`last_team_alert_at`, `comm_whatsapp_templates.is_system_template`/`event`/`buttons_json`/`variable_map_json`) + tabela `isp_incident_team_alerts`. Backend + frontend + `CONTENT_VERSION` v30.

- **Alerta de incidente à equipe (frente 6).** Quando a IA identifica, na conversa, uma anomalia de rede na região de um cliente **sem incidente cadastrado**, o **sistema** (não o modelo) registra um rascunho de incidente por escopo e **aciona a equipe de plantão por WhatsApp**. O assistente só diz "identifiquei uma instabilidade na sua região, a equipe já foi acionada", não abre chamado e não vaza %/OLT/CTO.
  - **`status_regiao` virou determinístico e higienizado:** devolve uma `situacao` (`normal` / `anomalia_regiao` / `incidente_ativo`) + orientação — o **limiar vem da config**, não do modelo; não devolve mais percentual cru. Quando é anomalia, o sistema já aciona a equipe.
  - **Destinatário = usuário→equipe→opt-in:** os alvos são os membros da **equipe de plantão configurada** (`isp.equipe.incidente`) com **telefone cadastrado** e o **opt-in "recebe alerta de incidente" ligado** no vínculo com a equipe. Resolvido no banco (determinístico); envio via `whatsapp-smart-send` (template HSM fora da janela, 1:1, nunca grupo — limite da Meta). Sem equipe/elegível/template → degradação graciosa (alerta in-app).
  - **Cron de outage** passou a reusar o mesmo alerta à equipe (além do in-app), com a mesma dedup/cooldown e as duas travas OFF.
  - Config nova na tela **ISP → Abertura de chamado**: card "Equipe de plantão" (equipe + limiar % + template + cooldown). Campos novos: telefone no cadastro de Usuários e toggle "recebe alerta" por membro em WhatsApp → Equipes e Filas. Log por destinatário em `isp_incident_team_alerts`; auditoria `isp.incident.auto_detected`/`team_alerted`.
- **Padrão de telefone (porte do delivery-system).** Novo `components/ui/PhoneInput` (seletor de país + busca, guarda E.164 sem `+`), agora **obrigatório** para todo campo de telefone (CLAUDE.md). Backend ganhou `normalizePhoneFromUser`/`normalizePhoneFromWhatsApp`/`isValidPhone`/`phoneVariants` — o `normalizePhone` ingênuo (que corrompia número estrangeiro de 11 dígitos) foi trocado pela heurística madura; inbound do WhatsApp passou a usar `normalizePhoneFromWhatsApp`.
- **Fundação do catálogo de templates HSM (Fase A, inerte).** Porte do padrão do Aquapark (adaptado ao multi-tenant): `WhatsappTemplate` ganhou `is_system_template`/`event`/`buttons_json`/`variable_map_json`; `comm/whatsapp/template-catalog/` com `catalog.seed.ts` (só o template do **alerta de incidente**) e `template-actions.ts` (`resolveButtonUrl` ação→link + `system.public_url`). Ainda **não fiado** (sem mapper/service/boot-seeder) — arquivos puros, não referenciados, sem efeito em runtime. A fiação (seed por org + publish na Meta) é a próxima frente.
- **Regras novas no CLAUDE.md.** (1) **Templates HSM**: o sistema tem que ter um catálogo nativo de padrões prontos-pra-publicar, com botões/links de acesso via `action`→`resolveButtonUrl`; todo novo emissor fora da janela de 24h nasce com sua linha no catálogo. (2) **Rodapé da sidebar**: aviso passivo de "nova versão disponível" (via `GET /system/version`), padrão portado do delivery-system.

## v0.9.74 - 2026-07-13 (PIX copia-e-cola na página de pagamento)

Sem `db push`. Backend (provider IXC + tool) + frontend (página pública).

- **PIX copia-e-cola na página `/pagar/:token`.** Nova op canônica `financeiro.boleto_pix`: para cada boleto em aberto, chama o `get_boleto` (tipo=dados, como o botão "Copiar código PIX" do IXC) e extrai o BR Code. **Detecção determinística pelo FORMATO** (`findPixEmv`): o EMV começa com "0002" e contém `BR.GOV.BCB.PIX` — não depende do nome do campo (o IXC/gateway varia), respeitando o "não chutar IXC". A tool `gerar_link_pagamento` faz merge do PIX no snapshot por id do boleto.
- **Página:** mostra o **PIX copia e cola** (copiável, em destaque) + linha digitável + botão "Abrir boleto ou pagar com QR Code" (a página do gateway já traz o QR). Degradação graciosa: se o ERP não devolver o PIX, a página fica só com linha digitável + link.

## v0.9.73 - 2026-07-13 (Frente 5: link público de pagamento — 2ª via gerada no chat, expira sozinha)

⚠️ **`db push` (destrutivo)** — modelo novo `IspPaymentLink`. Backend + frontend + `CONTENT_VERSION` v29.

- **Página pública de 2ª via, sem login** (`/pagar/:token`). A IA gera na hora um link tokenizado (48 chars, inguessável) com o **snapshot** dos boletos em aberto; o link **expira por tempo** (janela configurável, padrão 24h) e não pede dados de acesso. Porte do `PortalAccessToken` do Aquapark — **sem** a sessão JWT. Rota pública espelha o `/convite/:token`.
- **Backend:** `IspPaymentLink` (schema), `IspPaymentLinkService` (cria com TTL+snapshot; resolve com **410 Gone** genérico se expirou/inválido — sem enumerar tokens) + repository + `IspPaymentLinkController` (`@Public GET /isp/pagamento/:token`, throttle 30/min). A org sai do próprio token.
- **IA:** tool `gerar_link_pagamento` (busca os boletos em aberto → cria o token → devolve a URL). Roteiro (bloqueio + 2ª via/fatura) passou a **preferir o link de pagamento**; se a ferramenta devolver `error` (ex.: URL pública não configurada), cai na linha digitável direto — degradação graciosa, sem inventar link.
- **Config (ISP → Abertura de chamado):** card "Link de pagamento" com validade (1h/6h/24h/48h) + endereço público do sistema. Em `system_settings` (`isp.pagamento.ttl_horas` / `isp.pagamento.base_url`), viaja no backup. A URL vem da config (a IA roda no worker, sem request — nunca de env manual).
- **Decisões do Robson:** janela de tempo + TTL configurável (24h) + snapshot.

## v0.9.72 - 2026-07-13 (Assistente não inventa "assunto em andamento" na 1ª identificação)

Sem `db push`. Backend (roteiro do assistente-exemplo) + `CONTENT_VERSION` v28.

- **Corrige o texto:** ao identificar um cliente na PRIMEIRA vez (a pessoa só mandou o CPF, sem ter pedido nada antes), o assistente não diz mais "já sigo no mesmo assunto que estava em andamento" — não havia assunto. Agora só carrega uma solicitação anterior quando ela EXISTE de fato; na 1ª identificação, confirma o cliente e segue a rotina normal (diagnóstico).

## v0.9.71 - 2026-07-13 (Fix: IA volta a marcar a conversa + Frente 4: bloqueio por inadimplência)

Sem `db push`. Backend (attendance + tools + roteiro) + `CONTENT_VERSION` v27.

- **FIX (regressão da v0.9.66): a IA voltou a marcar a conversa como "atendido pela IA".** `assignBot` usava `NOT: { owner_type: 'QUEUE' }` — gotcha de NULL no SQL: `NOT (owner_type = 'QUEUE')` com `owner_type` NULO (toda conversa NOVA) dá NULL = falso, então o update casava 0 linhas e a conversa não virava BOT (ficava em "Aguardando / sem atendente" em vez da aba IA). Trocado por OR null-safe (`AND [ OR(handler null|BOT), OR(owner null|BOT) ]`). Mesmo gotcha que o comentário do `current_handler_type` já alertava.
- **FRENTE 4 — cliente bloqueado por inadimplência.** (1) **Rotina proativa:** ao identificar o cliente, o assistente roda o diagnóstico e conduz pela situação — não devolve mais um menu genérico quando dá pra já verificar (a não ser pedido só de fatura/2ª via). (2) **Bloqueio:** o diagnóstico já expõe `contrato.bloqueado` (contrato ativo com `status_internet` ≠ 'A'); nova situação no roteiro — não trata como problema técnico, não abre chamado de suporte, tenta o desbloqueio, oferece a 2ª via e encaminha pra fila do **Financeiro**. (3) **Desbloqueio de confiança AUTÔNOMO:** `desbloqueio_confianca` entra no assistente com `requires_approval: false` — a IA executa e o **próprio ERP é o porteiro** (recusa se a regra do provedor não permitir; nesse caso a IA não promete o desbloqueio, segue com o pagamento). Constante `ASSISTANT_TOOLS` renomeada (não é mais "read only").

## v0.9.70 - 2026-07-13 (Config: quantos boletos a IA envia — vencidos primeiro)

Sem `db push`. Backend (config + projeção + tools) + frontend (tela ISP) + `CONTENT_VERSION` v26.

- **Nova config "Envio de boletos" (ISP → Abertura de chamado).** Dropdown "Máximo por mensagem" (1, 2, 3, 5, 10, Todos) — sem campo livre. Guardado em `system_settings` (`isp.boleto.max_envio`, default 3; 0 = todos), viaja no backup, ACL `isp.incidents.read/write`. Endpoints `GET/PUT /isp/os-config/boleto-max`.
- **Aplicação determinística (o modelo não decide o número).** As tools `consultar_debitos` e `segunda_via_boleto` ordenam os boletos em aberto por `limitBoletos` (vencidos primeiro, o mais atrasado no topo; depois por vencimento) e cortam no limite. Retornam `total_em_aberto` pra IA avisar quando há mais do que o mostrado. Histórico não entra no limite. Roteiro atualizado: mostra os vencidos primeiro e, se houver mais, avisa e oferece enviar o restante.

## v0.9.69 - 2026-07-13 (Assistente carrega a intenção ao trocar de CPF + marca boleto vencido)

Sem `db push`. Backend (projeção de boleto + roteiro do assistente-exemplo; `CONTENT_VERSION` v25 re-aplica no boot).

- **Boleto vencido é marcado pelo SISTEMA (determinístico).** `projectBoleto` passou a calcular `vencido` + `dias_em_atraso` comparando a data de vencimento com a data do servidor (só por data, sem hora, imune a fuso) — o modelo não compara datas. Só aparecem quando o boleto está de fato vencido. O roteiro (situação "2ª via/fatura") manda avisar com clareza que o cliente está EM ATRASO (há quantos dias) e oferecer a 2ª via pra regularizar — sem afirmar que o acesso está bloqueado (o contrato pode seguir ativo; bloqueio só se confirma pelo diagnóstico). Era o caso da Faiani: boleto vencido em 10/07 mostrado neutro como "em aberto".
- **Ao trocar de CPF no meio, o assistente carrega a solicitação em curso.** Situação "conversa em andamento": se a pessoa já tinha pedido algo (boleto, 2ª via, sem internet, chamado) e envia outro CPF, o assistente re-identifica e **segue com a MESMA solicitação** pro novo assinante (ou confirma específico: "Quer o boleto do(a) <nome>?") — não volta pro menu genérico "o que você precisa?".

## v0.9.68 - 2026-07-13 (À prova de erro: o modelo não escolhe conexão nem assunto inválido)

Sem `db push`. Backend (provider IXC + schema das tools ISP; worker re-sincroniza o catálogo no boot).

- **A conexão de ERP NÃO vem mais do modelo.** Todas as tools ISP expunham `connection_id`/`filial` no schema, e o modelo confundia o **login** do assinante (ex.: "torre3pratinha") com a **conexão de ERP** e passava um `connection_id` inválido → "Conexão de ERP informada não está ativa neste escopo". Removidos `connection_id`/`filial` do schema de todas as tools ISP: o agente **sempre auto-resolve** a conexão pelo escopo (org/workspace/ambiente + prioridade); só nós de workflow podem injetar explicitamente. Mesmo padrão da v0.9.67 (setor/assunto): o modelo decide só o que é dele (CPF/descrição/login), nunca ids de infraestrutura.
- **O "Descobrir recursos" traz SÓ os assuntos com processo de O.S. vinculado** (`id_processo` ≠ 0). É o processo que abre a OS a partir do atendimento; assunto sem processo faz o IXC recusar ("Departamento destino"). Filtrando na origem, o operador **não consegue escolher** um assunto inválido na config de abertura de chamado — prevenção em vez de validação depois. (O setor já era filtrado por `su_ticket_setor` ativos.)
- Regra registrada no CLAUDE.md: id que a IA consome (conexão, setor, assunto) nunca é texto livre nem escolha do modelo — vem da CONFIG curada ou é auto-resolvido; as OPÇÕES da config vêm filtradas da fonte (só as utilizáveis); config/infra quebrada → degradação graciosa (encaminha pra fila), nunca erro críptico ao cliente.

## v0.9.67 - 2026-07-13 (Intermitência da OS resolvida de vez: setor/assunto SÓ da config)

Sem `db push`. Backend (tool `abrir_os` + provider). Remove o debug da v0.9.66.

- **A causa REAL da intermitência: o modelo passava `setor="suporte"` (a palavra).** O log de debug pegou o body: `id_ticket_setor:"suporte"` em vez de `"2"`. O `abrir_os` deixava o modelo **sobrescrever** o setor/assunto (params opcionais "para sobrescrever"), e às vezes o modelo mandava a palavra "suporte" — que o IXC recusa como departamento ("Departamento destino"). Quando não mandava, usava a config (id "2") e abria — daí a intermitência. Agora **setor e assunto vêm SÓ da config** (ids curados); os params de override saíram do schema — o modelo só decide CPF/descrição/login. (O `id_wfl_processo=1` sempre esteve certo — o retry da v0.9.66 era defesa extra, mantido; não era a causa.)

## v0.9.66 - 2026-07-13 (Intermitência da OS: retry na leitura do processo do assunto + debug)

Sem `db push`. Backend (provider IXC). Inclui o fix do assignBot da v0.9.65.

- **Corrige a intermitência do "Departamento destino".** A OS abria às vezes e falhava às vezes com a MESMA config. Causa: `processoDoAssunto` lê o `id_processo` do assunto a cada abertura, e a API do IXC **erra calado** (a listagem às vezes volta vazia). Sem o `id_processo`, o ticket saía sem `id_wfl_processo` → o assunto "obriga processo" → o IXC tentava anexar sozinho e pedia o "Departamento destino". Agora a leitura **repete até 3x** quando a lista vem vazia. Log `[DBG-OS]` temporário pra confirmar (removido na próxima).
- (v0.9.65) **Handoff pra fila não é reassumido pela IA:** o `assignBot` do nó do agente não reassume conversa com `owner=QUEUE`.

## v0.9.65 - 2026-07-13 (Handoff pra fila não é mais "roubado" de volta pela IA)

Sem `db push`. Backend.

- **A conversa fica na fila depois do handoff.** A IA encaminhava pra fila (`encaminhar_para_fila` → `handoffToQueue` → `owner=QUEUE`, solta o handler), mas o nó do Agente chama `assignBot` ao FIM do turno para marcar "atendido pela IA" — e isso rodava DEPOIS do handoff, reassumindo a conversa pro BOT (ela voltava pra aba "IA"). Agora o `assignBot` **não reassume conversa com `owner=QUEUE`** (`NOT owner_type QUEUE` no lock condicional): entregou pra fila, fica na fila para o atendente humano.

## v0.9.64 - 2026-07-13 (Remove o log de debug do su_ticket)

Sem `db push`. Backend (provider IXC). Tira o `[DBG-OS]` temporário da v0.9.63.

- **Debug removido.** O log do corpo do `su_ticket` (v0.9.63) confirmou que o body é o correto (`id_ticket_setor=2`, `id_wfl_processo=1`) e a OS abre (chamado 3943). O "Departamento destino" que aparecia era o **worker rodando estado antigo** (config `setor=4` de antes do re-pick / código desatualizado) — o restart do deploy o atualizou. Não há cache de config no código (lê do banco a cada abertura), então mudar só a config já vale sem deploy; mudar código exige o restart do worker (que o `upgrade.sh` worker-first já faz).

## v0.9.63 - 2026-07-13 (debug temporário — log do corpo do su_ticket) [substituída pela v0.9.64]

## v0.9.62 - 2026-07-13 (Config de OS = departamento do atendimento + negrito sem e-mail/link)

Sem `db push`. Backend (conteúdo `v24`) + front do admin.

- **Rótulo da config de OS clarificado.** Depois da frente 2 o "Setor" da config passou a ser o **departamento do atendimento** (`su_ticket_setor`: Suporte/Financeiro), não o `empresa_setor` antigo. A tela ISP → Abertura de chamado agora explica isso e pede para re-escolher o departamento se a config é anterior à atualização. (Quem tinha o id antigo — ex.: `4` — recebia do IXC "Preencha o campo Departamento destino" ao abrir; a correção é re-escolher o departamento na tela.)
- **Negrito não vaza em e-mail/login/link.** O login pode ser um e-mail (`x@dominio.com`); o WhatsApp linkifica e o `*negrito*` em volta aparece literal. Regra na persona (`v24`): não usar negrito em texto com `@` ou `http`.

## v0.9.61 - 2026-07-12 (Frente 3 — UI de mapeamento setor→fila)

Sem `db push`. Backend + front do admin.

- **Tela para mapear setor→fila** (em ISP → Abertura de chamado). Dois seletores — "Fila de Suporte" e "Fila do Financeiro" — populados com as filas cadastradas (WhatsApp → Equipes e Filas); salva o mapa em `system_settings` (`isp.fila.suporte`/`isp.fila.financeiro`). Antes só o seed auto-mapeava e ajustar exigia mexer no settings na mão. Endpoints `GET/PUT /isp/os-config/filas` (perm `isp.incidents.read/write`); `IspOsConfigService.getQueueMapping/setQueueMapping`.

## v0.9.60 - 2026-07-12 (Frente 3 — handoff do bot para a fila de setor (Suporte/Financeiro))

Sem `db push`. Backend. Conteúdo do assistente re-aplicado (`v23`).

- **A IA agora ENCAMINHA de verdade para a fila do setor** (antes só dizia "vou deixar na fila"). Nova tool `encaminhar_para_fila(setor)` + método `ChatAssignmentService.handoffToQueue` (bot-autorizado, ação segura: devolve ao time humano; solta o handler, põe a conversa na fila `owner=QUEUE`, volta pra OPEN pra um atendente assumir; grava evento `TRANSFERRED` ator=BOT). A mensagem de "está na fila, aguarde" a própria IA envia na resposta (não é envio de sistema — não fura o reply gate). Roteiro (`v23`): ao abrir o chamado, informa nº+72h+fila e **chama `encaminhar_para_fila('suporte')`**.
- **Filas de setor por config (DECISÃO B).** O seed cria "Fila Setor de Suporte" e "Fila Setor Financeiro" (vazias) e mapeia setor→fila em `system_settings` (`isp.fila.suporte`/`isp.fila.financeiro` = id da AttendanceQueue). Idempotente. O operador pode re-mapear/renomear na tela WhatsApp → Equipes e Filas. Se a fila não estiver configurada, a tool devolve "não configurada" e a IA encaminha para um atendente genérico.
- A fila do Financeiro já fica pronta para a frente 4 (bloqueio/inadimplência → fila financeiro). Sem UI dedicada de mapeamento ainda (o seed auto-mapeia; ajuste via settings) — pendência menor.

## v0.9.59 - 2026-07-12 (Atendimento: envia o processo do assunto (id_wfl_processo))

Sem `db push`. Backend (provider IXC). Fix da v0.9.57/58.

- **`su_ticket` recusava com "Por favor preencha um processo!".** O assunto tem "Obrigar processo no atendimento"=Sim, então via API o IXC exige `id_wfl_processo` explícito. Agora o provider lê o processo configurado no próprio assunto (`su_oss_assunto.id_processo`, ex.: O.S. OPA SUITE) e o envia — determinístico, sem config extra. Novo helper `processoDoAssunto`.

## v0.9.58 - 2026-07-12 (Atendimento: `titulo` obrigatório no su_ticket)

Sem `db push`. Backend (provider IXC). Fix da v0.9.57.

- **`su_ticket` recusava com "faltando a descrição do assunto".** Faltava o campo `titulo` (a "Descrição do assunto", obrigatório no IXC). Agora o ticket manda `titulo` (a descrição do problema, curta até 200 chars); a mensagem completa segue em `menssagem`.

## v0.9.57 - 2026-07-12 (Frente 2 — abrir OS pelo fluxo de ATENDIMENTO do IXC (su_ticket + processo))

Sem `db push`. Backend (provider IXC). **Exige RE-CONFIGURAR o setor da OS após o deploy** (ver abaixo).

- **OS nasce do atendimento (`su_ticket`), não mais do insert direto.** O insert direto em `su_oss_chamado` abria a OS mas o IXC ignorava o contrato e não copiava o endereço. Agora o `os.cadastrar` do provider IXC: `gerar_protocolo_atendimento` → insere um `su_ticket` cujo **assunto tem um processo vinculado** ("O.S. OPA SUITE") → **o processo abre a OS com contrato + endereço no contexto** (do jeito OpaSuite). Campos do ticket: protocolo, tipo=C, id_cliente, id_login (id num), id_contrato (id num do login), id_filial, id_assunto, id_ticket_setor, origem_endereco (L se login tem endereço próprio, senão C), menssagem (descrição), su_status=N, status=T, atualizar_cliente/login=S.
- **Setor agora é o DEPARTAMENTO do atendimento (`su_ticket_setor`), não `empresa_setor`.** O "Descobrir recursos" passou a listar `su_ticket_setor` (ex.: Financeiro=1, Suporte=2). ⚠️ **A config de OS precisa ser RE-CONFIGURADA:** rodar "Descobrir recursos" na conexão IXC e escolher de novo o **setor (departamento)** e o **assunto** (um com processo vinculado, ex.: LENTIDÃO). O `assunto_id` antigo (su_oss_assunto) continua válido; o `setor_id` antigo (empresa_setor) precisa virar um `su_ticket_setor`.
- **Anti-duplicidade agora por login** (o setor do ticket ≠ setor da OS, então o escopo por setor saiu). O helper `abrirOs` virou `abrirAtendimento`; novo `gerarProtocolo`. Tabelas novas no provider: `su_ticket`, `su_ticket_setor`.

## v0.9.56 - 2026-07-12 (OS completa: contrato + origem do endereço automáticos; negrito do WhatsApp)

Sem `db push`. Backend (provider IXC) + conteúdo do assistente (`v22`).

- **OS sai com o contrato preenchido (automático).** Ao resolver o login, o provider já traz o contrato do próprio login (`radusuarios.id_contrato`) e preenche o `id_contrato` da OS — o agente não precisa acertar. (Antes a OS abria com o Contrato vazio.)
- **Origem do endereço correta.** O `origem_endereco` passa a ser `'L'` (Login) só quando o login tem endereço PRÓPRIO; quando ele herda o endereço do cadastro (`endereco_padrao_cliente='S'`, caso comum), usa `'C'` (Cliente). Antes marcava sempre 'L' quando havia login, mesmo o endereço vindo do cliente. O helper `resolveLoginId` virou `resolveLogin` e devolve id + contrato + flag de endereço próprio.
- **Negrito do WhatsApp (1 asterisco).** O assistente usava `**texto**` (Markdown), que o WhatsApp mostra literal. Regra de formato na persona: negrito é `*texto*` (um asterisco de cada lado).

## v0.9.55 - 2026-07-12 (Abrir OS: resolve o login pelo id — não pelo nome)

Sem `db push`. Backend (provider IXC).

- **Abertura de OS falhava por causa do login.** O `abrir_os` passava o NOME do login (ex.: "torre3pratinha") em `id_login`, mas no IXC `su_oss_chamado.id_login` é FK pro **id numérico** de `radusuarios` — a abertura era recusada. Agora o provider resolve o nome do login pro id (novo helper `resolveLoginId`) antes de abrir; se não encontrar, abre sem login (origem no endereço do cliente) em vez de falhar. A anti-duplicidade de OS (`os.listar_abertas`) recebeu a mesma tradução — antes o filtro por login nunca casava (nome ≠ id). O agente continua trabalhando com o NOME do login; a tradução pro id é do provider.
- **`id_contrato` também é id (guarda numérica).** O diagnóstico já entrega o `id_contrato` como id numérico, mas a abertura ganhou uma guarda: só envia `id_contrato` se for numérico — evita mandar o nome do plano por engano (o IXC recusaria, como no login).

## v0.9.54 - 2026-07-12 (Deploy: worker reinicia no upgrade + diagnóstico mostra opções para o cliente escolher)

Sem `db push`. Backend + `scripts/upgrade.sh`. Conteúdo do assistente re-aplicado (`v21`).

- **Bug de deploy: o worker não reiniciava.** O `upgrade.sh` mandava `pm2 restart iastudio-api iastudio-worker` num comando só, com o **api primeiro** — e o worker ficava de fora (rodou 19h sem reiniciar enquanto o api reiniciava a cada deploy). Como o worker roda o assistente e registra as tools **em memória**, a tool nova do diagnóstico (`diagnosticar_conexao`, v0.9.50) nunca entrou nele → dava "sem handler builtin". Agora o upgrade reinicia o **worker primeiro** e o **api por último**, cada um em seu comando (o restart do api é o momento de risco pro próprio script de upgrade). Mudanças de roteiro/persona não sofriam disso (vivem no banco, lidas a cada run); só tool/código novo exigia o restart do worker.
- **Diagnóstico: mostrar as opções e o cliente escolhe (nunca pedir login/endereço digitado).** O assistente pedia para o cliente digitar o login ou o endereço do ponto — dados que ele pode não saber e que podem não bater com o cadastro. Agora sempre LISTA as opções que a ferramenta traz e o cliente escolhe pelo número. Opções de contrato passam a trazer **plano + número do contrato + endereço** (o número do contrato desempata quando dois têm o mesmo plano, ex.: dois "600 MEGAS FIBRA"); opções de conexão trazem login + referência + endereço.

## v0.9.53 - 2026-07-12 (Abertura mais natural — reconhece o número na saudação + cumprimenta uma vez só)

Sem `db push`. Backend. Conteúdo do assistente re-aplicado (`v20`).

- **Reconhece o número já na saudação.** Se o WhatsApp é de um número salvo no cadastro de um cliente, a abertura já reconhece na primeira mensagem ("Olá! Vejo que este número está salvo para <nome>. É sobre a conexão dele(a) ou de outro cliente?") em vez de saudar genérico e só identificar depois. Se o número não é conhecido, cumprimenta e pergunta o motivo.
- **Cumprimenta uma vez só.** A IA saudava duas vezes (na 1ª e na 2ª mensagem) — nada natural. Agora é regra de estilo na persona ("cumprimentar uma única vez, não repetir 'olá/oi'"), numa casa só.

## v0.9.52 - 2026-07-12 (Consolidação do agente ISP — fim da duplicidade + identificação determinística + persona padrão)

Sem `db push`. Backend. Conteúdo do assistente re-aplicado (`v19`).

- **Fim da duplicidade de lógica do agente.** A mesma regra vivia em 3-6 lugares (system_prompt + roteiro passos + roteiro situações + persona) com frases diferentes — o modelo recebia instruções redundantes/conflitantes e produzia respostas sem lógica. Agora cada assunto tem UMA casa: **persona** = só tom/formato; **system_prompt** = 3 guardrails transversais (quem você é / dado é do titular / não invente); **roteiro** = casa única do fluxo (triar → identificar → diagnóstico + situações), cada regra uma vez. Sem regra de negócio na persona nem no system_prompt.
- **Identificação determinística (raiz do "CPF enviado" fantasma).** A tool `identificar_cliente` passou a devolver COMO identificou (`identificado_por: 'telefone' | 'documento'`). O assistente apresenta a verdade — se foi pelo telefone, diz "este número está salvo para o cliente X"; nunca mais afirma que um CPF foi enviado quando não foi. Mesma filosofia da frente 1 (sistema decide, modelo apresenta).
- **"Nome que a IA usa" agora funciona.** O campo `name` da persona era ignorado pelo backend (não chegava no prompt). Agora o `compilePersona` injeta "Você se chama <nome>" — o assistente se apresenta pelo nome de verdade (genérico, vale para todo agente).
- **Persona padrão do exemplo ISP:** nasce como NETE, tom amigável, emojis moderado, respostas médias (4-6 frases) — os padrões pedidos. Como viajam no CONTENT_VERSION, não "resetam" a cada atualização. Modelo padrão do exemplo ajustado para `gpt-5.4` (confirmado respondendo; o `gpt-5.5` não retornou nos testes).

## v0.9.51 - 2026-07-12 (Identidade — documento manda sobre telefone + transparência na identificação por telefone)

Sem `db push`. Backend. Conteúdo do assistente re-aplicado (`v18`).

- **CPF/CNPJ digitado tem PRIORIDADE sobre o telefone.** A tool `identificar_cliente` buscava por telefone com precedência ("o dado que o atendimento possui") — mas o número do WhatsApp pode estar salvo no cadastro de OUTRA pessoa no ERP. Resultado real: o cliente enviava um CNPJ e a IA respondia com o titular do telefone (outra pessoa), ignorando o documento. Agora, se há um CPF/CNPJ informado, a identificação é por ele; o telefone só vale quando nenhum documento foi enviado (1º contato).
- **Transparência na identificação por telefone.** Quando o número está salvo no cadastro de um cliente, o assistente não presume mais que o atendimento é para ele: informa "vejo que este número está salvo para o cliente <nome>" e pergunta se é sobre a conexão desse cliente ou de outro — se for outro, pede o CPF/CNPJ para localizar. Roteiro (`v18`) + system_prompt atualizados; a situação "número salvo/vinculado" passou a exigir a confirmação antes de seguir.

## v0.9.50 - 2026-07-12 (Frente 1 — diagnóstico determinístico + funil + modelo forte + encerrar conversa da IA)

Sem `db push`. Backend + front do admin. Conteúdo do assistente re-aplicado (`v17`). Primeira frente do redesenho do assistente ISP (spec-assistente-isp §2). **Substitui a v0.9.49**, cuja tag caiu no commit da v0.9.48 (um `index.lock` órfão travou o commit local, então a frente 1 nunca subiu — nenhuma linha desta frente estava em produção).

- **Diagnóstico determinístico contrato→login (tira a lógica multi-passo do modelo).** Nova tool `diagnosticar_conexao` + `IspDiagnosisService`: o **sistema** decide as etapas e o modelo só apresenta. Recebe o CPF (e, nas re-chamadas, a escolha do cliente) e devolve a próxima etapa — `escolher_contrato` (opções pelo **plano**), `escolher_login` (pelo **login + referência** do ponto) ou `resolvido` (status do login online/desde + situação do contrato). Suprime **contratos inativos** (`status ≠ 'A'`) e **logins inativos** (`ativo ≠ 'S'`); filtra os logins pelo contrato escolhido (`id_contrato`). Compõe os ops canônicos (`cliente.dados`+`cliente.planos`+`cliente.acesso`) — vale para IXC e Altarede sem tocar provider.
- **Funil: `diagnosticar_conexao` é a ÚNICA porta.** O assistente ISP deixou de ter `consultar_contrato` e `status_conexao` na lista de ferramentas — com elas, o modelo pegava o atalho e nunca chegava ao login certo (anunciava "conexão ativa" mesmo com vários contratos). As duas seguem registradas no catálogo para workflows/outros agentes; só saíram deste assistente.
- **Modelo forte por padrão (porte do Aquapark).** O assistente-exemplo ISP nasce com `gpt-5.5` (o mini não sustenta o encadeamento de ferramentas do diagnóstico). E o campo **Modelo** do editor virou **dropdown curado** (sem digitação livre — jargão perigoso pro usuário), com `gpt-5.5`/`gpt-5.4` na lista; um modelo legado fora da lista é preservado como opção "(atual)".
- **Rótulo que distingue de verdade.** Como o endereço quase sempre é **herdado** do cliente (confirmado na base real: `endereco_padrao_cliente='S'`, campos vazios), rotular por endereço não separava as opções. Agora contrato mostra o **plano** e login mostra **login + referência**; o **endereço** entra só quando é próprio do ponto. Endereço efetivo: próprio do login → próprio do contrato → do cliente (DECISÃO A). Acima de 5 logins, `muitos=true` e o assistente pede um dado para estreitar em vez de listar tudo.
- **Encerrar conversa atendida pela IA (bug de permissão).** O botão "Encerrar" barrava ("Sem permissão para encerrar esta conversa") quando a IA estava no comando: o gate tratava o handler **BOT** como se fosse humano. Agora só barra quando um **humano** (`current_handler_type='USER'`) está atendendo — encerrar uma conversa da IA ou sem handler não rouba trabalho de ninguém, então quem tem permissão de encerrar encerra sem precisar assumir antes.
- **Roteiro do assistente (`v17`).** O passo "chegar até o login" manda **usar a ferramenta de diagnóstico** (não raciocinar os passos) e apresentar só o que está fora do normal. As projeções `projectContrato`/`projectConexao` passaram a expor endereço/referência/`endereco_proprio` (ponto único de normalização dos dois ERPs).

## v0.9.48 - 2026-07-12 (fix do build da v0.9.47 + aprovar executa + OS com endereço + saudação/login/72h)

Sem `db push`. Backend + front do admin. Conteúdo do assistente re-aplicado (`v15`). **Substitui a v0.9.47**, cujo build abortou (fail-safe manteve a produção na v0.9.46): o contexto de execução da ação aprovada não incluía `agentId`/`traceId` (obrigatórios em `ToolExecutionContext`) — corrigido guardando-os no pedido de aprovação e reconstruindo-os na execução.

- **Aprovar agora EXECUTA a ação (bug crítico).** O `decide` só mudava o status para APROVADO e **nunca rodava a ação** (a OS nunca abria no IXC mesmo após aprovar). Agora, ao aprovar, a ação é executada de verdade sob o mesmo escopo do run (via `ToolRuntime.runApproved`), com o escopo (workspace/ambiente/conexão) guardado no pedido de aprovação. Falha na execução fica registrada no próprio pedido. (Com o `abrir_os` automático da v0.9.46 isso nem é mais o caminho comum — mas o botão Aprovar precisava funcionar.)
- **OS sai com o endereço certo.** O provider abria a OS com `origem_endereco = Manual` (endereço/lat-long vazios). Agora usa o endereço do **login** (quando informado) ou do **cliente** — nunca Manual. E o roteiro leva a IA a chegar até o **login específico** (um cliente pode ter 2 contratos e vários logins por contrato) e passar o login/contrato daquela conexão na abertura.
- **Saudação e fluidez.** A abertura fala em "conexão/internet de um assinante" (não "conta") e, na venda, **orienta o próximo passo** (escrever cidade/endereço + plano que procura) em vez de só dizer "não precisa de CPF". Guardrail de **quebra de linha**: separar pontos/passos em linhas para ficar legível no WhatsApp (o envio já preserva `\n`; era o modelo escrevendo grudado).
- **Fechamento do chamado.** Ao abrir, a IA informa o número, o prazo de **até 72h** e que vai deixar o atendimento na fila da supervisão. (A ação de mover a conversa para a fila da supervisão + a mensagem automática de "seu chamado está na fila de supervisão" é uma capacidade nova de atendimento — **fica para a próxima versão**; nesta a IA só comunica.)
- **Varredura de contratos front↔back (parcial).** Corrigidos os 400 de whitelist em **Custos** (criar/editar orçamento não mistura mais `is_active`/`period_kind`; simulador manda `runs_per_month` sem `provider_kind`). Restam da varredura: MCP/Política/Memória (campo a mais no create/update), Incidente (`auto_detect`), Ambiente (`type`→`kind`), Workspace (`slug` obrigatório sem campo na UI) — **fila da próxima versão**.

## v0.9.46 - 2026-07-12 (suporte a GPT-5.x na API (porte Aquapark) + guardrails sucinto/nome≠CPF)

Sem `db push`. Backend. O modelo do assistente troca-se na aba Ajustes (sem deploy).

- **Suporte aos modelos GPT-5.x / série "o" na chamada da OpenAI (porte do Aquapark).** Esses modelos mudam o contrato da API: só aceitam `temperature` padrão (qualquer valor custom → HTTP 400) e usam `max_completion_tokens` em vez de `max_tokens`. O provider da OpenAI agora detecta `gpt-5*`/`o<n>*` e **omite a temperature** + usa o parâmetro certo. Sem isto, escolher um modelo GPT-5.x quebrava a chamada. Agora dá pra apontar o assistente pra um modelo mais forte na aba **Ajustes** (o gpt-4o-mini é fraco pra nuance — foi o que fez ele reler "sou o cliente Fabricia" como "cliente da Fabricia" e alucinar um CPF que ninguém enviou).
- **Guardrails do assistente (re-aplicados, `v14`):** responder **em 1–3 frases**, direto; **nome não é CPF** — se a pessoa diz o próprio nome ("sou o cliente Fabricia Bastos") ela está se identificando (ela É essa pessoa), e ainda assim é preciso o CPF/CNPJ pra localizar; **nunca** dizer "não localizei com o CPF informado" quando nenhum CPF foi enviado.
- **Lógica de conversação (fluidez).** A abertura já orienta: "se for sobre a conta de um assinante (sem internet, fatura, 2ª via, chamado), me envie o CPF/CNPJ do titular; se for para contratar, não precisa". E o gate fica explícito no roteiro: **assunto de assinante só avança com o CPF** — se não veio, pede e aguarda, sem tentar consultar/resolver antes de identificar. Assim a pessoa manda o CPF de imediato, sem a IA ficar repetindo "em que posso ajudar".
- **Abrir OS volta a ser AUTOMÁTICO (aprovação é opt-in).** O `abrir_os` estava caindo em "Pendências" (aguardando aprovação) porque o catálogo de tools era *create-if-missing*: o `requires_approval` antigo ficava preso no banco e a mudança pra `false` no código nunca propagava. Agora o seed **sincroniza os campos code-owned das tools builtin** (o código é a fonte da verdade) — o `abrir_os` abre direto. Quem quiser revisão antes de executar liga uma **Política** em IA Studio → Pendências → Políticas (opt-in), sem mexer no código.
- **Anti-duplicidade de OS escopada por SETOR.** Antes de abrir, a IA **sempre** verifica se já existe chamado aberto para o cliente — mas agora só conta como duplicado o chamado **do mesmo setor** da abertura. Uma OS aberta em outro setor (ex.: financeiro) não bloqueia mais um chamado de suporte. Se existir um no mesmo setor, a IA informa o número em vez de abrir outro.
- **Pendências (Aprovações) — aprovar/rejeitar quebrado corrigido.** O front mandava `{ decision: 'APPROVED'/'REJECTED' }` mas o backend espera `{ approve: boolean }` — dava o erro "property decision should not exist, approve must be a boolean value" e nada acontecia. Corrigido para `approve: true/false`. Também: a ação passa a aparecer com **nome amigável** (ex.: "Abrir chamado" em vez de `abrir_os`) e o texto de rejeitar foi corrigido — rejeitar **não** é destrutivo (só recusa a execução, nada é alterado), a redação anterior dizia o contrário.

## v0.9.45 - 2026-07-12 (agrupamento de mensagens na origem (porte Aquapark) + re-aplica prompt do assistente)

Sem `db push`. Backend + front do admin. Corrige o que a v0.9.44 não resolveu.

- **Agrupamento de mensagens picadas refeito — na ORIGEM, igual ao Aquapark.** A v0.9.44 ainda tinha o debounce DENTRO do nó Assistente: cada mensagem virava um run que dormia e comparava ids, e a própria resposta da IA "superava" a mensagem seguinte do cliente — resultado, respondia só a saudação e perdia contexto. Agora o agrupamento é no **dispatch** (`AutomationProcessors`), portando o padrão do SDR do Aquapark: um timer **por conversa** que REINICIA a cada mensagem nova e dispara **UMA vez** quando o cliente para de digitar. Chega **um** run só ao assistente, que lê o histórico completo e responde **juntando tudo**. Janela por `WHATSAPP_DEBOUNCE_MS` (default 8s). O debounce interno do nó foi removido.
- **Comportamento do assistente movido para o LUGAR CERTO (Passos + Situações).** Antes o comportamento vivia num blocão em "Instruções adicionais (avançado)" — só o dev entendia. Agora vive no **roteiro estruturado** (aba "O que faz"): Passos na ordem (entender motivo · continuar de onde parou · identificar · venda não pede CPF · escolher a conexão certa) e Situações "Quando… faça…" (sem internet, incidente na região, abrir chamado no "sim", 2ª via, venda). O dono do negócio abre o assistente e **lê/edita a lógica nas caixinhas**. "Instruções adicionais" ficou com 3 guardrails gerais só.
- **Prompt volta a ser re-aplicado no assistente existente.** A v0.9.44 marcou o conteúdo `v11` como semeado, então os ajustes não pegavam (por isso ainda anunciava "contrato ativo"). Bump para `v13-roteiro-estruturado` força a re-aplicação: **não anuncia o normal** (só o oposto — bloqueio/cancelado/incidente), **não recomeça a saudação** depois de identificar, **pergunta qual login** (com o endereço) quando há mais de um, e **abre a OS na mesma resposta** ao "sim".
- **Tick azul + "digitando"** (já descritos na v0.9.44) seguem: a IA marca lida + "digitando" ao começar; o atendente marca lida ao abrir e dispara "digitando" ao escrever.

## v0.9.44 - 2026-07-12 (WhatsApp: tick azul + "digitando" · assistente menos engessado · OS mais robusta)

Sem `db push` (nenhuma mudança de schema). Backend + front do admin.

- **Tick azul (lida) + "digitando…" no WhatsApp do cliente** — porte do padrão do Aquapark pra estrutura do IA Studio (Provider Registry). Um único POST à Meta (`status:'read'` + `typing_indicator`) marca a mensagem como lida e mostra "digitando" (some ao enviar a resposta ou em ~25s), ancorado no wamid da última mensagem recebida.
  - **A IA** marca lida + "digitando" assim que começa a processar a mensagem (o cliente vê o feedback enquanto a IA pensa).
  - **O atendente** marca lida ao abrir a conversa (tick azul) e dispara "digitando" enquanto escreve no campo de mensagem (throttle, só dentro da janela de 24h).
  - Novo: `markMessageRead` no cliente Graph, operação `markRead` no provider `whatsapp-meta`, `markRead`/`markReadByChat` no orquestrador, endpoint `POST /comm/whatsapp/chats/:id/typing`. Tudo best-effort — UX nunca quebra o atendimento.
- **Assistente menos engessado (continuidade/memória)** — depois de identificar/confirmar o cliente, a IA NÃO recomeça com a saudação nem repergunta "em que posso ajudar" quando o motivo já foi dito: dá andamento ao que a pessoa já pediu. E só informa o **oposto** do normal — não fica anunciando "seu contrato está ativo" (o esperado), só sinaliza bloqueio/cancelamento/incidente.
- **Múltiplos logins no mesmo contrato** — quando o cadastro tem mais de uma conexão, a IA PERGUNTA a qual login o cliente se refere, **listando o endereço** de cada um, antes de tratar status ou abrir chamado (não age no login errado).
- **Abertura de OS mais robusta** — a IA passou a **chamar a ferramenta de abrir OS na mesma resposta** ao "sim" (não protela com "já volto com o número"); e a checagem anti-duplicidade agora é **tolerante a falha** (se a listagem de OS abertas der erro, abre mesmo assim em vez de travar — erro silencioso não bloqueia o chamado). Refresh do conteúdo do assistente-exemplo: `v11-continuidade-os`.

## v0.9.43 - 2026-07-11 (dropdown de Setor da OS: lê empresa_setor, só ativos + fallback)

- **A causa do Setor vazio: eu lia a tabela errada.** A doc do IXC mostra que o campo `setor` da OS (`su_oss_chamado`) referencia **`empresa_setor.id`**, não `su_oss_setor` (que fica vazio em muitas bases). Troquei o discover (e o `atendimento.listar_setor`) para ler `empresa_setor` — agora o dropdown popula com os setores reais, e **só os ativos** (`ativo='S'`).
- **Fallback** (rede de segurança): se ainda assim nenhum setor for descoberto, o campo vira um **input pra digitar o id do setor** — não trava a config.
- Backend + front do admin, sem `db push`.

## v0.9.42 - 2026-07-11 (fix: ".map is not a function" na tela de Abertura de chamado)

- A tela de Abertura de chamado quebrava ao carregar a config: `getOsConfig`/`saveOsConfig` devolviam o envelope `{ items }` do `normalizeList` em vez do array, e a página fazia `.map` no objeto. Corrigido para devolver `.items` (o array). Só front do admin, sem `db push`.

## v0.9.41 - 2026-07-11 (a IA ABRE o chamado — config de setor/assunto + anti-duplicidade)

Precisa de `db push` (nova tabela `isp_os_config` — só adiciona). Fecha o ciclo de suporte técnico.

- **Config de abertura de OS (curada pelo operador).** Nova tela **ISP → Abertura de chamado**: um botão descobre os **setores e assuntos** direto do ERP (IXC), o operador escolhe quais a IA pode usar (pares setor↔assunto) e marca um como **padrão de suporte**. Assim a IA nunca chuta id — só usa valores válidos.
- **A IA abre a OS de verdade.** A ferramenta `abrir_os` foi habilitada no assistente-exemplo e **abre direto** (sem aprovação) após o cliente confirmar: preenche **setor+assunto pela config**, **CPF+filial** do cadastro, **login+contrato** da conexão com problema (essencial quando há mais de uma) e a **descrição** do problema (que a IA resume). Refresh `v10-abre-os`.
- **Sem duplicidade + guard de incidente.** Antes de abrir, checa se já existe **OS aberta** pra essa conexão/cliente (nova operação `os.listar_abertas` no IXC) — se existir, passa o número existente em vez de abrir outra. E o guard de incidente ativo já evitava OS duplicada em manutenção de região. Se a config não estiver pronta, a IA encaminha para um humano.
- Provider IXC: `os.listar_abertas` (anti-dup) + `id_contrato` na abertura de OS.

## v0.9.40 - 2026-07-11 (ajustes finos do assistente: abertura, CPF, status, chamado)

Cumulativa — garante no ar os ajustes de comportamento do assistente-exemplo (alguns já descritos na v0.9.39; esta versão assegura que todos entraram no build):

- **Abertura neutra:** cumprimenta e pergunta o motivo sem presumir que já identificou ("Robson" é só o nome do WhatsApp) — nada de "sua conta" antes de identificar.
- **Não inventa CPF:** ao não achar pelo telefone, apenas pede o CPF educadamente; não diz "não localizei este CPF" quando ninguém enviou CPF.
- **Sem contradição de status:** não fala "conexão ativa" e "conexão offline" na mesma frase — separa **contrato ativo** de **conexão offline no momento**.
- **Chamado sem beco sem saída:** em problema técnico, se a pessoa quer chamado, **encaminha claramente para um atendente humano** abrir a OS (a IA não abre a OS diretamente) — nunca um vago "acompanhe pelo suporte" nem promessa de chamado não aberto.

## v0.9.39 - 2026-07-11 (CPF com mais de um cadastro/contrato — pergunta qual)

- **Múltiplos cadastros/contratos no mesmo CPF/CNPJ.** O auto-vínculo só liga sozinho quando há **exatamente 1** cadastro. Se a identificação retorna **mais de um** (endereços/instalações diferentes), o assistente **não escolhe sozinho** e **não pede pra a pessoa digitar o endereço** (o que ela escreve pode não bater com o cadastro): ele **apresenta os endereços JÁ CADASTRADOS numa lista numerada** (como vieram do sistema) e a pessoa **escolhe pelo número**; só depois vincula o cadastro escolhido (pelo id). Idem para um cadastro com **vários contratos/conexões**. (Refresh `v9-multiplos-cadastros`.)
- **Abertura mais clara (sem parecer que já identificou).** A saudação dizia "Olá, Robson! ...suporte com sua conta" dando a entender que já sabia quem era — mas "Robson" é só o nome do WhatsApp e ninguém foi identificado ainda. Agora o assistente cumprimenta de forma **neutra** e pergunta **claramente o motivo**, sem falar "sua conta/seu cadastro" antes de identificar; enquanto o número não está vinculado, trata como desconhecido (descobre se é suporte de assinante ou interesse em contratar).
- **Fim da mensagem confusa "não localizei este CPF" quando ninguém deu CPF.** O assistente tentava identificar pelo telefone do WhatsApp; ao não achar, dizia "não consegui localizar um cadastro associado a este CPF" — sem a pessoa ter enviado CPF nenhum. Agora, se não encontra pelo telefone, ele apenas **pede o CPF/CNPJ educadamente**; só fala em "cadastro não encontrado" depois de um CPF de verdade não bater.
- **Suporte técnico: fim da contradição e do beco sem saída.** Não fala mais "conexão ativa" e "conexão offline" na mesma frase (separa **contrato ativo** de **conexão offline no momento**). E, quando é problema técnico e a pessoa quer chamado, em vez de "não posso abrir... acompanhe pelo suporte" (vago), ele **encaminha claramente para um atendente humano** dar sequência/abrir o chamado — nunca promete um chamado que não foi aberto.
- Cumulativa com a v0.9.38 (auto-vínculo ao identificar) e v0.9.37 (assume da IA + close→pool + fluxo técnico).

## v0.9.38 - 2026-07-11 (vínculo AUTOMÁTICO ao identificar + garante close→pool)

- **Vínculo agora é determinístico.** Antes dependia do modelo lembrar de chamar a ferramenta `vincular_cliente` — pouco confiável (às vezes não vinculava, e o "desvincular" nem aparecia). Agora a ferramenta **`identificar_cliente`** grava o vínculo automaticamente quando acha **exatamente 1 cliente**: aparece "Cliente: <nome>" + **desvincular** no cabeçalho, e a IA não re-pede o CPF. Outro CPF depois re-identifica e re-vincula sozinho.
- Cumulativa com a v0.9.37: **garante** no ar o *encerrar solta o atendente → volta pro pool* e o *fluxo de suporte técnico* (nomeia a conexão + oferece chamado), caso não tenham entrado no seu build da v0.9.37.

## v0.9.37 - 2026-07-11 (atendente assume da IA + fluxo de suporte técnico melhor)

- **"Assumir" numa conversa que a IA está conduzindo dava erro** ("Conversa já foi assumida por outro atendente"), porque o `claim` só aceitava conversa sem atendente (`current_handler_id = null`) e a IA está com ela (handler BOT). Agora o humano pode assumir de **null OU BOT** (tomar a frente da IA — normal, a IA para pelo gate); só bloqueia se **outro humano** já pegou. Corrige os toasts vermelhos ao clicar em Assumir numa conversa da IA.
- **Fluxo de suporte técnico mais completo (assistente-exemplo).** Ele dizia genérico "uma das conexões está offline" sem nomear e não sugeria chamado. Agora, ao verificar conexão, ele **diz qual conexão caiu (login) e desde quando**, dá a orientação básica, checa a região e **oferece abrir um chamado técnico** para aquela conexão (registrar/encaminhar). Refresh `v8-conexao-chamado`. (Obs.: o exemplo segue em modo leitura — ele *oferece/encaminha* o chamado; pra ele ABRIR a OS de fato precisaria habilitar a ferramenta de escrita `abrir_os`, com confirmação — decisão pendente do Robson.)
- **Encerrar solta o atendente → a conversa volta pro pool.** Antes, se um humano assumia (ou recebia por transferência) e depois **encerrava**, o handler continuava preso nele — quando o cliente voltava a escrever, a conversa reabria "atribuída" ao humano e a **IA não pegava de volta**. Agora o `close` limpa `current_handler`; ao reabrir por inbound, a conversa está sem atendente (pool) e a IA volta a atender.

## v0.9.36 - 2026-07-11 (vínculo CPF ↔ WhatsApp — a IA sabe de quem é o número)

Precisa de `db push` (só ADICIONA colunas — não perde dado). Cumulativa com a v0.9.35 (debounce + consistência de status/identidade).

- **Vínculo estruturado (raiz da confusão de identidade).** `WhatsappChat` ganhou `linked_customer_document/ref/name/linked_at` (o telefone → titular). A IA, depois de identificar e **confirmar** o CPF, chama a ferramenta **`vincular_cliente`** → o número fica ligado àquele cliente. Nas conversas seguintes ela **não pede o CPF de novo** e não mistura identidade (o nó Assistente injeta "esta conversa é do cliente X" no contexto).
- **Trocar de cliente:** se a pessoa quiser atender OUTRO cliente, o assistente avisa "é só me enviar o CPF" e, ao receber, **re-vincula** ao novo titular.
- **Desvincular pelo atendente:** no cabeçalho da conversa aparece "Cliente: <nome>" com um botão **desvincular** (perm `comm.whatsapp.claim`) — endpoint `POST /comm/whatsapp/chats/:id/unlink-customer`.
- Ferramenta `vincular_cliente` adicionada ao assistente-exemplo (refresh `v7-vinculo-cliente`). Sem válvula de segurança de CPF por ora (decisão do Robson) — o 2º fator pode ser plugado depois, como a spec previa.

## v0.9.35 - 2026-07-11 (debounce: agrupa mensagens picadas numa resposta só)

- **A IA deixa de responder 3x pra 3 mensagens seguidas.** Quando o assistente vai responder um inbound de WhatsApp, ele espera uma janela curta (~7s); se nesse meio-tempo chegou uma mensagem MAIS NOVA na conversa, esta execução não responde — quem responde é a execução da última mensagem, já com todo o histórico junto. Uma resposta por rajada. O evento inbound passou a carregar o `external_id` (wamid) pra essa comparação. (Porte do debounce do SDR do Aquapark.)
- **Assistente mais consistente sobre status.** Ele estava se contradizendo ("cadastro está ativo" e logo depois "sua conta está inativa") e concluindo "inativo" só porque não havia conexão ativa. Agora o system_prompt manda basear a conclusão no **status do CONTRATO** (não na mera ausência de conexão): sem conexão pode ser problema técnico (contrato ativo), bloqueio por pagamento, OU cancelamento — verificar antes de afirmar, e não dizer "inativa" se o cadastro está ativo.
- **Não misturar identidades.** Quando a pessoa no WhatsApp consulta o CPF de OUTRA pessoa (ex.: Robson pergunta pelo CPF da Fabricia), o assistente estava misturando ("Robson, sua conta..."). Agora ele separa: quem está no WhatsApp ≠ titular do cadastro consultado; refere-se ao titular pelo nome e não atribui a conta/conexão a quem está falando. (Refresh `v6-status-identidade`.)
- Sobe em cima da v0.9.34 (que já está em produção): adiciona debounce + os dois ajustes de comportamento acima.

## v0.9.34 - 2026-07-11 (corrige o TS que barrou a v0.9.33)

- **A v0.9.33 falhou no `API_BUILD`** (erro de tipo em `builtin-tools.ts`: `.catch(() => [])` fazia o TS inferir `never[]`, então `m.content` não existia em `never`). O painel de Atualização **mostrou a falha** e a produção ficou na versão anterior (fail-safe funcionando). Corrigido tipando o retorno como `WhatsappMessage[]` (em `builtin-tools.ts` e `agent.nodes.ts`). Cumulativa — traz tudo da v0.9.33 (IA assume conversa, aba IA/Aguardando, inativo→venda).

## v0.9.33 - 2026-07-11 (a IA ASSUME a conversa — "atendido pela IA" + regra: inativo vira venda)

- **assignBot: a IA passa a "atender" a conversa (BOT).** Quando o assistente responde de verdade numa conversa de WhatsApp, ele **assume o atendimento** (`current_handler_type=BOT`) — a conversa deixa de ficar solta em "Não atribuídas" e passa a mostrar **"atendido pela IA"**. Não rouba de humano (se um atendente está no comando, a IA não assume); e um humano pode **assumir** a qualquer momento (aí a IA para). Porte do `assignBot` do Aquapark (o schema já suportava BOT — sem `db push`).
- **Regra de negócio: cadastro/contrato INATIVO → VENDA, não 2ª via.** O assistente aprendeu a diferença: **bloqueado por inadimplência** (suspenso, reativa pagando) → oferece 2ª via; **inativo/cancelado** (contrato encerrado, não reativa pagando boleto antigo) → **não** oferece 2ª via, trata como **venda/negociação** e oferece um novo plano. (Refresh `v4-inativo-venda` no assistente-exemplo.)
- **Fila do atendente sem confusão: nova aba "IA" + "Aguardando".** As conversas que a IA está conduzindo saem da fila humana e vão pra uma aba **"IA"** própria (não poluem mais). A aba "Não atribuídas" virou **"Aguardando"** (quem realmente espera um humano — sem handler). Então o atendente vê claro: **Minhas** (o que atendo) · **Aguardando** (fila) · **IA** (a IA cuida) · Minha equipe · Todas. "Encerradas" segue no filtro de status (dropdown), não foi removido.

## v0.9.32 - 2026-07-11 (memória = o registro REAL das conversas + datas — como foi documentado)

A decisão documentada (`aquapark-commercial-memory.md`, textual: *"a memória de conversa efetiva da IA é o histórico real do WhatsApp — manter como fonte primária"*) não tinha sido portada. Agora está:

- **Ferramenta `conversation_history`** (memória primária): a IA lê o **registro real** das mensagens desta conversa de WhatsApp — quantas interações atrás precisar — **com data e hora**. É assim que ela lembra o que já foi tratado, se a pessoa **já é cliente**, o que ela já pediu, etc. Porte do `conversation_history` dos agentes do Aquapark.
- **Ferramenta `current_datetime`**: a IA sabe "hoje" (fuso America/Sao_Paulo) — pra raciocinar sobre prazos e sobre as datas do histórico ("você falou com a gente há 3 dias"). Porte do `current_datetime`.
- As duas entram no **assistente-exemplo** (`allowed_tools`) e o system prompt instrui a consultá-las. Aplica no assistente já criado (refresh `v3-memoria`). Sem `db push`.
- Continua valendo a injeção automática dos últimos turnos (v0.9.31) para continuidade imediata; o `conversation_history` é a leitura sob demanda, mais profunda e com datas — a **fonte primária** documentada. Os perfis de memória (chave-valor CONTACT/SESSION) seguem para **fatos estruturados** (ex.: "titular confirmado"), não para a transcrição.

## v0.9.31 - 2026-07-11 (assistente com MEMÓRIA da conversa — continuidade)

- **A raiz do "coloquei um CPF que não existe e ele não soube tratar": cada mensagem virava um run STATELESS.** O assistente esquecia o que já tinha sido dito (pediu CPF → recebeu CPF → mas já tinha "esquecido" o "estou sem internet" → voltava a cumprimentar). Agora o nó Assistente **carrega os turnos anteriores da conversa** (do chat de WhatsApp, via `scope_session=chat_id`) e injeta como histórico no assistente. Com contexto, ele: lembra do problema, chama a ferramenta de identificar quando o CPF chega e, se o CPF não existir, sabe responder "não localizei esse cadastro".
- Técnico: `AgentRunnerService.run` aceita `history[]` (semeia as mensagens antes do input); o nó AGENT carrega via `WhatsappInboxService.listMessages` (best-effort, tira a mensagem atual). `CommModule` passou a exportar o `WhatsappInboxService`. Sem `db push`.
- **Ainda pendente (frente aprovada):** IA assumir a conversa como **BOT** (filtro "IA" + "atendido pela IA") e **debounce** (agrupar mensagens picadas em uma resposta) — próximas.

## v0.9.30 - 2026-07-11 (assistente-exemplo: triar motivo → suporte identifica, venda não pede CPF)

- **O assistente conversava mas não conduzia.** Agora ele **entende o motivo do contato primeiro** e ramifica: (a) **assinante com suporte** (internet, fatura, contrato) → pede o CPF/CNPJ do titular para identificar e confirma antes de tratar dos dados; (b) **quem quer contratar / saber de planos** → é **VENDA**, **não** pede CPF, conduz como comercial (pergunta cidade/endereço e o que procura). A regra de ouro embutida: *nunca pedir CPF a quem só quer contratar*.
- Reforço via `system_prompt` directivo + roteiro estruturado reescrito (triagem cliente×venda) + persona com as regras. O texto que o fluxo manda ao assistente virou neutro ("atenda seguindo o seu roteiro") — antes o "responda de forma útil" fazia o modelo só cumprimentar.
- **Aplica no assistente JÁ criado:** o seed re-aplica o conteúdo (roteiro/persona/system_prompt) uma vez por versão (marcador `isp_example_content_v2-identifica`) no boot — sem o usuário reeditar, sem `db push`.

## v0.9.29 - 2026-07-11 (pente-fino: a automação por evento volta a FUNCIONAR + caça a erros silenciosos)

Auditoria do código inteiro, área por área. A "IA não respondia no WhatsApp" tinha DUAS causas reais (não era config) — as duas corrigidas:

**Por que nenhuma execução acontecia (evento→fluxo morto):**
- **Corrida no broker** (`bullmq.broker.ts`): `ensureConnection` marcava `connectAttempted` no topo, então a 2ª/3ª fila (EVENTS/NOTIFICATIONS) registravam com `available=false` (conexão ainda em voo) e **o consumidor da fila de eventos nunca era criado**. Worker de pé, Redis de pé, e mesmo assim ninguém consumia. Agora todos esperam a MESMA conexão; `process()` re-tenta criar o consumidor se o Redis ainda sobe no boot; falha de conexão libera a re-tentativa (não fica preso em fallback pra sempre).
- **Worker sem o nó Assistente** (`worker.module.ts`): o processo `iastudio-worker` (que roda a engine em produção) não importava `AiModule`/`IspModule` → o nó AGENT e as ferramentas não existiam lá → o fluxo chegava em "Assistente responde", caía em nó desconhecido e **seguia calado** mandando vazio. Corrigido o import.
- **Nó desconhecido agora FALHA a execução** (`workflow-engine`) em vez de "seguir pela saída padrão" — nunca mais mascara fluxo quebrado como concluído (aparece FAILED no monitor).

**Erros silenciosos caçados (a mesma classe que vinha mordendo):**
- Nó Assistente com aprovação-pendente / texto vazio / estouro de passos agora vai pra saída de **erro** (não manda mensagem em branco); estouro de `max_steps` virou ERRO.
- **Conexão de IA**: resolução por escopo exato não achava a OpenAI da org se o assistente estivesse em outro workspace/ambiente — agora cai pra org inteira.
- **Segredos**: decifração que falha (ENCRYPTION_KEY divergente pós-restore) não é mais engolida pra `{}` — propaga (evita o merge sobrescrever/apagar o segredo) e loga na view.
- **Permissões**: um blip do Postgres não tranca mais o usuário por 60s (não cacheia conjunto vazio quando a query falha).
- **Cron de sync WhatsApp** rodava em DOBRO (API + worker) — gated pra um processo só.
- **Front (dado errado plausível):** progresso de backup/restauração no console (lia `data.status` em vez de `data.operation`); dashboard consolidado com Execuções=NaN e custo/tokens zerados (shape aninhado); Dashboard/Minha Conta do cliente zerando plano/limites/consumo (envelope de licença achatado).

**UX (crítica do Robson):** publicar fluxo saiu de dentro de "Versões" — agora tem botão **Publicar/Despublicar** direto na barra do canvas (padrão Aquapark), com ícone de power.

**Pendências mapeadas (precisam de schema/`db push` ou frente própria):** IA assumir a conversa como atendente **BOT** (aparecer "atendido pela IA" + filtro "IA") — porte do `assignBot` do Aquapark; `@@unique` em `external_id` da mensagem + publicar evento sempre (dedup só no bus); `WHATSAPP_SEND` usar o envio inteligente (janela 24h/HSM); enforce de `action_permissions` do agente.

## v0.9.28 - 2026-07-11 (a IA responde no WhatsApp — fluxo + toggle)

Frente nova: o assistente de IA responde as mensagens do WhatsApp automaticamente. Porta a *lógica* do SDR do Aquapark num formato declarativo (o fluxo fica visível no canvas), sem clonar o SDR gigante. Sem mudança de schema (não precisa `db push`).

- **Fluxo semeado "IA responde no WhatsApp (exemplo)"** (por organização, junto do assistente-exemplo ISP): gatilho *mensagem recebida* → condição *ninguém humano atendendo* → **assistente responde** → **enviar WhatsApp** (texto = resposta do assistente). Nasce **DRAFT/desligado** e não ressuscita se apagado (marcador em `system_settings`). Marcado com a tag `ia-whatsapp`.
- **Gate humano como DADO:** o evento `whatsapp.inbound.message` passou a carregar `handler_type` (quem atende) e `contact_name`. A condição do fluxo (`{{input.handler_type}} != USER`) evita responder por cima de um atendente — o executor segue genérico (não conhece atendimento).
- **Toggle "Atendimento por IA"** (WhatsApp → Atendimento por IA): liga = publica o fluxo / desliga = despublica (novo `unpublish` no workflows service/controller, volta a DRAFT mantendo o fluxo visível — diferente de arquivar). Interruptor em linguagem do usuário, com confirmação ao ligar (os 5 patrasques) e explicação de quando a IA responde.
- **Decisões por regra:** nasce **OFF** (regra "todo automatismo nasce OFF" + IA agindo é alto risco — o Aquapark é ON, aqui é opt-in consciente); resposta em **texto livre** (o gatilho é um inbound → janela de 24h aberta, sem template HSM); usa o **nó de envio** (envia como sistema, sem pausa de aprovação) em vez da tool interna do agente.
- Novo item de menu + rota + breadcrumb `/whatsapp/atendimento-ia`; front acha o fluxo pela tag e publica/despublica.

## v0.9.27 - 2026-07-11 (painel de Atualização com o VISUAL do Aquapark: 2 modos)

- **Portado o visual do Aquapark (não só a lógica).** Robson apontou certo: a lógica veio de lá, o visual tinha que vir junto — eu tinha reusado uma caixa de log única pra tudo, então um upgrade **histórico** que falhou parecia um **alarme atual**. Agora são dois modos distintos, como no Aquapark:
  - **Enquanto roda:** caixa escura de console com o log ao vivo + "em execução…".
  - **Terminado (não rodando):** card calmo **"Último upgrade: vX → vY"** — ícone verde (SUCCESS) ou vermelho (FAILED), status, iniciado/concluído; se falhou, uma faixa vermelha discreta com a etapa. **Não** é mais a mesma caixa grande e alarmante.
- **Elemento novo (adição, não mudança de lógica):** dentro do card de resultado, um expander **"Ver log completo"** — mantém o diagnóstico sem poluir a tela. O service passou a trazer `from_version` e `finished_at` pro card.
- **Layout em 2 colunas (como o Aquapark):** "Versões disponíveis" e "Último upgrade" ficam **lado a lado** (`xl:grid-cols-2`), cada um em card próprio — em vez de empilhados na vertical, o que reduz a sobrecarga visual. Detalhe pequeno, impacto grande na leitura da tela.
- **Alinhamento fino ao Aquapark:** durante um upgrade em execução, a grade de versões **some** — fica só o console ao vivo no topo (sem poluir com a lista). E entrou o **Histórico de atualizações** colapsável no rodapé (from → to + data + badge de status), que o painel não tinha.

## v0.9.26 - 2026-07-11 (upgrade destravado: build da API + painel que PARA e MOSTRA a falha)

- **A CAUSA-RAIZ de "o upgrade não muda nada há tempo": a build da API vinha falhando calada.** Quando humanizei o editor de automação, criei o campo `type: 'agent'` no nó do Assistente (`agent.nodes.ts`) mas **nunca adicionei `'agent'` ao union `NodeFieldType`** (`node-registry.service.ts`). O `nest build` estourava `TS2322` — e como o `upgrade.sh` tem `set -euo pipefail` + `mark_failed` no passo `API_BUILD`, **todo upgrade abortava ali** (fail-safe: produção seguia na versão anterior). Corrigido: `'agent'` adicionado ao `NodeFieldType`.
- **O painel também lia o status do lugar errado — por isso a tela "sumia como se concluído".** O backend responde `{ upgrade, orphaned }`, mas o `getCurrentUpgrade` (console `services/system.js`) lia `data.status`/`data.log_lines` do **nível de cima** — sempre `undefined`. O painel **nunca** via RUNNING/SUCCESS/FAILED (status sempre `null`): não mostrava progresso, não recarregava no fim, não exibia falha. Corrigido conforme o Aquapark (que guarda o status em `.upgrade`): o service desembrulha `data.upgrade` e lê o órfão de `data.orphaned`.
- **Falha agora PARA e APARECE (padrão Aquapark):** o log passa a exibir também quando o upgrade terminou `FAILED`/`SUCCESS` (não só com linhas), e o estado `FAILED` mostra bloco vermelho explícito — "falhou na etapa X e foi interrompida; o sistema continua na versão anterior; revise o log e publique nova versão". Fim da falha silenciosa.
- Doc: regra de ouro reforçada — **antes de qualquer correção, olhar como o Aquapark faz** (prática obrigatória, não só em feature nova).

## v0.9.25 - 2026-07-11 (acesso ao /console corrigido + base amarrada na doc)

- **`studio.nivoo.dev.br/console` levava ao login do CLIENTE (bug de roteamento nginx).** A regra era `location /console/` (com barra final); `/console` **sem** a barra não casava e caía no `location /` → servia o painel do cliente. Adicionado redirect exato `location = /console { return 301 /console/; }` no `install.sh`. **Instalação existente não regenera o nginx sozinha** — aplicar o patch ao vivo no servidor (comando no handoff) + `nginx -t && systemctl reload nginx`.
- **Base do projeto amarrada na doc (porte do Aquapark):** `CLAUDE.md` ganhou **Pensar antes de codar** (checklist de 10 pontos), **Definição de pronto** e a regra **pós-compactação = re-ancorar antes de agir** (reler CLAUDE.md + topo do CHANGELOG e conferir estado real antes de agir; nunca cravar versão/arquivo de cabeça). `docs/base-doc-e-portes-aquapark.md` = mapa/backlog de porte. (Só doc + script — sem `db push`.)

## v0.9.24 - 2026-07-10 (o erro silencioso da versão + reload robusto)

- **A correção da versão da v0.9.23 caiu num erro silencioso.** O `vite.config` lia `readFileSync('../CHANGELOG.md')` com caminho **relativo ao diretório onde o build roda** — se esse caminho não batesse, o `try/catch` engolia a falha e caía calado no `package.json` (0.1.0). Resultado: a barra continuava em v0.1.0 mesmo com a v0.9.23 aplicada. Agora o caminho é resolvido a partir do **próprio arquivo** (`import.meta.url`), independente do diretório de build. (Exatamente o tipo de erro silencioso que vinha mascarando tudo: o upgrade concluía e recarregava, mas a barra presa em v0.1.0 fazia parecer que nada acontecia.)
- **Tela de Atualização: portado o padrão comprovado do Aquapark** em vez de remendar o meu. Polling **contínuo** (2s enquanto roda, 30s parado — nunca para) com `loadAll` buscando versão + status juntos, cada um com `catch`: durante o restart do backend a API cai, os fetches viram null, o estado anterior é preservado, e quando a API volta com SUCCESS o próximo ciclo detecta a transição e recarrega. O meu iniciava/parava o polling — era aí que se perdia o momento do SUCCESS e a tela "sumia como se tivesse concluído". Removido o banner "reiniciando" e o estado `restarting` (o polling contínuo já cobre).

## v0.9.23 - 2026-07-10 (versão real na barra + excluir fluxo de verdade)

- **A versão exibida na barra lateral estava presa em `v0.1.0`.** O `__APP_VERSION__` (barra lateral dos dois painéis) lia a versão do `package.json`, que nunca foi atualizado de `0.1.0`. Ou seja: por mais que você aplicasse v0.9.x, a barra sempre mostrava v0.1.0 — não dava para saber se o painel tinha atualizado (o backend mostrava a versão certa; só o rótulo da barra mentia). Agora o `vite.config` lê a versão real do **CHANGELOG.md** (a fonte da verdade do release; no build o repositório já está na tag certa), com fallback para o package.json. Vale para o painel do cliente e o console.
- **Fluxo só podia ser arquivado, nunca excluído.** Um rascunho que nunca rodou virava lixo permanente na tela — "arquivar" faz sentido para coisas com histórico, mas para um fluxo descartável é dogma sem visão de negócio. Adicionado **Excluir de verdade** (ícone lixeira, ao lado de Arquivar): `DELETE /automation/workflows/:id` apaga o fluxo e tudo que é dele (execuções, logs, versões, agendamento) numa transação — se qualquer passo falhar, nada é apagado. ConfirmDialog com aviso de que é permanente. Arquivar continua existindo para quem quer só tirar das listas ativas sem perder o histórico.

## v0.9.22 - 2026-07-10 (editor de automação humanizado + 3 buracos corrigidos)

O pente-fino anterior não cobriu o editor de fluxos — que estava cheio de jargão de desenvolvedor na cara. Corrigido, e no caminho apareceram dois buracos funcionais reais.

**Bugs funcionais (não só texto):**
- **O card do nó mostrava o tipo técnico cru** (`AGENT`, `TRIGGER_EVENT`, `WHATSAPP_SEND`) em fonte monoespaçada abaixo do nome, e o inspetor mostrava `agent_2 · AGENT`. Removido — o card agora mostra a descrição amigável; o tipo é exclusivamente interno.
- **O campo "Assistente" do nó de IA estava VAZIO** — não dava para escolher o assistente no fluxo. O inspetor carregava conexões e templates, mas nunca os assistentes. Corrigido: novo tipo de campo `agent` + carga dos assistentes no inspetor.
- **O campo de evento do gatilho era texto livre** que exigia digitar `whatsapp.inbound.message` exatamente — virou um **select** com rótulos humanos ("Nova mensagem de WhatsApp chegou") e o valor real por baixo, tanto no nó quanto no gatilho do fluxo.

**Linguagem (todos os 13 nós + editor):** rótulos e descrições reescritos sem jargão — "Event Bus"→"algo acontece na plataforma", "Meta/Email Orchestrator"→"envia WhatsApp/e-mail", "loop de raciocínio + ferramentas"→"responde ou executa uma tarefa", "Requisição HTTP"→"Chamar sistema externo", "Publicar evento"→"Anunciar acontecimento", "Renderizar template"→"Montar mensagem de um modelo", "Timeout/Headers/Payload"→"Tempo limite/Cabeçalhos/Dados". "Agente de IA"→**Assistente de IA** (nó, paleta, card, inspetor). "Rollback/diff/imutável" e sintaxe crua de variável (`{{vars.passo_1.status}}`) trocados por linguagem de negócio. Grupo "IA" entrou na ordem oficial da paleta.

## v0.9.21 - 2026-07-10 (tela de Atualização sem pânico + pente-fino passada 2)

- **Tela de Atualização não entra mais em pânico durante o restart.** Ao aplicar um upgrade, o backend reinicia e a API cai por 1–2 min — o polling antes disparava um `toast.error` vermelho a cada 2s, parecendo falha. Agora, durante um upgrade em curso, a falha de rede é tratada como **esperada**: mostra um aviso azul calmo ("Aplicando a atualização e reiniciando os serviços… a página recarrega sozinha") e segue tentando em silêncio. Quando a API volta com status SUCCESS, **recarrega a página sozinha**. Fora de um upgrade, erro de rede continua sendo erro.
- **Pente-fino passada 2:** Aprovações ("execução do agente"→"o assistente"), Auditoria (placeholders "user.create"/"User"→"Filtrar por ação"/"item afetado"), Execuções ("trace_id"→"Código de rastreio"), assistente de conexão (hint "Provider → Instância nomeada"→"nome para identificar esta conexão"), Custos (campo "YYYY-MM"→seletor de mês nativo).

## v0.9.20 - 2026-07-10 (pente-fino de UX, passada 1)

Auditoria de linguagem tela a tela (regra máxima: língua do usuário, nunca do desenvolvedor). Confirmado limpo: nenhum `confirm()/alert()` nativo, nenhum banner de erro de submit inline. Corrigido nesta passada (só texto visível — sem mudança de comportamento):

- **Nomenclatura padronizada:** "agente"→**assistente** e "ferramenta"/"tool"→**habilidade** em títulos, botões, toasts, tooltips, colunas e empty states (Assistentes, Habilidades, Custos, Memória, Conhecimento, Pendências, Versões, Incidentes; e no console: Consumo, Dashboard). Antes o produto só tinha renomeado os títulos.
- **Chaves cruas escondidas:** `provider_key` na coluna "Conector" agora mostra o nome amigável do conector (via marketplace, com fallback prettificado) em vez de `whatsapp-meta`; tooltip de permissão em Perfis não expõe mais a chave `core.users.read`.
- **Jargão fora:** "Tokens no mês"→**Consumo de IA** (Dashboard/Console), "Builtin"/"Custom"→**Da plataforma**/**Personalizada**, "Último health"→**Última verificação**, "health check" removido, "Rollback"→**Reverter**, "Timeout (ms)"→**Tempo limite (ms)**, "Provider"→**Provedor**.
- Áreas genuinamente técnicas (Desenvolvedor, API Keys, editor de fluxos avançado, JSON Schema de habilidade custom, MCP endpoint) mantidas — público técnico. Ficam mapeadas para passadas futuras se necessário.

## v0.9.19 - 2026-07-09 (menu humano + perfis com rótulos legíveis)

- **Bug: a tela de Perfis mostrava a chave crua da permissão (`core.users.read`) num balaio único "permissions 10/83".** O backend sempre mandou grupos + rótulos humanos (`{permissions, groups, labels}`), mas o `normalizeCatalog` do front não tratava esse formato — caía no fallback e imprimia a chave. Corrigido: agora renderiza os grupos ("Usuários e Acessos", "IA"…) com os rótulos humanos ("Ver usuários", "Conceder à IA ações que gravam dados"). As 83 permissões já tinham label no backend. Exemplo clássico de tela feita para desenvolvedor virando tela para usuário.
- **Menu de IA na língua do usuário (fatia 5).** Grupo "IA" → **IA Studio**; itens: Agentes→**Assistentes**, Bases de Conhecimento→**Conhecimento**, Ferramentas→**Habilidades**, Aprovações→**Pendências** (Memória e Custos mantidos). Só rótulos — as rotas `/ia/*` (internas, invisíveis) ficam iguais, sem risco de navegação. Breadcrumbs de `/ia/*` adicionados (não existiam). Títulos e textos das páginas atualizados para casar com o menu ("Assistentes", "Novo assistente", empty states).

## v0.9.18 - 2026-07-09 (anti-escalada nas ações da IA)

- **Trava anti-escalada nas ferramentas que gravam dados (fatia 3).** Marcar uma habilidade **"grava dados"** (`abrir_os`, `desbloqueio_confianca` — as `requires_approval`) num assistente passou a exigir a nova permissão `ai.agents.actions` ("Conceder à IA ações que gravam dados"). Sem ela, o operador só concede habilidades de **consulta** — no backend (rejeita no save de create/update/import, `ForbiddenException` com mensagem clara) **e** no front (checkbox desabilitado com o motivo). Ninguém eleva o poder da IA além do próprio. No runtime, a ação ainda passa por aprovação humana (`requires_approval`) — são duas travas em série.
- **Descoberta honesta:** `AiAgent.action_permissions` (campo herdado do conceito do Aquapark) **nunca foi lido em execução** no IA Studio — construir só a UI dele seria decorativo. Em vez disso, a lógica "operador autoriza o que a IA pode, sem conceder além do próprio poder" foi aplicada onde o IA Studio de fato controla: o grant das ferramentas. Perm nova seguiu os 5 passos do ACL (constante + grupo IA + label + Administrador herda via `ALL_PERMISSIONS`; fora dos demais perfis por ser opt-in).

## v0.9.17 - 2026-07-09 (exemplo já nasce quebrado em passos)

- **Assistente-exemplo ISP já nasce quebrado em passos.** O exemplo passou a ser semeado com o `roteiro` estruturado (objetivo + 3 passos + 3 situações), não mais com prompt cru — ao abrir "O que faz" você vê a lógica em caixinhas, sem precisar quebrar à mão. Backfill único no seed preenche o roteiro do exemplo já criado por versão anterior (só se estiver vazio — nunca sobrescreve edição sua).

## v0.9.16 - 2026-07-09 ("O que faz": roteiro em vez de prompt)

- **"O que faz" virou roteiro estruturado (fatia 2).** Em vez de um textão de prompt, o usuário monta **Objetivo + Passos (na ordem, reordenáveis) + Situações (Quando… faça…)** — descreve o assistente como instruiria um funcionário novo. Nova coluna `AiAgent.roteiro Json?` (`{objetivo, passos[], situacoes[]}`); compilador puro `agent-roteiro.ts` (espelha `agent-persona.ts`) injeta no system prompt como `## Objetivo / ## Passos / ## Situações`. A fonte da verdade é a estrutura; o texto é derivado. O `goal` legado é herdado pelo `objetivo` (migração suave, sem duplicar campo). O **prompt cru** saiu da vista: virou "Instruções adicionais (avançado)" em Ajustes avançados. Roteiro entra no snapshot de versão e no export/import. `db push` adiciona coluna nullable — **não destrutivo**.

## v0.9.15 - 2026-07-09 (editor do assistente na língua do usuário)

- **Editor do assistente na língua do usuário (fatia 1).** As oito abas técnicas (Geral/Persona/Prompt/Ferramentas/Conhecimento/Memória/Guardrails/Custos) viraram humanas: **Visão geral** (checklist "pronto para publicar?"), **Quem é**, **O que faz**, **O que sabe**, **O que pode fazer**, **Quem atende**, **Testar**, **Ajustes avançados**. Todo o jargão (conexão, modelo, temperatura, tokens, limites) foi para "Ajustes avançados"; as ferramentas aparecem pelo nome com marca "grava dados" nas de escrita, não mais por `tool.key`. **Só frontend** — nenhuma mudança no salvamento nem no schema. Nova regra máxima no CLAUDE.md: superfície sempre na língua do usuário, nunca do desenvolvedor.
- Nota de versão deixou de repetir em cada aba — agora aparece uma vez, na Visão geral.

## v0.9.14 - 2026-07-09 (assistente-exemplo ISP no painel)

- **Assistente "Atendimento (exemplo ISP)" nasce pronto no painel.** Seed idempotente (`isp-example-assistant.seed.ts`) que cria um `AiAgent` real — editável e removível — para você ver a lógica montada. Nasce **só** em organização que já tem uma conexão ISP ativa (Altarede/IXC), no mesmo workspace/ambiente da conexão. Modo **leitura**: `allowed_tools` traz as seis consultas (identificar/contrato/débitos/conexão/região/2ª via) e **não** inclui `abrir_os` nem `desbloqueio_confianca`. O fluxo "pede CPF → confirma nome → atende" vive no `system_prompt` por ora (a Frente B o torna estrutural + com gate). Marca-se como semeado em `system_settings` → **não ressuscita** se você apagar. Vem com modelo `gpt-4o-mini` e a conexão de IA da org (se houver só uma) — a descrição avisa para revisar modelo/conexão antes de usar.

## v0.9.13 - 2026-07-09 (agente ISP em leitura + o agente sabe com quem fala)

### Frente A — o agente passa a saber com quem fala

- **O nó AGENT não propagava `scope_keys`.** `AgentRunnerService` e `ToolExecutionContext` já previam o campo; ninguém o preenchia. Ou seja: o agente nunca soube o telefone de quem estava falando, e a memória de contato/sessão caía no fallback do `agent_run_id` (memória nova a cada mensagem). Agora o nó expõe dois campos de template — **Identificação do contato** (`{{input.phone}}`) e **Identificação da conversa** (`{{input.chat_id}}`) — visíveis e editáveis no canvas.
- **`resume()` perdia o escopo.** Um run pausado por aprovação retomava com `scopeKeys: {}` — e a retomada é exatamente o caminho das ações destrutivas (`desbloqueio_confianca`). A ação aprovada seria a única a rodar sem saber com quem falava. Novo campo `AiAgentRun.scope_keys Json?` persiste o escopo; `resume()` o recupera. (`db push` adiciona coluna nullable — **não destrutivo**.)

### Agente ISP em modo leitura

- **`identificar_cliente` aceita telefone.** Quem chega pelo WhatsApp traz o número, não o CPF — a tool só sabia buscar por CPF, então o agente não conseguia identificar com quem falava. Agora aceita `cpf` **ou** `telefone` (inclusive `5527999998888`, como a Meta entrega) e usa `cliente.por_telefone`. O Altarede, que não busca por telefone, responde com uma mensagem útil em vez de despejar o catálogo de operações.
- **Nova tool `consultar_contrato` (leitura).** Mostra o plano e o `status_internet` — ou seja, se o acesso está **bloqueado por inadimplência**. Sem ela o agente via "offline" e sugeria ordem de serviço técnica para um problema financeiro.
- **Tools ISP passaram a projetar a saída (`isp-projections.ts`).** O ERP devolve a linha inteira da tabela: o `cliente` do IXC tem ~150 colunas (`crm_data_sondagem`, `emp_remuneracao`, `ref_pes_fone2`...). Isso ia todo para o contexto do modelo — milhares de tokens de ruído por chamada, e cada campo é algo a mais que o LLM pode repetir ao cliente. A redação no provider tira o **perigoso** (senhas); a projeção tira o **irrelevante**. O provider segue devolvendo a linha crua para workflows e `ixc.listar`; quem estreita é a tool, que é a fronteira com o modelo.
- Modo leitura não exigiu código: `AiAgent.allowed_tools` é uma lista — basta não incluir `abrir_os` nem `desbloqueio_confianca`. O gate de aprovação do `ToolRuntimeService` segue como segunda trava.

### Outros

- Doc: como conferir o efeito do desbloqueio de confiança no IXC — `dt_ult_ativacao` (data de hoje) e `nao_bloquear_ate` (o prazo). **Não** `desbloqueio_confianca_ativo` nem `dt_ult_des_bloq_conf`: parecem os campos certos pelo nome, e ficam inalterados após um desbloqueio bem-sucedido. Verificado em base real (contrato bloqueado em 03/07, desbloqueado por 5 dias em 09/07).

## v0.9.12 - 2026-07-09 (boletos abertos, telefone e desbloqueio corretos)

- **"Boleto em aberto" não é `status = 'A'` (IXC).** O exemplo oficial "Listar boletos abertos" filtra `liberado = 'S'` **e** `status != 'C'` (cancelado) **e** `status != 'R'` (recebido). Meu filtro por `status = 'A'` perdia títulos abertos noutro estado (renegociado, em cobrança) e incluía títulos **não liberados** — o cliente veria dívida a menos, ou receberia cobrança de um boleto que o provedor não liberou. Afeta `consultar_debitos`, `segunda_via_boleto` e `financeiro.boleto_base64`.
- **Nova operação `cliente.por_telefone` (IXC).** O telefone do cliente mora em `telefone_celular`, `whatsapp`, `fone` e `telefone_comercial`, e o IXC não tem `OR` — a busca tenta coluna a coluna. Trata o número do WhatsApp (DDI 55, sem máscara) e a máscara do IXC (`(27) 99947-2853`). É a porta de entrada do atendimento: quem manda mensagem não digita CPF. Sem equivalente no Altarede, então **não** virou tool do agente ainda.
- **`desbloqueio_confianca` era chamado errado.** O exemplo oficial em PHP usa `$api->get('desbloqueio_confianca', ['id' => <id_contrato>])` — e o `get()` do `WebserviceClient` é o **modo listar** (header `ixcsoft: listar`). O provider chamava como insert (`POST` sem header). Corrigido com `callListar()`. O `id` é mesmo o id do contrato. (`desbloqueio_confianca` é também o nome de uma coluna de `cliente_contrato`; quem indica o estado é `desbloqueio_confianca_ativo`.)
- **`desbloqueio_confianca` sem fallback.** Acabou o "se nenhum contrato estiver ativo, usa o primeiro" — desbloquear o contrato errado é pior que não desbloquear. Agora exige exatamente um contrato ativo (`status = 'A'`) e falha alto nos demais casos. Verificação obrigatória no IXC: `desbloqueio_confianca_ativo` deve virar `'S'`.
- **`os.cadastrar` não abria OS no IXC.** A API recusava com `Preencha Filial<br />Preencha Setor` — dois campos que a collection oficial mostra vazios e que eu não enviava. Agora `setor` é obrigatório (é decisão de operação; vem do Descobrir recursos) e `id_filial` sai do cadastro do cliente (`cliente.filial_id`), com override opcional. Ambos entraram no schema da tool `abrir_os`, senão o agente tomaria 400 sem saber por quê. Notável: **foi o primeiro erro alto do IXC** em toda a integração.

## v0.9.10 - 2026-07-09 (o `rp` do IXC também trunca calado)

- **Paginação de verdade nas consultas de escopo (IXC).** `rp: 1000` trunca em silêncio: um bairro com 1200 clientes devolvia 1000 e nenhum aviso. `listAll()` percorre as páginas até vir menos que uma página cheia, com teto de 20 páginas (avisa no log ao bater). O CENTRO, com 768 clientes, passava raspando.
- **O lote que busca nome/telefone dos afetados usava um `IN` longo.** Com os 497 logins do CENTRO ele voltaria vazio: o incidente sairia sem nome e sem telefone, e o disparo proativo notificaria ninguém com aparência de sucesso. Agora vai em lotes de 100, como o resto.

## v0.9.9 - 2026-07-09 (o `IN` do IXC falha calado)

- **`IN` com muitos ids devolve lista vazia, sem erro (IXC).** A união geográfica da v0.9.8 montava um `IN` com os ~768 ids de clientes do bairro numa string única. O IXC não recusa: responde `registros: []`. Resultado: `herdados` vazio, união sem efeito, e o `bairro` continuava devolvendo os mesmos 38 logins de endereço próprio — um número plausível, produzido por uma falha silenciosa. Agora o `IN` vai em **lotes de 100** (`IN_CHUNK_SIZE`). Confirmado que `grid_param` e `financeiro.boleto_aberto_todos` estavam corretos — o culpado era só o tamanho da lista.
- IXC: `segunda_via_boleto` com `formato: "linha"` devolve `linha_digitavel` **e** `gateway_link` (link do boleto no gateway). **Não há PIX copia-e-cola** em `fn_areceber` (o `pix_txid` vem vazio) — a descrição da tool prometia algo que o IXC não entrega.

## v0.9.8 - 2026-07-09 (escopo geográfico correto no IXC)

- **Escopo geográfico contava só uma fração dos afetados (IXC).** `radusuarios.bairro`/`cidade` só vêm preenchidos quando o login tem endereço **próprio** (`endereco_padrao_cliente = 'N'`); a maioria herda o endereço do cliente e deixa esses campos vazios (`cidade = "0"`). Filtrar por bairro devolvia apenas os logins de endereço próprio — num incidente, notificaria uma fração dos afetados **sem sinal de erro**, com um número plausível. Agora `conectividade.listar_com_status` une duas fontes: `radusuarios` (endereço próprio) + `cliente` (endereço de cadastro, restrito aos logins com `endereco_padrao_cliente = 'S'`), já que o IXC não tem operador `OR`. A resolução dos logins saiu para `resolveLogins()` — `conectividade` estava respondendo três perguntas.
- IXC: `cidade` entrou em `ZERO_MEANS_UNSET` (`"0"` é "não configurado", casaria com a base toda).
- Confirmado contra base real: `id_porta_pon` (atalho de 1 requisição, via `radusuarios.interface_transmissao`) devolve **exatamente** a mesma lista que `porta_pon` (2 requisições, via `radpop_radio_cliente_fibra.ponid`) — 106 logins idênticos na PON `0/1/1`.

## v0.9.7 - 2026-07-09 (redação de senhas + escopo de rede)

- **Vazamento de senha do cliente para o LLM (IXC).** A tabela `cliente` do IXC devolve `senha` (senha da central do assinante) em texto claro, e `radusuarios` devolve a senha PPPoE e as do roteador/Wi-Fi. Essas linhas iam inteiras para a tool `identificar_cliente` — ou seja, para o contexto do modelo, que poderia repeti-las ao próprio cliente no WhatsApp. Agora `IxcProvider.list()` redige todo campo cujo nome case com `senha|password|secret|token|api_key`, no ponto único por onde toda leitura passa (adicionar operação nova não reintroduz o vazamento).
- IXC: `cnpj_cpf` sem máscara é o caso comum. A ordem de tentativa passou a ser valor-como-veio → só-dígitos → mascarado (antes começava pelo mascarado e gastava uma requisição em toda busca).
- ISP: `IspConnectivityService` agora usa o booleano `online` quando o provider o fornece, em vez de reinferir o estado com regex sobre o rótulo de texto. Funcionava por coincidência (`/online/i` não casa com `"Offline"`) — traduzir o rótulo inverteria a contagem de offline em silêncio.
- **Escopo de incidente por topologia, não por geografia.** `SCOPE_KEYS` ganhou `porta_pon` e `vlan`, e `id_slot` deixou de ser ignorado no IXC. Falha de rede afeta uma PON/CTO/OLT inteira, não um bairro — vizinhos de rua podem estar em PONs distintas. A descrição da tool `status_regiao` agora ordena a precisão (`porta_pon > id_cto > id_olt > vlan > bairro`) e avisa que `interface_concentrador` só discrimina clientes quando há uma interface por VLAN. - **Escopo PON: consulta em dois estágios (IXC).** A topologia PON **não** está em `radusuarios` (`id_porta_transmissor` vale `"0"` em toda a base; `interface_transmissao_fibra` nem existe na leitura) — está em `radpop_radio_cliente_fibra`, ligada por `id_login`. `conectividade.listar_com_status` agora filtra a tabela de fibra (`ponid`/`slotno`/`ponno`/`porta_ftth`), colhe os `id_login` e só então busca os logins (`radusuarios.id IN`). Novas chaves canônicas: `porta_pon` (o `ponid`, uma **string** `frame/slot/pon` como `"0/1/1"`), `numero_pon`, `porta_cto` e `id_porta_pon`. Esta última é o atalho de uma requisição só: `radusuarios.interface_transmissao` guarda o mesmo valor que `radpop_radio_cliente_fibra.id_radpop_radio_porta` (ambos `42` no login conferido).
- **Guarda contra incidente de escopo total (IXC).** Filtro de escopo com valor `"0"` (o `"não configurado"` do IXC) casaria com **todos** os logins. Como o escopo do incidente vira a lista do disparo proativo em massa por WhatsApp, a consulta agora recusa `"0"` — **por chave**, não universalmente: slot 0 e PON 0 existem de verdade e continuam válidos.

## v0.9.6 - 2026-07-09 (IXC conferido contra as collections oficiais)

- IXC: rótulo errado no Descobrir recursos. O IXC devolve `""` (string vazia) nos campos não preenchidos e o fallback usava `??`, que só pula `null`/`undefined` — planos sem `descricao` apareciam em branco. Pior: a ordem de preferência era global, então planos mostravam `descricao` (código interno, ex. `2MG(Outros)`) em vez do `nome` que o operador vê na tela do IXC (`AGUARDANDO5`). Agora a ordem de rótulos é **por tabela** (`vd_contratos` → `nome`; `su_oss_assunto` → `assunto`; `su_oss_setor` → `setor`) e ignora string vazia, caindo em `(sem nome) #id`.
- Conexões: o **id da conexão** não aparecia em lugar nenhum da UI. Agora está no modal de detalhe (clique na linha), com botão de copiar — é ele que vai nas chamadas de API e ao fixar a conexão em tools/fluxos.
- IXC, correções a partir das collections oficiais da API (`radusuarios`, `fn_areceber`, `cliente_contrato`, `su_oss_chamado`):
  - `radusuarios.online` vale **`'SS'`**, não `'S'` — o `isYes` comparava por igualdade estrita e leria **toda** conexão como offline (o `status_regiao` reportaria 100% offline). Agora aceita qualquer valor iniciado por `S`.
  - `ip_concentrador` e `interface` **existem** em `radusuarios` — a doc dizia que não tinham equivalente e os dois filtros de escopo eram descartados silenciosamente. Mapeados. Só `id_slot` segue sem equivalente.
  - `os.cadastrar` passou a enviar os defaults documentados (`tipo`, `prioridade`, `melhor_horario_agenda`) e aceita `id_login` para vincular a OS ao login do cliente.

## v0.9.5 - 2026-07-08 (Schema Discovery ligado)

- **"Descobrir recursos" nunca existiu.** O `IProvider.discover()` estava implementado em todos os providers e declarado na interface desde a Fase 2, mas **nenhum endpoint e nenhuma tela jamais o chamavam** — era código morto. Agora: `POST /integration/connections/:id/discover` (perm `integrations.connections.read`, read-only, grava só `last_sync_at` + `IntegrationLog`) e a ação **Descobrir recursos** (ícone bússola) na tela de Conexões, com modal agrupado por tipo e botão de copiar id. É por aí que se obtém o `id_assunto` que o `abrir_os` do IXC exige.

## v0.9.4 - 2026-07-08 (card de backups retidos)

- **Card "Backups retidos" mostrava 0 fixo.** O endpoint `GET /console/system/version` nunca devolveu `backups_retained` — o Console fazia `?? 0` sobre um campo inexistente, então o número era zero mesmo com backups em disco. Agora o controller compõe a resposta com `BackupService.count()` (dumps `.sql.gz` da rotação do upgrade + pacotes `.tar.gz` de migração).

## v0.9.3 - 2026-07-08 (a tela de Atualização enxerga versões novas)

- **Tela de Atualização não via versões novas.** O `VersionService` rodava `git tag --list` no clone de `/opt/iastudio` sem nunca fazer `git fetch` — a instância só enxergava as tags que existiam no momento da instalação e dizia "Instância atualizada" para sempre. Agora faz `git fetch --tags --force` (best-effort, timeout de 20s) antes de listar; se o fetch falhar, cai nas tags locais e a tela mostra um aviso de "repositório remoto inacessível" (`remote_synced: false`) em vez de mentir. Botão **Verificar agora** (`GET /console/system/version?force=1`) ignora o cache de 5 min.
- Nota: como a v0.9.1 e a v0.9.2 não têm esse fetch, a primeira aparição de uma tag nova nessas versões exige um `git fetch --tags` manual no servidor (ou passa a funcionar sozinha após o primeiro upgrade, já que o `upgrade.sh` faz fetch na fase `GIT_FETCH`).

## v0.9.2 - 2026-07-08 (WhatsApp em produção + port do Aquapark + ERP IXC Soft)

### WhatsApp (Meta Cloud API) — primeiro fluxo ponta a ponta em produção

- **Causa-raiz do webhook mudo:** a WABA não estava inscrita no app (`subscribed_apps`). O `connect()` do `WhatsappMetaProvider` agora chama `subscribeAppToWaba` (best-effort) — nenhuma conexão nova nasce sem receber inbound.
- **Envio de mídia por upload real do aparelho:** `uploadMedia` no `meta-graph.client.ts` (FormData/Blob nativos, limites da Meta por tipo), `POST /comm/whatsapp/chats/:id/media/upload` (multipart) e `WhatsappInboxService.uploadAndSendMedia` — passa pela **mesma porta** do `/send` (reply gate + janela de 24h + takeover 409).
- **UX portada do Aquapark:** `MessageComposer` (menu de anexo, gravação de áudio com pausa/retomar/preview/regravar, troca enviar↔microfone), `AudioPlayer` próprio (resolve duração de opus/blob da Meta, que o `<audio>` nativo não consegue), cores oficiais do WhatsApp nos balões/fundo/ticks, avatares e **badges de contagem** por aba (`GET /comm/whatsapp/chats/counts`).

### Conexões e wizard

- Wizard não fecha mais ao clicar fora (`dismissable={false}`) e bloqueia **autofill do navegador** em campos de segredo (`autoComplete="new-password"` + `data-1p-ignore`/`data-lpignore`) — o gerenciador de senhas preenchia WABA ID e Access Token.
- Campo `generatable` com botões **Gerar** e **Copiar** (verify token) + caixa com a **URL do webhook** pronta pra colar na Meta.
- **Editar conexão** (antes só criar): `PATCH` com merge raso de config e atualização só das chaves de segredo preenchidas.
- `/auth/me` passou a devolver os **ambientes** do workspace (o seletor do topo ficava vazio e travava o wizard em "Selecione workspace e ambiente").

### IA Studio e Automação — port do Aquapark

- `FluxoCanvas` reescrito com a UX do Aquapark (paleta agrupada por categoria e colapsável, inspetor inline, nó customizado, auto-centralização) mantendo o motor **declarativo** do IA Studio: catálogo vem do `getNodesCatalog()`, grafo persistido é a fonte da verdade.
- Editor de assistente (persona guiada + aba "Testar" embutida), tela de Ferramentas com governança (`is_active`/`timeout_ms`/`requires_approval`) e Bases de Conhecimento.

### ERP IXC Soft (novo provider)

- `IxcProvider` (`integration/registry/providers/ixc.provider.ts` + `ixc.helpers.ts`) — segundo ERP de provedor. A API do IXC é CRUD sobre tabelas (`/webservice/v1/<tabela>`), Basic auth com token `id:chave`, header `ixcsoft: listar` nas listagens. Wizard: URL do IXC + token (validado no formato). `health()` distingue token recusado de IP fora das "Redes permitidas". `discover()` traz setores, assuntos de OS e planos.
- **Solução ISP virou multi-ERP:** Altarede e IXC implementam o **mesmo contrato canônico** de operações (`cliente.dados`, `financeiro.*`, `conectividade.listar_com_status`, `os.cadastrar`…), cada um traduzindo pra sua API. `IspConnectionResolver` resolve qualquer conexão de ERP ativa (`ISP_ERP_PROVIDER_KEYS`), com pin opcional por `erp`/`filial`/`connection_id`. **Nenhuma tool do agente mudou** — trocar de ERP é trocar a conexão.
- Limitações assumidas do IXC (documentadas no README do módulo ISP): sem envio de boleto por e-mail; filtros de escopo `ip_concentrador`/`interface_concentrador`/`id_slot` sem equivalente; `abrir_os` exige `id_assunto` (vem do Descobrir recursos).

### Correções

- `whatsapp-inbox.controller.ts`: erro de build no union `Multipart` (`MultipartFile | MultipartValue`) ao ler campos do formulário.

## v0.9.1 - 2026-07-04 (primeiro deploy em produção + correções)

Primeira instalação real (Debian 13, `studio.nivoo.dev.br`) e a rodada de ajustes de primeiro-deploy:

- **Scripts:** `install.sh` detecta a porta real do cluster PostgreSQL (não assume 5432) e restaura `/etc/nginx/nginx.conf` ausente (conffile removido por purge anterior). `SEED_DEMO` gate (produção sem org Demo). Endpoint público `GET /api/v1/health`. Console com `basename` (serve em `/console/` no modo single).
- **Build (gate no servidor):** correções de tipo que só apareceram no `nest build` real — `@fastify/multipart` cast; `ResourceMapping.connection_id` `String?`→`String @default("")` (não pode ser nullable em `@@unique`) + sentinela `''` no service/seed/repo; `bullmq` connection cast (skew de ioredis).
- **Login:** os dois painéis liam `data.token`, mas o backend retorna `access_token` — corrigido (o login não funcionava).
- **Console:** rotas corrigidas — `console/plans` e `console/licenses` (antes `console/licensing/*`, davam 404); endpoint `GET /console/usage` (consumo global) criado; **licença agora resolvida por organização** (o Console passa o org_id, não o license_id) — a aba Licença carrega e os botões de ação renderizam.
- **Console — Usuários do cliente (novo):** aba "Usuários" no detalhe do cliente para o operador editar nome/e-mail e **resetar a senha** de um usuário do tenant (reset revoga sessões).
- **UX:** sidebar do Painel do Cliente vira accordion de um grupo só (abre um, fecha o outro) em vez de tudo aberto.

## v0.9.0 - 2026-07-03 (Fases 3-8)

> ⚠️ **Fases 5-8 ainda sem verificação estática executada** (`prisma generate` + `tsc --noEmit` + `vite build`): o mount do workspace↔sandbox não serviu conteúdo de arquivos nesta sessão, impedindo o build. Código escrito e revisado estaticamente (seams de integração conferidos), mas o gate de 0 erros roda no servidor via `scripts/install.sh` (primeira instalação) ou `scripts/upgrade.sh` (atualização). `db push` das Fases 5-8 é destrutivo; a Fase 5 exige `CREATE EXTENSION IF NOT EXISTS vector;` (o `install.sh` já cria); a Fase 7 exige envs `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_OAUTH_REDIRECT` (Gmail OAuth).

- Fase 8 (FINAL): Instalação, Atualização, Backup e Dashboards (modelo Aquapark; deploy SaaS `/opt/iastudio`, PM2 `iastudio-api`+`iastudio-worker`):
  - `scripts/` (padrão Aquapark, **wizard interativo**): `install.sh` — menu interativo (modo single/multi, domínios, SSL Let's Encrypt, nome/e-mail/senha do admin, org Demo s/N, keep-deps/keep-db) que instala Node 20, PM2, PostgreSQL+pgvector, Redis, Nginx, Certbot; gera `.env` (segredos aleatórios + `PLATFORM_ADMIN_EMAIL/PASSWORD` + `SEED_DEMO` + `GOOGLE_*`); `db push`; build api+admin+console; PM2 `iastudio-api`+`iastudio-worker`; seed verificado (aguarda a API e aborta se o admin não existir em `core_users`); Nginx (single: painel em `/`, Console em `/console/`, API em `/api`; multi: 3 domínios) + SSL. `uninstall.sh` — wizard (PURGE/keep-deps/keep-db/keep-all, confirma com `REMOVER`). `upgrade.sh <tag> <id>` — args posicionais (como o `SystemService` chama), 13 fases com log por fase em `system_upgrades.log_lines` (String[] via `array_append`), backup antes de tudo, rebuild dos 3 apps, `pm2 restart`; falha = fica na versão anterior. `backup-full.sh`/`restore-full.sh` (pacote db+storage+manifest; restore via systemd-run), `restore-backup.sh` (só banco), `ecosystem.config.js`. Backups em `/opt/iastudio-backups` (mesma pasta que o Console lê). Build sempre no servidor.
  - Extras de deploy: endpoint público `GET /api/v1/health` (nginx/monitoramento/install); gate `SEED_DEMO` no seed (produção não cria org Demo); Console com `basename={import.meta.env.BASE_URL}` (permite servir em `/console/` no modo single).
  - Schema `system_*`: `SystemUpgrade` (`system_upgrades`) e `SystemRestore` (`system_restores`) — infra global (sem tenant).
  - Módulo `system/` (`@PlatformAdminOnly() /console/system/*`): versão atual + tags disponíveis (cache 5min), `POST upgrade` (spawn detached de `upgrade.sh` + polling do log ao vivo), lock órfão liberável, backups (gerar/listar/baixar-stream/subir-multipart/excluir/restaurar) com guard anti path-traversal e 1 operação por vez, tudo auditado. `@fastify/multipart` adicionado.
  - Dashboards (`dashboards/`, diretriz 34 — só agregações): `GET /console/dashboards/overview` (orgs, execuções+erros, custo IA+tokens, WhatsApp, emails, health de conexões, filas) e `GET /dashboards/summary` (org-scoped).
  - Console: `pages/Atualizacao.jsx` (aba Atualização com log ao vivo + banner de lock; aba Backup/Restauração com 5 patrasques) + `pages/DashboardConsolidado.jsx` + rotas/nav. Permissões `system.upgrade`/`system.backup`/`system.restore` (bypass de platform admin no Console).

- Fase 7: Email Platform + Resource Model + DevTools (diretrizes 9/23/24/25/28/56/57):
  - Email: provider `google-workspace` (Gmail via REST/HTTP, sem SDK) com OAuth2 real — infra nova no Integration Manager (`GET /api/integrations/oauth/google/start` autenticado + `GET /api/integrations/oauth/google/callback` público; troca code→access+refresh, grava no Secret com `oauth_meta`, PENDING_AUTH→ACTIVE; refresh automático; TOKEN_EXPIRED quando o refresh falha); `execute` email.send/list/search/get/labels/threads. Provider `smtp` real via `nodemailer` (health = verify(); envio via transporter). Nó `EMAIL_SEND` real (resolve conexão + template EMAIL), canal email do Notification Center real, tool IA `enviar_email` real. Metering `emails`/`email_sends_month` + limite `google_accounts`. Front: botão "Entrar com Google" no wizard (popup + polling).
  - Resource Model (`resource/`, diretriz 9): catálogo canônico EM CÓDIGO (Customer/Person/Company/Product/Order/Invoice/Payment/Contract/Ticket/ServiceOrder/Lead) + extensões verticais (ISP). Schema `resource_mappings` (só o mapeamento — a plataforma nunca é dona do dado). Mapper (`toCanonical`) + **Mapper Inteligente** (IA sugere field_map, nunca aplica sozinho — diretriz 25) + seed dos mappings Altarede de exemplo. Resource Explorer read-only (`GET /resource/explore` via `IProvider.execute`). Schema Discovery via `discover()`.
  - Console do Desenvolvedor (`devtools/`, diretriz 28): "Postman interno" — testar execute/HTTP/SQL(read-only)/tool/IA via conexões, auditado, sem persistir dado de negócio.
  - Developer Center (`developer/`, diretriz 57): `developer_api_keys` (prefix + hash SHA-256; chave em claro só 1x; revogar = estado). Public API versionada `/api/v1/public/*` (`ping`/`me`) protegida por `ApiKeyGuard` (header `x-api-key`/Bearer `ias_...`). Fachada estável — nunca reexpõe endpoints internos.
  - ACL: grupos "Recursos" (`resource.mappings.read/write`, `resource.explore.read`, `resource.mapper.suggest`) e "Desenvolvedor" (`devtools.use`, `developer.apikeys.read/manage`). Front: páginas Recursos (Mapeamentos + Explorer) e Desenvolvedor (Console + API Keys) + rotas/nav. Dep nova: `nodemailer`.

- Fase 6: Solução ISP / Altarede (primeira solução oficial — como extensão, nada de ISP no core):
  - AltaredeProvider completo (categoria ERP): correção da auth (appkey+token no CORPO JSON, não headers), catálogo de 15 operações, `discover()` (setores/motivos), tratamento do envelope `{data}`/`{message}`/`{error}`.
  - Tools do agente ISP (no catálogo `ai_tools` da Fase 5, via ToolRegistry): `identificar_cliente`, `consultar_debitos`, `status_conexao`, `status_regiao`, `segunda_via_boleto` (+PIX), `desbloqueio_confianca` (requires_approval), `abrir_os` (requires_approval + suprime OS duplicada consultando incidente ativo). Conexão Altarede resolvida por `IspConnectionResolver` — a IA nunca chama a API direto (sempre `ConnectionsService.execute`).
  - Módulo `isp/` — Manutenção/Incidentes (painel na plataforma): schema `isp_incidents`/`isp_incident_targets`/`isp_incident_dispatches`; escopo selecionável (cidade/bairro/OLT/slot/CTO) + conexão; resolver afetados via conectividade com checkbox include/exclude + vínculo manual; modos **reativo (default)** / proativo / combinado; `IncidentLookupService` que as tools consultam; disparo em massa (Meta Orchestrator + Notification Center) com confirmação + rate limit + log (OFF por default); detecção automática de outage dupla-OFF (só sugere rascunho); toggles (suprimir OS/previsão/normalização). ACL grupo "ISP". Front: `pages/ISP/Incidentes.jsx` + nav. Conector PHP de contingência só documentado.

- Fase 5: AI Platform + Studio — módulo `ai` (diretrizes 10/15/16/17/26/29/31/32):
  - Schema: pgvector habilitado (`previewFeatures=["postgresqlExtensions"]` + `extensions=[vector]`); 16 models `ai_*` (agents, agent_prompt_versions, agent_runs, tools, tool_call_logs, knowledge_bases/documents/chunks/query_logs, memory_profiles/entries, approval_policies, action_approvals, collaboration_rules, cost_records, budgets, mcp_servers). Chunk com `embedding Unsupported("vector(1536)")?` + espelho `embedding_json` (fallback cosseno em app quando não há pgvector). Índice HNSW criado por SQL idempotente no boot.
  - Providers multi-LLM: `LlmProviderRegistryService` (registry declarativo) + fachada `LlmProviderService` (resolve Connection categoria AI → Secret → HTTP puro, sem SDK; cálculo de `cost_usd` por tabela de preços). Implementações OpenAI, Anthropic, Gemini, Ollama; OpenRouter/Groq/DeepSeek/Mistral/Azure reusam o provider OpenAI-compatible via `base_url`. AI Orchestrator (fallback/menor custo entre conexões AI ativas).
  - Agentes: CRUD + versões imutáveis (draft/publish/rollback — diretriz 3) + export/import JSON sem secrets. `AgentRunnerService` = loop tool-calling (RAG injetado no prompt, tools, gate de aprovação que pausa o run, guardrail de custo por run, registro de custo/consumo, evento `ai.agent.run.completed`, `resume()` pós-aprovação). Persona compilada + prompt-security básico.
  - Tools genéricas (diretriz 10): `consultar_faq` (RAG), `memory_read/write`, `http_request` (anti-SSRF), `connection_execute`, `enviar_whatsapp` (Meta Orchestrator), `enviar_notificacao` (Notification Center), `executar_sql` (read-only default; escrita exige aprovação), `gerar_documento`, `consultar_especialista` (colaboração). Registry + runtime com `AiToolCallLog` + retenção por cron.
  - RAG (pgvector): ingest (parse TXT/MD/URL + PDF/DOCX opcionais → chunk → embed) e query por similaridade `<=>` com fallback JSON. Memória 4 escopos (SESSION/CONTACT/WORKFLOW/AGENT) com TTL e max_items.
  - Aprovações genéricas (diretriz 31): `ApprovalPolicy` (TOOL/SQL_WRITE/MASS_SEND/COST/ADMIN) + fila `AiActionApproval` (nasce OFF). Custos (diretriz 17): agregação por org×workspace×agente×provider×modelo×mês, orçamentos com alerta/bloqueio (OFF) e simulador pré-publicação (diretriz 32). Colaboração multi-agente (diretriz 16). MCP Client (diretriz 15): cadastro de servers + descoberta de tools (HTTP/SSE; STDIO só metadado; MCP Server = pós-V1).
  - Nó `AGENT` no NodeRegistry (integra a Fase 4): `AutomationModule` passa a exportar `NodeRegistryService`; `AiModule` registra o nó. Sem dependência circular.
  - ACL: grupo "IA" (17 permissões `ai.*`) + perfil de sistema "Operador de IA". Limites de plano `ai_agents`/`ai_knowledge_bases` (+ `ai_tokens_month`) e features `ai_studio`/`ai_rag`/`ai_mcp`.
  - Painel do Cliente: grupo **IA** — Agentes (editor 8 abas + versões/publicar/rollback + testar com transcript/tokens/custo + export/import), Bases de Conhecimento (documentos + testar consulta), Memória, Ferramentas (catálogo + MCP), Aprovações (fila + políticas), Custos (consumo + orçamentos + simulador). **Canvas React Flow** (`@xyflow/react`) em `FluxoCanvas.jsx` substituindo o editor em lista da Fase 4 (mesmo grafo JSON; `__pos` guardado no config; editor em lista mantido como fallback em `/automacao/fluxos/:id/lista`).

- Fase 4: Automation Platform — módulo `automation` + infra `shared/broker` e `shared/events`:
  - Event Bus central (diretriz 7): `EventBusService.publish(envelope)` com persistência em `automation_event_log` (dedup por `source_event_id` único), emissão EventEmitter2 (compat) + fila do broker; replay por endpoint (perm `automation.events.retry`); `whatsapp.inbound.message` migrado pro bus.
  - Message Broker abstraído (diretriz 8): interface `IMessageBroker` (token `MESSAGE_BROKER`) + `BullMqBroker` (bullmq + ioredis, prefixo `iastudio`, retry com backoff exponencial, DLQ `<fila>:dlq`, idempotência por jobId); sem Redis loga warn e usa fallback em memória (dev).
  - Worker separado (diretriz 33): `src/worker.ts` (`npm run start:worker`) processa execuções/eventos/notificações + SchedulerCron; fallback dev `WORKER_INLINE` (default on — API processa inline; produção liga off e sobe `iastudio-worker`).
  - Workflow Engine (diretrizes 3/27/49): `automation_workflows` + versões IMUTÁVEIS (`automation_workflow_versions` — publicar = apontar `current_version`; rollback = repontar), execuções (`automation_executions` + logs por nó), engine agnóstica (DAG com edges condicionais, variáveis `{{input.*}}/{{vars.*}}`, dry-run, DELAY longo re-agendado via broker), metering `executions` + limites `flows`/`executions_month`.
  - NodeRegistry (definition+executor+validator): TRIGGER_MANUAL/EVENT/SCHEDULE/WEBHOOK, CONDITION, DELAY, HTTP_REQUEST (conexão OU URL direta com guarda anti-SSRF), CONNECTION_EXECUTE, WHATSAPP_SEND (Meta Orchestrator), EMAIL_SEND (stub Fase 7), NOTIFY, TEMPLATE_RENDER, EVENT_PUBLISH.
  - Scheduler visual (diretriz 12): trigger amigável (diário/semanal/mensal/intervalo/primeiro-último dia útil/CRON) + `computeNextRuns` com calendários de feriados (`automation_calendars`), `automation_schedules` persistido, preview das próximas 5, cron por minuto idempotente entre processos.
  - Execution Monitor (diretriz 13): filtros status/fluxo/período/trace_id, detalhe com timeline por nó, retry e cancel (cooperativo).
  - Catálogo de Templates (diretriz 11): `automation_templates` multi-canal (WhatsApp/Email/SMS/Push/PDF/HTML/Markdown) + render `{{variáveis}}`.
  - Notification Center (diretriz 22): `notify()` com canal explícito > fallback whatsapp→email→in-app, entrega via fila, sino in-app (`automation_notifications`) + log (`automation_notification_log`).
  - Webhook público `POST /api/webhooks/flows/:token` (TRIGGER_WEBHOOK, token por fluxo, idempotência via `x-idempotency-key`); export/import JSON versionado sem secrets (diretriz 29).
  - ACL: grupo "Automação" (12 permissões) + perfil de sistema "Operador de Automação".
  - Painel do Cliente: grupo Automação — Fluxos (lista + editor em lista vertical de passos + versões/publicar/rollback/diff + executar com dry-run + export/import), Agendamentos (+ calendários), Execuções (monitor + timeline), Templates, Eventos (log + replay), Notificações (log) + sino no Header (polling 30s). Canvas React Flow fica pra Fase 5 (mesmo grafo).

- Fase 3: Communication Platform / WhatsApp Meta Cloud API (oficial-only) — módulo `comm`:
  - Provider `whatsapp-meta` real no registry (connect/health/execute/discover) + wizard manual (Access Token/Phone Number ID/WABA/App Secret/Verify Token) com passo informativo do Embedded Signup ("em breve"); limite de plano `whatsapp_numbers` por conexão.
  - Meta Orchestrator (roteamento por tag/departamento/padrão/prioridade — o fluxo nunca conhece o número), smart-send com janela de 24h + fallback 131047, metering `whatsapp_messages`.
  - Webhook público `GET/POST /api/webhooks/whatsapp` multi-tenant (HMAC por app_secret, roteado por phone_number_id), inbox de conver