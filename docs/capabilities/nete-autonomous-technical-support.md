---
schema: prompt-framework/v1
id: ia-studio.capability.nete-autonomous-technical-support
kind: capability
version: 1.2.0
status: in-progress
title: Suporte técnico autônomo N2 da Nete
policy_refs:
  - workflow.capability-contract@1.0.0
  - workflow.architecture-baseline@1.0.0
baseline_ref: docs/architecture-baseline.md
owners: [robson]
reviewers: [robson]
reviewed_at: "2026-11-22"
change_reason: Introduz playbooks diagnósticos determinísticos, sessão IXC ampliada e pausa real da automação após escalonamento.
---

# Capability Contract: suporte técnico autônomo N2 da Nete

## Objetivo e fronteira

Permitir que a Nete investigue e conduza casos técnicos ao longo de vários
turnos, correlacionando evidências reais, hipóteses, experimentos e ações até
resolver ou encaminhar com justificativa. O IXC continua fonte dos dados de
negócio; ConnectChat continua canal; o IA Studio é dono da memória e da decisão
operacional do caso.

## Invariantes

1. Mensagem não é caso técnico: o caso persiste além de um turno e do processo.
2. `online` não comprova navegação, equipamento ou resolução.
3. Falha de consulta não equivale a resultado vazio.
4. Hipótese nunca é apresentada como medição ou fato.
5. CPF/CNPJ seleciona cadastro, mas não concede autorização para dados privados.
6. Troca ou desvínculo de cliente cancela o escopo técnico anterior.
7. Operação sensível reutiliza autorização, aprovação, idempotência e auditoria existentes.
8. Observação agendada possui concessão persistente: API e worker não executam o mesmo ciclo em paralelo.

## Modelo operacional

O núcleo mantém `AiTechnicalCase`, `AiTechnicalEvidence`,
`AiDiagnosticHypothesis`, `AiDiagnosticExperiment` e `AiTechnicalAction`. Dados
projetados variáveis de uma evidência podem usar JSON; estado, escopo, ciclo de
vida e relações são colunas explícitas. CPF/CNPJ não é persistido no caso.

O primeiro experimento implementado é a reinicialização assistida do roteador
indicado pelo cliente. O sistema registra condição inicial, confirmação de
desligamento, nova leitura da sessão, religamento, observação agendada e
confirmação de navegação. Permanecer online após o desligamento é inconclusivo:
pode haver equipamento separado ou atraso da fonte; nunca é inventada uma queda.
Contrato e acesso selecionados são restaurados do estado persistente para que o
observador consulte o mesmo ponto depois de reinício da API ou do worker.

O runtime está dividido em oito responsabilidades explícitas: investigador do
contexto verificado, memória do caso, correlator de histórico, motor de
raciocínio, playbook de sintomas, executor/observador de experimento, planejador
por IA com catálogo restrito e comunicador. O playbook determina o estado e a
ação permitida; a IA pode redigir e justificar, mas não saltar etapas. Falta de
conexão, lentidão, intermitência, cobertura Wi-Fi e aparelho isolado possuem
coleta própria. Autorização, seleção de escopo, duplicidade, abertura de OS e
encerramento continuam sob regras determinísticas.

O comunicador não envia a pergunta escolhida de forma isolada: primeiro apresenta
o resultado operacional comprovado que fundamentou a decisão e explicita o limite
da leitura. Uma sessão `online`, por exemplo, é informada como estado do sistema,
nunca como prova de que a navegação funciona. O histórico do escopo atual evita
perguntar novamente algo que o cliente já respondeu.

Quando o diagnóstico é escalado, a Nete grava uma concessão persistente de
handoff local e para de responder naquela conversa. O atendimento fica aberto
para o operador continuar; limpar o contexto local ou trocar/desvincular o
cliente remove a concessão. O ConnectChat ainda não oferece fila/atribuição de
atendente na API de integração, portanto o sistema não afirma que transferiu
para uma fila inexistente.

## Slices e progresso

| Slice | Conteúdo | Estado |
|---|---|---|
| S0: auditoria e contrato | Localizar perda de contexto, fontes e limites | concluído |
| S1: memória e experimento base | Caso/evidência/hipótese/ação persistentes e reinicialização assistida | implementado; validação oficial pendente |
| S2: investigador completo | Atualidade e falha por fonte, histórico correlacionado por sintoma | implementado; validação oficial pendente |
| S3: motor de decisão ampliado | Playbooks por sintoma, catálogo seguro, plano da IA validado e fallback determinístico | implementado; validação oficial pendente |
| S4: resolução e OS | Seleção de contrato/acesso, reincidência, idempotência e fechamento remoto | implementado nos dois repositórios; release coordenada pendente |
| S5: Acceptance integrada | 21 decisões de governança + diálogos regressivos | 59 testes puros aprovados; IXC/ConnectChat reais pendentes |

A Capability permanece `in-progress`. O IXC já fornece estado, início/fim da
sessão e motivo de desconexão. Este corte não declara telemetria de ONU/OLT,
potência, ping, DNS, tráfego ou atuação remota no CPE. Para isso, a instalação
precisa disponibilizar uma API real de ACS/NMS/OLT (por exemplo, um ACS TR-069
com interface norte); o runtime deve integrar essa fonte pelo Provider Registry.

O companion change do ConnectChat implementa
`POST /v1/integration/conversations/:conversationId/close`, idempotente e
protegido por `chat:write`, publica `conversation.closed` e bloqueia o compositor
do cliente. A Nete chama essa operação somente depois de enviar a confirmação
final de resolução e audita sucesso ou falha. Os dois lados precisam entrar na
mesma release coordenada; enquanto isso não ocorrer, não se declara ativação em
produção.

## Critérios de aceite

- O histórico influencia a decisão sem ser tratado como instrução.
- Evidências registram fonte, disponibilidade, horário e escopo.
- O teste atravessa turnos e reinício do serviço.
- A observação após religamento ocorre sem exigir nova mensagem do cliente.
- Resolução exige confirmação de navegação quando aplicável.
- Timeout, conversa encerrada, troca e desvínculo de cliente cancelam com segurança.
- OS só é afirmada após confirmação do IXC.
- Cliente habitual vinculado usa o `customer_id` verificado no backend para OS sem repetir CPF; o ID não entra no schema do modelo.
- Falhas e limitações de telemetria são comunicadas sem fabricação de resultado.
- A próxima pergunta técnica vem depois da evidência consultada, não como roteiro genérico.
- Uma resposta anterior sobre o alcance da falha nos aparelhos não é perguntada novamente no mesmo escopo.
- Escalonamento pausa a resposta automática e permanece assim após reinício do serviço.
- Lentidão, intermitência, cobertura e falha isolada não entram indevidamente no experimento de falta total.

