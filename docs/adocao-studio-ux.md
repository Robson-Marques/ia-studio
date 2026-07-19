# Adoção do Studio UX no IA Studio — piloto

> Como o `platform-admin` consome o design system **Studio UX** (pacotes
> `@studio-ux-ds/*`, publicados no GitHub Packages da org `studio-ux-ds`).
> Estado atual: **piloto** — uma rota isolada (`/studio-ux-demo`) que prova
> install → import → build ponta a ponta, sem tocar em nenhuma tela existente.

## O que foi adicionado (piloto)

- **`package.json`** — dependências `@studio-ux-ds/tokens`, `@studio-ux-ds/components`, `@studio-ux-ds/react` (`^1.0.15`).
- **`.npmrc`** — aponta o escopo `@studio-ux-ds` para o GitHub Packages (token via env, ver abaixo).
- **`src/main.jsx`** — importa `@studio-ux-ds/tokens/tokens.css` e `@studio-ux-ds/components/components.css`. Esses CSS só definem variáveis `--su-*` e classes `.su*` (totalmente escopadas) — **não afetam nenhuma tela existente** (o IA Studio usa `--ap-*`).
- **`src/pages/StudioUxDemo.jsx`** + rota **`/studio-ux-demo`** — a vitrine, consumindo o adapter React (`Button`, `Badge`, `StatCard`, `Card`, `Tabs`, `DataTable`, `Field`, `Input`, `Select`, `Switch`, `SegmentedControl`). O tema do Studio UX é escopado à página via `data-theme`, sincronizado com o toggle do IA Studio.

## Pré-requisito: autenticar no GitHub Packages

Os pacotes são **privados** (org `studio-ux-ds`). Para o `npm install` baixá-los, o ambiente precisa de um token do GitHub com escopo **`read:packages`**.

1. Gere um token clássico no GitHub (Settings → Developer settings → Tokens) com `read:packages`.
2. O `.npmrc` do `platform-admin` já referencia esse token por variável de ambiente (não guarda segredo):

   ```
   @studio-ux-ds:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   ```

3. **No servidor de build** (onde o `upgrade.sh`/`install.sh` roda o `npm install`), exporte a variável antes do install — por exemplo no `.bashrc` do root, ou no próprio script de deploy:

   ```bash
   export NODE_AUTH_TOKEN=ghp_seu_token_read_packages
   ```

   Sem essa variável, o `npm install` dos `@studio-ux-ds/*` retorna **401** e o build aborta (fail-safe — a produção fica na versão anterior). Configure o token **antes** de subir a tag que inclui estas dependências.

## Como ver o piloto

Depois do `npm install` + build, acesse **`/studio-ux-demo`** no painel (rota autenticada, sem permissão específica). A tela mostra os componentes do Studio UX rodando dentro do IA Studio, seguindo o tema claro/escuro do painel.

## Por que é seguro (isolado e reversível)

- Nenhuma tela existente foi alterada — só foram **adicionados** arquivos e uma rota.
- Os CSS do Studio UX (`--su-*` / `.su*`) e os do IA Studio (`--ap-*`) coexistem sem colisão de nome.
- Para remover o piloto: apague `src/pages/StudioUxDemo.jsx`, a rota `/studio-ux-demo` e os dois imports em `main.jsx`; opcionalmente as dependências e o `.npmrc`.

## Nota sobre o build (Vite)

O adapter `@studio-ux-ds/react` é distribuído como **fonte JSX** (runtime descartável — o produto transpila). O Vite 5 + `@vitejs/plugin-react` pré-empacota dependências com esbuild, que lida com `.jsx` automaticamente — não é preciso configuração extra. Se algum dia o pré-empacotamento reclamar, a alternativa é consumir as classes CSS direto (`.su-*`) sem o adapter, ou adicionar `optimizeDeps: { include: ['@studio-ux-ds/react'] }` no `vite.config.js`.

## Próximos passos (fora do piloto)

- Migrar telas reais para o Studio UX (uma por vez), ou criar uma **ponte de tokens** (`--ap-*` → valores `--su-*`) para unificar a base de cor/espaço.
- Consumir o adapter mobile-web (`@studio-ux-ds/react/mobile`) se houver PWA.
- Fixar a versão adotada (o IA Studio declara `@studio-ux-ds/* ^1.x`).
