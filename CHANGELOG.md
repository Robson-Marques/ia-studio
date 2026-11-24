# Changelog
## [v0.12.66] - 2026-11-24
### changed
- ConnectChat/Nete (quedas do login via radacct; cliente-mínimo vs OS-detalhe; desarma reinício de sistema; múltiplos ativos → atendente): rodada de lapidação do atendimento técnico.
  - **Desarmado o reinício/desconexão por sistema**: `reiniciar_conexao` sai da lista de tools do agente (`connectchat-auto-responder.service.ts`) — era ele que gerava "não consegui reiniciar a conexão por aqui", e depende de outra ferramenta que ainda não existe. O reinício passa a ser sempre PEDIDO ao cliente (religar o equipamento da tomada), nunca prometido como ação do sistema. Religamos esse caminho mais à frente.
  - **Histórico de quedas do login (radacct)**: nova ação `conexao.historico` no `ixc.provider.ts` (lista `radacct` por `username`), projeção `projectSessaoRadacct` (`isp-projections.ts`, sem IP/MAC/NAS), e análise no `connectchat-support-context.service.ts` — só com UM login ativo: calcula quedas 24h/7d e o sinal de `anomalia`. **Para o cliente**, a Nete informa apenas que "verificou uma anomalia/instabilidade na conexão" — nunca números/horários; os contadores vão só para a OS.
  - **Fluxo online**: informa a anomalia (se houver) → pede ao cliente para religar o equipamento (confirmando que está em casa) → se não puder ou não resolver, abre OS e encaminha para a equipe. Sem reinício por sistema.
  - **OS detalhada e SINTETIZADA**: nova instrução — ao abrir OS, a Nete escreve um resumo compreendido (não recortado) para o técnico: evolução dos atendimentos dos últimos 30 dias (quantos, o que houve em cada, como o último fechou, o que ocorreu entre eles) + resumo das quedas. Para o cliente, o mínimo; na OS, o detalhe. Reincidência passa a ser janela de **30 dias**.
  - **Múltiplos contratos/logins ATIVOS → atendente**: a Nete não tenta adivinhar qual. Abre uma OS SIMPLES (motivo do contato + nota de que havia múltiplos cadastros e não deu para identificar qual) e avisa o cliente, de forma seca e gentil, que um atendente vai contatar para confirmar a instalação. Sem análise/quedas/reinício. (Ativo-only já era filtrado: cancelado/inativo descarta, bloqueado-ativo consulta.)
  - **Filtro de ruído do histórico (`connectchat-recent-history.ts`)**: registros de sistema ("Alteração de dados da O.S.", mudança de setor) e stubs de abertura por processo sem fechamento passam a ser marcados `[interno]` e descartados do histórico do cliente. Corrigido um bug: "OPA SUITE"/"disparando do processo" NÃO marcam mais sozinhos — a OS real criada por processo abre com esse cabeçalho, então a regra antiga corria o risco de descartar OS real finalizada; agora só é ruído quando é a ABERTURA por processo, sem fechamento e não encerrada.

### note
- Fora de escopo por ora (pedido do Robson): desconectar login / caminho de outra tecnologia / outro sistema — religamos depois. A evolução dos atendimentos sai da própria listagem de OS/chamados recentes (a "mensagem" que importa é a finalizada, `mensagem_resposta`); as linhas de atualização/ausência/mudança de setor são descartadas como ruído, e o teor de ausência fica no corpo da própria OS. Backend puro, sem schema/ACL. Typecheck: arquivos tocados sem erro novo (restam só os ambientais conhecidos: @types/node, PrismaService, lib es2022).

## [v0.12.65] - 2026-11-24
### changed
- ConnectChat/Nete (ENTENDER, não copiar: resumir o fechamento em linguagem simples, sem vazar interno): a v0.12.64 fez a Nete ler a finalização da OS, mas ela passou a REPRODUZIR o texto literal ao cliente ("o fechamento foi registrado assim: 'TROCADO A ONU. MARCOS E EMANUEL'") — copiar e colar, não entender, e ainda expondo nome de técnico. Corrige um exagero da v0.12.62 (que mandava "citar as palavras exatas, entre aspas" para travar alucinação). Ajuste:
  - **`connectchat-attendance-protocol.ts`**: a regra de citação literal vira "ENTENDA, não copie" — a Nete LÊ o texto do sistema para compreender, mas conta ao cliente o SENTIDO em linguagem simples, sem acrescentar fato/causa que não esteja escrito e sem reproduzir o texto (ex.: "TROCADO A ONU. MARCOS E EMANUEL" → "foi feita a troca de um equipamento"). "Nome de técnico" e "modelo/código de equipamento" entram na lista do que nunca se expõe ao cliente. O núcleo anti-invenção (só afirmar o que está escrito; "não tenho esse dado" é válido) permanece.
  - **`connectchat-diagnosis.ts`**: as linhas do driver de conduta e o cabeçalho do histórico trocam "cite a DATA e o fechamento literais" por "diga a DATA e RESUMA em linguagem simples o que foi feito, sem copiar o texto nem expor detalhe interno". O histórico continua literal no que a Nete LÊ; muda só o que ela FALA.

### note
- Fecha o ciclo do grounding sem virar copiadora: ler literal (não inventa) + resumir o sentido (entende, não cola) + não vazar interno. Backend puro, sem schema/ACL/tool/endpoint. Typecheck: os dois arquivos com zero erro novo.

## [v0.12.64] - 2026-11-24
### changed
- ConnectChat/Nete (lê a FINALIZAÇÃO da OS, não só a abertura; e saudação obrigatória): com a v0.12.63 a Nete já citava a OS certa e datada, mas (1) lia só o relato de ABERTURA e perguntava ao cliente o que tinha sido feito — em vez de ler a resposta de fechamento que está no sistema; e (2) não cumprimentava. Correções:
  - **`isp-projections.ts` (`projectOrdemServico`)**: o campo de fechamento passa a ler `mensagem_resposta` como fonte primária (a resposta/finalização da O.S. no `su_oss_chamado`), antes de `solucao`/`parecer`/`observacao_tecnica`. Era o campo que faltava — por isso o fechamento ("TROCADO A ONU") não chegava e a classificação da resolução caía em inconclusivo. A listagem de OS recentes já trazia a coluna; só a projeção descartava.
  - **`connectchat-attendance-protocol.ts`**: saudação obrigatória na primeira mensagem do atendimento, com "Bom dia/Boa tarde/Boa noite" resolvido deterministicamente pelo horário local (America/Sao_Paulo) — mesmo que o cliente não tenha cumprimentado nem dito "oi". `buildAttendanceProtocol` passa a aceitar `now` opcional (testável); a chamada no responder segue igual.

### note
- Com o `mensagem_resposta` na projeção, o fechamento real alimenta o driver de conduta do diagnóstico (v0.12.63): "TROCADO A ONU" → resolução de CAMPO → a Nete afirma o que foi feito (entre aspas) e decide, em vez de perguntar ao cliente. Backend puro, sem schema/ACL/tool/endpoint. Typecheck: os dois arquivos com zero erro novo.

## [v0.12.63] - 2026-11-24
### changed
- ConnectChat/Nete (o fechamento da OS INFORMA a conduta; histórico datado e literal): a Nete tinha os dados certos sendo buscados, mas o diagnóstico só imprimia CHAMADOS (tickets) — as ORDENS DE SERVIÇO (`su_oss_chamado`, onde mora o fechamento real, ex.: "TROCADO A ONU" de 21/11) eram lidas e descartadas num resumo opaco. Resultado: ela referenciava um registro vago (ou o de TESTE do dia 23) em vez do fechamento real. Correções:
  - **Novo `connectchat-recent-history.ts`** (função pura `buildRecentHistory`): normaliza OS + chamados num histórico único, LITERAL e DATADO (mais recente primeiro); marca registro interno/de teste (`teste`, `opa suite`, `disparando do processo`...) para desconsiderar; e aponta o registro FECHADO relevante (não interno) que deve informar a conduta, com classificação grosseira e determinística da resolução: `CAMPO` (intervenção da equipe — troca de equipamento/cabo/sinal), `FORA_DA_REDE` (TV/IPTV/app/equipamento do cliente) ou `INCONCLUSIVO`.
  - **`connectchat-diagnosis.ts`**: passa a imprimir esse histórico com a DATA sempre na frente e o fechamento entre aspas. REMOVIDO o branch rígido anterior ("reincidente → não reinicia / abre OS") — no lugar, o fechamento do registro relevante é entregue como INSUMO de decisão e a Nete INTERPRETA (ex.: OS de 21/11 fechada com troca de equipamento → ela pode pedir para religar o equipamento OU abrir OS para a equipe, ela julga). O código informa os fatos; a decisão é dela, como um atendente — não fluxo fixo.
  - Guardrails duros mantidos: offline não reinicia; IDs de infra vêm da config; cite só o literal, com a data.

### note
- Fecha o gap "ela não leu o fechamento da OS": a OS real agora chega escrita e datada no diagnóstico, e o registro de teste sai marcado `[interno]` sem ser escondido. Backend puro, sem schema/ACL/tool/endpoint. Typecheck: os dois arquivos ConnectChat com zero erro novo. Plano aprovado via Relatório de alinhamento do STUDIO-WORKFLOW.

## [v0.12.62] - 2026-11-24
### changed
- ConnectChat/Nete (anti-alucinação / grounding duro): a Nete estava gerando NARRATIVA CONVINCENTE — afirmava como fato do sistema coisas que não estavam no dado (ex.: "reiniciar já não resolveu a lentidão no chamado anterior" sem isso constar na resolução; "você está tendo quedas" apenas repetindo o cliente). Correções:
  - Protocolo (`connectchat-attendance-protocol.ts`): regra dura — a Nete só pode AFIRMAR sobre conexão/contrato/histórico/o-que-foi-feito o que está ESCRITO no diagnóstico ou no retorno de uma ferramenta. Se não está lá, não sabe: não supõe, não monta história plausível, não repete como fato do sistema o que o cliente disse. Resolução de chamado citada com as palavras exatas, entre aspas. "Não tenho esse dado" é resposta válida; inventar é proibido.
  - Diagnóstico (`connectchat-diagnosis.ts`): marca o DESCONHECIDO explícito ("Instabilidade/quedas do login: SEM DADO — não afirme que caiu nem que não caiu"); remove o material processado que convidava narração (dicas de resolução/evidência soltas); aponta para a resolução LITERAL dos chamados recentes como única fonte do "o que foi feito antes"; reincidência afirma só o que está escrito (há chamado do mesmo tipo), sem alegar o procedimento tentado quando a resolução não registra.

### note
- Grounding no nível do prompt (o mais forte sem reescrever o fluxo). Se ainda escapar, o passo garantido é o código MONTAR a frase factual (o modelo não gera fato). Falta o log de conexão RADIUS para a Nete verificar quedas de verdade — até lá, ela não pode afirmar quedas.

## [v0.12.61] - 2026-11-24
### changed
- ConnectChat/Nete (reestruturação do organismo de prompt — causa raiz de "o diagnóstico é decoração"): o protocolo de atendimento e o diagnóstico estavam empilhados dentro de `connectchat-auto-responder.service.ts` e chegavam ao modelo sob o cabeçalho `## Restrições deste teste supervisionado` — ou seja, rotulados como andaime de teste e colados no rodapé do prompt, abaixo da persona. O modelo tratava tudo como secundário. Correções, seguindo o STUDIO-WORKFLOW (uma frente estrutural, cada organismo em seu arquivo):
  - **Runner (`agent-runner.service.ts`)**: o cabeçalho de `channelInstructions` passa de "Restrições deste teste supervisionado" para `## Instruções obrigatórias deste atendimento (seguir à risca; têm prioridade sobre a persona)`. `channelInstructions` é usado só pelo ConnectChat (6 callsites, todos operacionais) — a mudança os reforça, não os quebra. Esta é a causa raiz: o diagnóstico perfeito não adiantava num slot que o código mandava despriorizar.
  - **Novo `connectchat-attendance-protocol.ts`**: identidade e princípios da Nete (função pura `buildAttendanceProtocol`), sem os caminhos por estado.
  - **Novo `connectchat-diagnosis.ts`**: estado + diagnóstico determinístico por cliente (função pura `buildDiagnosis`), com a conduta por estado CONSOLIDADA (sem duplicar o protocolo). Inclui a correção do caminho OFFLINE (não é reinício às cegas — confirmar offline, perguntar se está em casa, pedir foto; rádio/fibra), o acompanhamento/encerramento de OS aberta, reincidência real e causa-fora-da-rede.
  - **Responder**: passa a importar e chamar os dois módulos; `channelPolicy()` e `buildSystemMemory()` inline foram REMOVIDOS (nada de código empilhado/duplicado).

### note
- Refatoração estrutural + a correção de enquadramento que a torna efetiva; sem nova feature de comportamento (a conduta foi realocada e de-duplicada, não inventada). Typecheck: os 3 arquivos ConnectChat com zero erro novo; o runner só com 2 implicit-any pré-existentes (deslocados pela edição). Falta o log de conexão RADIUS/flapping (frente futura). Plano aprovado via Relatório de alinhamento do STUDIO-WORKFLOW.

## [v0.12.60] - 2026-11-24
### changed
- ConnectChat/Nete (a informação precisa MUDAR a conduta, não enfeitar): mencionar "você teve um chamado recente" é alegórico se não muda a ação. O diagnóstico passa a transformar o histórico em DECISÃO:
  - REINCIDENTE -> não repetir às cegas o passo já tentado; ler a RESOLUÇÃO dos chamados anteriores e conduzir por ela; se o mesmo procedimento já falhou, escalar / abrir OS marcando reincidência em vez de repetir.
  - Flag determinística **causa fora da rede**: se as resoluções anteriores apontam TV/IPTV/app/equipamento do cliente, o diagnóstico avisa para NÃO tratar como problema de rede nem repetir reinício de roteador por padrão.
  - A análise é da IA, não do cliente: o cliente só desliga/liga o equipamento e confere cabos; a IA verifica o sistema primeiro e deixa isso mudar a conduta.
  - Antes de orientar um reinício, CONFIRMAR se o cliente consegue fazer agora ("está em casa, consegue desligar uns 30s pra acompanhar?") em vez de insistir.

### note
- Ainda falta o LOG DE CONEXÃO do login (RADIUS/radacct) para a Nete ver quedas recorrentes de minutos (flapping) e agir sobre isso — precisa do endpoint do manual IXC.

## [v0.12.59] - 2026-11-24
### fixed
- ConnectChat/Nete (diagnóstico raso — a causa real de "ela não olha nada"): o estado operacional já carregava AUTOMATICAMENTE a **tecnologia** (fibra/rádio, lida do cadastro), a **análise de histórico** (`historyAnalysis`: reincidência real, casos semelhantes e o que resolveu antes) e a **evidência de reincidência** — mas o `buildSystemMemory` descartava tudo isso antes de montar o diagnóstico que vai para o modelo. Resultado: a Nete só usava o que estava no diagnóstico (online, chamado recente) e ignorava fibra/rádio e o histórico, porque eles nunca chegavam a ela. Corrigido: o diagnóstico agora mostra:
  - **Tecnologia de acesso** (FIBRA/RÁDIO) — e adapta a orientação: offline de rádio lembra o rádio no poste/torre; fibra lembra a luz/sinal da ONU.
  - **Reincidência real** (`historyAnalysis.recurrent`/`recurrentWithin48h`) em vez da contagem crua de chamados.
  - **O que já resolveu antes** (`previousResolutionHints`) e **histórico semelhante** (`recurrenceEvidence`).
  É a aplicação concreta do princípio determinístico (`docs/nete-base-comportamento.md`): o sistema já investigou; o diagnóstico entrega tudo pronto, o modelo só relata. Sem novas chamadas ao IXC — o dado já vinha sendo lido.

### note
- O "extrato de acesso" no sentido de LOG DE CONEXÃO do login (várias quedas de minutos no mesmo dia / flapping) é outro conjunto de dados (RADIUS/radacct) e ainda NÃO é carregado — precisa do endpoint do manual IXC. É a última peça para o diagnóstico ficar completo.

## [v0.12.58] - 2026-11-23
### added
- IXC + ConnectChat/Nete — três ações do manual oficial da API, num update só (para testar o fluxo inteiro):
  - **Encerramento com ANÁLISE encadeada**: o `encerrar_os` agora, quando há um técnico curado, coloca a O.S. em análise (`su_oss_chamado_analisar`, status `AN`) antes de finalizar (`su_oss_chamado_fechar`) — pré-requisito do workflow IXC. Best-effort: se já estiver assumida/em análise, segue direto para o fechamento. Sem técnico configurado, encerra direto como antes.
  - **Reiniciar conexão** (`reiniciar_conexao` → `desconectar_clientes`): a Nete força a reconexão do login do cliente no concentrador, sem depender de ele mexer no equipamento. Para cliente ONLINE com problema; não resolve quem está OFFLINE por falta de sinal.
  - **Identificar fibra/rádio** (`identificar_tecnologia` → `radpop_radio_cliente_fibra`): lê do sistema se o acesso é fibra ou rádio. No caminho offline, a Nete usa isso para adaptar a orientação (rádio: há o rádio no poste/torre além do roteador) em vez de só perguntar.
- Config (tela **ISP > Abertura de Chamado**): novo campo **Técnico do encerramento** (id do técnico do IXC, curado — o modelo nunca escolhe id de infra). Vazio = encerra direto; preenchido = encadeia a análise antes de finalizar. Setor reaproveita o par padrão de abertura.
- Provider IXC: ações `os.analisar`, `conexao.desconectar`, `cliente.tecnologia`. Tools `reiniciar_conexao` e `identificar_tecnologia` na lista nativa da Nete; `encerrar_os` passa o técnico/setor curados.

### note
- Todas são escrita/leitura no IXC: compilam limpo aqui (tsc), mas só se provam contra o servidor real — é o smoke test do fluxo inteiro. Degradação graciosa em todas (falha não vira erro críptico). Ver `docs/nete-base-comportamento.md`.

## [v0.12.57] - 2026-11-23
### added
- ConnectChat/Nete (ENCERRAMENTO de chamado): quando o cliente confirma que normalizou/voltou e há O.S. aberta do caso, a Nete finaliza a O.S. em vez de deixar aberta. Baseado no manual oficial da API IXC: endpoint dedicado `POST su_oss_chamado_fechar` com `finaliza_processo: 'S'` (finaliza o workflow) e `status: 'F'`.
  - Provider IXC: nova ação `os.encerrar` (`encerrarOs`) + helper de data no padrão do IXC (`DD/MM/AAAA HH:mm:ss`, America/Sao_Paulo). `id_chamado` vem de `os.listar_abertas` — a IA não escolhe id de infra.
  - Tool `encerrar_os`: localiza a O.S. aberta do cliente e finaliza com mensagem de resolução. Se houver mais de uma O.S. aberta, NÃO encerra sozinha — devolve a lista para confirmar qual. Degradação graciosa: falha na consulta ou no fechamento não vira erro críptico — encaminha para um atendente.
  - Comportamento: só encerra com a confirmação do cliente; registrada na lista de ferramentas nativas da Nete.

### note
- O fechamento é uma ESCRITA no IXC: compila limpo aqui, mas é a parte que só se exercita contra o servidor real. Se o workflow do IXC exigir "analisar/assumir" (`su_oss_chamado_analisar`, status `AN`, com técnico/setor) antes de finalizar, ou um id de técnico fixo, ajusta-se com config curada — ver `docs/nete-base-comportamento.md`. Roadmap de ações IXC já mapeadas: `desconectar_clientes` (reiniciar conexão do login) e `radpop_radio_cliente_fibra` (identificar fibra/rádio).

## [v0.12.56] - 2026-11-23
### changed
- ConnectChat/Nete (FRENTE DE COMPORTAMENTO CONSOLIDADA — deployar como um todo): esta versão fecha, num estado coeso e compilando, a base de comportamento determinística construída ao longo do dia (v0.12.50–v0.12.55). O código monta o bloco de diagnóstico e decide o caminho; o modelo relata e segue. Caminhos: BLOQUEADO → financeiro (2ª via/link/desbloqueio de confiança), nunca técnico; INCIDENTE na região → informar, não abrir OS; ONLINE que diz "não funciona" → causa local provável → um reinício → OS; LENTIDÃO → um reinício → OS de lentidão; REINCIDENTE → prioridade + registro na descrição da OS. Identidade: vinculado confirma titular (senão pede o doc do certo), sem vínculo pede o doc. Analisar o sistema antes de perguntar; poucas perguntas; relato do diagnóstico na primeira resposta.
- ConnectChat/Nete (correção do caminho OFFLINE): offline NÃO leva a reinício às cegas (reiniciar não resolve quem está offline). A Nete passa a entender o porquê (estrutura/rede externa → incidente), confirmar com o cliente se os equipamentos estão ligados (luzes/cabos), pedir FOTO dos equipamentos e, se não for simples no local, abrir OS para a equipe verificar a estrutura/sinal. (Funções de fibra — provisionar/reiniciar ONU remoto — ficam para uma frente futura, outro departamento.)

### note
- Fora deste pacote, de propósito: ENCERRAMENTO de chamado (cliente diz que normalizou → fechar) é escrita no IXC (`os.encerrar`/finalizar), que precisa de iteração contra o servidor real como o `abrir_os` precisou — não dá para entregar às cegas. É a próxima frente focada. Ver `docs/nete-base-comportamento.md`.

## [v0.12.55] - 2026-11-23
### changed
- ConnectChat/Nete (diagnóstico determinístico — 1º degrau do classificador): o `buildSystemMemory()` passa a montar EM CÓDIGO um bloco "## Diagnóstico (determinístico)" que decide o caminho a partir do estado já lido (BLOQUEADO → financeiro; INCIDENTE → informar/não abrir OS; OFFLINE → reinício → OS; ONLINE → causa local → reinício → OS) e marca reincidência. Inclui a ordem explícita de RELATAR ao cliente, na primeira resposta, o que foi visto no sistema antes de pedir qualquer coisa. Objetivo: matar o "às vezes diagnostica, às vezes não" — o sistema decide, o modelo relata e segue, não escolhe outro caminho.

### note
- Degrau parcial: a diretriz de relato ainda é seguida pelo modelo. O degrau pleno (código TEMPLATAR a 1ª mensagem de diagnóstico, sem depender do modelo) e o ENCERRAMENTO de chamado quando o cliente diz que normalizou (precisa de `os.encerrar` no provider + tool `encerrar_os`, inexistentes hoje) estão em `docs/nete-base-comportamento.md`.

## [v0.12.54] - 2026-11-23
### changed
- ConnectChat/Nete (comportamento: analisar o sistema primeiro): a política de atendimento passa a mandar ANALISAR O CADASTRO ANTES DE PERGUNTAR ao cliente. Assim que tem o titular, a Nete roda a rotina sobre o estado do cliente (bloqueio/financeiro, online/offline, incidente, OS/chamado aberto, histórico de chamados) — mesmo que o cliente já tenha dito o problema. O sistema descobre a causa; o cliente só confirma ou completa o que faltou. Uma ou duas perguntas no máximo, nunca interrogatório.
- ConnectChat/Nete (identificação): cliente vinculado -> confirma se o atendimento é para esse titular; se não for, pede o CPF/CNPJ do cliente certo antes de seguir. Sem vínculo -> pede o documento logo no início.
- ConnectChat/Nete (reincidência): nova regra + sinal determinístico. A memória de sessão passa a marcar "Reincidência: N chamados recentes" (contagem feita no código, não pelo modelo); a política manda tratar com prioridade e REGISTRAR na descrição da OS que é cliente reincidente, para o técnico dar solução definitiva.
- ConnectChat/Nete (online que diz "não funciona"): orientação explícita de que, se o acesso está online, a causa costuma ser local (roteador/aparelho travado) -> um reinício e, persistindo, OS (pode exigir visita).

### note
- Este é o refino OBJETIVO da linha de comportamento pedida pelo Robson. A versão PLENAMENTE determinística (o código decidir o caminho, não o modelo) é a frente estrutural documentada em `docs/nete-base-comportamento.md` — próximo checkpoint.

## [v0.12.53] - 2026-11-23
### changed
- ConnectChat/Nete (diagnóstico vira descrição, não trava): o que a Nete levanta no diagnóstico (o que funciona, o que o cliente relatou, o que já foi tentado) passa a servir para DESCREVER BEM o chamado/OS e deve ser registrado na abertura — mas coletar essa informação nunca pode travar o andamento. Com o essencial em mãos, ela abre o chamado e segue, sem ficar juntando detalhes a mais. Complementa a v0.12.52 (ser resolutiva).

## [v0.12.52] - 2026-11-23
### changed
- ConnectChat/Nete (ser resolutiva, menos passos): a política de atendimento passa a pedir que ela resolva em poucos passos em vez de alongar o atendimento. No máximo uma ou duas perguntas de diagnóstico e então AÇÃO — reinício do equipamento, abrir chamado/OS ou oferecer a solução. Proibido mandar o cliente testar em sequência (app por app, dados móveis, navegador).
- ConnectChat/Nete (lentidão): novo caminho explícito na estrutura de análise. Acesso online e sem bloqueio com lentidão -> pede UM reinício do equipamento (se o cliente ainda não fez) e, persistindo, abre um chamado de lentidão para a equipe avaliar — sem ficar testando indefinidamente. O caminho offline também foi encurtado para um reinício + OS, sem encadear testes.

## [v0.12.51] - 2026-11-23
### changed
- ConnectChat/Nete (comunicação): quando o cliente já está vinculado, a Nete passa a tratá-lo pelo PRIMEIRO nome de forma natural (sem repetir o nome a cada mensagem), demonstrando que já sabe com quem fala — antes ela tinha o nome no contexto mas não o usava.
- ConnectChat/Nete (legibilidade): a resposta passa a sair com uma frase por linha em vez de um bloco único de texto. Além da instrução na política de atendimento, há uma quebra determinística no envio (`breakSentences`): quebra a linha após `.` `!` `?` seguido de início de nova frase, de forma conservadora — não quebra IP, decimal, hora (18:35), CPF nem valores (R$ 89,90). Garante o resultado independentemente de o modelo ter formatado ou não.

## [v0.12.50] - 2026-11-23
### fixed
- ConnectChat/Nete: corrige a causa real de a Nete não responder. O decorator `@Interval(5000)` estava na função errada — ao inserir `ensureNativeIspTools` (v0.12.47), ela entrou entre o `@Interval` e o `poll()`, de modo que o agendador passou a chamar a reconciliação de ferramentas (sem argumento, erro engolido pelo try/catch) e o `poll()` ficou SEM agendamento nenhum. Ou seja: o laço que lê mensagens novas e responde nunca era disparado — silêncio total, independente de ferramentas, IXC ou memória de sessão. O `@Interval(5000)` foi devolvido ao `poll()` e a `ensureNativeIspTools` continua sendo chamada de dentro do poll (recebendo o agent). Isso explica por que o hardening da v0.12.49 não surtiu efeito: ele blindava contra travamento, mas o problema era o poll jamais rodar.

## [v0.12.49] - 2026-11-23
### fixed
- ConnectChat/Nete: corrige regressão em que a Nete parava de responder. Blindagem — a reconciliação de ferramentas do agente nativo e a leitura do estado do cliente no sistema (camada 2) não podem mais derrubar nem congelar o polling: a reconciliação nunca lança (degrada para o agente como está) e a leitura do IXC passou a ter timeout (10s/8s), então uma consulta lenta ou indisponível não trava o atendimento. A Nete sempre responde, mesmo que a memória de sessão fique indisponível naquele turno.

## [v0.12.48] - 2026-11-23
### added
- ConnectChat/Nete: memória de sessão (camada 2). Ao identificar o titular, o atendimento carrega AO VIVO o estado do cliente no sistema (online/offline, contrato bloqueado, boletos em aberto/vencidos, OS e chamados abertos, incidente de região e histórico de chamados recentes com pedido/resolução) e injeta como contexto da sessão — separado da conversa, recém-lido a cada turno e nunca reaproveitado entre atendimentos. A Nete passa a raciocinar por uma estrutura de análise por perfil (bloqueio→financeiro; offline+incidente→informar; offline sem bloqueio→técnico/OS; OS/chamado aberto→acompanhar; online e em dia→perguntar) como espinha do raciocínio, não roteiro fixo. Benefício: mesmo que a execução de uma ferramenta falhe, o estado já está no contexto, então ela responde com robustez e usa as tools para aprofundar ou agir.

## [v0.12.47] - 2026-11-23
### fixed
- ConnectChat/Nete: o agente nativo passa a receber automaticamente TODO o catálogo de ferramentas do ISP (consulta e ação: identificar, status, contrato, débitos, OS/chamados, diagnóstico, região, 2ª via, link de pagamento, desbloqueio de confiança, abrir OS, encaminhar) a cada ciclo de atendimento, de forma idempotente, sem depender de o usuário configurar ferramentas em tela — a configuração de ferramentas deixou de ser exposta ao usuário final e a Nete decide sozinha o que usar. Resolve o caso em que ela só conversava ("consulta indisponível") por estar sem ferramentas; a v0.12.45 só semeava as tools ao abrir Configurações da IA, o que deixou de acontecer.

## [v0.12.46] - 2026-11-23
### changed
- WhatsApp/WAHA: motor migrado definitivamente de WEBJS para NOWEB (Baileys), sem manter WEBJS ativo. O mesmo container (mesmo nome e volume /app/.sessions) é recriado no deploy com WAHA_ENGINE=NOWEB, WHATSAPP_DEFAULT_ENGINE=NOWEB, WAHA_NOWEB_WA_VERSION=auto-web, WHATSAPP_RESTART_ALL_SESSIONS=True, WAHA_AUTO_START_DELAY_SECONDS=5 e rotação de log (50m x3). A troca muda o namespace: sessões WEBJS antigas permanecem no volume (não apagadas) mas não são carregadas pelo NOWEB — refazer o pareamento por QR uma vez por número.
### fixed
- WAHA: sessões que caíam sem recuperar agora reiniciam sozinhas em FAILED/STOPPED via POST /restart SEM logout (preserva a autenticação), no máximo 1x por sessão a cada 5 min, com trava anti-loop. LoggedOut exige QR, TemporaryBan não reconecta e ClientOutdated pede atualização de imagem — esses não reiniciam.
- WAHA: diagnóstico da queda preservado (reason, event, mensagem, código e os 3 estados anteriores) e enviado como alerta operacional no Event Bus; o estado do canal descreve a causa (ConnectFailure, StreamReplaced, ClientOutdated, LoggedOut, TemporaryBan) em vez de um "offline" genérico.

## [v0.12.45] - 2026-11-23
### fixed
- ConnectChat: a Nete não usava as ferramentas (só conversava e dizia "indisponível") porque o AGENTE NATIVO nascia — e era reusado — com allowed_tools vazio, diferente dos agentes criados pela tela, que já recebem o conjunto de consulta do ISP. Agora o agente nativo é semeado com as ferramentas de consulta (identificar_cliente, status_conexao, consultar_contrato, consultar_os_recentes, consultar_chamados_recentes, diagnosticar_conexao, status_regiao) e um nativo já existente vazio é preenchido automaticamente quando há conexão IXC ativa (só leitura, sem aprovação).

## [v0.12.44] - 2026-11-23
### fixed
- ConnectChat: cliente já vinculado passa a ser atendido sem pedir o CPF de novo. O condutor resolve o titular (nome + CPF/CNPJ) a partir do vínculo e entrega ao agente, que agora consegue consultar conexão/contrato/financeiro/chamados no IXC. Antes, o agente vinculado ficava sem o documento (as operações do IXC são chaveadas por CPF) e as consultas voltavam "indisponível".
- IXC: cliente.identificacao passa a devolver também o documento (cnpj_cpf), de forma aditiva — é o que permite resolver o CPF do titular a partir do id vinculado.
- Painel ConnectChat/Conversas: corrige o balão da IA que aparecia azul com texto preto (ilegível). A tela usava tokens --su-* inexistentes neste painel; adicionado fallback legível com os tokens --ap-* do tema (sem cravar cor fixa).

## [v0.12.43] - 2026-11-23
### fixed
- Destrava o build da v0.12.42: a linha 228 (progressAuthenticatedLink, fluxo de vínculo PWA legado) tinha uma chamada quebrada a sendReply com argumento vazio — edição pela metade herdada do branch, não da virada para intenção. Trocada por inbox.sendAgentMessage. O código do atendimento por intenção já compilava; este era o único erro do nest build.

## [v0.12.42] - 2026-11-23
### changed
- ConnectChat (Nete): atendimento deixa de ser fluxo/máquina-de-estados e passa a ser conduzido por INTENÇÃO pelo AgentRunner, com as ferramentas ISP e o histórico da conversa. A IA entende o pedido, consulta vínculo/bloqueio/online-offline/OS/chamados/região via tools e responde de forma humana e variável. O responder manteve só o encanamento do canal (cursor/claim/debounce/dedup/reset) e a política de atendimento virou instrução (channelPolicy), não galho de código.
- Ferramentas ISP agora são multicanais: identificar_cliente (auto-vínculo) e encaminhar_para_fila reconhecem o canal pelo escopo do run. O caminho do WhatsApp fica inalterado (padrão quando não há channel no escopo); no ConnectChat o vínculo persiste pelo inbox do canal e o handoff pausa a Nete para o operador assumir.
### security
- Mantida a trava anti-enumeração de cadastro no ConnectChat (máx. 5 buscas por documento / 15 min por conversa) como guard gracioso em identificar_cliente.
- Preservado o princípio "IA nunca escolhe id de infra": conexão/ERP continuam auto-resolvidos pela config curada nas tools; o modelo só decide CPF/descrição/escolha do cliente.

## [v0.12.40] - 2026-11-23
### fixed
- Previne resposta duplicada em loop infinito no ConnectChat, avançando o cursor no catch.

