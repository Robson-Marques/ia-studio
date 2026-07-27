# ESTADO DO TRABALHO — handoff entre sessões (LER PRIMEIRO)

> Este arquivo existe porque a memória do assistente é compactada em sessões
> longas e ele perde o fio (principalmente rastreando versão). **A fonte da
> verdade é o git + este doc, NUNCA a memória.** Toda sessão nova começa lendo:
> (1) `git log --oneline -3` e `git tag`, (2) este arquivo, (3) `CLAUDE.md`,
> (4) a spec da frente atual. Ao terminar uma frente, ATUALIZAR este arquivo.
>
> Última atualização: 2026-07-13.

## 🔴 REGRA DE OURO (o furo recorrente)

- **NUNCA cravar número de versão ou "o que está no ar" de cabeça.** Rodar
  `git tag | sort -V | tail` e `git log --oneline -3` ANTES de falar de versão.
- **Produção deploya por TAG** (painel Configurações > Atualização aplica `vX.Y.Z`).
  O working tree local do assistente NÃO é a produção. Confirmar sempre pela tag.
- **Nunca taggear sem o Robson confirmar o número.** Tag é imutável — nunca reusar.
- **Build falho = fail-safe:** o painel aborta e mantém a versão anterior. Antes de
  entregar comando de release, revisar estático (ler interface/DTO INTEIRO antes de
  construir objeto — já queimou a v0.9.47 por não ler `ToolExecutionContext` todo).
- **Bump `CONTENT_VERSION`** no seed do assistente sempre que mudar o prompt/roteiro,
  senão não re-aplica no assistente já semeado.

## ✅ Versão em produção

> Detalhe por versão está no `CHANGELOG.md` (fonte da verdade por tag). Aqui só o ESTADO vigente.
> Confirmar a versão real SEMPRE com `git tag | sort -V | tail`.

> ⚠️ **Destravamento de release (2026-07-19):** a produção ficou presa em `c7afd43` (era v0.9.74) porque
> a **Frente 6 nunca foi commitada** e as tags **v0.9.75/v0.9.76/v0.9.77 foram empurradas no commit errado**
> (apontam pro `c7afd43`, sem código novo — **queimadas, não reusar**). A v0.9.77 queimou numa 2ª tentativa
> em que o `.git/index.lock` travado bloqueou o commit mas a tag saiu mesmo assim. Destravado seguindo pra
> frente: **v0.9.78 = Frente 6 + fundação do catálogo HSM** (com `db push`); **v0.9.79 = piloto Studio UX**
> (isolado). Ao aplicar pelo painel, a produção sai da era v0.9.74 direto pra v0.9.79.

- **v0.9.74 era a última NO AR** até o destravamento acima. O assistente ISP (**NETE**) está completo e
  validado em produção até a **frente 5**:
  - Identifica (documento > telefone) → **diagnóstico determinístico** contrato→login → status online/offline.
  - **Abre OS** via atendimento (`su_ticket` + processo do assunto) → **encaminha pra fila de Suporte**.
  - **Bloqueado por inadimplência** → **desbloqueio de confiança AUTÔNOMO** (o ERP é o porteiro) → 2ª via → **fila Financeiro**.
  - **Link público de pagamento** `/pagar/:token` (gerado na hora, expira, sem login) com valor/vencimento,
    boleto **vencido marcado**, linha digitável copiável e botão "Abrir boleto ou pagar com QR Code".
- **Prompt: `CONTENT_VERSION v29`** (`isp-example-assistant.seed.ts`). **Bump SEMPRE** que mexer no
  roteiro/persona/system_prompt, senão não re-aplica no assistente já semeado.
- **PIX inline DEFERIDO** (decisão do Robson: "quero trabalhar outra realidade depois; por ora está bom").
  O `get_boleto tipo=dados` do IXC **NÃO** carrega o EMV — a op `financeiro.boleto_pix` + `findPixEmv`
  (detecção pelo FORMATO do BR Code) está pronta mas volta vazio. Falta o endpoint certo do
  "Copiar código PIX" do IXC (recon: F12→Network no botão, ou doc da API). Por ora o PIX vem pela
  página da Efí (botão do boleto). **Não é bloqueio.**

### 🎨 Adoção do Studio UX — onde está (2026-07-26)

Frente de UI em curso, **paralela e independente** do backend/assistente acima. Estado completo em
[`docs/adocao-studio-ux.md`](adocao-studio-ux.md) (documento vivo, com a tabela de regras do DS e as
armadilhas). Resumo para re-ancorar:

- **Casca `AppShell` + Dashboard** no DS desde a v0.9.80; toast global do DS desde a v0.9.84.
- **Famílias migradas:** IA Studio (v0.9.84→v0.9.91), ISP (v0.9.92), **Automação INTEIRA**
  (A: v0.9.99 · B: v0.10.2 · C: v0.10.4), **WhatsApp INTEIRA** (v0.10.9 — 11 arquivos) e
  **Integrações INTEIRA** (v0.10.11 — 6 arquivos viraram 9).
- **Faltam:** Configurações (5), Recursos (2), Desenvolvedor (2) — todas
  lista+form, sem layout especial.
- **A conexão tem rota própria** (v0.10.11): `/integracoes/conexoes/:id`, `/:id/editar` e `/nova`
  (que aceita `?provider=<chave>`, é assim que o Marketplace manda para lá). O `?open=<id>` da
  v0.10.10 sobrevive só como encaminhamento. "Descobrir recursos" é **aba** da conexão, não modal.
- **Os mapas de estado de Integrações declaram `tone` direto**, sem `lib/tone.js`. É o caminho de
  saída da ponte: cada família que migrar deve fazer o mesmo. A ponte engole papel desconhecido no
  `|| 'neutral'` — foi assim que "credencial vencida" ficou cinza por meses.
- **DS consumido: `^1.2.32`.** A migração já rendeu 23 releases do próprio Studio UX — a regra é
  **evoluir o DS primeiro** e só então o consumidor; nunca improvisar no `platform-admin`.
- **Tela de trabalho contínuo usa `fullBleed`** do AppShell (v1.2.31) e `flex: 1` — **nunca**
  `calc(100dvh - Xrem)`. A lista de rotas full-bleed vive no `Layout.jsx` (`FULL_BLEED_PATHS`).
- **A conversa do WhatsApp tem cores fixas de propósito** (convenção do aplicativo). No escuro ela
  fica clara — decisão pendente em `docs/divida-tecnica.md` (`DT-005`). Não "conserte" achando que é
  sobra do padrão antigo.
- **Campos do composer de WhatsApp** vivem em `pages/WhatsApp/composer/` (gravador de áudio, barra de
  gravação, anexo). Coisa nova de composer entra ali, não no `MessageComposer`.
- **Uma cor de ação no painel todo** (v0.10.3): `--ap-accent` e a cor `brand` do Tailwind herdam
  `--su-action`. Não cravar hex de cor de ação em lugar nenhum — trocar o accent tem que mudar
  tela migrada e não-migrada junto.
- **Conteúdo compartilhado entre as duas vistas do fluxo:** os campos de configuração de um passo
  vivem em `pages/Automacao/editor/NodeFields.jsx`. Eram dois renderizadores e **já tinham
  divergido** (o tipo `agent` só existia no canvas). Campo novo entra ali, não na tela.
- **Três containers, não dois** (DS v1.2.24): **Modal** = leitura/campo curto · **rota** = registro que
  existe por si · **inspetor** (`Drawer`) = propriedade de item dentro de um editor, sem URL própria,
  com o contexto precisando ficar à vista. Foi assim que a configuração de um passo do fluxo saiu do
  Modal sem virar rota (ela é rascunho da sessão até salvar uma versão).
- **Armadilha que mais custou: PROP MORTA.** React não avisa prop desconhecida em componente próprio.
  `<Badge tone>` ficou 47 vezes sem efeito (badge cinza em 19 arquivos, telas já validadas) até o DS
  v1.2.22 aceitar o nome. **Conferir a assinatura real do componente antes de usar prop "óbvia".**
  Variante pior: prop repassada pro DOM — `<Checkbox>rótulo</Checkbox>` mandava `children` pro
  `<input>` e derrubava a página inteira (tela branca em `/automacao/calendarios/novo`, DS v1.2.23).
  **Tela branca em rota nova = prop no lugar errado; abra o console antes de investigar API.**
- **Dívida técnica do produto agora tem casa própria:** [`docs/divida-tecnica.md`](divida-tecnica.md)
  (DT-001…DT-004). Critério do Robson (2026-07-25): **o que não é responsabilidade do DS sai do doc
  de adoção e vive na dívida técnica do IA Studio.** Abertos hoje: ajuda de variáveis no editor de
  template, assimetria `workflow`/`env`/`now` no template, `DELETE` de base de conhecimento,
  "Ativar imediatamente" do MCP.

### 🧠 Lições que se repetem (re-ancorar antes de codar)
- **ID de infra a IA NUNCA escolhe** (conexão/setor/assunto/fila) — vem da CONFIG curada ou auto-resolve
  pelo escopo. Regra no CLAUDE.md (Governança). Bugs que vieram de violar isso: conexão="torre3pratinha"
  (login), setor="suporte" (palavra), "Departamento destino".
- **Gotcha de NULL no SQL:** `{ not: X }`/`NOT` em campo ANULÁVEL exclui os NULOS (`NULL=X`→NULL→falso).
  Sempre OR com `null` explícito. Queimou o marcador da IA (v0.9.66→v0.9.71: conversa nova, owner nulo).
- **IXC erra calado:** `IN` grande devolve vazio; `rp` trunca sem avisar; `online` vem "SS"; `get_boleto
  dados` não traz PIX. Validar contra dado real; nunca presumir número plausível.
- **Deploy worker-first:** o `upgrade.sh` reinicia `iastudio-worker` ANTES do `iastudio-api` — tool nova
  só existe no worker após restart. `db push` destrutivo roda sozinho na fase PRISMA_PUSH.
- **Git do sandbox às vezes STALE** (working-tree diverge dos canônicos, diff falso): confiar no
  **Read/Edit** pro conteúdo e nos **tags/log** do git pra versão.
- **Config de OS:** setor = `su_ticket_setor` (departamento: Financeiro=1, Suporte=2), NÃO `empresa_setor`;
  assunto = um com processo (`id_processo`) vinculado. Recon base Newnet (cliente id 2): contrato ativo
  `status='A'`, login ativo `radusuarios.ativo='S'`, endereço quase sempre herdado do cliente.

## 🎯 O que estamos construindo agora

Redesenho do comportamento do assistente ISP, guiado por
`docs/spec-assistente-isp-atendimento.md` (spec travada com o Robson).
**Uma frente por vez, com plano aprovado antes de codar e diff mostrado antes do deploy.**

Decisões travadas: **A** = endereço do login se houver, senão do contrato ·
**B** = criar filas "Setor Financeiro" e "Setor de Suporte" por config (evitar
"supervisão") · **C** = página de pagamento entra junto com o financeiro.

## 📋 Frentes (ordem aprovada)

1. **Diagnóstico determinístico (contrato→login)** — ✅ **FEITA E VALIDADA no WhatsApp de ponta a
   ponta** (v0.9.50→v0.9.56). Tool `diagnosticar_conexao` + `IspDiagnosisService`: sistema decide
   as etapas, modelo só apresenta. Fluxo completo confirmado: saudação reconhece o número →
   identifica (documento manda sobre telefone) → escolhe contrato (plano+nº+endereço) → escolhe
   login → status offline/desde → abre OS (login/setor/status certos, origem=Cliente). Ver README
   isp + CHANGELOG v0.9.50–v0.9.56. **Recon fixado (base Newnet, cliente id 2):** contrato ativo =
   `status='A'`; login ativo = `radusuarios.ativo='S'`; login→contrato via `id_contrato`; endereço
   quase sempre HERDADO (`endereco_padrao_cliente='S'`); `online` erra calado ("SS").
2. **Abrir OS via ATENDIMENTO do IXC** — ✅ **FEITA E VALIDADA** (v0.9.57–59; chamado 3935 abriu com
   contrato+endereço+tudo certo no IXC). O
   `os.cadastrar` do IXC agora faz `gerar_protocolo_atendimento` → insere `su_ticket` com o
   **assunto que tem processo vinculado** ("O.S. OPA SUITE") → o processo abre a OS com contrato+
   endereço. **Recon fixado:** o processo NÃO vem em `id_wfl_processo` (nem é exposto `su_wfl_processo`)
   — vem do ASSUNTO (`su_oss_assunto.id_processo` + `obrigar_processo_atendimento`; ex.: assunto 27
   LENTIDÃO → processo 1 O.S. OPA SUITE). **Setor = `su_ticket_setor`** (departamento: Financeiro=1,
   Suporte=2), NÃO `empresa_setor`. Métodos: `abrirAtendimento` + `gerarProtocolo` no ixc.provider.
   **PENDÊNCIA de config:** re-descobrir recursos + re-escolher setor(departamento)+assunto(com processo).
3. **Filas de setor (Financeiro/Suporte) + handoff do bot para a fila** — ✅ **FEITA E VALIDADA**
   (v0.9.60–64; chamado 3943 abriu + IA encaminhou pra fila de Suporte). `encaminhar_para_fila` +
   `handoffToQueue` (bot-autorizado) + seed das filas + mapa setor→fila em `system_settings` + UI de
   mapeamento (ISP → Abertura de chamado). LIÇÃO: a config de OS **não tem cache** (lê do banco), mas
   o "Departamento destino" que travou era o **worker com estado antigo** (config `setor=4` de antes do
   re-pick) — o restart do deploy resolveu. Config de OS: setor = `su_ticket_setor` (departamento), não
   `empresa_setor`; assunto = um com processo (id_processo) vinculado.
4. **Desbloqueio de confiança + bloqueado → fila financeiro** — ✅ **FEITA E VALIDADA** (v0.9.71;
   Carleia bloqueada → desbloqueio autônomo 5 dias → 2ª via → fila Financeiro). Rotina PROATIVA na
   identificação (roda o diagnóstico, não menu genérico). `desbloqueio_confianca` autônomo
   (`requires_approval:false`, ERP é o porteiro). Diagnóstico expõe `contrato.bloqueado`
   (`status_internet`≠'A'). **PIX inline ficou deferido** (ver "Versão em produção").
5. **Página pública de 2ª via/pagamento (porte Aquapark)** — ✅ **FEITA E VALIDADA** (v0.9.73–74;
   `/pagar/:token` abriu com os boletos da Carleia). Modelo `IspPaymentLink` (token+snapshot+TTL, sem
   sessão JWT), `@Public GET /isp/pagamento/:token` (410 genérico), tool `gerar_link_pagamento`, config
   na tela ISP (`isp.pagamento.*`). Decisões: janela + TTL 24h configurável + snapshot.
6. **Alerta de incidentes** (registrar + previsão + notificar equipe via WhatsApp) — ✅ **IMPLEMENTADA**
   (aguardando `db push` + deploy + validação humana; ver CHANGELOG v0.9.75). O que faltava era a perna
   **alerta à EQUIPE** (a infra pré-existente avisava cliente/operador in-app). Feito: `IspTeamAlertService`
   (destinatários = membros da equipe de plantão com telefone + opt-in; envio via `whatsapp-smart-send`,
   template fora da janela, 1:1) + `isp-scope.util` (rótulo + hash de dedup) + `registerDetectedAnomaly`/
   `alertTeamForIncident`/`fireTeamAlert` no `isp-incidents.service`. Gatilho REATIVO na `status_regiao`
   (agora devolve `situacao` higienizada, limiar da config; sem % cru) + o cron reusa o mesmo alerta. Config
   `isp.equipe.incidente`/`limiar_pct`/`template`/`cooldown_min` (tela ISP → Abertura de chamado). Roteiro:
   nova situação "anomalia_regiao" (CONTENT_VERSION **v30**). **PENDÊNCIA operacional:** criar/publicar na
   Meta o template HSM do alerta e apontá-lo na config; cadastrar telefones dos usuários e ligar o opt-in.

**Padrão de telefone (transversal, entrou junto na v0.9.75):** `components/ui/PhoneInput` (seletor de país,
E.164 sem `+`) agora OBRIGATÓRIO em todo campo de telefone; backend com `normalizePhoneFromUser`/
`normalizePhoneFromWhatsApp` (troca da heurística ingênua que corrompia estrangeiro). Porte do delivery-system.
Pendência do Robson: rodar o mesmo ajuste nos outros sistemas (prompt de propagação entregue).

## 🧹 Pendências técnicas conhecidas (não urgentes)

- **Catálogo de templates HSM (padrão do Aquapark) — IA Studio NÃO tem.** A regra nova no `CLAUDE.md`
  exige um catálogo nativo de templates prontos-pra-publicar (seed no boot + `resolveButtonUrl` das ações
  de botão/links de acesso). O IA Studio hoje só tem CRUD manual de template (`WhatsappTemplate`). **Frente
  própria:** portar o subsistema `whatsapp-template-catalog/` do Aquapark (`catalog.seed.ts` +
  `template-actions.ts` + mapper/service/controller + aba "Templates do Sistema"), semeando os templates do
  ISP como padrões (inclusive o **alerta de incidente** da frente 6). Enquanto não vier, o template do alerta
  é criado manual na Meta e apontado no card "Equipe de plantão".

- **PIX inline** na página de pagamento: falta o endpoint IXC do "Copiar código PIX" (o `get_boleto
  dados` não traz o EMV). Op `financeiro.boleto_pix` + `findPixEmv` prontas — só trocar a chamada.
  Deferido pelo Robson ("outra realidade depois").
- **Backlog do provider IXC** (docs que o Robson subiu, mapear em frentes futuras): viabilidade por
  endereço + inserir LEAD (venda/cobertura); desconectar login + limpar MAC (troubleshooting técnico);
  criar tarefa/interações/disparar-finalizar (atendimento); receber título (baixa manual — admin, não
  é da IA); consultar dados do boleto com juro/multa (valor atualizado — refino da 2ª via).
- Varredura de contratos front↔back: faltam MCP/Política/Memória (campo a mais no
  create/update), Incidente (`auto_detect`), Ambiente (`type`→`kind`), Workspace
  (`slug` obrigatório sem campo na UI). Todos 400 de whitelist. (Custos já corrigido.)
- UX: a Política de aprovação pede "Condição (JSON)" cru — trocar por campos amigáveis.
- `/console` no domínio único: se voltar a redirecionar, é o nginx do servidor sem o
  bloco `location /console/` (o `upgrade.sh` não toca no nginx — é edição no servidor).

## 🔗 Mapa da documentação (o que ler e para quê)

Regras e estado:
- `CLAUDE.md` (raiz) — regra máxima (auto-carregada toda sessão). Inclui doc/código-vivos-sem-lixo e porte-não-reinvente-Aquapark.
- `docs/ESTADO-e-handoff.md` (este) — índice do estado vigente para re-ancorar.
- `CHANGELOG.md` — histórico por versão (a verdade do "o que roda", por tag).

Arquitetura viva:
- `docs/diretrizes-arquiteturais.md` — 58 diretrizes que governam o desenho.
- `docs/deploy-e-versionamento.md` — runbook de deploy/release/backup.
- `RELATORIO-ANALISE-E-ARQUITETURA.md` — **Parte 2** = contrato da API do ERP Altarede (referência viva da integração ISP). Parte 1 é histórico.
- `docs/base-doc-e-portes-aquapark.md` — backlog do que ainda falta portar do Aquapark.

Estado por módulo ("o que existe e como funciona hoje"):
- READMEs em `platform-api/src/modules/*/README.md` (ai, isp, automation, comm, integration, system).

Frente em andamento (andaimes — somem quando a frente conclui + é documentada no README/CLAUDE.md):
- `docs/spec-assistente-isp-atendimento.md` — comportamento do assistente ISP (frentes 1–6; 1–5 feitas, falta a 6 = incidentes).
- `docs/spec-painel-assistente-humanizado.md` — UI do editor do assistente (backlog de casca).

Referência externa (porte-não-reinvente): `../aquapark/`.
