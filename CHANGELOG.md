# Changelog
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

