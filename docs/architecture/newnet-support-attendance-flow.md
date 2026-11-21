# Newnet — atendimento assistido por estado e evidência

O ConnectChat é o primeiro canal operacional da Nete; o WhatsApp somente após homologação. Existe um único agente interno. O **orquestrador do backend** controla etapas, identidade, consultas e permissões. O LLM redige respostas, não decide quem está autenticado nem qual cadastro consultar.

## Estados do atendimento

| Estado | Gatilho | Ação permitida | Transição |
| --- | --- | --- | --- |
| ENTRADA | Primeira mensagem | Saudação curta; reconhecer o motivo já informado | IDENTIFICAR |
| IDENTIFICAR | Ausência de vínculo ACTIVE/CUSTOMER | Solicitar CPF do titular, sem divulgar resultados | CPF_LOCALIZADO |
| CPF_LOCALIZADO | CPF válido e cadastro único encontrado no IXC | Solicitar consentimento de vínculo; não expor nome, endereço, boletos ou serviço | CONFIRMACAO |
| CONFIRMACAO | Consentimento sim/não | Registrar consentimento, aguardar validação segura de identidade | VINCULADO ou HUMANO |
| VINCULADO | Confirmação segura no ConnectChat | Usar exclusivamente `customerRef=ixc:<connection_id>:<customer_id>` | PRE_TRIAGEM |
| PRE_TRIAGEM | Vínculo confirmado | Consultar OS abertas, OS/tickets recentes, contratos ativos e status do serviço | OS_EXISTENTE ou DIAGNOSTICO |
| OS_EXISTENTE | Pelo menos uma OS realmente aberta | Informar existência e protocolo quando disponível; jamais gerar duplicidade | ACOMPANHAMENTO |
| DIAGNOSTICO | Ausência comprovada de OS aberta | Analisar reincidência em até 48 h; confirmar tecnologia e conexão antes de recomendar passos específicos | ORIENTACAO ou HUMANO |
| ORIENTACAO | Evidência suficiente | Pergunta única e pertinente ou teste seguro, sem presumir equipamentos | SOLUCAO ou HUMANO |
| HUMANO | Falha de consulta, identidade/tecnologia incerta, risco ou necessidade de ação | Encaminhar com resumo estruturado e histórico, sem inventar prazos | OPERADOR |

## Regras obrigatórias

1. A Nete saúda de forma breve. Se o motivo já foi declarado, **não pergunta de novo**.
2. Cliente com vínculo ativo: **não solicita CPF novamente**.
3. CPF é identificador de busca, **não autenticação**. Apenas CPF + "sim" NÃO autoriza vincular automaticamente; o ConnectChat exige validação adicional aprovada pela operação. O código atual registra intenção de consentimento em `SystemSetting` e o atendimento humano conclui a vinculação no fluxo existente.
4. Nenhum dado pessoal, financeiro ou contratual é revelado antes de vínculo seguro. Não incluir CPF em logs, mensagens de confirmação ou prompts enviados ao modelo.
5. A consulta de OS abertas é **fail-closed**. Falha no IXC significa "não consegui verificar", nunca "não existe OS".
6. Com OS aberta, informar uma vez, sem duplicar protocolo, prometer data ou abrir outra OS. Para reabordagens, usar a situação registrada.
7. Chamados encerrados há até 48 h são **sinal de reincidência**, não prova de mesma causa. Comparar abertura, encerramento, duração, motivo, resolução e histórico disponível; quando ausentes, não inventar.
8. A tecnologia só é considerada confirmada pelo IXC quando houver campo técnico inequívoco para um único contrato ativo. Nome de plano não é prova de fibra/rádio. Caso contrário, perguntar objetivamente, sem presumir modem/ONU/LOS.
9. Uma mensagem de resposta por turno, com possíveis parágrafos internos; não repetir pergunta já respondida. Debounce e idempotência por conversa.
10. Ferramentas de escrita no IXC não são liberadas no ConnectChat durante a homologação. Abertura de chamado/OS será um marco posterior, condicionado a política de aprovação e verificação de duplicidade imediatamente antes da escrita.

## Implementado nesta mudança

- Mensagens iniciais curtas e coleta de CPF.
- Localização segura por CPF com validação de dígitos (sem revelar cadastro).
- Consentimento explícito solicitado e registrado; pendência aparece ao operador no ConnectChat, que confirma a validação da identidade e usa o vínculo direto já existente.
- Checkpoints de identificação e tecnologia sem repetições.
- Consulta de OS aberta, tickets recentes (incluindo estados abertos e inconclusivos), últimas cinco OS e últimos cinco chamados apenas por `customerRef` validado; cálculo de reincidência em 48 h usando datas reais.
- Contratos e acessos ativos consultados pelo ID de cliente confirmado, com seleção do ponto quando há vários contratos e inferência de tecnologia proibida quando campo da fonte não é inequívoco.
- Incidentes ativos da conexão consultados pelo leitor ISP existente, agrupando logins em uma única leitura; respeita a supressão de OS e a autorização para divulgação de previsão.\n- Triagem separa suporte, financeiro e pedidos gerais. Falhas de consulta bloqueiam conclusões e ações prematuras.

## Ainda não implementado / aprovação necessária

- Confirmação automática de identidade por OTP ou outro fator independente; no momento é necessária validação presencial/procedimental por operador.
- Vinculação sem intervenção humana após confirmação forte: o vínculo atual é feito pelo operador autorizado, usando a API ConnectChat existente.
- Rotinas profundas de diagnóstico físico (fibra/rádio), validação de mapeamentos tecnológicos reais do IXC, monitoramento contínuo e classificação completa dos status de tickets da instalação.
- Regras completas de abertura/reabertura de tickets, tratamento de solicitações múltiplas por contrato e handoff automático.
- Build, testes de integração IXC/ConnectChat, concorrência e homologação visual/operacional. O serviço de resposta deve permanecer em ambiente controlado até validar.

## Cenários mínimos de homologação

- Primeiro contato com e sem motivo; CPF ausente, válido, inválido e inexistente.
- Cliente sem vínculo não recebe dados privados; CPF encontrado não gera vinculação por si.
- Consentimento positivo, negativo e silencioso; cliente já vinculado não é questionado de novo.
- Serviço fibra, rádio, tecnologia desconhecida e cliente com mais de um contrato ativo.
- OS aberta, OS recente encerrada há 12h/36h/72h, múltiplas OS, IXC indisponível e histórico incompleto.
- Sem repetição da mesma pergunta; uma bolha; mensagens simultâneas; reinício de worker; ausência de envio duplicado.
