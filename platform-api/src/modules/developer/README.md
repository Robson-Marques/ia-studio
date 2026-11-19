# Developer Center + Public API (Fase 7 — diretriz 57)

Camadas `Internal → SDK → Public`. A **Public API** é uma fachada estável e versionada (`/api/v1/public/*`), autenticada por **API Key** (nunca pelo JWT interno). Endpoints internos NUNCA são expostos por aqui.

## API Keys (`developer_api_keys`)
- Criar (`POST /api/v1/developer/api-keys`, perm `developer.apikeys.manage`) → retorna a chave em **claro uma única vez** (`plaintext`, formato `ias_<prefix>_<secret>`). Persiste só `prefix` (exibição) + `hashed_key` (SHA-256, `@@unique`).
- Listar (`GET`, perm `developer.apikeys.read`) → só metadados.
- Revogar (`POST /:id/revoke`, perm `developer.apikeys.manage`) → muda estado (`revoked_at`), **nunca deleta**.
- `scopes[]` e `expires_at?` opcionais.

## Public API
- `GET /api/v1/public/ping` — health autenticado (valida a credencial).
- `GET /api/v1/public/me` — identidade da instalação + escopos da chave.
- Autenticação: header `x-api-key: ias_...` ou `Authorization: Bearer ias_...`.
- `ApiKeyGuard` resolve a chave (`DeveloperService.authenticate`), checa revogação/expiração, faz `touch` de `last_used_at` e anexa `request.apiKey` (`ApiKeyContext`). Rotas marcadas `@Public()` para pular o `JwtAuthGuard` global.

Novos recursos públicos entram por controllers `version: '1'` sob `public`, sempre via `ApiKeyGuard` — jamais reexpondo controllers internos.
