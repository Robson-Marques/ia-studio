---
schema: prompt-framework/v1
id: ia-studio.assistant-ticket-analysis
kind: task
version: 1.0.0
status: released
title: Analisar chamados IXC com assistente
extends: workflow.system-change-base@1.1.0
policy_refs:
  - ia-studio.project-rules
  - ia-studio.source-of-truth
inputs:
  - approved_alignment_report
  - ixc_provider_contract
  - assistant_runtime_contract
  - ticket_analysis_scope
outputs:
  - ticket_analysis_change
  - validation_evidence
  - checkpoint
owners: [robson]
reviewers: [robson]
reviewed_at: "2026-10-05"
released_at: "2026-10-05"
change_reason: Cria a especialidade aprovada para análise assistida, limitada e rastreável de chamados recentes do IXC.
---

# Analisar chamados IXC com assistente

## Missão

Governar a análise assistida de chamados recentes do IXC para apoiar o operador
na compreensão do fechamento e do histórico de atendimento, com evidências
limitadas à fonte consultada e sem executar ações no ERP.

## Contexto aceito

- `approved_alignment_report`: relatório aprovado que delimita a capacidade.
- `ixc_provider_contract`: implementação, permissões, autenticação, limites e
  falhas do provider IXC já embarcado.
- `assistant_runtime_contract`: runtime, tools, regras de resposta e contexto
  do assistente que consumirá a análise.
- `ticket_analysis_scope`: cliente, critério de recência confirmado no provider,
  limite de chamados e perguntas operacionais permitidas.

## Conhecimento e referências

- `workflow.system-change-base@1.1.0`: execução coesa, validação e checkpoint.
- `CLAUDE.md`: Provider Registry, Secrets Manager, ACL, logs e proteção contra
  IDs de infraestrutura definidos pelo modelo.
- `docs/diretrizes-arquiteturais.md`: fronteiras de integração e IA aplicáveis.
- `platform-api/src/modules/integration/README.md`: contrato vivo das conexões
  e do Registry.
- Fontes vivas do runtime de assistentes e do provider IXC, identificadas após
  o alinhamento e antes de qualquer mudança de comportamento.

## Responsabilidades

- Mapear o fluxo real entre o assistente, a tool, a conexão IXC, o provider e
  os logs antes de alterar o comportamento.
- Delimitar a consulta por cliente, critério de recência e quantidade de chamados, sem
  permitir busca ampla ou identificação ambígua de infraestrutura pelo modelo.
- Expor ao assistente apenas os dados necessários para analisar os chamados
  recentes e o fechamento, preservando segredos e reduzindo dados pessoais.
- Produzir análise que separe fatos obtidos da fonte, lacunas e inferências;
  nunca apresentar conclusão inventada como dado do IXC.
- Manter erros explícitos quando a conexão, o cliente ou o IXC não estiverem
  disponíveis, com degradação segura para o operador.
- Preservar ACL, rastreabilidade e documentação viva do contrato alterado.

## Limites e restrições

- Não criar conector, credencial, contrato externo ou integração IXC nova.
- Não abrir, editar, fechar, reatribuir ou automatizar chamados no IXC.
- Não expor segredo, token, configuração de infraestrutura ou dados de outros
  clientes no contexto do assistente.
- Não persistir histórico de chamados, memória de IA ou conclusão analítica sem
  decisão explícita e modelo de dados aprovado.
- Não permitir que o modelo escolha IDs de conexão, fila, setor ou assunto;
  esses valores vêm da configuração curada ou de resolução determinística.
- Não reintroduzir organização, workspace, ambiente, Console, billing ou outro
  comportamento SaaS.

## Processo

1. Ler o alinhamento aprovado e inventariar o provider IXC, runtime, conexões,
   ACL, logs e consumidores reais.
2. Confirmar o escopo operacional da consulta: cliente, critério de recência, máximo de
   chamados, campos disponíveis e comportamento quando não houver resultado.
3. Desenhar a menor tool/contrato que devolva dados minimizados e rastreáveis ao
   runtime, sem mutação no IXC.
4. Implementar somente as fronteiras confirmadas, com falha explícita, logs
   seguros e permission gates proporcionais.
5. Validar consulta, limitação, análise fundamentada, falha de conexão e acesso
   sem permissão; usar dados mascarados quando necessário.
6. Atualizar documentação viva, CHANGELOG e checkpoint objetivo.

## Formato de saída

Resposta em pt-BR com resultado primeiro, fontes consultadas, arquivos
alterados, limites aplicados à consulta, evidências de validação e pendências
reais. A resposta operacional do assistente deve distinguir evidências do IXC,
síntese e lacunas; nunca conter segredos ou IDs internos.

## Critérios de aceite

| Caso | Resultado esperado |
|---|---|
| Consulta delimitada | Retorna somente chamados do cliente no critério de recência confirmado, respeitando limite explícito. |
| Análise de fechamento | Distingue fatos do IXC, síntese e incertezas sem inventar diagnóstico. |
| IXC indisponível | Informa falha compreensível e não executa ação corretiva no ERP. |
| Sem resultado | Explica que não há chamados no recorte solicitado, sem gerar conclusão falsa. |
| Dados sensíveis | Segredos, tokens e identificadores de infraestrutura não entram na resposta ou no contexto do modelo. |
| Alteração concluída | ACL, logs, documentação viva, CHANGELOG e validação proporcional estão atualizados. |

## Registro de revisão

| Versão | Estado | Revisão | Impacto |
|---|---|---|---|
| 1.0.0 | released | Aprovado por Robson em 2026-10-05 | Especialidade local criada após alinhamento para orientar análise assistida de chamados IXC, sem mutações no ERP. |
