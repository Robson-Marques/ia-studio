# ESTADO DO TRABALHO — handoff entre sessões (LER PRIMEIRO)

> Este arquivo existe porque a memória do assistente é compactada em sessões
> longas e ele perde o fio (principalmente rastreando versão). **A fonte da
> verdade é o git + este doc, NUNCA a memória.** Toda sessão nova começa lendo:
> (1) `git log --oneline -3` e `git tag`, (2) este arquivo, (3) `CLAUDE.md`,
> (4) a spec da frente atual. Ao terminar uma frente, ATUALIZAR este arquivo.
>
> Última atualização: 2026-07-12.

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

- **v0.9.54** engatilhada (fix deploy: worker reinicia no upgrade + diagnóstico mostra opções pro
  cliente escolher, contrato com plano+nº+endereço). ⚠️ **FRENTE 1 VALIDADA no WhatsApp** (o
  diagnóstico listou os 5 contratos da Newnet pra escolher — funcionou de ponta a ponta). O que
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
- **Prompt do assistente ISP: `CONTENT_VERSION v21`** (mostrar opções pro cliente escolher; v0.9.54).
  Antes: v20 (abertura reconhece o número, v0.9.53), v19 (consolidação, v0.9.52). Estrutura FINAL:
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

1. **Diagnóstico determinístico (contrato→login)** — ✅ FEITA (v0.9.49, aguardando
   validação no WhatsApp). Tool `diagnosticar_conexao` + `IspDiagnosisService`: sistema
   decide as etapas, modelo só apresenta. Ver README do módulo isp + CHANGELOG v0.9.49.
   **Recon fixado (base real Newnet, cliente id 2):** contrato ativo = `status='A'`;
   login ativo = `radusuarios.ativo='S'`; login→contrato via `id_contrato`; endereço
   quase sempre HERDADO (`endereco_padrao_cliente='S'`, campos vazios) → rótulo por
   plano/login+referência, endereço só se próprio. `online` erra calado ("SS"). Borda
   conhecida: contratos com plano idêntico ficam com rótulo igual (revisar se incomodar).
2. **PRÓXIMA:** Filas de setor (Financeiro/Suporte) + handoff do bot para a fila.
3. Desbloqueio de confiança pela IA + oferta PIX/boleto; bloqueado → fila financeiro.
4. Página pública de 2ª via/pagamento (porte Aquapark) — junto com a frente 3.
5. Alerta de incidentes (registrar + previsão + notificar equipe via WhatsApp).

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
