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
- Consentimento explícito solicitado e registrado. A Nete aguarda o estado autenticado ACTIVE/CUSTOMER emitido pelo ConnectChat e retoma o atendimento automaticamente após essa confirmação.
- Checkpoints de identificação e tecnologia sem repetições.
- Consulta de OS aberta, tickets recentes (incluindo estados abertos e inconclusivos), últimas cinco OS e últimos cinco chamados apenas por `customerRef` validado; cálculo de reincidência em 48 h usando datas reais.
- Contratos e acessos ativos consultados pelo ID de cliente confirmado, com seleção do ponto quando há vários contratos e inferência de tecnologia proibida quando campo da fonte não é inequívoco.
- Incidentes ativos da conexão consultados pelo leitor ISP existente, agrupando logins em uma única leitura; respeita a supressão de OS e a autorização para divulgação de previsão.\n- Triagem separa suporte, financeiro e pedidos gerais. Falhas de consulta bloqueiam conclusões e ações prematuras.

## Ainda não implementado / aprovação necessária

- Contrato de criação/consumo da prova autenticada na versão instalada do ConnectChat: o IA Studio já observa o vínculo confirmado, mas ainda não dispara a solicitação de prova pela PWA porque não temos o formato validado da API.
- Vinculação iniciada pela Nete com prova independente, sem operador: aguarda inspeção da implementação de LinkProof/LinkRequest no ConnectChat. NÃO usar linkContactDirectly a partir de CPF+sim.
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

## Diretriz adicional: operação 100% autônoma (pendente de prova de vínculo)

- A Nete não exige aprovação operacional para conversar, consultar dados de uma identidade **já confirmada** ou executar ações com permissão e controles técnicos pré-definidos. Ações de escrita precisam ter autorização de sistema, idempotência, auditoria, limites e verificação anti-duplicidade; não têm de exigir um humano a cada chamada.
- CPF + consentimento não é prova de titularidade. O ConnectChat dispõe de APIs `createLinkRequest`, `exchangeLinkProof` e `completeLinkRequest`; **a semântica da prova deve ser verificada no código da API/PWA do ConnectChat antes de automatizar o vínculo**. Não chamar `linkContactDirectly` apenas com CPF digitado.
- O módulo de menu IA fica reduzido às configurações e conhecimento; Memória/MCP migram para Desenvolvedor. Ferramentas e catálogo de ações deixam de ser configuração operacional visível; permissões e implementação continuam internas.
- A interface operacional não oferece confirmação humana de vínculo. O gatilho automático atual é a transição autenticada para CUSTOMER/ACTIVE. A solicitação/aceitação da prova na PWA ainda precisa de contrato confirmado; não simular que esse acionamento já funciona.
- Depois de confirmar o mecanismo, testar: contato com CPF correto de terceiro, prova expirou, prova de outra identidade, autorização revogada, repetição de proof, várias sessões e vínculo existente.

## Estado atual do PR #30 (sem release)

- Menu operacional: somente Configurações da IA e Conhecimento. Memória/MCP ficam em Desenvolvedor; catálogo de habilidades e decisões manuais retirados do fluxo operacional sem apagar o backend legado.
- Após o contato autorizar vínculo, a Nete não manda para operador; aguarda o contato ter sua identidade confirmada pelo mecanismo de sessão do ConnectChat.
- Quando o ConnectChat relatar `status=CUSTOMER`, `linkStatus=ACTIVE` e `customerRef` com ID IXC igual ao cadastro localizado, a Nete retoma o motivo salvo automaticamente e não repete identificação.
- **Falta integrar o disparo da prova e validar seu consumo**: o ConnectChat instalado dispõe de `/app/apps/api/dist/contact-link` e `integration.controller.js`, mas o contrato compilado e o fluxo PWA não estão disponíveis nesta sessão. Não presumir qual `purpose` ou quais campos de prova a API aceita.
