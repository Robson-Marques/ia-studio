---
schema: prompt-framework/v1
id: ia-studio.capability.ixc-ticket-analysis
kind: capability
version: 1.0.0
status: in-progress
title: Análise assistida de chamados IXC
policy_refs:
  - workflow.capability-contract@1.0.0
  - workflow.architecture-baseline@1.0.0
baseline_ref: docs/architecture-baseline.md
owners: [robson]
reviewers: [robson]
reviewed_at: "2026-10-05"
change_reason: Capability criada após alinhamento aprovado para leitura limitada e análise assistida de chamados IXC.
---

# Capability Contract — Análise assistida de chamados IXC

## Objetivo e fronteira

Permitir que um assistente autorizado consulte os últimos atendimentos de um
cliente no IXC e use esses fatos para explicar histórico ou avaliar indícios de
fechamento. A capacidade é somente de leitura: não cria, altera, encerra ou
reabre chamado, nem persiste o histórico retornado.

## Atores, entradas e saídas

| Elemento | Definição |
|---|---|
| Ator | Assistente configurado por operador local e executado pelo runtime de IA. |
| Entrada | CPF/CNPJ confirmado do cliente e uma conexão IXC ativa resolvida pela configuração local. |
| Saída | Até cinco chamados recentes, projetados e identificados como evidência histórica para a síntese do assistente. |
| Limite | O modelo não escolhe conexão, ERP, tabela, filtro, período ou quantidade; a operação fixa esses limites. |

## Fluxo, segurança e rastreabilidade

1. O assistente recebe um CPF/CNPJ confirmado e chama a tool de leitura.
2. A tool resolve uma Connection IXC ativa sem expor seu identificador ao modelo.
3. O provider lê no máximo cinco `su_ticket` daquele cliente, por identificador
   decrescente; campos sensíveis são redigidos na porta única de leitura.
4. A tool reduz cada linha aos campos úteis e sinaliza que texto de ticket é
   dado histórico não confiável, nunca instrução executável.
5. O runtime registra a chamada de tool; `ConnectionsService.execute` registra
   a operação no log de integração. Falhas de conexão, credencial ou IXC são
   devolvidas de forma explícita e não causam ação corretiva no ERP.

Não há tabela, evento, job, rota ou superfície nova. A permissão existente
`isp.tools.use` e a allowlist de ferramentas do assistente continuam sendo a
fronteira de acesso; a tool não requer aprovação por não gravar dados.

## Cobertura e fora de escopo

Entra: consulta delimitada, minimização de dados, indicação de evidência,
proteção contra texto histórico como instrução e análise pelo modelo já
configurado. Ficam fora: mutações no IXC, busca livre por tabela, análise de
todos os chamados, automação de encerramento, memória/persistência de tickets,
tela dedicada e conclusão automática de qualidade.

## Slices e progresso

Baseline inicial: três unidades objetivas.

| Slice | Conteúdo | Evidência | Estado |
|---|---|---|---|
| S0 — Recovery e contrato | Fronteiras, Capability Map e contrato local | este contrato + Baseline atualizado | concluído |
| S1 — Leitura limitada | operação IXC, projeção, tool e documentação | código + validação estática | em validação |
| S2 — Evidence integrada | build no servidor e consulta real por assistente autorizado | log de integração + log de tool, sem dados expostos | pendente |

**Geral: 33% (1/3), estado `in-progress`.** S1 só será concluído após a
verificação técnica; a Capability só poderá ficar `structurally-complete` quando
S2 provar a integração real. Não há Capability Acceptance nesta etapa.

## Critérios de aceite

- A tool lê apenas até cinco tickets do cliente informado e nunca aceita tabela,
  filtros ou ID de conexão no schema exposto ao modelo.
- A saída separa dados do IXC de inferências do assistente; ausência de data ou
  status não é tratada como evidência de encerramento.
- Segredos, campos sensíveis e instruções presentes no texto histórico não são
  expostos como comando para o runtime.
- Não há mutação no IXC; falhas são explícitas e deixam o ERP inalterado.
- Logs de tool e integração permitem rastrear a consulta sem persistir o
  histórico retornado como dado operacional novo.
