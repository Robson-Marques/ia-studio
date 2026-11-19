# RFC-001 — Conversão de SaaS para instalação dedicada

**Status:** aceita para implementação em slices

## Contexto

O IA Studio foi projetado como SaaS multi-tenant: organização, workspace e
ambiente escopam dados; um Console administra clientes, planos, licenças, billing,
consumo e domínios. A estratégia aprovada é uma vertente independente por
cliente, em repositório próprio, mesmo quando aplicações diferentes coexistem
no mesmo servidor.

## Decisão

Converter o IA Studio em estrutura-base de software dedicado. Cada cliente parte
da base para uma vertente e repositório próprios; sua aplicação terá dados,
configurações, identidade, integrações, processos e recursos de infraestrutura
próprios. Multi-tenancy e superfícies/comercialização SaaS não fazem parte do
produto alvo.

A primeira vertente será para provedor de internet, usando ISP/IXC existentes. A
verticalização depende desta conversão e não altera o core dedicado antes de ter
Capability Contract próprio.

## Impacto por fronteira

| Fronteira | Decisão |
|---|---|
| Banco | Remover Organization, Workspace, Environment, relações de tenant e dados comerciais SaaS. A política de dados é pré-requisito de alteração destrutiva. |
| API/eventos | Remover contexto de tenant, headers de escopo, ator de plataforma e campos SaaS em envelopes. |
| Auth/ACL | Um ator local por JWT e ACL granular; sem PLATFORM_ADMIN, Console ou bypass. |
| Painel | Adaptar `platform-admin`; remover `platform-console` e dependências SaaS. |
| Integrações | Preservar Registry, Connection, Secret, Storage e logs; retirar curadoria/install por organização e Limits/Usage. |
| Workers | Manter API e worker separados; isolar cada aplicação por processo, fila/namespace e configuração. |
| Infra | Parametrizar diretório, banco, storage, Redis, PM2, backup e vhost por aplicação da vertente. |

## Alternativa recusada

Manter SaaS único e modelar clientes como tenant, white-label ou branding. Isso
preservaria o acoplamento que a decisão de produto removeu e impediria adaptações
independentes por negócio.

## Riscos e tratamento

- Nenhum `db push --accept-data-loss` será aplicado em produção antes de definir
  GAP-001 e obter backup verificável.
- A retirada de escopo é transversal a API, filas, jobs, ACL, consultas e painel;
  todos avançam pelo mesmo Capability Contract.
- O Acceptance exige coexistência comprovada entre aplicações independentes no host.
- ISP fica fora do core desta RFC até sua Capability própria.

O escopo e a prova de completude vivem em
`docs/capabilities/saas-to-dedicated-installation.md`; o estado recuperado vive em
`docs/architecture-baseline.md`.
