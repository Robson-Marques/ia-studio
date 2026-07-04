# platform-console — IA Studio Console (Operação do SaaS)

Frontend React do **Console do SaaS** — usado exclusivamente pela operação da
plataforma (usuários com `is_platform_admin`). Gerencia clientes (organizações),
planos, licenças, feature flags, consumo global e auditoria global.

> **NUNCA compartilha componentes de negócio com o `platform-admin`.** Cada app
> tem sua própria cópia do UI kit (duplicação deliberada — ver CLAUDE.md).
> Visual distinto: sidebar sempre escura + accent violeta.

## Stack

- React 18 + Vite 5
- Tailwind 3 (dark/light via CSS vars `--ap-*`; sidebar fixa escura)
- react-router-dom 6 · axios · lucide-react · clsx

## Como rodar

```bash
npm install
npm run dev        # http://localhost:5174 (proxy /api → http://localhost:3000)
npm run build      # gera dist/
npm run preview
```

Login usa o mesmo `POST /auth/login` do painel; se `user.is_platform_admin`
for falso o Console recusa localmente ("Acesso restrito à operação") e nada é
persistido. Token em `localStorage.iastudio_console_token` (chave separada —
os dois apps podem ficar logados ao mesmo tempo).

## Estrutura

```
src/
├── main.jsx / App.jsx        # bootstrap + rotas (redirect raiz → /clientes)
├── index.css                 # CSS vars --ap-* (accent violeta #8b5cf6)
├── lib/                      # api.js (console token), toast.js, format.js
├── context/                  # AuthContext (gate is_platform_admin), ThemeContext
├── hooks/usePermissions.js   # can() — bypass p/ platform admin
├── components/
│   ├── ProtectedRoute.jsx    # + PermissionRoute
│   ├── Layout/               # Layout, Sidebar (sempre escura), Header
│   └── ui/                   # cópia própria do UI kit (Modal, ConfirmDialog, Table…)
├── services/                 # organizations, plans, licenses, flags, usage, audit
│                             # (todos sob /api/v1/console/*)
└── pages/
    ├── Login.jsx             # tela escura, barra não-admins
    ├── Clientes.jsx          # listagem + criar (nome + slug + plano inicial)
    ├── ClienteDetalhe.jsx    # abas Dados / Workspaces / Licença / Uso do mês
    │                         # (trocar plano, status, gerar nova chave — ConfirmDialog)
    ├── Planos.jsx            # CRUD: preço, trial, 9 limites (vazio = ilimitado),
    │                         # 11 features em checkboxes
    ├── Flags.jsx             # flags globais + overrides por organização
    ├── Consumo.jsx           # organização × métrica do mês corrente
    └── Auditoria.jsx         # escopo global (/console/audit)
```

## Padrões obrigatórios (ver CLAUDE.md da raiz)

- Erros/validações **sempre via toast**; nunca `confirm()`/`alert()` nativos.
- Ações destrutivas (trocar plano/status, gerar chave, remover override):
  ConfirmDialog + disclaimer + tooltip + loading + `can()`.
- Listagens: `<Table>` no desktop + cards no mobile, `<EmptyState>` quando vazio.
- Cores via CSS vars `--ap-*`; testar dark + light e 375px + 1920px.
