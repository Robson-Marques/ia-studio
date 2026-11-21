# Newnet — instalação e validação na produção

Este roteiro usa a instalação Newnet já existente. Não cria ambiente de piloto, lista de identidades, novo banco, GitHub Actions ou implantação automática.

## Comportamento normal

- A Nete atende **todas as conversas OPEN** no ConnectChat, sem restrição por identidade. Não existe `CONNECTCHAT_AI_PILOT_IDENTITIES`.
- A configuração do agente nativo continua sendo a fonte do `auto_reply`: agente precisa estar ativo.
- `CONNECTCHAT_AI_AUTOREPLY` é somente um **kill switch** de emergência: `off` desliga a Nete; valor ausente ou diferente de `off` mantém o comportamento normal.
- A criação de novo vínculo é uma ação distinta: `CONNECTCHAT_AI_LINKING=on` permite solicitar/concluir LinkRequest. Sem `on`, a Nete continua atendendo contatos já vinculados, mas não cria novos vínculos.
- `ai.connectchat.link_purpose` precisa receber uma finalidade realmente aceita pela versão instalada do ConnectChat.

## Publicação pelo procedimento atual do servidor

1. Manter backup/versão anterior para rollback e atualizar o IA Studio com o código do PR #32 pelo processo de deploy que já é usado.
2. Conferir que a API, ConnectChat e IXC estão disponíveis e o agente nativo está ativo, com `auto_reply` habilitado.
3. Com `CONNECTCHAT_AI_AUTOREPLY` ausente ou diferente de `off`, a Nete atende normalmente todas as conversas abertas, sem allowlist.
4. Antes de usar `CONNECTCHAT_AI_LINKING=on`, confirmar no ConnectChat instalado que a aprovação na PWA comprova o direito do solicitante sobre o CPF/CNPJ IXC correspondente. CPF/CNPJ + "sim" ou login no chat, isoladamente, não comprovam titularidade.
5. Validar no servidor: CPF/CNPJ, consentimento, vínculo PWA, segunda via de títulos do cliente verificado, suporte, incidente aberto, escolha de contrato e ausência de OS duplicada. Não usar dados de outro assinante para validar.
6. Se precisar interromper rapidamente a Nete, definir `CONNECTCHAT_AI_AUTOREPLY=off` e recarregar/reiniciar a configuração da API; isso não derruba ConnectChat ou IXC.

## Limites reais desta entrega

- Títulos financeiros são somente leitura e só aparecem mediante pedido de segunda via/boletos, depois de vínculo `CUSTOMER/ACTIVE`.
- As ferramentas executáveis continuam desabilitadas no canal ConnectChat (`allowedToolsOverride: []`): nenhuma OS, desbloqueio ou cobrança é feita pela IA.
- A leitura das conversas não cria vínculo direto. O fluxo de LinkRequest exige confirmação pela API e respeita identidade, cliente IXC e prazo.
- O código da PWA ConnectChat não faz parte deste repositório disponível. A prova de titularidade permanece dependente da implementação instalada; não afirmar que foi homologada aqui.
- Não adicionar CI ou testes automáticos GitHub para este fluxo. O workflow temporário foi removido.

## Rollback

Desativar `CONNECTCHAT_AI_AUTOREPLY=off` e `CONNECTCHAT_AI_LINKING=off` e, se necessário, restaurar o pacote/tag anterior pelo procedimento normal, preservando banco de dados e histórico.
