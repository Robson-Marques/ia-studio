---
schema: prompt-framework/v1
id: ia-studio.connectchat-channel
kind: task
version: 1.0.0
status: released
title: Integrar o canal ConnectChat ao atendimento
extends: workflow.system-change-base@1.1.0
policy_refs:
  - ia-studio.project-rules
  - ia-studio.source-of-truth
inputs:
  - approved_alignment_report
  - connectchat_api_contract
  - inbox_and_whatsapp_contract
outputs:
  - connectchat_channel_change
  - validation_evidence
  - checkpoint
owners: [robson]
reviewers: [robson]
reviewed_at: "2026-10-06"
released_at: "2026-10-06"
change_reason: Cria a especialidade aprovada para consumir a API externa ConnectChat como canal de atendimento no IA Studio.
---

# Integrar o canal ConnectChat ao atendimento

## Missão

Governar a integração do ConnectChat ao atendimento do IA Studio para que o
operador veja clientes e conversas, leia o histórico e responda pelo painel,
preservando o ConnectChat como dono das conversas e o IA Studio como consumidor
autenticado de sua API.

## Contexto aceito

- `approved_alignment_report`: relatório aprovado que delimita o canal e sua
  superfície de atendimento.
- `connectchat_api_contract`: contrato HTTP versionado, credenciais técnicas,
  escopos, idempotência, polling e erros do ConnectChat.
- `inbox_and_whatsapp_contract`: módulos, permissões, estado de conversas e
  padrões do atendimento existente que o novo canal deve reutilizar quando
  compatíveis.

## Conhecimento e referências

- `workflow.system-change-base@1.1.0`: execução coesa, validação e checkpoint.
- `CLAUDE.md`: Provider Registry, Secrets Manager, ACL, logs e fronteiras da
  instalação dedicada.
- `docs/diretrizes-arquiteturais.md`: contratos externos, eventos, segurança e
  documentação viva aplicáveis.
- `platform-api/src/modules/integration/README.md`: contrato vivo de conexões,
  segredos e logs de integração.
- `docs/integration/prompt-y-studio-connectchat-api.md` no repositório
  ConnectChat: contrato de consumo da API para o IA Studio.

## Responsabilidades

- Mapear antes da mudança os consumidores reais do Inbox e do WhatsApp, sem
  duplicar suas regras de atendimento nem tratar o ConnectChat como WhatsApp.
- Criar um adaptador HTTP isolado no backend, com URL, chave, actor e timeout
  configurados somente no ambiente seguro da instalação.
- Usar `X-ConnectChat-Key`, `X-ConnectChat-Actor-Ref`, escopos mínimos e
  `Idempotency-Key` estável em toda operação mutável; retries preservam chave e
  corpo originais.
- Descobrir conversas e ler mensagens por polling incremental baseado em
  `serverSequence`, sem WebSocket empresarial nem acesso ao banco ConnectChat.
- Expor conversas `PENDING` para onboarding, mas preservar o bloqueio de ações
  comerciais até o contato estar `ACTIVE`.
- Manter ACL, auditoria, logs sem segredo, falhas explícitas e documentação viva.

## Limites e restrições

- Não expor a chave técnica em frontend, PWA, logs, respostas da API ou backup.
- Não criar fallback de instalação, chave ou acesso SQL direto ao ConnectChat.
- Não alterar o contrato ou banco do ConnectChat nesta frente.
- Não usar WebSocket do PWA do cliente como transporte empresarial.
- Não liberar operação comercial para `LEAD` ou `PENDING`.
- Não reintroduzir organização, workspace, ambiente, Console, billing ou outro
  comportamento SaaS no IA Studio.

## Processo

1. Ler o alinhamento aprovado e inventariar Inbox, WhatsApp, Integration
   Manager, Secrets Manager, ACL, logs e consumidores reais.
2. Confirmar o contrato ConnectChat, variáveis de ambiente, escopos, mapeamento
   de atores e os limites da interface de atendimento.
3. Desenhar o adaptador e a sincronização incremental, com cursor persistente,
   idempotência, backoff e tratamento explícito de conflitos e conversa fechada.
4. Implementar somente as fronteiras confirmadas no backend e na interface,
   reutilizando padrões existentes de loading, vazio, erro e permissão.
5. Validar autenticação, escopo, listagem, polling, envio idempotente, edição,
   recibos, estados `PENDING`/`ACTIVE` e falhas operacionais.
6. Atualizar documentação viva, CHANGELOG e emitir checkpoint objetivo.

## Formato de saída

Resposta em pt-BR com resultado primeiro, contrato e limites aplicados,
arquivos alterados, evidências de validação e pendências reais. Nunca incluir
chave, token ou dado pessoal desnecessário.

## Critérios de aceite

| Caso | Resultado esperado |
|---|---|
| Credencial técnica | Permanece somente no backend e não aparece em logs ou frontend. |
| Nova conversa | É descoberta por listagem e aparece no atendimento com cliente e estado. |
| Polling incremental | Usa o maior `serverSequence` persistido e não duplica mensagem. |
| Retry de mutação | Reutiliza o mesmo corpo, `clientMessageId` e `Idempotency-Key`. |
| Contato pendente | Aceita onboarding, mas não libera ação comercial. |
| Conversa fechada ou escopo inválido | Interrompe a ação e apresenta erro operacional compreensível. |
| Alteração concluída | ACL, logs, documentação, CHANGELOG e validação proporcional estão atualizados. |

## Registro de revisão

| Versão | Estado | Revisão | Impacto |
|---|---|---|---|
| 1.0.0 | released | Aprovado por Robson em 2026-10-06 | Especialidade local criada após alinhamento aprovado para conectar o atendimento do IA Studio à API ConnectChat. |
