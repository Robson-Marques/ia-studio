# Changelog
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

