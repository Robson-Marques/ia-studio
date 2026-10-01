# Email Orchestrator (Fase 7 — Email Platform)

Porta única de envio de e-mail da instalação. Espelha o Meta Orchestrator do
WhatsApp: **o chamador nunca conhece a conta** — informa o critério (conexão
explícita ou tag) e o orquestrador resolve uma `Connection` de e-mail local
(categoria COMMUNICATION).

## Resolução de conexão
`resolveConnection(criteria)`:
1. `criteria.connectionId` explícito (deve estar ACTIVE na instalação);
2. `criteria.tag` (Connection.tags);
3. preferência de provider (`google-workspace` antes de `smtp`) + maior `priority`.

Providers de e-mail: `google-workspace` (Gmail OAuth2) e `smtp` (nodemailer).

## Envio
`send(message, criteria)`:
- chama `ConnectionsService.execute(connId, 'email.send', {...})` (Provider
  Registry → IntegrationLog + `last_used_at`);
- não aplica plano, licença, metering ou consumo comercial.

Nunca chama API externa direto (diretriz — IA/fluxo sempre via Integration Manager).

## Quem consome
- Node `EMAIL_SEND` da automação (com suporte a template EMAIL do catálogo);
- Notification Center (canal `email`);
- Tool de IA `enviar_email`.

## OAuth (Google)
O fluxo de consentimento vive no Integration Manager
(`connections/google-oauth.*`). Tokens no Cofre de Segredos; refresh automático
no `GoogleWorkspaceProvider`. Sem access token válido/refresh → `TOKEN_EXPIRED`.
