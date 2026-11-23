# Changelog
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

