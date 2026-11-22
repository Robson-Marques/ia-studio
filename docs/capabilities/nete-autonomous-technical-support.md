---
schema: prompt-framework/v1
id: ia-studio.capability.nete-autonomous-technical-support
kind: capability
version: 1.1.1
status: in-progress
title: Suporte técnico autônomo N2 da Nete
policy_refs:
  - workflow.capability-contract@1.0.0
  - workflow.architecture-baseline@1.0.0
baseline_ref: docs/architecture-baseline.md
owners: [robson]
reviewers: [robson]
reviewed_at: "2026-11-21"
change_reason: Torna a investigação operacional visível antes da próxima pergunta e preserva respostas anteriores do escopo atual.
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

O runtime está dividido em sete responsabilidades explícitas: investigador do
contexto verificado, memória do caso, correlator de histórico, motor de
raciocínio, executor/observador de experimento, planejador por IA com catálogo
restrito e comunicador. A IA escolhe a próxima pergunta ou teste somente entre
ações de leitura e diagnóstico seguro; autorização, seleção de escopo,
duplicidade, abertura de OS e encerramento continuam sob regras determinísticas.

O comunicador não envia a pergunta escolhida de forma isolada: primeiro apresenta
o resultado operacional comprovado que fundamentou a decisão e explicita o limite
da leitura. Uma sessão `online`, por exemplo, é informada como estado do sistema,
nunca como prova de que a navegação funciona. O histórico do escopo atual evita
perguntar novamente algo que o cliente já respondeu.

## Slices e progresso

| Slice | Conteúdo | Estado |
|---|---|---|
| S0: auditoria e contrato | Localizar perda de contexto, fontes e limites | concluído |
| S1: memória e experimento base | Caso/evidência/hipótese/ação persistentes e reinicialização assistida | implementado; validação oficial pendente |
| S2: investigador completo | Atualidade e falha por fonte, histórico correlacionado por sintoma | implementado; validação oficial pendente |
| S3: motor de decisão ampliado | Catálogo seguro, plano da IA validado e fallback determinístico | implementado; validação oficial pendente |
| S4: resolução e OS | Seleção de contrato/acesso, reincidência, idempotência e fechamento remoto | implementado nos dois repositórios; release coordenada pendente |
| S5: Acceptance integrada | 20 cenários obrigatórios + múltiplos contratos | 21 decisões puras aprovadas; IXC/ConnectChat reais pendentes |

A Capability permanece `in-progress`. Este corte não declara que a Nete já
possui telemetria de ONU/OLT, ping, DNS ou tráfego.

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
- Falhas e limitações de telemetria são comunicadas sem fabricação de resultado.
- A próxima pergunta técnica vem depois da evidência consultada, não como roteiro genérico.
- Uma resposta anterior sobre o alcance da falha nos aparelhos não é perguntada novamente no mesmo escopo.

