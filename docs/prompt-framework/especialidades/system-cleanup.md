---
schema: prompt-framework/v1
id: ia-studio.system-cleanup
kind: task
version: 1.0.0
status: released
title: Faxina de código e arquivos mortos do IA Studio
extends: workflow.system-change-base@1.1.0
policy_refs:
  - ia-studio.project-rules
  - ia-studio.source-of-truth
inputs:
  - approved_alignment_report
  - dead_code_inventory
  - dormant_policy_decision
outputs:
  - cleanup_change
  - build_and_gate_evidence
  - capability_checkpoint
owners: [robson]
reviewers: [robson]
reviewed_at: "2026-09-21"
released_at: "2026-09-21"
change_reason: "Primeira release aprovada pelo Robson após o alinhamento da frente de faxina: código e arquivos que não são mais usados representam risco operacional e devem ser removidos de verdade — não apenas ocultados sob uma nova tag — em etapas, com o repo passando a representar só o que está em uso."
---

# Faxina de código e arquivos mortos do IA Studio

## Missão

Remover código morto e arquivos mortos do IA Studio em etapas, de modo que o
repositório passe a representar **apenas o que está realmente em uso**, sem
quebrar build, gates, migrações ou runtime, e distinguindo em cada item
**excluir de verdade** de **arquivar** (motor dormente que se decide manter).

## Quando usar

- Pedido explícito de limpeza de "lixo": código morto (não referenciado) ou
  arquivos mortos (não importados/servidos/executados).
- Restos de uma tela, módulo, rota, provider ou menu que deixou de existir e cuja
  configuração/ACL/import ficou pendurada.
- Adaptadores temporários, seeds de retirada e caminhos de compatibilidade que
  cumpriram seu papel e agora só confundem.

## Contexto aceito

- `approved_alignment_report`: relatório de alinhamento aprovado que autorizou a
  execução desta frente (não basta o `ok` de criação da especialidade).
- `dead_code_inventory`: inventário read-only da Etapa 0 — cada item classificado
  como *excluir de verdade* ou *arquivar*, com a evidência de (ir)referência.
- `dormant_policy_decision`: decisão explícita do dono sobre os motores dormentes
  (ex.: LLM Gemini/Ollama, providers WhatsApp Baileys) — excluir de verdade ou
  manter arquivado. Sem default.

## Conhecimento e referências

- **`workflow.system-change-base@1.1.0`**: base de execução herdada (uma mudança
  coesa por vez, checkpoint, sem release fantasma).
- **`workflow.engineering-doctrine`**: "sem lixo"; "arquivar ≠ excluir por caso";
  degradação explícita.
- **Gates de migração** (`scripts/migration/verify-*.sh`): evidência objetiva de
  que a remoção não reintroduziu escopo SaaS nem quebrou o contrato de instância.
- **Fonte da verdade**: `schema.prisma` (dados), Provider Registry de integração
  e registro de LLM (motores), rotas/menus do `platform-admin` (superfície).

## Responsabilidades

- Provar **irreferência** antes de remover: um símbolo/arquivo só é morto quando
  nenhuma superfície viva o alcança (import, rota, menu, ACL, seed, build, PM2,
  Nginx, migração). A prova acompanha o item no inventário.
- Trabalhar **em etapas**: Etapa 0 inventário (read-only) → Etapa 1 remover
  arquivos/módulos mortos → Etapa 2 limpeza intra-código (imports órfãos, entradas
  de menu/rota/ACL órfãs, adaptadores temporários). Cada etapa é uma mudança coesa
  com sua própria versão.
- Respeitar a política dormente: item marcado *arquivar* não é apagado; item
  *excluir de verdade* é removido junto com toda configuração que só existia por
  causa dele.
- Depois de cada remoção: `nest build` do `platform-api`, build do
  `platform-admin`, os quatro gates verdes e smoke do que a remoção tocou — antes
  do checkpoint.
- Nenhuma remoção "de conveniência" fora do inventário aprovado; item novo achado
  no meio entra no inventário e espera aprovação.

## Limites e restrições

- **Não** apagar item marcado *arquivar* nem transformar arquivamento em exclusão
  sem novo `ok`.
- **Não** remover nada sem a prova de irreferência registrada — dúvida vira item de
  inventário, não remoção.
- **Não** misturar refactor de comportamento com faxina: a faxina remove o que já
  está morto; se algo vivo precisa mudar para morrer, isso é outra frente.
- **Não** fechar uma etapa com build/gate/smoke vermelho — reverte e reabre o item.
- **Não** tocar em `schema.prisma`/migrações para "limpar" sem decisão explícita: a
  remoção de dados é destrutiva e sai do escopo de faxina de código.

## Processo

1. **Etapa 0 — inventário (read-only).** Varrer `platform-api/src` e
   `platform-admin/src` por reachability; listar arquivos/símbolos sem referência
   viva e restos de configuração órfã; classificar cada um *excluir de verdade* vs
   *arquivar*; anexar a evidência. Entregar o inventário e pedir a decisão dormente.
2. **Etapa 1 — remoção de arquivos/módulos mortos.** Remover só os itens
   aprovados como *excluir de verdade*; build + 4 gates + smoke; checkpoint; versão
   própria.
3. **Etapa 2 — limpeza intra-código.** Remover imports órfãos, entradas de
   menu/rota/ACL de telas que não existem mais, adaptadores/seeds temporários que
   cumpriram o papel; build + 4 gates + smoke; checkpoint; versão própria.
4. **Registro.** Cada etapa atualiza CHANGELOG e, quando afeta a superfície
   operacional dedicada, o handoff/Capability.

## Formato de saída

- **Inventário (Etapa 0)**: doc com tabela item → tipo (arquivo/símbolo/config) →
  evidência de irreferência → classificação (*excluir de verdade*/*arquivar*).
- **Mudança de faxina (Etapa 1/2)**: diff da remoção + evidência de build + 4
  gates verdes + smoke.
- **Checkpoint**: arquivos removidos/alterados, versão, próximos itens.
- **Bloco PowerShell** de commit/tag/push e, quando houver efeito no host, bloco de
  atualização do servidor.

## Critérios de aceite

| Caso | Resultado esperado |
|---|---|
| Item sem prova de irreferência | Não removido; volta ao inventário |
| Item marcado *arquivar* | Preservado; nunca apagado sem novo `ok` |
| Motor dormente sem decisão do dono | Bloqueado; pergunta antes de remover |
| Build ou gate vermelho após remoção | Revertido; etapa reaberta |
| Remoção fora do inventário aprovado | Recusada; entra como item novo |
| Etapa concluída | Build + 4 gates + smoke verdes, checkpoint e versão própria |

## Registro de revisão

| Versão | Estado | Revisão | Impacto |
|---|---|---|---|
| 1.0.0 | released | Aprovado por Robson em 2026-09-21 | Primeira release. Nasce da frente de faxina de código/arquivos mortos: remover de verdade o que não é usado, em etapas, com o repo passando a representar só o que existe — em vez de acumular versões que deixam o morto para trás. |
