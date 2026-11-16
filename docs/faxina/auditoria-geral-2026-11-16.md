# Auditoria geral do IA Studio — 2026-11-16

> Relatório de **auditoria somente leitura**. Nada foi apagado, movido ou alterado no projeto além deste arquivo.
> Ele descreve o que existe, classifica e propõe um plano de faxina. Quem decide e executa a limpeza é o Robson, em outro trabalho, depois de aprovar o plano.
> Este relatório é construído por partes: esta versão contém as seções 1 a 10.

## 1. Resumo executivo

**Estado geral (pelo que foi lido até agora).** O projeto é um monorepo com três aplicações (`platform-api`, `platform-admin`, `platform-console`), `docs/` e `scripts/`. A documentação normativa existe e é detalhada (`CLAUDE.md`, 58 diretrizes, runbook de deploy, handoff, dívida técnica). O código está em evolução rápida: o `CHANGELOG.md` mostra releases seguidas (a mais recente listada no topo é `v0.10.89`, de 14/09/2026) e os últimos commits tratam de templates de WhatsApp com cabeçalho de mídia.

**O que já se vê de problema só pelos documentos:**

1. **Documentos citados que não existem.** Conferido com Glob em 2026-11-16:
   - `docs/base-replicavel.md` — não existe.
   - `docs/prompt-framework/especialidades/system-cleanup.md` — não existe (a pasta só tem `whatsapp-connectors.md`, `tenant-domains.md` e `adocao-studio-ux.md`).
   - `docs/faxina/etapa-0-inventario.md` — não existe (a pasta `docs/faxina/` só passa a existir com este relatório).
   - `docs/plano-de-execucao.md` — não existe, mas o `README.md` o lista como documento normativo nº 2 e na tabela de estrutura. Achado extra, além dos três citados pelo Robson.
2. **Documentos de estado desatualizados.** `docs/ESTADO-e-handoff.md` diz "Última atualização: 2026-07-13", mas seu próprio texto cita versões até `v0.10.26`, enquanto o topo do `CHANGELOG.md` está em `v0.10.89` e a tag vigente informada é `v0.12.1`. O handoff é justamente o documento de re-ancoragem; estando velho, induz erro. O `README.md` também descreve `scripts/` como "(fase final)" e `docs/` com "plano de execução", o que não reflete o estado real.
3. **Possíveis divergências entre CHANGELOG e tag.** O topo do CHANGELOG (`v0.10.89`) é menor que a tag informada (`v0.12.1`). Pode ser que o CHANGELOG tenha entradas mais novas em outro trecho, ou que a ordem do arquivo não seja a esperada. **Inconclusivo** até rodar os comandos de Git da seção 2.
4. **Resíduos suspeitos de teste de sincronização** na raiz e em `platform-api/`: `.sync-probe.txt`, `platform-api/.sync-test`, `platform-api/.sync-test2` (conteúdos de uma linha, sem função no produto; não estão no `.gitignore`). Ver seção 2.
5. **Arquivos de análise na raiz** (`ANEXO-ANALISE-BACKEND-AQUAPARK.md`, `RELATORIO-ANALISE-E-ARQUITETURA.md`, `ARCHITECTURE_LOCK.md`): o `RELATORIO...` (Parte 2) é citado como documento vivo; os outros dois não aparecem nos documentos-base lidos e precisam de verificação na seção 5.
6. **`CLAUDE.md` aparece como removido no índice do Git** desta cópia de trabalho (status inicial `D  CLAUDE.md`); a cópia legível está em `contexto/repositorio/_CLAUDE.md`. Isso é artefato do ambiente de auditoria, mas **não pode ser commitado por engano**: apagaria a regra máxima do projeto do repositório.

**Principais riscos da faxina:**

- Apagar algo que parece resíduo mas é referenciado (scripts de deploy, `upgrade.sh`, `ecosystem`, nginx) e só quebra em produção, pois o build só roda no servidor.
- Apagar arquivo ainda não rastreado, perdendo trabalho que nunca foi commitado.
- Mexer em `schema.prisma` ou em semeadores (`CONTENT_VERSION`, catálogo HSM) junto com a limpeza — o `CLAUDE.md` proíbe refator estrutural junto com feature.
- Tags já publicadas são imutáveis; a faxina não pode reescrever histórico nem reusar número de versão.

**Esforço estimado (provisório, a refinar nas seções seguintes):**

| Frente | Esforço |
|---|---|
| Corrigir referências quebradas e atualizar handoff/README | pequeno (horas) |
| Remover resíduos `.sync-*` e confirmar o que é gerado/versionado indevidamente | pequeno |
| Inventário e limpeza de código morto no painel e na API | médio (dias, em checkpoints) |
| Reorganização de `docs/` e raiz | médio |

**Avaliação provisória: MÉDIA.** Não há indício, até aqui, de problema estrutural (arquitetura, schema ou deploy); o trabalho é de higiene e de documentação, mas exige checkpoints e validação humana por causa do deploy só em servidor. A avaliação será confirmada ou ajustada depois do inventário das etapas seguintes.

## 2. Estado do Git

**Limite desta auditoria.** A IA que produziu este relatório **não tem acesso ao Git** nesta cópia: não há terminal e não rodou nenhum comando. O que está aqui vem só da leitura de arquivos e das informações passadas no pedido (tag vigente `v0.12.1`, branch de trabalho `job/…`, últimos commits no contexto: `22f8fe6`, `2c81294`, `bb50d27`, `0ecc11e`, `0410614`). Nada abaixo foi confirmado por comando.

**Comandos que o Robson (ou o sistema) deve rodar** na raiz do repositório e anexar a saída antes de qualquer limpeza:

```bash
git status
git branch
git log -n 15
git tag --sort=-v:refname
git ls-files --others --exclude-standard
```

O que cada um responde:

| Comando | Para que serve |
|---|---|
| `git status` | Mostra mudanças não commitadas e arquivos novos. Confirma se o `D  CLAUDE.md` do início é só desta cópia. |
| `git branch` | Confirma em qual branch se está e se existe branch de limpeza separada. |
| `git log -n 15` | Confirma a ponta do histórico e se o último commit corresponde à tag `v0.12.1`. |
| `git tag --sort=-v:refname` | Confirma a tag mais recente (a informada é `v0.12.1`) e se há tags "queimadas" citadas no handoff (`v0.9.75`, `v0.9.76`, `v0.9.77`). |
| `git ls-files --others --exclude-standard` | Lista arquivos **não rastreados** que não estão no `.gitignore` — é aqui que aparecem os resíduos de verdade. |

**O que se vê por leitura (suspeitas, não conclusões):**

| Caminho | Conteúdo | Observação |
|---|---|---|
| `.sync-probe.txt` | uma linha: `probe-1783110529` | Parece sonda de teste de sincronização. Não referenciado nos documentos lidos. |
| `platform-api/.sync-test` | uma linha: `sync-test-f4-updated` | Parece resto de teste de sincronização. |
| `platform-api/.sync-test2` | uma linha: `linux-to-windows-test` | Parece resto de teste de sincronização entre Linux e Windows. |

Nenhum dos três está coberto pelo `.gitignore`. Não se sabe se estão **rastreados** (já commitados) ou **não rastreados**; o `git ls-files --others --exclude-standard` responde isso. Classificação provisória: **inconclusivo** até conferir com Git e buscar referências no código e nos scripts (seção 3).

**Cuidados para não perder trabalho:**

1. Antes de qualquer remoção, registrar a saída de `git status` e `git ls-files --others --exclude-standard`. Arquivo **não rastreado** apagado não volta pelo Git.
2. Se `git status` mostrar mudanças não commitadas do Robson, commitá-las ou guardá-las **antes** da faxina; não misturar faxina com trabalho em andamento.
3. Fazer a faxina em **branch própria**, nunca na `main`, e em commits pequenos (um por checkpoint), para poder reverter item a item.
4. Não mexer em tags existentes. Tag é imutável (regra do `docs/deploy-e-versionamento.md`); a faxina não gera tag sem o Robson confirmar o número.
5. Confirmar, antes de apagar qualquer arquivo de raiz ou `scripts/`, que ele não é lido pelo `upgrade.sh`/`install.sh` (o build só roda no servidor; erro só aparece em produção).
6. Conferir o `D  CLAUDE.md`: se ele aparecer como removido em um commit real, **desfazer** — o arquivo é a regra máxima do projeto.
7. Ainda não há `.gitignore` para `.sync-*`. Se forem confirmados como resíduos, decidir entre apagá-los e/ou ignorá-los; isso é ação da fase de execução, não desta auditoria.

## 3. Inventário de código e arquivos

> Cobertura desta versão: raiz, `platform-api/src` (módulos e dependências), `platform-admin/src` (rotas, menu, páginas), `platform-console/src`, `scripts/`, configuração de deploy e `package.json` das três aplicações. Auditoria só por leitura e busca (Grep/Glob); nenhum comando foi executado e nada foi alterado. Os "resultados" das evidências são os retornados pelas buscas nesta data.
> Limites: sem Git, não se sabe quais arquivos estão rastreados; `schema.prisma`, migrations e dados não foram tocados (a pasta `platform-api/prisma/` só contém `schema.prisma`; não há `migrations/` no checkout). Não há arquivos `*.spec.ts`/`*.test.ts` em `platform-api` (Glob `platform-api/**/*.{spec,test}.ts` sem resultado). Não foram encontradas pastas `nginx/`, `deploy/` nem `ecosystem*` versionados (o `.gitignore` ignora `ecosystem.config.js`): PM2 e Nginx são gerados por `scripts/install.sh`/`domains-sync.sh`.

| item/caminho | tipo | situação atual | evidência | classificação | ação recomendada | risco | validação necessária |
|---|---|---|---|---|---|---|---|
| `.sync-probe.txt` (raiz) | arquivo | 1 linha `probe-1783110529`; fora do `.gitignore` | Grep `sync-probe\|sync-test` no repositório (exceto `contexto/`): só este relatório e o próprio `platform-api/.sync-test` citam o padrão; nenhum script, doc ou código cita `.sync-probe.txt` | Morto com irreferência comprovada | Propor remoção em checkpoint de resíduos (fase de execução, nunca nesta auditoria) | Baixo: se estiver não rastreado, não volta pelo Git | `git ls-files --others --exclude-standard` e `git log -- .sync-probe.txt`; nova busca pelo nome antes de apagar |
| `platform-api/.sync-test` | arquivo | 1 linha `sync-test-f4-updated` | Mesma busca: nenhum código/script/doc o referencia (o único acerto fora do relatório é o próprio conteúdo do arquivo) | Morto com irreferência comprovada | Propor remoção junto dos demais `.sync-*` | Baixo | Mesmas verificações de Git; confirmar que `nest-cli.json`/`tsconfig.json` não o incluem (não citam) |
| `platform-api/.sync-test2` | arquivo | 1 linha `linux-to-windows-test` | Mesma busca: nenhuma referência ao nome `sync-test2` fora deste relatório | Morto com irreferência comprovada | Propor remoção junto dos demais `.sync-*`; decidir se `.sync-*` entra no `.gitignore` | Baixo | Mesmas verificações de Git |
| `docs/base-replicavel.md`, `docs/prompt-framework/especialidades/system-cleanup.md`, `docs/faxina/etapa-0-inventario.md`, `docs/plano-de-execucao.md` | referência quebrada | Citados em documentos, mas não existem | Glob confirmou a ausência dos quatro arquivos; o `README.md` lista `docs/plano-de-execucao.md` como documento normativo nº 2 | Órfão de configuração | Corrigir/remover as menções na frente de documentação (seção 7); não criar os arquivos sem decisão | Baixo | Grep pelo nome de cada arquivo após a correção: zero ocorrências em documentos vivos |
| `ANEXO-ANALISE-BACKEND-AQUAPARK.md` (raiz) | documento | Anexo de análise do porte Aquapark | Grep pelo nome (exceto `contexto/`, `docs/faxina/`, CHANGELOG): nenhum acerto fora de `RELATORIO-ANALISE-E-ARQUITETURA.md` (documento irmão); só o CHANGELOG o cita | Inconclusivo | Decidir na seção 7 se vai para `docs/` ou vira histórico; não apagar | Médio: pode ser lido por pessoas, não por código; referência dinâmica/humana não detectável por busca | Confirmar com o Robson o papel do documento; Grep novamente depois de qualquer movimentação |
| `ARCHITECTURE_LOCK.md` (raiz) | documento | Trava de arquitetura | Grep pelo nome: citado só por `RELATORIO-ANALISE-E-ARQUITETURA.md` e por si mesmo; CHANGELOG o cita (histórico) | Inconclusivo | Verificar se ainda vale como regra; se sim, ligar do `README.md`; se não, arquivar com decisão do Robson | Médio: pode conter regra que o `CLAUDE.md` não replica | Leitura comparada com `CLAUDE.md` e `docs/diretrizes-arquiteturais.md` na etapa de documentação |
| `RELATORIO-ANALISE-E-ARQUITETURA.md`, `COMO-INTERAGIR-COM-ROBSON.md` (raiz) | documentos | Citados em `README.md`, `docs/diretrizes-arquiteturais.md`, handoff e especialidades | Grep pelos nomes: 11 arquivos de documentação citam o grupo (README, handoff, diretrizes, catálogo de especialidades etc.) | Vivo e necessário | Nenhuma; só manter links corretos | Baixo | Grep de links após qualquer reorganização de `docs/` |
| `CHANGELOG.md` | documento | Fonte da versão exibida no painel | `platform-admin/vite.config.js` lê `../CHANGELOG.md` (regex `^##\s+v...`) no build | Histórico obrigatório | Nenhuma; não reordenar nem editar entradas antigas | Alto se o primeiro `## vX.Y.Z` mudar: muda a versão exibida | Conferir qual é o primeiro `## v` do arquivo na etapa de documentação (o topo lido foi `v0.10.89`, tag vigente `v0.12.1`) |
| `.gitignore` | configuração | Cobre `node_modules`, `dist`, `.env*`, `ecosystem.config.js`, logs, `*.sql`, backups | Leitura do arquivo; sem entrada para `.sync-*` | Vivo mas candidato a refatoração | Avaliar entrada `.sync-*` se os arquivos forem removidos | Baixo | `git status` limpo após a faxina |
| `scripts/install.sh`, `upgrade.sh`, `uninstall.sh`, `backup-full.sh`, `restore-full.sh`, `restore-backup.sh`, `domains-sync.sh`, `scripts/README.md` | scripts de deploy | Pasta `scripts/` existe (README anunciava "fase final") | Grep pelos nomes: citados em `system.controller.ts`, `backup.service.ts`, `upgrade.service.ts`, `domain-sync.service.ts`, `seed.service.ts`, `health.controller.ts`, `docs/deploy-e-versionamento.md` e no handoff; `install.sh` e `domains-sync.sh` contêm nginx/pm2 (51 e 19 ocorrências) | Vivo e necessário | Nenhuma remoção; só corrigir a descrição no `README.md` raiz | Alto: só validável no servidor | Nenhum script é tocado; qualquer edição futura exige validação humana em produção |
| Configuração PM2/Nginx (`ecosystem.config.js`, nginx) | configuração de deploy | Não há arquivo versionado; `.gitignore` ignora `ecosystem.config.js` | Glob `{ecosystem*,*.conf,deploy/**,nginx/**}` sem resultado; Grep `ecosystem\|nginx\|pm2` em `scripts/` retorna 130 ocorrências em 7 arquivos | Vivo e necessário | Nenhuma; documentar que é gerado pelo instalador | Médio | Conferir no servidor (fora da auditoria) |
| `platform-api/src/app.module.ts`, `worker.module.ts` | módulo raiz | 35 arquivos `*.module.ts` no total; todos os de `app.module.ts` importados e existentes | Leitura dos dois arquivos: módulos de domínio/shared registrados na API; o worker importa `Licensing`, `Integration`, `Comm`, `Automation`, `Ai`, `Isp`; Glob `**/*.module.ts` lista 35 arquivos, todos citados em um dos dois ou em módulos filhos (`integration.module.ts` agrega `registry`, `connections`, `storage`, `marketplace`, `secrets`) | Vivo e necessário | Nenhuma | Médio: módulo filho só é provado por leitura do pai | Lista completa de imports dos módulos filhos na etapa 4 se for propor remover algo; nenhum candidato morto encontrado |
| Dependências da API: `@nestjs/swagger`, `mapped-types`, `passport`, `passport-jwt`, `@nestjs/passport`, `class-transformer`, `dotenv`, `uuid`, `nodemailer`, `pdf-lib`, `@fastify/multipart` | dependência | Declaradas em `platform-api/package.json` | Grep dos imports: `main.ts` (swagger, dotenv, multipart dinâmico), `worker.ts` (dotenv), `jwt.strategy.ts`/`jwt-auth.guard.ts`/`auth.module.ts` (passport), DTOs (`mapped-types`, `class-transformer`), `invites.service.ts` (`uuid`), `smtp.provider.ts` (`nodemailer`), `content-review-export.service.ts` (`pdf-lib`) | Vivo e necessário | Nenhuma | Baixo | `npm ls` no servidor se quiser prova de resolução |
| Dependências da API carregadas dinamicamente: `qrcode`, `@whiskeysockets/baileys`; `@fastify/static` | dependência | `qrcode` e `baileys` entram por `import(spec)` com string em variável; `@fastify/static` sem import visível | Grep `qrcode`: `whatsapp-baileys.runtime.ts:352-354` (`const spec = 'qrcode'`) e `:254` (baileys); Grep `@fastify/static\|fastifyStatic` em `platform-api/src`: nenhum resultado | `qrcode`/`baileys`: Vivo e necessário. `@fastify/static`: Inconclusivo | Manter `qrcode`/`baileys`. Para `@fastify/static`, procurar uso no deploy e em `main.ts` antes de propor remoção como órfão | Médio: carregamento dinâmico por nome falha só em runtime | Grep do nome do pacote em `scripts/`, `platform-api/` (fora de `node_modules`) e `docs/`; confirmar com `npm ls @fastify/static` |
| `clsx` em `platform-admin/package.json` e `platform-console/package.json` | dependência | Declarada nos dois painéis | Grep `clsx` em `platform-admin` (sem `node_modules`): só `package.json` e `README.md`; Grep `clsx\|lucide-react` em `platform-console`: `clsx` só em `package.json` e `README.md` (os demais acertos são `lucide-react`) | Órfão de configuração | Propor remoção de `clsx` dos dois `package.json` e das menções nos READMEs em checkpoint próprio; não está em `manualChunks` (que lista só react, react-dom, react-router-dom, axios) | Baixo: alterar `package.json` exige regerar lockfile no servidor | `npm ci` e `vite build` nos dois painéis no servidor |
| `platform-admin/src/App.jsx` + `components/Layout/Layout.jsx` | roteador e menu | Rotas autenticadas e itens de menu por seção (contagem exata não conferida) | Cada `path` do menu (leitura de `Layout.jsx`) tem rota em `App.jsx`; rotas de `execucoes`, `eventos`, `notificacoes`, `ferramentas` e `memoria` só redirecionam (`Navigate`) para abas; `perm` de rota ↔ `perm` de menu coincidem | Vivo e necessário | Nenhuma | Baixo | Foto das telas na execução de qualquer mudança |
| Páginas do painel não roteadas: `Automacao/Execucoes.jsx`, `Eventos.jsx`, `Notificacoes.jsx`, `IA/Ferramentas.jsx`, `IA/Memoria.jsx` | componente de página | Não têm `<Route>` próprio | Grep de imports: `Monitoramento.jsx:3-5` importa Execucoes/Eventos/Notificacoes; `AjustesGerais.jsx:3-4` importa `Ferramentas` e `Memoria` | Vivo e necessário | Nenhuma: são abas, não páginas | Baixo | Nenhuma |
| `platform-admin/src/pages/StudioUxDemo.jsx` e rota `/studio-ux-demo` | página piloto | Rota registrada em `App.jsx:181`; sem item de menu | Grep `studio-ux-demo\|StudioUxDemo`: `App.jsx`, `docs/adocao-studio-ux.md`, `docs/prompt-framework/especialidades/adocao-studio-ux.md` (que manda manter o piloto "intacto") e CHANGELOG v0.9.79 | Decisão de produto | Manter até o Robson decidir o fim da adoção do Studio UX; não remover | Médio: especialidade do projeto proíbe ignorá-lo | Decisão do Robson; depois Grep do nome |
| Componentes e libs do painel: `WorkflowStatusBadge.jsx`, `GoogleOAuthButton.jsx`, `AudioPlayer.jsx`, `ChatList.jsx`, `TransferModal.jsx`, `TimelineModal.jsx`, `useAudioRecorder.js`, `lib/tone.js`, `lib/format.js` | componentes | Importados | Grep de imports: cada um tem pelo menos um importador (`Fluxos.jsx`, `FluxoEditor.jsx`, `FluxoCanvas.jsx`, `ConexaoNova.jsx`, `ConexaoDetalhe.jsx`, `Conversas.jsx`, `ChatWindow.jsx`, `AudioRecorderBar.jsx`; `tone` em 5+ arquivos; `lib/tone` e `lib/format` aparecem em 23 arquivos no Grep de contagem) | Vivo e necessário | Nenhuma | Baixo | Nenhuma |
| `platform-admin/package.json` (`@studio-ux-ds/*`, `@xyflow/react`, `axios`, `react*`) e `vite.config.js` | dependência e build | `manualChunks` cita `react`, `react-dom`, `react-router-dom`, `axios`, todos declarados | Grep `from '(clsx\|axios\|@xyflow/react\|@studio-ux-ds/..)'` em `platform-admin/src`: 88 ocorrências em 87 arquivos, incluindo `FluxoCanvas.jsx` (xyflow) e `main.jsx`; `vite.config.js` sem referência a pacote ausente (o comentário registra a lição do `lucide-react` removido na v0.10.22) | Vivo e necessário | Nenhuma | Médio: `@studio-ux-ds/*` vem de registro privado via `.npmrc` (`GITLAB_PACKAGE_TOKEN`), só resolve no servidor | Conferir `.npmrc` e o token no servidor, sem imprimir segredo |
| `platform-console/src` (rotas, `ui/*`, `services/*`, `lib/*`) | aplicação | Rotas em `App.jsx` para 10 páginas | Todas as páginas de `src/pages` têm `<Route>`; Grep de imports: cada `ui/*` (StatCard, Tabs, UIToastContainer, Table, ConfirmDialog, EmptyState, Modal, FormField), `lib/*` (canonicalHost, toast, format) e `services/*` (dashboards, orgUsers, organizations, plans, flags, licenses, domains, audit, system, usage, marketplace) é importado por alguma página | Vivo e necessário | Nenhuma | Baixo | Nenhuma |
| `platform-console/vite.config.js` (`vendor-icons: ['lucide-react']`) | build | `manualChunks` cita `lucide-react` | `lucide-react` está declarado em `platform-console/package.json` e importado por várias páginas (Grep: `Planos`, `Consumo`, `ClienteDetalhe`, `Flags`, `Marketplace`, `Auditoria`, `Clientes`, `Login`, `Dominios` etc.) | Vivo e necessário | Nenhuma (diferente do painel, onde o pacote foi removido) | Baixo: se `lucide-react` sair do `package.json`, remover também esta linha | `vite build` no servidor |
| Catálogo `platform-api/src/shared/permissions.constants.ts` | permissões | Constantes + perfis de sistema | Grep por constante/string: `CORE_ENVIRONMENTS_*`, `CORE_SETTINGS_*`, `CORE_INVITES_READ`, `INTEGRATIONS_LOGS_READ`, `INTEGRATIONS_CONNECTIONS_EXECUTE`, `AI_COSTS_MANAGE`, `AI_MCP_READ`, `RESOURCE_MAPPER_SUGGEST` têm guard em controllers; rotas do painel só usam perms existentes no catálogo | Vivo e necessário | Nenhuma | Baixo | Nenhuma |
| `ISP_TOOLS_USE` (`isp.tools.use`) e `AI_PROVIDERS_READ` (`ai.providers.read`) | permissões | Existem no catálogo e nos perfis de sistema (linhas 110, 262, 367, 452; 99, 249, 360) | Grep em todo o repositório (exceto `contexto/`, CHANGELOG, relatório e o catálogo): só `platform-api/src/modules/isp/README.md:174` cita `isp.tools.use`; nenhum guard, controller ou tela do painel usa as duas | Inconclusivo | Não remover. Verificar uso dinâmico (perm exigida por ferramenta de IA via string no banco/seed, `requiredPermission`) e decidir com o Robson; remoção alteraria perfis já gravados | Alto: perm gravada em perfis de clientes; seeds e dados de produção | Grep de `requiredPermission`/campo de perm nas ferramentas e seeds; consulta de leitura ao banco no servidor (fora desta auditoria) |
| Comentários de compatibilidade temporária / código comentado | código | Busca ampla encontrou marcadores | Grep (`TODO\|FIXME\|HACK\|compat\|legado\|legacy\|deprecated`, case-insensitive) em `platform-api/src`: 96 ocorrências em 60 arquivos, concentradas em `modules/isp/*`, `comm/whatsapp/*`, `shared/*`; muitas são a palavra "compatível" em comentário normal, sem relação com código morto | Inconclusivo | Triagem manual dos 60 arquivos na etapa 4 (separar comentário informativo de compatibilidade temporária real) | Médio: classificar só pelo marcador gera falso positivo | Leitura de cada ocorrência antes de classificar |
| `platform-api/src/modules/*/README.md` (ex.: `system`, `isp`, `comm`, `automation`) | documentação de módulo | Existem READMEs de módulo | Glob/Grep: `system/README.md` descreve `@fastify/multipart` e rotas reais (`/console/system/backups/upload`); `isp/README.md` descreve perms | Vivo mas candidato a refatoração | Conferir se cada README ainda corresponde ao código (etapa 3) | Baixo | Comparação README × controllers |
| `platform-api/prisma/schema.prisma` | schema | Único arquivo em `platform-api/prisma/` | Glob `platform-api/prisma/*`: só `schema.prisma`; citado em docs e `seed.service.ts` | Vivo e necessário | **Fora do escopo:** não tocar | Alto | Nenhuma nesta faxina |

## 4. Classificações permitidas

Todo item do inventário (seção 3) recebe **exatamente uma** destas nove classificações. Sem classificação, ou sem evidência que a sustente, o item é **inconclusivo** — nunca se presume.

| # | Classificação | Quando usar |
|---|---|---|
| 1 | **Morto com irreferência comprovada** | Nada no repositório o importa, chama ou cita (código, rota, scripts, docs, configuração, strings), e isso foi demonstrado por busca pelo **nome do item no repositório inteiro**, não só por `import`. Só esta classificação autoriza propor remoção. |
| 2 | **Órfão de configuração** | Configuração, dependência, variável ou chave que nomeia algo que não existe mais (ex.: entrada de `package.json` ou `manualChunks` do `vite.config.js` apontando para pacote removido). |
| 3 | **Duplicado** | Existe outro arquivo/trecho que cumpre o mesmo papel. Indicar qual é o canônico. |
| 4 | **Gerado e não deveria estar versionado** | Saída de build, cache, log, backup ou artefato que o `.gitignore` deveria cobrir. |
| 5 | **Vivo e necessário** | Em uso e correto. Nenhuma ação, só registrar. |
| 6 | **Vivo mas candidato a refatoração** | Em uso, mas com problema de coesão, tamanho ou padrão. Entra em checkpoint próprio, **nunca junto de feature** e nunca nesta faxina sem aprovação. |
| 7 | **Histórico obrigatório** | Registro que não pode ser apagado ou reescrito (`CHANGELOG.md`, tags, entradas resolvidas de `docs/divida-tecnica.md`, decisões de produto registradas). |
| 8 | **Decisão de produto** | Remover, manter ou mudar depende de escolha do Robson, não de critério técnico (ex.: DT-005, tema escuro da conversa; DT-001, lista de variáveis do template). |
| 9 | **Inconclusivo** | Falta evidência (sem Git, sem como executar, referência dinâmica possível). Fica como está até haver validação. |

**Regras de uso:**

- Referência por **nome dinâmico** (strings, rotas montadas, chaves de configuração, nomes de seed) conta como possível referência: na dúvida, é inconclusivo.
- Item cuja remoção só pode ser validada em produção (scripts, nginx, PM2, `.env`) nunca é "morto" sem validação humana.
- A ação recomendada nunca é executada por esta auditoria.

## 5. Mapa da documentação atual

> Cobertura: todos os `.md` do repositório fora de `contexto/` (material do modelo, somente leitura) e de `.nivoo/`: raiz (6), `docs/` (10 + `prompt-framework/` 5), READMEs das três aplicações, `scripts/README.md` e 9 READMEs de módulo da API. Leitura por Read/Grep; nenhum arquivo foi alterado. Os `.md` de `contexto/` não fazem parte do produto.
> Papéis usados: **SSOT normativa**, **operacional viva**, **README de módulo**, **histórico obrigatório**, **duplicado**, **desatualizado**, **referência quebrada**, **candidato a consolidação/arquivamento/exclusão**. Um documento pode ter mais de um papel (o principal vem primeiro).
> `CLAUDE.md` existe no repositório (cópia legível em `contexto/repositorio/_CLAUDE.md`; o índice desta cópia o marca como removido — ver seção 1, item 6). Ele é a SSOT máxima e **não é tocado** pela faxina.

### 5.1 Tabela

| documento | papel | autoridade / SSOT | sobreposição | problema | destino recomendado |
|---|---|---|---|---|---|
| `CLAUDE.md` (raiz) | SSOT normativa | Regra máxima do projeto | Replicado em resumo por READMEs (`Padrões obrigatórios`) e pelo handoff | Nenhum de conteúdo; atenção ao `D  CLAUDE.md` do índice | **Permanece.** Nunca apagar nem mover |
| `README.md` (raiz) | Operacional viva (porta de entrada) | Entrada do repositório; não é SSOT de regra | Lista "Documentos normativos" que repete o mapa do handoff | **Referência quebrada** (`docs/plano-de-execucao.md`, nº 2 da lista e tabela de estrutura); **desatualizado** (`scripts/` "fase final", `docs/` "plano de execução", "Redis (fases 4+)") | **Permanece e é corrigido**: remover/ajustar a menção ao plano; apontar para o índice único (5.2) |
| `CHANGELOG.md` | Histórico obrigatório | Fonte do que roda por tag e da versão exibida no painel (`vite.config.js` lê o primeiro `## v`) | Handoff e `divida-tecnica.md` citam entradas dele | Topo `v0.10.89` (14/09/2026) × tag informada `v0.12.1`; Grep `^## v0\.1[12]` não acha entradas 0.11/0.12 | **Permanece intocado.** A divergência vira decisão do Robson (seção 10); não reordenar nem reescrever |
| `ARCHITECTURE_LOCK.md` (raiz) | SSOT normativa (congelamento V1, 02/07/2026) + histórico de decisão | Define blocos da V1 e a regra "mudança estrutural = RFC em `docs/rfcs/`" | Parte do conteúdo dos blocos sobrepõe `diretrizes-arquiteturais.md` e o `CLAUDE.md` | **Não é citado** pelo README nem pelo handoff (só por `RELATORIO-…` e CHANGELOG); cita `docs/plano-de-execucao.md` (inexistente) e a pasta `docs/rfcs/` (não existe: Glob vazio); estado "Fase 1 em verificação" velho | **Preservar** (decisão arquitetural). Ligar do índice; marcar o estado como congelamento histórico; corrigir a citação do plano. Não consolidar em outro doc |
| `RELATORIO-ANALISE-E-ARQUITETURA.md` (raiz) | Operacional viva (Parte 2: contrato da API Altarede) + histórico (Parte 1) | Parte 2 = SSOT do contrato do ERP Altarede | Parte 1 sobrepõe o `ANEXO-…` (mesma análise do Aquapark) | Dois papéis num arquivo; cabeçalho já avisa. Cita o anexo da raiz | **Permanece.** Opção futura (decisão): dividir em Parte 2 viva e Parte 1 histórica; só com aprovação |
| `ANEXO-ANALISE-BACKEND-AQUAPARK.md` (raiz) | Histórico (análise pré-build, 02/07/2026) | Nenhuma; apoio da Parte 1 | Detalha a Parte 1 do `RELATORIO-…` | Na raiz sem ponteiro de README/handoff; só o `RELATORIO-…` e o CHANGELOG citam | **Arquivar por mover** para `docs/historico/` (não apagar) com ponteiro; decisão do Robson (seção 10) |
| `COMO-INTERAGIR-COM-ROBSON.md` (raiz) | Duplicado deliberado (stub/ponteiro) | SSOT externa fora do repositório (`C:\Users\Flowspec\Documents\STUDIO-WORKFLOW\…`) | Equivalente no modelo: `contexto/base/COMO-INTERAGIR-COM-O-RESPONSAVEL.md` | O ponteiro leva a caminho Windows que não existe no repositório; é citado por 3 especialidades e pelo catálogo | **Permanece como ponteiro** (já é). Não editar enquanto a SSOT externa mandar; só registrar a referência externa como "fora do repositório" |
| `docs/ESTADO-e-handoff.md` | Operacional viva (re-ancoragem) | Índice do estado vigente (por regra do `CLAUDE.md`) | Seção "Mapa da documentação" sobrepõe o `README.md`; seções de adoção do Studio UX repetem `adocao-studio-ux.md`; frentes ISP repetem a spec | **Desatualizado** (última atualização 2026-07-13; texto até `v0.10.26`; ainda diz "v0.9.74 no ar" e "falta a frente 6"); mapa omite 8 documentos vivos (ver 5.2); grande (~300 linhas) com histórico de frentes | **Permanece como índice de estado, reescrito enxuto** em checkpoint próprio: só estado vigente + mapa completo; detalhe vai para os docs de origem. Fonte única do índice de documentos |
| `docs/diretrizes-arquiteturais.md` | SSOT normativa | 58 diretrizes que governam o desenho | Reforça `ARCHITECTURE_LOCK.md` | Nenhum link quebrado (cita o `RELATORIO-…` e o deploy, ambos existentes) | **Permanece** |
| `docs/deploy-e-versionamento.md` | Operacional viva (runbook) | SSOT do release/upgrade/backup | Tabela de scripts repete o `scripts/README.md` | **Desatualizado**: "13 fases" mas lista 12 e omite `CONSOLE_BUILD` (existe em `scripts/upgrade.sh:215`); diz "Processo PM2: `iastudio-api`" e o `scripts/README.md`/install/uninstall usam `api` + `worker` | **Permanece e é corrigido.** Fonte única do fluxo de release; o `scripts/README.md` fica com o detalhe por script |
| `scripts/README.md` | README de operação (scripts) | SSOT do detalhe de cada script | Tabela de scripts sobrepõe o runbook de deploy | Título "(Fase 8)" é rótulo de fase de projeto antigo | **Permanece**; o runbook aponta para ele em vez de repetir descrição |
| `docs/divida-tecnica.md` | Operacional viva + histórico obrigatório (seção Resolvidos) | SSOT da dívida do produto (DT-001…) | Handoff e `adocao-studio-ux.md` apontam para ele | Nenhum link quebrado | **Permanece.** Resolvidos nunca são apagados |
| `docs/adocao-studio-ux.md` | Operacional viva (estado + ADR da adoção) | SSOT da adoção do DS no `platform-admin` | O handoff repete ~100 linhas do mesmo estado | Nenhum link interno quebrado; cita documentos externos do Studio UX (`STUDIO_UX_TABLES.md`, `COMPONENT_LIBRARY`) fora do repositório | **Permanece como fonte única** da adoção; o handoff vira ponteiro + 5 linhas de estado |
| `docs/dominios-e-subdominios.md` | Operacional viva (runbook de tenancy por Host) | SSOT do desenho e operação de domínios | Handoff tem a seção "Frente de ENDEREÇOS" | Nenhum link quebrado; **não** citado no `README.md` | **Permanece**; entra no índice |
| `docs/base-doc-e-portes-aquapark.md` | Candidato a consolidação/arquivamento | Backlog de porte do Aquapark (10/07/2026), citado pelo handoff como vivo | Várias linhas viraram regra no `CLAUDE.md` e itens viraram `divida-tecnica.md` | **Parcialmente desatualizado**: "CLAUDE.md raso (71 linhas)", `divida-tecnica.md` marcado como "❌ criar" (já existe), tabela "❌ Portar" não conferida | **Candidato a arquivamento por mover** (`docs/historico/`) depois de a tabela ser conferida contra o `CLAUDE.md`; o que ainda faltar vira item em `divida-tecnica.md`. Decisão do Robson |
| `docs/spec-assistente-isp-atendimento.md` | Operacional viva (spec "andaime" travada) | Comportamento do assistente ISP | Handoff repete o resumo das 6 frentes; `isp/README.md` descreve o estado | Handoff diz "falta a 6"; a frente 6 está implementada (CHANGELOG v0.9.75) | **Permanece** enquanto a frente não for documentada em `isp/README.md`; depois arquivar (andaime pela regra do handoff). Marcar o estado da frente 6 |
| `docs/spec-painel-assistente-humanizado.md` | Candidato a arquivamento (andaime de 09/07/2026) | Spec da humanização do painel (backlog de casca) | CHANGELOG registra a execução; adoção do DS refez as telas | Estado não confirmado: a UI do editor foi reescrita no DS (v0.10.x) | **Inconclusivo → decisão do Robson**: arquivar em `docs/historico/` se o backlog foi atendido |
| `docs/prompt-framework/README.md` | Operacional viva (ponteiro do método) | Aponta o método externo | Duplica em texto o índice do `contexto/base/README.md` | **Desatualizado/contraditório**: diz "ainda não existe catálogo local nem especialidades", mas o catálogo e 3 especialidades existem; links `../../../STUDIO-WORKFLOW/…` (6) apontam para fora do repositório; versão "STUDIO-WORKFLOW v3.0.0" × catálogo citando `prompt-alignment@2.1.0` | **Permanece e é corrigido**: remover a afirmação falsa; manter os links externos marcados como "fora do repositório" |
| `docs/prompt-framework/catalogo-especialidades.md` | SSOT normativa (catálogo) | Lista de especialidades `ia-studio.*` | O README do framework fala do mesmo catálogo | Não lista `system-cleanup` (inexistente); as 3 especialidades listadas existem | **Permanece.** A especialidade `system-cleanup` só se cria em plano próprio (seção 10) |
| `docs/prompt-framework/especialidades/adocao-studio-ux.md` | SSOT normativa (especialidade) | Governa a adoção do DS | Link de leitura obrigatória ao `docs/adocao-studio-ux.md` (existe) | **Referência quebrada**: `AGENTS.md` (linha 62; não existe); caminhos `C:\Users\Flowspec\…\STUDIO-UX\…` e `STUDIO-WORKFLOW\…` fora do repositório; sugere `docs/adr/…` (pasta inexistente, apenas como criação futura) | **Permanece**; corrigir a citação de `AGENTS.md`; marcar os externos |
| `docs/prompt-framework/especialidades/tenant-domains.md` | SSOT normativa (especialidade) | Governa tenancy por Host | Aponta `docs/dominios-e-subdominios.md` e o handoff (ambos existem) | Cita `COMO-INTERAGIR-COM-ROBSON.md` (stub externo) | **Permanece** |
| `docs/prompt-framework/especialidades/whatsapp-connectors.md` | SSOT normativa (especialidade) | Governa o porte dos conectores WhatsApp | — | **Referência quebrada**: `docs/mapeamento-aquapark-menus-ia-studio-whatsapp.md` (linha 67, "este trabalho"; Glob vazio); cita `STUDIO-WORKFLOW/shared/system-change-base.md` externo | **Permanece**; corrigir ou remover a citação do mapeamento ausente |
| `platform-api/README.md` | README de aplicação | Visão da API, variáveis de ambiente, convenções | Resumo das regras do `CLAUDE.md` | Título "Fase 1"; descreve só o escopo da Fase 1; "Secrets Manager (Fase 2)" | **Permanece**; refrescar o escopo para o estado atual (checkpoint de documentação) |
| `platform-admin/README.md` | README de aplicação | Painel do Cliente | Resumo do `CLAUDE.md` | Cita `clsx` como dependência (órfão — seção 3); estado de adoção do DS está em `adocao-studio-ux.md`, não aqui | **Permanece**; corrigir `clsx` junto da remoção da dependência |
| `platform-console/README.md` | README de aplicação | Console do SaaS | Resumo do `CLAUDE.md` | Cita `clsx` (órfão, seção 3); `lucide-react` está vivo | **Permanece**; corrigir `clsx` junto da remoção |
| `platform-api/src/modules/ai/README.md` | README de módulo | Estado do módulo `ai/` | — | Título "(Fase 5)"; rótulo de fase | **Permanece**; conferir contra controllers |
| `platform-api/src/modules/automation/README.md` | README de módulo | Estado do módulo `automation` | — | Diz que `EMAIL_SEND` é stub "até a Fase 7", mas `comm.nodes.ts:2,84` já usa o Email Orchestrator; marcadores "Fase N" | **Provável desatualizado** (a confirmar por leitura do node); **permanece e é corrigido** |
| `platform-api/src/modules/comm/README.md` | README de módulo | Estado de `comm` (WhatsApp Meta) | Parte dos conectores está na especialidade `whatsapp-connectors` | "Realtime = polling 5s", "worker na Fase 4": decisões de época, possível divergência | **Permanece**; conferir contra o código |
| `platform-api/src/modules/comm/email/README.md` | README de módulo | Email Orchestrator | — | Rótulo "Fase 7" | **Permanece** |
| `platform-api/src/modules/developer/README.md` | README de módulo | Developer Center / API pública | — | Rótulo "Fase 7" | **Permanece** |
| `platform-api/src/modules/integration/README.md` | README de módulo | Integration Manager | — | Diz "whatsapp-meta: só catálogo… implementação na Fase 3" (a Fase 3 existe: README `comm`) | **Provável desatualizado**; permanece e é corrigido |
| `platform-api/src/modules/isp/README.md` | README de módulo | Solução ISP; única citação de `isp.tools.use` | Handoff e spec descrevem o mesmo assistente | Rótulo "Fase 6"; é a única fonte que cita a perm `isp.tools.use` (seção 3) | **Permanece**; é a fonte única do estado do módulo ISP |
| `platform-api/src/modules/system/README.md` | README de módulo | Atualização, backup e restauração | Runbook de deploy descreve o mesmo fluxo | Rótulo "Fase 8" | **Permanece**; mantém só o lado do código, o runbook mantém o fluxo |
| `docs/faxina/auditoria-geral-2026-11-16.md` | Histórico (evidência desta auditoria) | Este relatório | — | — | **Permanece** como registro da faxina |

### 5.2 Duplicações: fonte única e destino de cada cópia

| tema | fonte única | o que vira ponteiro | o que se consolida / remove |
|---|---|---|---|
| Índice de documentos ("o que ler") | Um mapa só, em `docs/ESTADO-e-handoff.md` (seção Mapa) completado | `README.md` (lista "Documentos normativos") passa a apontar para o mapa, sem repetir descrições | Remover do `README.md` a menção a `docs/plano-de-execucao.md`; completar o mapa com `ARCHITECTURE_LOCK.md`, `adocao-studio-ux.md`, `divida-tecnica.md`, `dominios-e-subdominios.md`, `prompt-framework/` e o catálogo (hoje omitidos) |
| Estado da adoção do Studio UX | `docs/adocao-studio-ux.md` | Seção "Adoção do Studio UX" do handoff (~100 linhas) vira 5 linhas + link | Nada é apagado: o conteúdo já vive na fonte única; o corte só ocorre depois de comparar os dois textos |
| Frentes do assistente ISP | `platform-api/src/modules/isp/README.md` (estado) e `docs/spec-assistente-isp-atendimento.md` (spec) | Seção "Frentes" do handoff vira resumo + link | Frente 6 marcada como implementada; spec arquivada quando o README do módulo a cobrir |
| Fluxo de release e scripts | `docs/deploy-e-versionamento.md` (fluxo) e `scripts/README.md` (detalhe por script) | A tabela de scripts do runbook vira link para o `scripts/README.md` | Corrigir fases, `CONSOLE_BUILD` e processos PM2 (`api` + `worker`) em um lugar só |
| Regras do `CLAUDE.md` nos READMEs | `CLAUDE.md` | Seções "Padrões obrigatórios"/"Convenções" dos 3 READMEs de aplicação ficam como ponteiro curto | Sem remoção de regra; só evitar cópia de texto |
| Análise do Aquapark | `RELATORIO-ANALISE-E-ARQUITETURA.md` (Parte 1, histórico) | — | `ANEXO-…` fica como histórico em pasta própria; não é fundido (é detalhe arquivo a arquivo) |
| Método STUDIO-WORKFLOW | SSOT externa (`STUDIO-WORKFLOW`) e, no modelo, `contexto/base/` | `COMO-INTERAGIR-COM-ROBSON.md` e `docs/prompt-framework/README.md` (links externos) | Nenhuma cópia local do método é criada |

**Regra de proteção.** Nada acima propõe apagar `CHANGELOG.md`, RFCs (a pasta `docs/rfcs/` ainda não existe e continua sendo o destino previsto), decisões arquiteturais (`ARCHITECTURE_LOCK.md`, `diretrizes-arquiteturais.md`), `divida-tecnica.md` (Resolvidos) nem evidências de migração. "Antigo" nunca foi critério; o critério foi: sem leitor, sem autoridade e substituído por fonte viva — e mesmo assim a ação é **mover**, não apagar.

### 5.3 Referências quebradas e caminhos externos

Verificadas por Glob (existência) e Grep (citação) em 2026-11-16.

**Quebradas dentro do repositório (alvo não existe):**

| # | citado em | alvo | evidência | correção proposta |
|---|---|---|---|---|
| 1 | `README.md:12,18` e `ARCHITECTURE_LOCK.md:21` | `docs/plano-de-execucao.md` | Glob vazio | Remover a menção do README e do lock, ou criar o plano por decisão do Robson (não criar sem decisão) |
| 2 | `docs/prompt-framework/especialidades/whatsapp-connectors.md:67` | `docs/mapeamento-aquapark-menus-ia-studio-whatsapp.md` | Glob vazio | Remover a linha ou indicar que o mapa não foi versionado |
| 3 | `docs/prompt-framework/especialidades/adocao-studio-ux.md:62` | `AGENTS.md` (raiz) | Glob vazio | Remover a citação (o `CLAUDE.md` é a regra do repositório) |
| 4 | `ARCHITECTURE_LOCK.md:30` | `docs/rfcs/` (modelo `RFC-NNN-titulo.md`) | Glob vazio; nenhum RFC existe | Não é erro de link: é a pasta prevista. Registrar que ainda não há RFC; criar a pasta só quando surgir o primeiro |
| 5 | `docs/base-replicavel.md`, `docs/prompt-framework/especialidades/system-cleanup.md`, `docs/faxina/etapa-0-inventario.md` | citados no pedido da faxina | Glob vazio (seção 1) | Não existem; o `system-cleanup` e o inventário só seriam criados em plano próprio |

**Fora do repositório (existência não verificável aqui):**

| citado em | alvo | observação |
|---|---|---|
| `COMO-INTERAGIR-COM-ROBSON.md:3` | `C:\Users\Flowspec\Documents\STUDIO-WORKFLOW\COMO-INTERAGIR-COM-ROBSON.md` | Ponteiro intencional para a SSOT externa |
| `docs/prompt-framework/README.md:9-14` | `../../../STUDIO-WORKFLOW/{README,framework,prompt-alinhamento,shared/system-change-base,architecture-review,COMO-INTERAGIR-COM-ROBSON}.md` | Links relativos que saem do repositório; não resolvem aqui |
| `docs/prompt-framework/especialidades/adocao-studio-ux.md:63-64` | `C:\Users\Flowspec\Documents\STUDIO-UX\…` e `…\STUDIO-WORKFLOW\shared\consuming-system-adoption.md` | Artefatos externos do Studio UX |
| `docs/prompt-framework/especialidades/whatsapp-connectors.md:70` e `…/tenant-domains.md` | `STUDIO-WORKFLOW/shared/system-change-base.md` | Externo |
| `docs/adocao-studio-ux.md` (várias linhas) e `CHANGELOG.md` | `STUDIO_UX_TABLES.md`, `STUDIO_UX_COMPONENT_LIBRARY.md` | Externos ao projeto; histórico |
| `docs/ESTADO-e-handoff.md:301` | `../aquapark/` | Repositório irmão, externo |

**Links internos conferidos e íntegros:** `docs/ESTADO-e-handoff.md` → `adocao-studio-ux.md`, `divida-tecnica.md`; `docs/adocao-studio-ux.md` → `prompt-framework/especialidades/adocao-studio-ux.md`, `divida-tecnica.md`; `docs/prompt-framework/catalogo-especialidades.md` → três especialidades; `docs/dominios-e-subdominios.md` → `especialidades/tenant-domains.md`; `adocao-studio-ux.md` (especialidade) → `docs/adocao-studio-ux.md`, handoff, CHANGELOG. Citações em prosa de `CLAUDE.md`, `CHANGELOG.md`, `diretrizes-arquiteturais.md` e `deploy-e-versionamento.md` a arquivos existentes foram conferidas no Grep da seção 3.

**Limite.** Links dentro do `CLAUDE.md` (cópia em `contexto/repositorio/_CLAUDE.md`) e as milhares de linhas do `CHANGELOG.md` não foram percorridos um a um; o Grep por `\.md` no CHANGELOG mostrou só citações a documentos existentes ou externos. A verificação final de links deve ser repetida depois de qualquer movimentação.

## 6. Estrutura documental proposta

> Proposta apenas. Nenhum arquivo é movido por este trabalho. Princípios: uma fonte única por assunto; raiz enxuta (`README.md`, `CLAUDE.md`, `CHANGELOG.md` e ponteiros obrigatórios); histórico preservado em pasta própria, não apagado; todo documento movido deixa ponteiro ou tem as citações corrigidas na mesma execução.

### 6.1 Árvore sugerida

```text
/
├── CLAUDE.md                          (permanece — regra máxima)
├── README.md                          (permanece, corrigido; aponta para o índice)
├── CHANGELOG.md                       (permanece intocado — lido pelo build do painel)
├── COMO-INTERAGIR-COM-ROBSON.md       (permanece — ponteiro para a SSOT externa)
├── ARCHITECTURE_LOCK.md               (permanece na raiz: é citado por caminho e é decisão arquitetural)
├── RELATORIO-ANALISE-E-ARQUITETURA.md (permanece: Parte 2 viva)
├── scripts/README.md                  (permanece)
├── platform-*/README.md               (permanecem, corrigidos)
├── platform-api/src/modules/*/README.md (permanecem)
└── docs/
    ├── ESTADO-e-handoff.md            (índice + estado vigente, enxuto)
    ├── diretrizes-arquiteturais.md    (permanece)
    ├── deploy-e-versionamento.md      (permanece, corrigido)
    ├── divida-tecnica.md              (permanece)
    ├── adocao-studio-ux.md            (permanece — fonte única da adoção)
    ├── dominios-e-subdominios.md      (permanece)
    ├── spec-assistente-isp-atendimento.md (permanece até a frente ser documentada no README do módulo)
    ├── prompt-framework/              (permanece; README corrigido)
    │   ├── README.md
    │   ├── catalogo-especialidades.md
    │   └── especialidades/{adocao-studio-ux,tenant-domains,whatsapp-connectors}.md
    ├── rfcs/                          (só criada quando surgir o 1º RFC — prevista no lock)
    ├── historico/                     (NOVA — preservação, nunca exclusão)
    │   ├── ANEXO-ANALISE-BACKEND-AQUAPARK.md        (movido da raiz, se aprovado)
    │   ├── base-doc-e-portes-aquapark.md            (movido após conferência, se aprovado)
    │   └── spec-painel-assistente-humanizado.md     (movido se o backlog foi atendido, se aprovado)
    └── faxina/
        └── auditoria-geral-2026-11-16.md            (este relatório; evidências das checkpoints entram aqui)
```

`docs/historico/` é uma pasta nova proposta; a criação depende de decisão do Robson (seção 10). Se ele preferir não criar pasta, os três documentos ficam onde estão com um aviso "histórico" no topo.

### 6.2 O que permanece, consolida, vira ponteiro ou é preservado

| destino | itens |
|---|---|
| **Permanece como está** | `CLAUDE.md`, `CHANGELOG.md`, `ARCHITECTURE_LOCK.md` (texto), `docs/diretrizes-arquiteturais.md`, `docs/divida-tecnica.md`, `docs/dominios-e-subdominios.md`, `docs/prompt-framework/catalogo-especialidades.md`, as 3 especialidades (salvo as correções de 6.3), READMEs de `comm/email`, `developer`, `isp`, `system`, `ai` |
| **Permanece e é corrigido** | `README.md`, `docs/ESTADO-e-handoff.md`, `docs/deploy-e-versionamento.md`, `docs/prompt-framework/README.md`, `platform-api/README.md`, `platform-admin/README.md`, `platform-console/README.md`, READMEs de `automation` e `integration` |
| **Se consolida** | Índice de documentos: uma lista só, no handoff; `README.md` aponta para ela. Fluxo de release: um lugar só (`deploy-e-versionamento.md`), detalhe de scripts no `scripts/README.md` |
| **Vira ponteiro** | Seção de adoção do Studio UX no handoff → `adocao-studio-ux.md`; seção de frentes ISP no handoff → `isp/README.md` + spec; seções "Padrões obrigatórios" dos READMEs → `CLAUDE.md`; `COMO-INTERAGIR-COM-ROBSON.md` (já ponteiro) |
| **Históricos preservados (nunca apagar)** | `CHANGELOG.md`; tags; `ARCHITECTURE_LOCK.md`; decisões e Resolvidos de `divida-tecnica.md`; Parte 1 do `RELATORIO-…`; `ANEXO-…` (mesmo movido); ADR de adoção no `adocao-studio-ux.md`; este relatório |
| **Candidatos a mover para `docs/historico/` (com decisão)** | `ANEXO-ANALISE-BACKEND-AQUAPARK.md`, `docs/base-doc-e-portes-aquapark.md`, `docs/spec-painel-assistente-humanizado.md`; depois, `docs/spec-assistente-isp-atendimento.md` |
| **Candidatos a exclusão** | **Nenhum documento.** Só os resíduos `.sync-*` (seção 3), que não são documentação |

### 6.3 Referências a corrigir (lista para o checkpoint de documentação)

1. `README.md`: remover `docs/plano-de-execucao.md` (linhas 12 e 18); reescrever a descrição de `scripts/` ("fase final") e de `docs/`; apontar para o mapa do handoff.
2. `ARCHITECTURE_LOCK.md:21`: citação do plano inexistente; **alterar só com aprovação**, por ser documento de decisão (pode ser registrado como nota ao lado, sem reescrever o texto original).
3. `docs/ESTADO-e-handoff.md`: atualizar a data e o estado de versão (conferindo tag e Git, nunca de cabeça); completar o mapa de documentos; encurtar as seções duplicadas; marcar a frente 6 do ISP como implementada.
4. `docs/deploy-e-versionamento.md`: número e lista de fases do `upgrade.sh` (conferir com o script), `CONSOLE_BUILD`, processos PM2 `api` + `worker`.
5. `docs/prompt-framework/README.md`: remover "ainda não existe catálogo local nem especialidades"; marcar os links `../../../STUDIO-WORKFLOW/…` como externos; alinhar a versão do método citada.
6. `docs/prompt-framework/especialidades/whatsapp-connectors.md:67`: remover a citação do mapa inexistente.
7. `docs/prompt-framework/especialidades/adocao-studio-ux.md:62`: remover a citação de `AGENTS.md`.
8. `platform-admin/README.md:17` e `platform-console/README.md:15`: tirar `clsx`, na mesma execução da remoção da dependência dos `package.json` (seção 3).
9. READMEs de `automation` e `integration`: conferir contra o código o que dizem sobre `EMAIL_SEND` e `whatsapp-meta` e atualizar o texto.
10. READMEs de módulo e de aplicação: trocar rótulos "(Fase N)" do título por descrição do estado, sem apagar o conteúdo técnico.
11. Depois de qualquer movimentação: Grep pelo nome de cada arquivo movido, em todo o repositório (exceto `contexto/`), com resultado zerado para os caminhos antigos.

## 7. Plano de execução em checkpoints

> Regras: uma mudança coesa por checkpoint; em branch própria (nunca `main`); um commit por checkpoint; **validação e aprovação do Robson entre as etapas**; nenhuma tag sem o Robson confirmar o número; nenhum build local no Windows do Robson (validação em servidor ou CI, seção 8). Nada abaixo foi executado: nesta auditoria nenhum arquivo foi apagado ou movido, então todos os itens seguem **propostos**, não feitos.

### Etapa 1 — Arquivos comprovadamente mortos

| # | item | pré-condição | validação |
|---|---|---|---|
| 1.1 | `.sync-probe.txt`, `platform-api/.sync-test`, `platform-api/.sync-test2` (únicos itens com classificação "Morto com irreferência comprovada", seção 3) | `git status` e `git ls-files --others --exclude-standard` registrados; nova busca pelos três nomes sem acerto fora de relatórios de faxina; confirmar se estão rastreados (se não estiverem, não voltam pelo Git) | Grep zerado dos nomes; `git status` mostra só as três remoções |
| 1.2 | Decidir se `.sync-*` entra no `.gitignore` | Decisão 9.3 | `git status` limpo depois de recriar um arquivo de teste |

Nenhum outro item da seção 3 tem prova de irreferência. Não entram na Etapa 1: `ANEXO-ANALISE-BACKEND-AQUAPARK.md`, `ARCHITECTURE_LOCK.md` (inconclusivos), `@fastify/static`, `isp.tools.use`, `ai.providers.read`.

### Etapa 2 — Resíduos internos, imports e configurações órfãs

| # | item | observação |
|---|---|---|
| 2.1 | Remover `clsx` de `platform-admin/package.json` e `platform-console/package.json` (órfão de configuração) | Regerar lockfile no servidor; não está em `manualChunks`. Junto, tirar a menção dos dois READMEs (6.3, item 8) |
| 2.2 | Triagem dos ~60 arquivos de `platform-api/src` com marcadores `TODO/compat/legado` (96 ocorrências) | Só classificar e listar; remover apenas o que for comprovadamente comentário de compatibilidade vencida |
| 2.3 | Prova de uso de `@fastify/static` | Se comprovado órfão, remover do `package.json` da API; senão, manter |
| 2.4 | Conferir os imports dos módulos filhos (`integration`, `comm`, `isp`) | Nenhum candidato morto encontrado até aqui; só registrar |

### Etapa 3 — Consolidação da documentação

Executar a lista 6.3 (itens 1 a 11) e a árvore 6.1, em commits separados: (a) referências quebradas; (b) handoff, README e runbook de deploy atualizados contra Git, tag e scripts reais; (c) mover para `docs/historico/` somente os documentos aprovados na decisão 9.6, com Grep dos caminhos antigos zerado. `CHANGELOG.md`, tags, `ARCHITECTURE_LOCK.md` (texto) e Resolvidos da dívida técnica não são tocados.

### Etapa 4 — Padronização final e validação

Rodar a matriz da seção 8 completa em servidor/CI, repetir a checagem de links, registrar as evidências neste relatório, decidir a versão (patch por `CHANGELOG.md`) e só então o Robson autoriza tag e publicação.

### Frentes funcionais (fora da faxina; listadas à parte)

Não entram em nenhum checkpoint acima, pois mudam comportamento ou dados e não podem ser misturadas com limpeza (`CLAUDE.md`):

- Destino de `isp.tools.use` e `ai.providers.read` (permissões gravadas em perfis de clientes).
- Fim do piloto `StudioUxDemo` / adoção do Studio UX (decisão de produto).
- Criar `docs/rfcs/` e o RFC inicial; criar `plano-de-execucao.md` ou `system-cleanup.md` (especialidade nova só em plano próprio, conforme `contexto/base/specialty-creation.md`).
- Qualquer mudança em `schema.prisma`, semeadores (`CONTENT_VERSION`, catálogo HSM) e scripts de deploy.
- Ausência de testes automatizados na API (nenhum `*.spec.ts`/`*.test.ts` encontrado, seção 3): frente de qualidade, não de faxina.

## 8. Matriz de validação futura

> Tudo é planejado para servidor ou CI. **Nunca build local no Windows do Robson.** Os comandos abaixo foram conferidos nos `package.json` em 2026-11-16: `platform-api` tem `build` (`nest build`), `start`, `start:dev`, `start:prod`, `start:worker`; `platform-admin` e `platform-console` têm `dev`, `build` (`vite build`) e `preview`. **Não existem scripts `test`, `lint`, `typecheck` nem de migração** em nenhum dos três; por isso as linhas sem comando de projeto usam Grep/Git ou verificação manual no servidor.

| área | como validar | onde | critério de aprovação |
|---|---|---|---|
| Build da API | `npm ci && npx prisma generate && npm run build` em `platform-api` (`nest build`) | servidor/CI | Termina sem erro; `dist/main.js` e `dist/worker.js` existem |
| Build do painel | `npm ci && npm run build` em `platform-admin`; idem `platform-console` | servidor/CI | `vite build` sem erro; `.npmrc` e token do registro `@studio-ux-ds` resolvem (sem imprimir segredo); versão exibida segue o primeiro `## v` do `CHANGELOG.md` |
| Gates de migração | O projeto não tem `migrations/`: `install.sh` e `upgrade.sh` usam `prisma db push`. Validar que `git diff` não toca `platform-api/prisma/schema.prisma` e que `upgrade.sh` passa a fase `PRISMA_PUSH` em banco de homologação | servidor (banco de teste) | Diff do schema vazio; fase `PRISMA_PUSH` sem `mark_failed`. Qualquer diff no schema aborta o checkpoint |
| Verificação de imports | Grep dos nomes removidos/movidos (arquivos, pacotes) em `platform-*`, `scripts/`, `docs/`; os dois builds acima cobrem import quebrado; `npm ls <pacote>` para dependências removidas | CI/servidor | Zero ocorrências em documentos e código vivos; builds verdes |
| Rotas, menus e ACL | Comparar `Layout.jsx` × `App.jsx` (cada `path` com rota e `perm` coincidente) e `permissions.constants.ts` × guards, como na seção 3; nenhuma permissão removida nesta faxina | revisão por leitura + CI | Mesma lista de rotas e perms antes e depois; foto das telas se o visual mudar |
| Smoke tests | Subir API e worker (`start:prod`, `start:worker`) e conferir `GET /api/v1/health`; abrir login e uma tela do painel e do console | servidor de homologação | Health responde; login carrega sem erro de console; worker sobe sem exceção |
| Instalação e atualização | Rodar `upgrade.sh` em homologação (e `install.sh` em máquina limpa só se algum script ou `package.json` mudou) | servidor de homologação | Todas as fases concluídas; `CONSOLE_BUILD` e processos `api` + `worker` ativos; sem edição de script na Etapa 1 e 2 |
| Documentação e links internos | Glob de existência de cada alvo citado; Grep dos caminhos antigos; conferir links relativos de `docs/`; `README.md` × árvore real | CI ou revisão | Nenhuma referência quebrada interna (lista 5.3 zerada); externas marcadas como externas |
| Integridade do repositório | `git status`, `git diff --stat` por checkpoint; confirmar que `CLAUDE.md` não aparece como removido | Git | Só os arquivos previstos no checkpoint mudaram; `CLAUDE.md` intacto |

## 9. Decisões que precisam do Robson

Só decisões reais; nenhuma foi tomada por esta auditoria.

| # | decisão | opções e impacto |
|---|---|---|
| 9.1 | Os três `.sync-*` podem ser apagados? | **Sim:** limpa a raiz; se não estiverem rastreados, não voltam pelo Git. **Não:** ficam como ruído. Depende de o Robson confirmar que não são testes em uso |
| 9.2 | Estado real de Git e versão | O CHANGELOG lido tem topo `v0.10.89` e a tag é `v0.12.1`. Robson (ou o sistema) roda os comandos da seção 2 e informa se há divergência. Se o primeiro `## v` do CHANGELOG for menor que a tag, a versão exibida no painel está errada — isso é frente funcional, não faxina |
| 9.3 | Adicionar `.sync-*` ao `.gitignore`? | **Sim:** evita recorrência. **Não:** mantém o `.gitignore` como está |
| 9.4 | `ANEXO-ANALISE-BACKEND-AQUAPARK.md` e `ARCHITECTURE_LOCK.md` | Anexo: **mover para `docs/historico/`**, **ficar na raiz com aviso "histórico"**, ou **ficar como está**. Lock: **continua regra viva** (passa a ser linkado do README e a citação do plano inexistente recebe nota) ou **arquivar** (perde força de regra) |
| 9.5 | `docs/plano-de-execucao.md` | **Remover as menções** (README e lock) ou **criar o documento** (exige conteúdo definido por ele). Criar sem decisão é inventar regra |
| 9.6 | Criar `docs/historico/` e mover `base-doc-e-portes-aquapark.md`, `spec-painel-assistente-humanizado.md` e (depois) a spec do ISP | **Criar e mover:** raiz e `docs/` mais enxutas, mas caminhos mudam. **Só avisar "histórico" no topo:** zero risco de link, menos organização |
| 9.7 | `@fastify/static`, `isp.tools.use`, `ai.providers.read` | **Remover** se a prova de uso dinâmico (seed, banco, `requiredPermission`) vier zerada — para as permissões, altera perfis já gravados em clientes. **Manter** e documentar o motivo. Recomendação técnica: manter até a prova, mas a escolha é dele |
| 9.8 | Piloto `StudioUxDemo` (`/studio-ux-demo`) | **Manter** (a especialidade manda manter intacto) ou **encerrar a adoção** e remover rota e página em frente funcional própria |
| 9.9 | Criar a especialidade `system-cleanup` e o `docs/rfcs/` | **Criar** (plano próprio, só no repositório do projeto) ou **seguir sem** e remover a citação. Os documentos citados no pedido (`base-replicavel`, `etapa-0-inventario`) não existem: confirmar se é para criá-los ou se eram intenção |
| 9.10 | Ambiente de validação | Qual servidor ou CI de homologação roda a matriz da seção 8 (não há testes automatizados nem scripts de lint) e quem aprova cada checkpoint |

## 10. Resumo para o chat

**Relatório:** `docs/faxina/auditoria-geral-2026-11-16.md` (seções 1 a 10). Auditoria somente leitura: nenhum arquivo foi apagado, movido ou alterado, e nenhum item aparece como "já removido". Avaliação geral: **média** — higiene e documentação, sem problema estrutural encontrado.

**Itens seguros para a primeira etapa** (irreferência comprovada por busca; ainda dependem de conferir no Git se estão rastreados):

- `.sync-probe.txt`
- `platform-api/.sync-test`
- `platform-api/.sync-test2`

Seguros também, já como Etapa 2 ou 3 e sem risco funcional: remover `clsx` dos dois painéis e corrigir as referências documentais quebradas (`plano-de-execucao.md`, mapa Aquapark, `AGENTS.md`).

**Itens bloqueados por decisão do Robson:**

- Destino de `ANEXO-ANALISE-BACKEND-AQUAPARK.md` e `ARCHITECTURE_LOCK.md` (9.4).
- Criar ou remover a menção a `docs/plano-de-execucao.md`, `system-cleanup` e `docs/rfcs/` (9.5, 9.9).
- Criar `docs/historico/` e mover documentos (9.6).
- `@fastify/static`, `isp.tools.use`, `ai.providers.read` (9.7) e `StudioUxDemo` (9.8).
- Divergência CHANGELOG `v0.10.89` × tag `v0.12.1` e estado do Git (9.2).
- Ambiente de validação, pois não há testes nem lint nos `package.json` (9.10).

**Riscos a lembrar:** o `CLAUDE.md` aparece como removido nesta cópia de trabalho e não pode ser commitado assim; build só em servidor/CI; nada de `schema.prisma`, tags nem scripts de deploy na faxina.
