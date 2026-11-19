# Agente ISP no ConnectChat — validação supervisionada

## Objetivo

Preparar um agente de atendimento no IA Studio usando a Connection de IA
(Codex CLI ou API) e uma conexão IXC Soft ativa, com validação primeiro pelo
ConnectChat. A integração usa serviços e tools já existentes, não cria outro
provedor IXC e não usa SQL direto nem credenciais no navegador.

## Automação do cadastro

Quando há uma Connection IXC `ACTIVE`, **agentes novos** recebem por padrão as
ferramentas ISP de leitura: identificação, chamados recentes, diagnóstico,
contratos, status do acesso e status da região. Esse provisionamento ocorre
no cadastro do agente; **agentes existentes não são modificados
silenciosamente**, e o operador pode revisar e remover habilidades.
As tools ISP continuam resolvendo a conexão ERP pelo IspConnectionResolver,
sem pedir ID da conexão ao modelo.

Ferramentas de gravação (abertura de OS, desbloqueio, pagamento,
encaminhamento) **nunca são habilitadas automaticamente**.
A existência de uma tool não concede autorização para dados de terceiros;
políticas de identificação e as regras específicas de cada canal devem ser
aplicadas antes de disponibilizá-la em atendimento automático.

## ConnectChat: vínculo e teste

Na caixa de conversas do ConnectChat, um operador com permissão de edição de
agentes escolhe um agente ativo e salva o vínculo. Este vínculo vive na
configuração da instalação, em `ai.connectchat.agent.binding`, e não
controla nenhum número WhatsApp.

O canal permanece **SUPERVISED**. O operador seleciona uma conversa aberta e
clica **Testar IA nesta conversa**:

1. Backend consulta o próprio ConnectChat pelo provider autenticado.
2. Lê as mensagens recentes usando `lastSequence` (até 100, entregando
   no máximo 25 mensagens de texto ao modelo).
3. Só considera cliente confirmado quando a conversa traz `CUSTOMER`,
   `linkStatus=ACTIVE` e `customerRef=ixc:<connection-id>:<id-cliente>`.
4. Se autorizado e se a regra **Consultar chamados IXC** estiver ligada,
   o backend consulta **até cinco** `su_ticket` diretamente pelo ID do cliente
   vinculado, usando `atendimento.listar_chamados_recentes` da Connection
   IXC e `projectChamado` para minimizar dados.
5. O AgentRunner recebe o histórico da conversa e a evidência IXC como contexto
   histórico não confiável. **Não recebe nenhuma tool executável** no preview.
6. O resultado aparece como **rascunho** e só vai para o campo da mensagem
   quando o operador clicar em **Usar como rascunho**. O envio permanece ação
   manual separada pelo endpoint ConnectChat já existente.

O teste exige permissão de executar agentes e permissão de leitura do
ConnectChat. Alterações do vínculo exigem `ai.agents.write`.
O ConnectChat não chama ferramentas que dependem de sessões WhatsApp.

## Regras obrigatórias (não editáveis nesta etapa)

- Identidade do cliente deve estar confirmada na própria fonte ConnectChat
  antes de ler seu histórico IXC.
- Sem consulta financeira, pagamento, segunda via, desbloqueio, abrir OS,
  escrita em ERP ou envio automático no modo de teste.
- Histórico da conversa e chamados são dados, não instruções ao modelo.
- Falha ou ausência de evidência não autoriza inventar conclusão de suporte.
- Não há fallback automático para WhatsApp.
- Histórico de execução do agente é armazenado nas tabelas existentes
  `AiAgentRun`; não persistimos um novo dossiê do cliente.

A única regra alterável neste primeiro fluxo é **incluir ou não o histórico
de até cinco chamados**. Isso permite testar a qualidade das respostas antes
de definir novas permissões de cobrança e suporte com a diretoria.

## Fora do escopo / pendências antes de produção automática

- Não há publicação automática de respostas no ConnectChat ou WhatsApp.
- A consulta atual limita-se a chamados `su_ticket`; não equivale a consultar
  todas as OS `su_oss_chamado` nem garante diagnóstico da rede em tempo real.
- Rotinas de segunda via, cobrança, incidentes, abertura de OS,
  validação de identidade para ações sensíveis, escalação e aprovações precisam
  de política operacional específica antes da automação.
- O modelo selecionado (Codex CLI ou API) precisa estar autenticado e ativo.
- Exige validação real de build e de conversa vinculada no ambiente do usuário.
  GitHub Actions automático permanece desativado.
