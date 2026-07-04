# Email Orchestrator (Fase 7 — Email Platform)

Porta única de envio de e-mail da plataforma. Espelha o Meta Orchestrator do
WhatsApp: **o chamador nunca conhece a conta** — informa escopo (org/workspace/
ambiente) + critério (conexão explícita ou tag) e o orquestrador resolve uma
`Connection` de e-mail (categoria COMMUNICATION).

## Resolução de conexão
`resolveConnection(scope, criteria)`:
1. `criteria.connectionId` explícito (deve estar ACTIVE no escopo);
2. `criteria.tag` (Connection.tags);
3. preferência de provider (`google-workspace` antes de `smtp`) + maior `priority`.

Providers de e-mail: `google-workspace` (Gmail OAuth2) e `smtp` (nodemailer).

## Envio
`send(scope, message, criteria)`:
- checa o limite de plano `email_sends_month` (LimitsService — diretriz 19);
- chama `ConnectionsService.execute(org, connId, 'email.send', {...})` (Provider
  Registry → IntegrationLog + `last_used_at`);
- registra consumo `emails` **e** `email_sends_month` (UsageService — diretriz 40).

Nunca chama API externa direto (diretriz — IA/fluxo sempre via Integration Manager).

## Quem consome
- Node `EMAIL_SEND` da automação (com suporte a template EMAIL do catálogo);
- Notification Center (canal `email`);
- Tool de IA `enviar_email`.

## OAuth (Google)
O fluxo de consentimento vive no Integration Manager
(`connections/google-oauth.*`). Tokens no Cofre de Segredos; refresh automático
no `GoogleWorkspaceProvider`. Sem access token válido/refresh → `TOKEN_EXPIRED`.
