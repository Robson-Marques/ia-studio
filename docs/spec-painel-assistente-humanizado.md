# Spec — Humanizar o painel do assistente (porta do Aquapark)

> Origem: 09/07/2026. Robson achou o painel de IA confuso; referência são os
> prints do Aquapark em `aquapark-api/public/help-media/ia-studio-*`.
> Prioridade escolhida: **painel intuitivo primeiro** (a IA responder no
> WhatsApp é outra frente — o "fio" que ainda não existe).

## Princípio (não clonar — extrair a lógica)

Não copiar o Aquapark pixel a pixel. Extrair **por que** ele é intuitivo: o
painel fala a língua do dono do provedor, não a do programador. A pessoa
descreve o atendente que quer ("Quem é", "O que faz", "O que pode fazer") e o
sistema traduz para `persona`, `system_prompt` e `allowed_tools` por baixo. Onde
o IA Studio já for melhor (arquitetura declarativa, multi-tenant), mantém-se — a
humanização é da superfície, não da fundação.

## Dois caminhos até o agente (distintos, o mesmo agente)

1. **Turnkey** — toggle "IA responde no WhatsApp" (Ajustes gerais). Um listener
   pega o inbound, agrupa mensagens, decide se aquele contato é atendido pela IA,
   chama o agente e responde. Para quem quer ligar e usar.
2. **Automação** — fluxo no canvas: gatilho `whatsapp.inbound.message` → nó
   Agente → enviar WhatsApp. Para quem quer filtrar/ramificar/orquestrar.

O turnkey é açúcar sobre o que o fluxo faz à mão. O IA Studio já tem o nó Agente
(e a Frente A fez ele carregar o `scope`); falta o listener (caminho 1) e o
gatilho de inbound alimentar o `scope_keys` (fecha o caminho 2). **Essa é a outra
frente** — não esta.

## O que o Aquapark faz (observado nos prints)

**Menu IA Studio:** Assistentes / Conhecimento / Pendências / Painel / Ajustes
gerais / Automações. (Hoje o IA Studio: Agentes / Bases de Conhecimento /
Memória / Ferramentas / Aprovações / Custos — vocabulário técnico.)

**Novo assistente:** escolha de modelo — Atendimento / Vendedor / Concierge /
Do zero (templates que pré-preenchem persona + roteiro + ferramentas).

**Editor em abas humanas:**
- **Visão geral** — checklist "pronto para publicar?" (tem nome / tem objetivo /
  sabe responder (opcional) / tem habilidades) + dica do próximo passo.
- **Quem é** — persona: nome que a IA usa, tom, emojis, tamanho das respostas,
  Sempre / Nunca (uma regra por linha). ⇢ já existe no backend (`persona`).
- **O que faz** — Objetivo + **Passos (na ordem)** + **Situações (Quando… faça…)**.
  Não se escreve prompt cru; o sistema compila. ⇢ hoje é textarea `system_prompt`.
- **O que sabe** — bases de conhecimento. ⇢ existe.
- **O que pode fazer** — ferramentas como checkboxes com rótulo amigável, marca
  "grava dados" nas de ação; e "Ações autorizadas" (permissões) embaixo, com a
  trava anti-escalada "você só concede o que você mesmo tem". ⇢ `allowed_tools`
  + `action_permissions` (este último hoje sem UI).
- **Follow-up** — por assistente (herda o geral). ⇢ não existe ainda.
- **Quem atende** — roteamento; depende de um interruptor GERAL em Ajustes gerais.
- **Testar** — execução embutida. ⇢ já existe.
- **Ajustes avançados** — modelo, temperatura, conexão, passos, memória, limites.

## Mapa: campo Aquapark → backend IA Studio (já existe)

| Aba | Campo | Coluna `AiAgent` |
|---|---|---|
| Quem é | persona completa | `persona` Json ✅ |
| O que faz | objetivo | `goal` ✅ |
| O que faz | passos + situações | **novo** `roteiro Json?` (compila p/ `system_prompt`) |
| O que sabe | bases | `knowledge_base_ids` ✅ |
| O que pode fazer | ferramentas | `allowed_tools` ✅ |
| O que pode fazer | ações | `action_permissions` ✅ (falta UI) |
| Ajustes avançados | modelo/temp/conexão | `model`/`temperature`/`connection_id` ✅ |

**Quase tudo já existe.** O trabalho é de CASCA, não de fundação — exatamente o
tipo de mudança de baixo risco que não deveria gerar refatoração.

## Fatiamento (1 fatia por checkpoint)

**Fatia 1 — Reorganização das abas (SEM tocar no save).** Renomear/reagrupar as
9 abas técnicas nas 8 humanas; adicionar "Visão geral" (checklist derivado do
form, sem estado novo); "O que pode fazer" mostra nome amigável + "grava dados"
(= `requires_approval`). Guardrails+Custos+Memória+conexão/modelo viram "Ajustes
avançados". Nenhuma mudança de schema, nenhuma mudança no corpo do save. Risco
mínimo. **← começa aqui.**

**Fatia 2 — "O que faz" estruturado.** Nova coluna `AiAgent.roteiro Json?`
(`{ objetivo, passos[], situacoes[] }`) + compilador puro `agent-roteiro.ts`
(espelha `agent-persona.ts`) que injeta no system prompt. UI de Passos/Situações.
`db push` nullable (não destrutivo). Checkpoint.

**Fatia 3 — "O que pode fazer": Ações autorizadas.** UI de `action_permissions`
a partir de um catálogo (endpoint das permissões que o próprio ator possui —
respeita a anti-escalada). Checkpoint.

**Fatia 4 — Templates no "Novo assistente"** (Atendimento/Vendedor/Concierge/Do
zero) — pré-preenchem persona+roteiro+tools. Barato depois da Fatia 2.

**Fatia 5 — Menu** renomeado para o vocabulário humano (Assistentes/Conhecimento/
…), com redirecionamentos dos caminhos antigos. Toca navegação → sprint própria.

Follow-up e "Quem atende" dependem do subsistema de atendimento (a outra frente)
— ficam para depois dela.

## Não-metas desta frente
- Fazer a IA responder no WhatsApp (frente separada; é o listener de inbound).
- Mexer no backend de execução do agente (a Frente A já cobriu o escopo).
