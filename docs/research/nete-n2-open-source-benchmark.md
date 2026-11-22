# Benchmark aberto — agente N2 para ISP

Revisão feita em 2026-11-22 para separar o que pode ser resolvido por prompt do
que exige estado, ferramentas e infraestrutura operacional.

## Fontes primárias consultadas

- [TMF621 Trouble Ticket](https://github.com/tmforum-apis/TMF621_TroubleTicket):
  ticket possui ciclo de vida, severidade, datas, partes, entidades relacionadas,
  notas e eventos; não é apenas uma mensagem de chat.
- [TMF656 Service Problem Management](https://github.com/tmforum-apis/TMF656_ServiceProblemManagement):
  problema de serviço agrega alarmes, anomalias de desempenho, tickets, SLA e
  manutenção; problema de rede e atendimento individual são entidades distintas.
- [OpenAI Support Agent Demo](https://github.com/openai/openai-support-agent-demo):
  conversa multi-turno, busca, function calling e execução automática somente
  para ações não sensíveis; ações sensíveis permanecem sob controle humano.
- [OpenAI Customer Service Agents Demo](https://github.com/openai/openai-cs-agents-demo):
  triagem, especialistas, ferramentas e handoffs explícitos, em vez de um único
  prompt tentando executar todo o atendimento.
- [LangGraph human-in-the-loop](https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/concepts/human_in_the_loop.md):
  pausa e retomada persistentes para revisão, correção ou transferência em pontos
  de baixa tolerância a erro.
- [GenieACS](https://github.com/genieacs/genieacs): ACS TR-069 com interface
  norte para estado e atuação remota em CPE. Demonstra que diagnosticar roteador,
  ONT e Wi-Fi exige uma fonte operacional; o LLM não produz essa telemetria.

## Decisões incorporadas

1. Caso técnico, evidências, hipóteses, experimentos e ações persistem fora do chat.
2. O playbook determinístico escolhe a etapa; o modelo apenas redige dentro do
   catálogo permitido.
3. Ticket individual, incidente regional e falha administrativa têm gates
   distintos e não geram OS duplicada.
4. Escalonamento pausa realmente a automação naquela conversa.
5. A fonte IXC existente preserva sessão e motivo de desconexão; dados inexistentes
   não são simulados.

## Lacunas que dependem da instalação

- API de ACS/OLT/NMS para potência óptica, estado ONU/ONT, eventos e reinício remoto.
- Sondas controladas para ping, DNS, perda, latência e throughput.
- API de atribuição/fila no ConnectChat, caso seja desejada transferência formal
  além da pausa local e continuidade pelo operador.
- Validação integrada com IXC e ConnectChat reais após deploy. Testes puros não
  comprovam credencial, configuração de setor/assunto, latência ou resposta do ERP.

Conclusão: não existe “prompt melhor” que substitua essas fontes. O caminho de
produção é playbook + estado + ferramentas verificadas + handoff + avaliação real.
