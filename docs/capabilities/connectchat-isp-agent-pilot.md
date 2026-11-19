# Bancada supervisionada de agentes ISP no ConnectChat

## Objetivo

Configurar um assistente de atendimento sobre as conexões existentes do IA Studio,
iniciando por **ConnectChat** e somente depois liberando **WhatsApp**. A bancada
é uma forma de validar conhecimento, identificação e raciocínio antes de colocar
um agente para responder sozinho.

## Capacidades reaproveitadas

- **IXC**: provider `ixc`, com operações de cliente, contratos, chamados,
  conectividade e financeiro (a versão desta integração já existia).
- **ISP**: `IspTools`, `IspDiagnosisService` e `IncidentLookupService`.
  Não duplicamos lógica de consulta a tabelas, login, contrato, OLT ou OS.
- **IA**: `AgentRunnerService`, `ToolRuntimeService`, `AiAgent`, conhecimento
  e guardrails existentes. A IA Codex CLI ou API é a Connection do agente.
- **ConnectChat**: conversas e mensagens do provider existente, sem mecanismo
  separado de transporte, sem novo protocolo e sem polling de mensagens pela IA.

## Padrão de novos agentes

Se houver **exatamente uma conexão IXC ativa** quando o agente for criado e
o editor não tiver informado habilidades, o backend ativa apenas as ferramentas
de leitura já existentes e ativas:

- `identificar_cliente`
- `consultar_chamados_recentes`
- `consultar_os_recentes`
- `diagnosticar_conexao`
- `consultar_contrato`
- `status_conexao`
- `conversation_history`
- `current_datetime`

Nenhum acesso SQL, chamadas HTTP livres, alteração de registro, nova OS,
desbloqueio, disparo de mensagem ou cobrança são habilitados por padrão.
O editor marca as mesmas habilidades automaticamente e mostra um aviso antes
de salvar. O operador pode ajustá-las em “O que faz”. Assistentes existentes
não são alterados silenciosamente; podem ser editados manualmente.

Para múltiplas conexões IXC, a configuração deve ser definida pelo operador,
para evitar confundir clientes de empresas/filiais diferentes.

## Bancada de testes

Abra **ConnectChat → Conversas internas**, selecione um atendimento e um
agente ativo. O vínculo da bancada é persistido em
`ai.connectchat.pilot.agent_id`, por instalação.

**Simular resposta**:

1. Confere as permissões locais de leitura ConnectChat e execução de agentes.
2. Confere que a conversa pertence ao ConnectChat conectado.
3. Lê até 100 mensagens da conversa e oferece ao agente as 20 últimas mensagens
   com conteúdo, para manter continuidade.
4. Consulta regras persistidas em `ai.connectchat.pilot.rules`. Padrões:
   `ticketHistory=true`, `networkDiagnosis=true`, `financialRead=false` e
   `requireCustomerLink=true`.
5. Sem vínculo ativo de cliente, só oferece FAQ e hora atual. Mesmo que o usuário
   desmarque controles na UI, a consulta de dados pessoais exige vínculo ativo.
6. Com o vínculo IXC ativo, o backend lê deterministicamente os **cinco últimos
   atendimentos** e as **cinco últimas ordens de serviço** do titular pelo
   ID armazenado no vínculo, reduz os campos pela projeção `projectChamado`
   e anexa ambas as fontes separadas ao contexto antes da IA responder.
   Se uma consulta falhar, informa indisponibilidade, nunca ausência.
7. Ensaia o AgentRunner com ferramentas explicitamente autorizadas. Nunca
   disponibiliza no ensaio ferramentas de escrita, boleto em PDF, WhatsApp,
   desbloqueio, criação de OS ou alteração em conexão.
8. Mostra o **rascunho não enviado**, com botão **Revisar na mensagem**. Apenas
   um operador com permissão de envio pode copiar o rascunho para o composer e
   clicar manualmente em Enviar.

Nenhuma mensagem é automaticamente enviada para o ConnectChat ou WhatsApp,
nenhum vínculo é ativado automaticamente e o `auto_reply` do agente não é
alterado. Não existe mudança de esquema Prisma nem migração de banco.

## Segurança e ressalvas

- O `RequirePermissions` da aplicação usa **OR**. O endpoint da bancada
  realiza verificação explícita **AND** de ambas as permissões necessárias.
- As regras e o vínculo são auditados pelo `SettingsService`. Chamadas de
  ferramentas passam pelo log existente do `AgentRunner`.
- `identificar_cliente` mantém o comportamento de vínculo automático existente
  do WhatsApp; o ensaio ConnectChat bloqueia esse efeito colateral.
- Titularidade confirmada via vínculo é condição mínima, não substitui as
  regras reais de identidade para envio de faturas e ações financeiras; essas
  operações continuam sob revisão humana.
- A leitura de títulos é uma opção de teste desligada por padrão e depende
  também de habilitar `consultar_debitos` nas habilidades do agente.
  Não autoriza cobrar, negociar, desbloquear acesso ou emitir segunda via.
- A bancada é restrita à revisão por operadores. Antes de habilitar resposta
  automática no WhatsApp, ainda é necessária uma política explícita de alçada,
  identidade, privacidade, antifraude e escalonamento humano, com testes reais.

## Validação necessária antes da tag

- Compilar NestJS + painel com o Studio UX privado.
- Testar a seleção de um agente Codex CLI conectado, depois um agente por API.
- Conferir vínculo ativo/inativo, permissões, mensagens com anexos, conversa sem
  cliente vinculado e agente inativo.
- Conferir as três regras, sobretudo consulta financeira desligada por padrão.
- Verificar que nenhuma simulação dispara mensagem/OS/desbloqueio no IXC,
  no WhatsApp ou no ConnectChat.
- Validar consultas reais IXC em ambiente controlado e revisar os resultados.
- Nenhum CI GitHub automático deve ser acionado nesta entrega.
