# Atendimento ISP — integração automática IXC e laboratório ConnectChat

## Escopo desta entrega

O IXC **já possui** provider ERP e ferramentas ISP no módulo `platform-api/src/modules/isp`.
Esta entrega usa a infraestrutura atual, sem novo ERP, migração Prisma ou conexão duplicada.

1. Quando há `Connection` IXC `ACTIVE`, novos agentes (e agentes atualizados pelo
   editor) recebem automaticamente **somente** as ferramentas de leitura
   `identificar_cliente`, `consultar_chamados_recentes`, `diagnosticar_conexao`,
   `consultar_contrato` e `status_conexao`, contanto que os registros do
   catálogo estejam ativos, sejam builtin e não exijam aprovação. Isso também
   adiciona ao prompt um procedimento inicial de atendimento ISP.
2. O ConnectChat conserva sua conexão atual: não se cria outra credencial técnica.
   Em **Conversas internas > Laboratório de IA — ConnectChat**, o operador
   escolhe um assistente ativo, salva seu vínculo à instalação e testa uma
   mensagem recente de uma conversa selecionada.
3. O teste usa o AgentRunner existente (Codex CLI ou API, conforme a conexão do
   agente), mas **não envia** a resposta ao cliente. Exibe uma prévia privada
   e opcionalmente copia o texto para o compositor, para revisão e envio
   manual por alguém com permissão.
4. Somente um vínculo `ixc:<connectionId>:<customerId>` confirmado no
   ConnectChat autoriza a consulta de histórico daquele cliente. O sistema
   consulta **no máximo cinco** `su_ticket` mais recentes, projeta campos
   mínimos e registra explicitamente se o IXC estava indisponível.
5. O documento do cliente é obtido exclusivamente no servidor pela ID do
   cadastro vinculado, não pelo modelo. Ferramentas liberadas no laboratório
   para titular confirmado (`consultar_chamados_recentes`,
   `consultar_contrato`, `status_conexao`) recebem o CPF/CNPJ travado a
   esse cliente e a Connection IXC daquele vínculo. Não aceitam login manual
   para outro cliente.
6. Regras editáveis do laboratório: consultar histórico, janela de reincidência
   (1–180 dias), mínimo de chamados (2–5) e recomendar humano em incerteza.
   A sinalização de recorrência é **indício quantitativo**, não diagnóstico:
   os últimos cinco tickets podem não cobrir todo o período.
7. O ToolRuntime aplica a allowlist por execução e proíbe aprovações no preview,
   evitando envio, modificação de dados e escalada de ferramentas por prompt.

## Limites de segurança intencionais

- Resposta automática no ConnectChat: **desabilitada** (não há webhook de agente
  habilitado por esta entrega).
- Resposta automática no WhatsApp: **inalterada e não ativada**.
- Desbloquear, abrir OS, gerar link de pagamento, segunda via, envio proativo,
  editar/excluir registros e disparar incidente regional: **não permitidos no laboratório**.
- Sem vínculo de titularidade confirmado, não consultar cadastro/histórico de
  outro cliente por CPF fornecido na mensagem. O agente só pode fazer perguntas
  e consultar FAQ/data neste modo.
- Não executar alterações financeiras ou criar uma OS antes de haver regras
  de titularidade, limites comerciais, confirmação de ação e revisão humana.
- `vincular_cliente` do WhatsApp é propositalmente desabilitada no ConnectChat
  e nenhum `scopeKeys.session` é repassado ao runtime neste teste.
- O preview é privado, mas o AgentRunner ainda armazena runs e logs de ferramentas
  conforme a retenção/ACL atuais; validar a política de dados da operação.
- Não instalar/configurar um novo provider ConnectChat nem criar canal WhatsApp.

## Critérios de verificação antes de publicar

1. Com uma única conexão IXC ativa, criar agente e salvar; conferir em
   `allowed_tools` apenas as consultas automáticas previstas, sem ações de escrita.
2. Escolher o agente no laboratório; confirmar que não existe mensagem nova
   no ConnectChat após `Gerar resposta de teste`.
3. Sem cliente vinculado: o agente pede dados de identificação; nenhuma
   ferramenta que leia contratos, chamados, pagamentos ou status deve ser executada.
4. Com cliente vinculado: confirmar consulta limitada dos últimos cinco chamados
   e que os valores correspondem exatamente ao cadastro vinculado.
5. Conferir que erro de IXC aparece como **indisponível**, jamais como
   `cliente sem chamados`.
6. Testar resposta de suporte reincidente, cliente sem chamados, pedido de
   boleto, tentativa de CPF de terceiro e solicitação de abertura de OS.
7. Simular prompt malicioso em ticket: a IA deve tratá-lo como dado histórico.
8. Salvar regras do laboratório e voltar à tela: valores devem persistir.
9. Conferir edição de agente existente sem perder habilidades personalizadas,
   mas adicionando apenas as consultas automáticas do IXC.
10. Fazer build da API e do painel no ambiente de implantação, sem executar
    GitHub Actions automáticos. Só publicar release após validação local.

## Ainda não é homologação para produção

Precisa de decisão humana quanto às regras de comprovação de titularidade,
envio de segunda via/PIX, abertura/duplicidade de OS, encaminhamento de filas,
monitoramento fora do IXC (OLT/RADIUS/incidentes), horário de atendimento,
limites de retries, exceções contratuais e liberação de envio automático.
Estes itens não podem ser ativados apenas por prompt.
