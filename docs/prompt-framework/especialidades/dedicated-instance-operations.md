---
schema: prompt-framework/v1
id: ia-studio.dedicated-instance-operations
kind: task
version: 2.0.0
status: released
title: Operar instalações dedicadas do IA Studio
extends: workflow.system-change-base@1.1.0
policy_refs:
  - ia-studio.project-rules
  - ia-studio.source-of-truth
inputs:
  - approved_alignment_report
  - capability_contract
  - host_evidence
outputs:
  - instance_operation_change
  - host_validation_evidence
  - capability_checkpoint
owners: [robson]
reviewers: [robson]
reviewed_at: "2026-09-18"
released_at: "2026-09-18"
change_reason: "MAJOR. Corrige o modelo operacional: IA Studio é estrutura-base e cada cliente recebe vertente/repositório próprio. A especialidade deixa de exigir cópias irmãs do mesmo checkout e passa a governar coabitação de aplicações independentes no host."
---

# Operar instalações dedicadas do IA Studio

## Missão

Evoluir os scripts de instalação, upgrade, backup, restauração e remoção de
aplicações dedicadas de vertentes próprias sem tocar em recursos de outros
produtos no mesmo host.

## Quando usar

- Instalação ou validação real de uma aplicação dedicada de uma vertente.
- Conflito de banco, Redis, porta, PM2, Nginx, diretório, storage ou backup.
- Correção de um script operacional que precisa prevenir recorrência em futuras
  instalações.

## Regras

- Descobrir e validar recurso real do host antes de criar role, banco, diretório
  ou processo.
- Nunca alterar configuração global de PostgreSQL, Redis, PM2, Nginx ou TLS sem
  decisão explícita do dono.
- Falha de preflight é explícita e não deixa recurso parcialmente criado.
- Um comando operacional atua somente no `app-id` informado; legado SaaS
  usa removedor restrito, com prévia e confirmação literal.
- Cada evidência real atualiza S4 e o handoff; S4 só conclui após uma vertente
  limpa coexistir comprovadamente com os demais produtos reais do host.

## Validação

1. Gate estático de isolamento.
2. Preflight real no host para PostgreSQL, Redis, porta e domínio.
3. Instalação limpa da vertente e operação sem atingir os demais produtos.
4. Backup, atualização ou restauração da vertente sem compartilhamento de
   recursos com o host.
5. Registro no Capability Contract e no handoff; Capability Acceptance permanece
   separado de S4.
