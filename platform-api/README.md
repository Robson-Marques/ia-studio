# platform-api — IA Studio dedicado

API NestJS 10 + Fastify 4 + Prisma/PostgreSQL da instância dedicada do IA
Studio. Uma execução atende um único cliente; os registros pertencem
implicitamente à instalação. A API não aceita tenant, organização, workspace,
ambiente, plano, licença ou escopo comercial.

## Executar

```bash
cp .env.example .env
npm install
npx prisma db push
npx prisma generate
npm run build
npm run start:dev
```

Prefixo HTTP: `/api/v1`. Swagger: `/api/docs`.

## Ambiente essencial

| Variável | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL exclusivo da instância. |
| `JWT_SECRET` | Assinatura de sessão. |
| `ENCRYPTION_KEY` | Cifragem de secrets. |
| `PORT` | Porta HTTP. |
| `CORS_ORIGINS` | Origem do painel desta instância. |
| `IASTUDIO_SCRIPTS_DIR` | Scripts de manutenção da instância. |
| `IASTUDIO_BACKUP_DIR` | Diretório exclusivo de backups. |

## Autenticação e autorização

`POST /auth/login` cria uma sessão de usuário local. `GET /auth/me` devolve o
usuário e as permissões efetivas do perfil. As rotas usam
`@RequirePermissions(...)`; manutenção de software exige também
`@InstallationAdminOnly()` e `system.maintain`.

## Administração da instalação

As operações abaixo são locais e não possuem prefixo `/console`:

- `GET /system/version`, `POST /system/upgrade`, status/log/histórico e liberação de lock;
- listar, gerar, enviar, baixar, excluir e restaurar backups em `/system/backups`;
- feature flags administrativas em `/administration/flags`.

Atualização, backup e restauração gravam histórico e erros explícitos. O painel
local faz polling do estado enquanto a operação estiver em execução.

## Regras de evolução

- O schema alvo é criado limpo para a instância dedicada; a fonte SaaS é somente
  histórica/rollback e dados operacionais só entram por migração seletiva auditável.
- Repositórios concentram acesso ao Prisma; services concentram regra de negócio;
  DTOs validam entradas.
- Não reintroduza headers, JWT claims, filtros ou envelopes de tenant.
- Consulte o Capability Contract antes de ampliar infraestrutura ou dados.
