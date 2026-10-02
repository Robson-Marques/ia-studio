# IA Studio — Diretrizes Arquiteturais Vigentes

> Documento normativo do estado atual. Histórico da transição SaaS → aplicação
> dedicada está no [RFC-001](rfcs/RFC-001-conversao-saas-instalacao-dedicada.md)
> e no [Capability Contract](capabilities/saas-to-dedicated-installation.md).
> Não use documentos históricos para recriar `Organization`, `Workspace`,
> `Environment`, Console SaaS, billing, licensing, trials, metering ou escopo
> tenant.

## 1. Produto-base e vertentes

IA Studio é uma estrutura-base. Cada cliente recebe uma **vertente própria**,
em repositório próprio, com identidade, módulos e integrações que façam sentido
para seu negócio. A vertente é uma aplicação independente; ela não é tenant,
workspace nem uma configuração dentro de uma aplicação compartilhada.

Uma vertente pode ser instalada no mesmo host de outros produtos, mas usa
recursos exclusivos: diretório `/opt/<app-id>`, configuração
`/etc/iastudio/apps/<app-id>.env`, banco e role PostgreSQL, Redis DB/prefixo,
processos PM2, storage, backups, logs, vhost e domínio. O contrato operacional
está em [deploy-e-versionamento.md](deploy-e-versionamento.md).

## 2. Identidade, ACL e administração local

Há um único escopo de identidade: usuários, perfis, convites, permissões e
auditoria locais à aplicação. Autorização é feita por permissões
`dominio.acao`, com `JwtAuthGuard`, `PermissionsGuard` e
`@RequirePermissions` na API, mais `can()` no painel.

`platform-admin` é o único painel administrativo. Ele contém o produto e a
administração local da instalação: atualização, backup, restauração, histórico
operacional e auditoria. Não existe `platform-console`, ator
`PLATFORM_ADMIN`, gestão de clientes, planos, licenças, consumo ou domínio por
tenant.

## 3. Configuração e segredos

Configurações pertencem à aplicação local. Segredos são guardados fora dos
logs e da auditoria, com criptografia e redação. Conexões referenciam segredos
por identificador; credenciais não devem ser duplicadas em registros de
domínio, DTOs, eventos ou payloads de fila.

Feature flags são locais: o código define o comportamento técnico padrão e o
banco oferece somente override administrativo da própria aplicação. Todo novo
automatismo nasce desligado, explícito e auditável.

## 4. Integrações e módulos verticais

Providers são registrados centralmente e implementam uma porta comum para
conectar, testar saúde, descobrir recursos e executar operações. Não espalhar
switches por tipo de provider. O catálogo pode expor itens instaláveis da
vertente, mas não é marketplace SaaS nem exige deploy compartilhado.

O primeiro pacote de referência é ISP/IXC. Ele não torna o core dependente de
ISP: novas vertentes selecionam somente os módulos relevantes — por exemplo,
uma loja pode usar IA, atendimento WhatsApp e catálogo sem carregar integração
IXC. Extensões de segmento ficam atrás de portas, módulos e permissões próprias.

## 5. Comunicação WhatsApp

WhatsApp usa exclusivamente capacidades oficiais da Meta Cloud API. O fluxo
prioritário é Embedded Signup/OAuth oficial; credenciais manuais são uma
alternativa operacional quando a aprovação Meta ainda não permitir o fluxo
oficial. Cada conexão, webhook, template e secret pertence à aplicação local.

Envios automáticos fora da janela de 24 horas exigem template HSM aprovado.
Templates de sistema são semeados de modo idempotente e ações de botões são
resolvidas para URLs da própria aplicação, sem URLs hardcoded.

## 6. Automação, IA e eventos

O Event Bus tem contratos locais e persistidos. O envelope carrega evento,
`trace_id`, `source_event_id` para idempotência, payload mínimo e horário; não
carrega organization, workspace ou environment. Producers, consumers, workers,
logs e replays preservam esse contrato.

Automação mantém fronteiras explícitas: Scheduler → Event Bus → Queue →
Workflow Runtime → Execution Monitor. Workers são separados da API; estado
operacional fica em PostgreSQL/Redis, nunca na memória do processo.

Tools de IA são registradas, possuem schema de entrada/saída, timeout,
permissão, auditoria e, quando necessário, aprovação. A reconstrução de uma
execução aprovada usa somente contexto local persistido; não aceita fallback ou
campos artificiais de tenant.

## 7. Dados, observabilidade e API

Toda mutação administrativa sensível é auditada com usuário, ação, IP,
user-agent e diff, redigindo segredos. Application, audit, integration,
execution e security logs têm natureza própria. Métricas e custos podem apoiar
a gestão local da aplicação, mas não implementam medição SaaS, billing ou
enforcement de licença.

A API é REST versionada, com OpenAPI/Swagger. Endpoints internos não são
publicados diretamente; uma futura API pública será uma fachada estável e
versionada.

## 8. Evolução e qualidade

Fluxos e agentes podem ter versões imutáveis, publicação e rollback de versão
de conteúdo. Importação/exportação é JSON versionado e nunca exporta segredos.
Componentes de UI seguem o Studio UX; toda tela cobre loading, vazio, erro,
ACL, responsividade e auditoria quando aplicável.

Antes de implementar uma nova vertente ou módulo, valide as fronteiras no
Capability Contract local e execute os gates correspondentes. Não reintroduza
estruturas SaaS como atalho de reutilização.
