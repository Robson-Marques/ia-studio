# Base do IA Studio via doc do Aquapark — regras amarradas + backlog de porte

> Origem: 10/07/2026. Decisão do Robson: o Aquapark já está à frente e tem as
> regras bem amarradas na doc; o IA Studio reinventa e bate nos mesmos bugs
> porque o CLAUDE.md dele é raso (71 linhas vs 1583 do Aquapark). Este documento
> é a **base**: mapeia cada categoria de regra do Aquapark ao estado do IA
> Studio e lista o que portar — para parar de descobrir buraco por print.

## Princípio-mãe desta frente

**Quando o Aquapark já tem algo funcionando e testado, PORTA — não reinventa.**
Reinventar do zero é repetir bugs já resolvidos lá. Vale para código (upgrade,
canvas, composer WhatsApp, tela de Atualização) e para regra (a doc). Só se
constrói do zero o que o IA Studio tem de genuinamente novo (multi-tenant,
Provider Registry, declarativo) — e mesmo aí, herdando os padrões.

## Lições desta sessão que DEVEM virar regra amarrada (as que doeram)

| Lição | O que aconteceu | Regra a fixar no CLAUDE.md |
|---|---|---|
| **Porte, não reinvente** | Refiz a tela de upgrade do zero e caí no start/stop de polling que o Aquapark já tinha resolvido com polling contínuo. | Antes de construir algo que o Aquapark tem, LER o equivalente lá e portar. |
| **Erro silencioso é o pior** | `try/catch` do vite engolia a falha de caminho e caía em `package.json` (v0.1.0). O IXC "erra calado": `IN` grande devolve vazio, `rp` trunca, `online` mal lido. | Desconfiar de todo resultado "plausível". Nunca `catch` que engole e devolve fallback sem sinal. Validar contra dado real. |
| **Arquivar ≠ excluir (por caso)** | Fluxo só arquivava; rascunho descartável virava lixo permanente. | "Nunca excluir, só arquivar" vale para o que tem histórico/referência. Rascunho sem uso → excluir de verdade. Não aplicar o dogma cegamente. |
| **UX humana em TODA tela** | Editor de automação vazava `TRIGGER_EVENT`, "Event Bus", campo de assistente vazio. | Já virou regra máxima; aplicar no canvas e nas telas técnicas também. |
| **Verificar de ponta a ponta** | Buracos funcionais (campo vazio, tipo cru) passaram por auditorias que só olhavam listas/forms. | Auditoria de UX cobre o CANVAS e os editores, não só telas de lista. |

## Mapa: regra do Aquapark → estado no IA Studio → ação

Legenda: ✅ já amarrada · 🟡 existe rala (expandir) · ❌ falta (portar) · ⬜ não se aplica

| Categoria (Aquapark) | IA Studio | Ação |
|---|---|---|
| Idioma pt-BR | ✅ | — |
| Banco: schema fonte única, sem migration, `db push` | ✅ | — |
| Banco: multi-tenant `organization_id`/workspace/environment | ✅ (IA Studio tem, Aquapark não) | — |
| Modularização "um arquivo, uma pergunta" + sinais de split | 🟡 (1 linha) | Expandir com sinais de split/não-split e estrutura do módulo |
| Padrões de código: UTF-8, sem `any`, sem console.log, class-validator | 🟡 | Expandir (encoding, `@Auditable`, eventos payload mínimo) |
| UX: toast obrigatório, sem confirm nativo | ✅ | — |
| UX: 5 patrasques em ação destrutiva | ✅ | — |
| UX: componentes ui/, CSS vars, responsivo | ✅ | — |
| UX: linguagem do usuário (regra máxima) | ✅ | Reforçar "vale no canvas/editor também" |
| Deploy: release git+tag, build só no servidor, não reusar tag | 🟡 | Expandir com as fases do upgrade e o "porte, não reinvente" |
| **Sistema de versão/upgrade (fases, polling, reload)** | 🟡 código / ❌ doc | **Portado o polling do Aquapark (v0.9.24).** Documentar o padrão. |
| Backup/restore + migração de servidor | 🟡 | Documentar o que existe (`backup-full`/`restore-full`) |
| Engineering thinking rules (checklist de 18 pontos antes de codar) | ❌ | **Portar** — é a rede que evita feature incompleta |
| Navigation rules (sidebar/tabs/breadcrumbs) | 🟡 | Expandir |
| ACL rules (5 passos p/ perm nova, gating front+back) | 🟡 | Expandir com os 5 passos explícitos |
| UI patterns (componentes obrigatórios, listagem responsiva, estados) | 🟡 | Expandir |
| Feature completion rules ("definição de pronto") | ❌ | **Portar** — checklist backend/front/mobile/ACL/nav/doc |
| Evolução gradual + Execution governance (1 frente/vez, checkpoint) | 🟡 | Expandir com "sweeps não triviais", "checkpoint entre frentes" |
| Estado de entidades (state machines, status derivado) | 🟡 | Documentar as state machines que existem |
| Eventos globais do sistema (tabela evento→listeners) | ❌ | **Criar** a tabela de eventos do IA Studio |
| Automation & AI governance (workflow=dado, canvas=visual, node=def+exec) | ✅ | — |
| Dívida técnica — registro ativo | ❌ | Criar `docs/divida-tecnica.md` |
| Sicoob/D4Sign/boleto | ⬜ | Não se aplica (IA Studio é genérico) |

## Ordem de porte proposta (uma por checkpoint)

1. **CLAUDE.md — âncoras críticas primeiro:** "porte não reinvente", "erro
   silencioso", "arquivar vs excluir", Engineering Thinking Rules, Feature
   Completion Rules. (Baixo risco — é doc.)
2. **Tabela de Eventos Globais do IA Studio** (evento → emitter → listeners).
3. **State machines documentadas** (as que existem em `shared/state-machines`?).
4. **`docs/divida-tecnica.md`** — registro ativo (os itens da auditoria de UX
   pendentes entram aqui).
5. Expandir Navigation/ACL/UI patterns com os detalhes enforçáveis.

Nenhum item aqui é feature nova — é amarrar a base. Depois disso, a lista de
UX pendente (Conhecimento/RAG, Auditoria, console, Números) e a IA-responde-no-
WhatsApp entram com a rede montada.
