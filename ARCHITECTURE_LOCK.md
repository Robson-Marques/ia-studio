# ARCHITECTURE_LOCK.md — Registro histórico do congelamento SaaS V1

**Data do congelamento:** 02/07/2026 · **Status: arquivada e substituída pela arquitetura dedicada** · Autoridade: Robson (product owner)

> Este arquivo preserva somente a fotografia do estado SaaS recuperado. A
> arquitetura oficial vigente é a dedicada, definida em
> `docs/diretrizes-arquiteturais.md`, decidida em
> `docs/rfcs/RFC-001-conversao-saas-instalacao-dedicada.md` e aceita em
> `docs/capabilities/saas-to-dedicated-installation.md`. Nada abaixo autoriza
> ampliar, preservar ou recriar contratos SaaS.

## Registro histórico: declaração SaaS substituída

Na data do congelamento, a arquitetura SaaS proposta para a V1 do **IA Studio**
era composta por, e somente por:

| # | Bloco | Escopo resumido |
|---|---|---|
| 1 | **Core Platform** | Organizations → Workspaces → Environments, usuários, convites, perfis/permissões, feature flags, auditoria, settings, identity plugável |
| 2 | **Licensing** | Planos, limites, recursos, chave, trial, enforcement (LimitsService/UsageService) |
| 3 | **Billing** | Assinaturas, cobranças, cupons, grace period — só conversa com Licensing (Billing → Licensing → Flags → Sistema) |
| 4 | **Integration Platform** | Marketplace universal, Provider Registry (IProvider), Provider → Instance, Secrets Manager, Connection Wizard, Storage Manager, estados de conexão |
| 5 | **Automation Platform** | Event Bus → Queue (IMessageBroker/BullMQ) → Workflow Runtime → Execution Monitor; Scheduler visual; versionamento git-like de fluxos; sandbox/dry-run; Notification Center; catálogo de templates multi-canal |
| 6 | **AI Platform** | Providers multi-LLM, agentes com tool-calling, biblioteca de tools, RAG (pgvector), memória, MCP, agentes colaborativos, custos/orçamentos, políticas de aprovação |
| 7 | **Communication Platform** | WhatsApp Meta Cloud API oficial-only (orquestrador multi-número, wizard, sync), Email (Gmail OAuth2), canais futuros por adapter |
| 8 | **Console** | Painel administrativo da operação SaaS (tenants, planos, licenças, flags globais, consumo, marketplace, atualizações) — isolado do painel do cliente |
| 9 | **IA Studio (módulo Studio)** | Camada visual: editor de fluxos/agentes, publicação, testes, versionamento — execução sempre na Automation Platform |

Documentos vinculados ao congelamento: `CLAUDE.md`, `docs/plano-de-execucao.md`, `docs/diretrizes-arquiteturais.md` (58 diretrizes, blocos 1–4) e `docs/deploy-e-versionamento.md`.

## Princípio reitor (parte do lock)

> Registro histórico: a plataforma é orientada a integrações. A solução ISP
> atualmente embarcada usa o IXC; nenhuma decisão arquitetural pode depender de
> segmento específico, e funcionalidade de negócio entra via Providers, Tools e
> Templates.

## Regra de mudança a partir de agora

1. **Nenhuma mudança estrutural durante a implementação da V1.** Novas ideias NÃO entram direto no código nem nos documentos normativos.
2. Toda proposta nova vira **RFC**: arquivo em `docs/rfcs/RFC-NNN-titulo.md` com: motivação, impacto nos blocos acima, alternativa sem mudança estrutural, custo/risco, e decisão (aceita para V1 / adiada para V2 / recusada). Decisão é do Robson.
3. RFC aceita para V1 só é implementada em **checkpoint entre fases** (nunca no meio de uma fase).
4. Correções de bug, ajustes de UX e detalhes de implementação que **não alteram contratos entre blocos** não precisam de RFC.
5. O que já está mapeado como **pós-V1** (gateway de pagamento, White Label, Plugins, Biblioteca da Comunidade, cluster multi-worker, SSO, GraphQL) permanece pós-V1 — antecipação exige RFC.

## Estado no momento do congelamento

- Fase 0 concluída (scaffold, CLAUDE.md, docs normativos).
- Fase 1 implementada (Core Platform SaaS: platform-api + platform-admin + platform-console), em verificação.
