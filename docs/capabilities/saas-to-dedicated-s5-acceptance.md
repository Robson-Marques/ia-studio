# S5 — Capability Acceptance: SaaS → instalação dedicada

**Capability:** `ia-studio.capability.saas-to-dedicated-installation`  
**Data da Acceptance:** 2026-10-03  
**Versão operacional comprovada:** `v0.11.37`  
**Resultado:** aceito

## Escopo da aceitação integrada

Esta é a única Acceptance da Capability, executada após S1–S4. Ela não repete
os checkpoints de cada slice: consolida os gates de regressão, a inspeção dos
contratos ativos e a prova operacional da vertente Newnet no host compartilhado.

## Evidência por critério

| # | Critério de Acceptance | Evidência integrada | Resultado |
|---|---|---|---|
| 1 | Schema, JWT, ACL, API e eventos sem escopo SaaS | `verify-dedicated-cut.sh --check`: 0 referências bloqueantes em schema (209 iniciais), auth (68), ACL (53), API (1.254) e eventos (735). | aprovado |
| 2 | Identidade, permissões e auditoria locais | Sessão do administrador local permitiu operar a tela dedicada. A API protege `/system/*` com `system.maintain`; `BackupService` e `UpgradeService` registram auditoria. Não há claim/header de tenant no gate S1. | aprovado |
| 3 | Módulos e integrações sem serviços SaaS | `verify-operational-dedicated.sh` aprovado: runtime não contém escopo SaaS, `LimitsService`, `UsageService`, Billing ou Licensing; exportador histórico é read-only e separado da aplicação. | aprovado |
| 4 | Console removido e administração local preservada | `verify-console-retirement.sh` aprovado; `platform-console`, rota/vhost `/console/`, build e permissões SaaS estão ausentes. Atualização, backup e restauração existem em `Configurações → Administração da instalação`, sob `system.maintain`. | aprovado |
| 5 | Coabitação sem cruzamento no host | `verify-instance-isolation.sh` aprovado: recursos são derivados por `app-id`. No host real, Newnet em `/opt/newnet-ia-studio` coexistiu com Ctrl Leads e Finanças, com banco, Redis, PM2, vhost e backups próprios. | aprovado |
| 6 | Banco dedicado limpo e política de dados | A vertente Newnet foi instalada do zero em PostgreSQL dedicado; não havia dados operacionais a migrar, condição registrada em `migrations/s2-dev-data-disposition.md`. A futura migração usa apenas exportação NDJSON seletiva e auditável. | aprovado |
| 7 | Segurança, auditoria, eventos, jobs e erros proporcionais | Os contratos ativos mantêm `JwtAuthGuard`/`PermissionsGuard`, `@RequirePermissions`, auditoria local, `IMessageBroker`, `trace_id` e `source_event_id`. Backup/restauração usam lock por aplicação, `systemd-run`, status persistido e recuperação explícita. | aprovado |
| 8 | Documentação e operação coerentes | README, CLAUDE, diretrizes, deploy, Baseline, RFC, matriz S3, contrato e este registro descrevem aplicação dedicada. O antigo `ARCHITECTURE_LOCK.md` foi explicitamente arquivado como histórico SaaS, sem autoridade normativa vigente. | aprovado |

## Execução dos gates

Em 2026-10-03, no checkout da vertente Newnet, passaram:

```bash
bash scripts/migration/verify-dedicated-cut.sh --check
bash scripts/migration/verify-operational-dedicated.sh
bash scripts/migration/verify-console-retirement.sh
bash scripts/migration/verify-instance-isolation.sh
bash scripts/migration/verify-saas-to-dedicated-acceptance.sh
```

O primeiro gate informou S1 em 100%: 2.319 referências iniciais e zero
bloqueantes nas cinco camadas. Os demais validaram respectivamente S2, S3, o
contrato estático de isolamento de S4 e a consolidação regressiva de S5.

## Prova operacional no host

Na instalação Newnet, a atualização para `v0.11.37` foi construída e aplicada
no host. O administrador local gerou `full-20261002-165318.tar.gz` e restaurou
o mesmo pacote. O painel exibiu `Restauração concluída`/`SUCCESS`, incluindo:

```text
DB_RESTORE: banco restaurado com sucesso.
DONE: restauração concluída (full-20261002-165318.tar.gz).
```

Durante o restore, a parada controlada do PM2 gerou respostas `502` transitórias
no DevTools. O painel tratou a janela como reconexão, retomou a API e mostrou o
resultado terminal correto, sem converter registro histórico em falha atual.

## Limites e decisão

O ambiente local não contém `node_modules` e não é utilizado para build; o build
real de API e painel foi comprovado pelo atualizador no host antes da operação
acima. Não há gap bloqueante aberto nesta Capability. A próxima frente, se
necessária, é uma Capability de produto de uma vertente específica (por exemplo,
ISP), e não extensão do modelo SaaS removido.
