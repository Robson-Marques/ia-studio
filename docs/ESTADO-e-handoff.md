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

- **v0.9.69 engatilhada (aguardando release):** dois ajustes de comportamento do assistente
  (`CONTENT_VERSION` v25) + 1 determinístico. (1) **Boleto vencido marcado pelo sistema:**
  `projectBoleto` (`isp-projections.ts`) calcula `vencido`/`dias_em_atraso` (vencimento < data do
  servidor, só data); roteiro avisa "em atraso há X dias" e oferece 2ª via — SEM afirmar bloqueio
  (contrato pode seguir ativo). Era a Faiani: boleto venc. 10/07 mostrado neutro. (2) **Carrega a
  intenção ao trocar de CPF:** se já pediram algo (boleto etc.) e mandam outro CPF, segue a MESMA
  solicitação pro novo assinante em vez de voltar ao menu genérico. ⚠️ callers de `projectBoleto`
  passam a data via arrow (`.map((b) => projectBoleto(b))`) pra não passar o índice como data.
- **v0.9.68 no ar (à prova de erro de id — LER):** dois fixes da MESMA lição
  (o modelo/config não escolhe id de infra). (1) **Conexão de ERP não vem mais do modelo** —
  removidos `connection_id`/`filial` do schema de TODAS as tools ISP (`isp-tools.ts`); o agente
  auto-resolve pelo escopo (`IspConnectionResolver`, prioridade/tag). Era o bug "Conexão de ERP
  informada não está ativa neste escopo": o modelo passava o LOGIN ("torre3pratinha") como
  conexão. (2) **discover do IXC traz só assunto com processo vinculado** (`ixc.provider.ts`,
  `id_processo`≠0) → operador não escolhe assunto que quebraria a abertura. Regra gravada no
  CLAUDE.md (Governança: "ID DE INFRA A IA NUNCA ESCOLHE"). VALIDADO: chamado 3946 abriu e caiu
  na fila de Suporte (o erro "não está ativa neste escopo" sumiu).
- **v0.9.67 no ar** (tag confirmada): `abrir_os` — setor/assunto SÓ da config (modelo não
  sobrescreve); era o bug intermitente "Departamento destino" (o modelo passava setor="suporte").
- **v0.9.60** (FRENTE 3 — handoff bot→fila de setor). Tool `encaminhar_para_fila` +
  `handoffToQueue`; seed cria "Fila Setor de Suporte/Financeiro" + mapeia em `system_settings`
  (`isp.fila.suporte`/`isp.fila.financeiro`). A IA encaminha de verdade após abrir o chamado.
  Aguardando validação (testar: abrir chamado → conversa vai pra fila de Suporte).
- **v0.9.59 NO AR — FRENTE 2 VALIDADA** (chamado 3935 abriu no IXC com contrato+endereço+tudo certo).
  OS nasce do `su_ticket` (atendimento) → processo do assunto (O.S. OPA SUITE) abre a OS. Fixes até
  fechar: v0.9.57 (fluxo), v0.9.58 (`titulo` obrigatório), v0.9.59 (`id_wfl_processo` do assunto).
  Config: setor = `su_ticket_setor` (departamento); assunto = um com processo vinculado.
- **v0.9.56 NO AR** (confirmado no teste: OS 36530 abriu com origem=Cliente, o fix da origem = v0.9.56).
  OS abre com login/setor/status/origem corretos; **contrato e endereço da OS ainda NÃO preenchem**
  no insert direto → é a frente 2 (OS via atendimento/protocolo). Negrito 1 asterisco OK (um login
  escapou uma vez — regra na persona, se persistir fazer normalize `**`→`*` no envio). **v0.9.55 no ar**
  (login pelo id — OS 36529). **v0.9.54 no ar**
  (fix deploy worker + opções pro cliente escolher). ⚠️ **FRENTE 1 VALIDADA no WhatsApp de ponta a
  ponta** (contrato→login→status offline→oferta de chamado). Só a abertura da OS falhava por passar
  o NOME do login onde o IXC quer o id — corrigido na v0.9.55. **v0.9.55 já reinicia o worker sozinho**
  (o upgrade.sh worker-first da v0.9.54 já está no servidor). O que
  faltava era o **worker rodando código velho**: o `upgrade.sh` reiniciava só o api, não o worker
  (19h sem restart) — a tool nova do diagnóstico não existia no worker. Corrigido no upgrade.sh
  (worker primeiro). **Ao aplicar a v0.9.54, o upgrade.sh EM EXECUÇÃO ainda é o antigo → dar
  `pm2 restart iastudio-worker` manual UMA vez; da próxima em diante é automático.** **v0.9.53
  já no ar** = CONSOLIDAÇÃO do agente: fim da duplicidade de lógica + identificação
  determinística `identificado_por` + persona.name funcional + persona padrão NETE/amigável/
  médias + modelo padrão gpt-5.4). **v0.9.51 já no ar** (identidade doc>telefone) e **v0.9.50**
  (frente 1 + funil). LIÇÃO (crítica do Robson, procede): eu vinha empilhando a mesma regra em
  system_prompt + roteiro + persona (3-6 lugares) em vez de avaliar o agente inteiro — a
  consolidação da v0.9.52 é a casa-única por assunto. Falta o teste limpo do CNPJ (contaminado
  antes por identificação-por-telefone → Fabricia; corrigido na v0.9.51/52). ⚠️ A **v0.9.49 QUEIMOU**: a tag caiu no commit da v0.9.48 porque um
  `.git/index.lock` órfão travou o `git commit` local — nada da frente 1 subiu (confirmado:
  `isp-diagnosis.service.ts` não existia no servidor, `CONTENT_VERSION` em v14). **Lição:** se
  um commit "não pega" (tag aponta pro commit velho), checar `.git/index.lock` e apagar antes.
  Produção real segue em **v0.9.48** (com nome "v0.9.49" no painel). Confirmar sempre pelo que
  o servidor tem, não pelo número do painel.
- **v0.9.48** (confirmar com `git tag`): estrutural completo — aprovar-executa
  (`ApprovalsService.executeApproved`), OS com `origem_endereco` login/cliente
  (nunca Manual), `abrir_os` automático (seed sincroniza `requires_approval` das
  tools builtin), anti-duplicidade de OS por setor, tick azul + "digitando",
  agrupamento de mensagens picadas na origem (`AutomationProcessors`), GPT-5.x na
  API OpenAI (omite temperature / usa `max_completion_tokens`).
- **Prompt do assistente ISP: `CONTENT_VERSION v25`** (carrega a intenção ao trocar de CPF + roteiro avisa boleto vencido/em atraso; v0.9.69). Antes: v24 (negrito sem e-mail/link; v0.9.62). Antes:
  v23 (handoff fila, v0.9.60), v22 (negrito WhatsApp, v0.9.56),
  v21 (mostrar opções, v0.9.54), v20 (abertura reconhece número, v0.9.53), v19 (consolidação, v0.9.52). Estrutura FINAL:
  persona = tom/formato; system_prompt = 3 guardrails; roteiro = casa única do fluxo; identificação
  determinística via `identificado_por`. Ao mexer no comportamento, editar NA CASA CERTA — não
  reintroduzir a mesma regra em 2 lugares. Antes: v18 (identidade, v0.9.51), v17 (funil, v0.9.50). O passo "chegar até o login" usa a tool `diagnosticar_conexao`, que é a **única
  porta** (removidos `consultar_contrato`/`status_conexao` deste assistente — funil). Exemplo
  novo nasce com `gpt-5.5`; o campo Modelo virou dropdown curado (sem texto livre). A v0.9.46
  já deixou a API compatível com gpt-5.x.

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
4. Desbloqueio de confiança pela IA + oferta PIX/boleto; bloqueado → fila financeiro (a fila já existe).
5. Página pública de 2ª via/pagamento (porte Aquapark) — junto com a frente do financeiro.
6. Alerta de incidentes (registrar + previsão + notificar equipe via WhatsApp).

## 🧹 Pendências técnicas conhecidas (não urgentes)

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
- `docs/spec-assistente-isp-atendimento.md` — comportamento do assistente ISP (frentes 1–5).
- `docs/spec-painel-assistente-humanizado.md` — UI do editor do assistente (backlog de casca).

Referência externa (porte-não-reinvente): `../aquapark/`.
