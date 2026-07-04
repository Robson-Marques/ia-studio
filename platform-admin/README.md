# platform-admin — IA Studio (Painel do Cliente)

Frontend React do **Painel do Cliente** da plataforma IA Studio. Usado pelas
organizações (tenants) para gerenciar usuários, convites, perfis de acesso,
workspaces/ambientes, auditoria e a própria conta/licença.

> Console do SaaS (operação) é o app separado `platform-console/`. Os dois
> **não compartilham componentes de negócio** — cada um tem sua cópia do UI kit
> (duplicação deliberada, ver CLAUDE.md).

## Stack

- React 18 + Vite 5
- Tailwind 3 (dark/light via CSS vars `--ap-*`)
- react-router-dom 6 · axios · lucide-react · clsx

## Como rodar

```bash
npm install
npm run dev        # http://localhost:5173 (proxy /api → http://localhost:3000)
npm run build      # gera dist/
npm run preview
```

O backend (platform-api, NestJS) deve estar em `http://localhost:3000` com o
prefixo `/api/v1`. Em produção, `VITE_API_URL` pode sobrescrever o baseURL.

## Estrutura

```
src/
├── main.jsx / App.jsx        # bootstrap + rotas (ProtectedRoute/PermissionRoute)
├── index.css                 # CSS vars --ap-* (dark + light) + classes utilitárias
├── lib/
│   ├── api.js                # axios central (Bearer + x-workspace-id + 401 → /login)
│   ├── toast.js              # bus de toasts (toast.success/error/warn/info)
│   └── format.js             # formatação pt-BR (datas, números, limites)
├── context/
│   ├── AuthContext.jsx       # login/logout/me (/auth/login, /auth/me), trocar senha
│   ├── ThemeContext.jsx      # dark/light persistido
│   └── WorkspaceContext.jsx  # seletor de workspace/ambiente (header x-workspace-id)
├── hooks/usePermissions.js   # can('dominio.acao'); bypass p/ platform admin e admin da org
├── components/
│   ├── ProtectedRoute.jsx    # + PermissionRoute
│   ├── Layout/               # Layout, Sidebar (accordion + drawer mobile), Header
│   └── ui/                   # Modal, ConfirmDialog, Table+Pagination, FormField,
│                             # Tabs (folder/pills), EmptyState, StatCard, UIToastContainer
├── services/                 # users, invites, profiles, workspaces, audit, account
└── pages/
    ├── Login.jsx             # POST /auth/login
    ├── AcceptInvite.jsx      # rota pública /convite/:token
    ├── Dashboard.jsx         # StatCards de consumo + card do plano
    ├── Usuarios.jsx          # abas Usuários / Convites (CRUD + inativar/reativar)
    ├── PerfisAcesso.jsx      # editor de perfis com checkboxes por grupo do catálogo
    ├── Workspaces.jsx        # CRUD workspaces + ambientes (PRODUCTION/STAGING/DEVELOPMENT)
    ├── Auditoria.jsx         # filtros + expandir linha com old/new em JSON
    └── MinhaConta.jsx        # plano, status, chave, barras de consumo, recursos
```

## Padrões obrigatórios (ver CLAUDE.md da raiz)

- Erros/validações **sempre via toast** — nunca banner inline, nunca `confirm()`/`alert()` nativos.
- Ações destrutivas: ConfirmDialog + disclaimer + tooltip + loading + `can()`.
- Listagens: `<Table>` no desktop + cards no mobile (`md:hidden`), `<EmptyState>` quando vazio.
- Cores apenas via CSS vars `--ap-*`; testar dark + light e 375px + 1920px.
- Rota nova = entrada no `BREADCRUMBS` do Header + item na Sidebar (com `perm`).
