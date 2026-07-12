# Changelog — IA Studio

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