# platform-admin — painel da instância dedicada

Frontend React do IA Studio instalado para um único cliente. Ele administra as
operações, usuários, perfis, integrações, automações, IA e comunicação desta
instância; não possui seletor de organização/workspace/ambiente nem telas de
planos, licenças ou consumo SaaS.

## Stack

- React 18 + Vite 5;
- Studio UX (`@studio-ux-ds/{tokens,components,icons,react}`);
- Tailwind 3, React Router e Axios.

## Executar

```bash
npm install
npm run dev
npm run build
```

O backend usa `/api/v1`; `VITE_API_URL` pode definir a origem em produção.

## Administração local

`Configurações → Administração da instalação` usa a permissão
`system.maintain` e oferece versão instalada, versões disponíveis, atualização
com log ao vivo, falha/lock/recuperação, histórico, backup e restauração. Essas
ações atingem somente a instância local.

## Convenções

- Rotas protegidas usam `PermissionRoute` e permissões reais, sem bypass de
  administrador global.
- Erros são informados por toast; ações destrutivas usam `ConfirmDialog`.
- Componentes visuais vêm do Studio UX e valores visuais usam tokens.
- Uma rota nova deve entrar no menu, breadcrumb e autorização correspondente.
