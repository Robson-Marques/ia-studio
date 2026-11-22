---
schema: prompt-framework/v1
id: ia-studio.autonomous-technical-support
kind: task
version: 1.0.0
status: released
title: Evoluir suporte técnico autônomo
extends: workflow.system-change-base@2.1.0
policy_refs:
  - ia-studio.project-rules
  - ia-studio.source-of-truth
inputs:
  - approved_alignment_report
  - technical_support_capability
  - verified_operational_sources
outputs:
  - autonomous_support_change
  - decision_tests
  - checkpoint
owners: [robson]
reviewers: [robson]
reviewed_at: "2026-11-21"
released_at: "2026-11-21"
change_reason: Cobrir a evolução aprovada da Nete de fluxo por mensagem para suporte N2 orientado a caso, evidência e experimento.
---

# Evoluir suporte técnico autônomo

## Missão

Transformar o atendimento técnico da Nete em investigação persistente baseada
em evidências, hipóteses, ações e experimentos observáveis, reutilizando as
integrações e políticas existentes.

## Contexto aceito

- Capability Contract do suporte N2 vigente.
- Código real do condutor ConnectChat, runtime de assistentes e módulo ISP.
- Operações e limitações comprovadas do IXC e do ConnectChat.

## Conhecimento e referências

- `CLAUDE.md` e `docs/ESTADO-e-handoff.md`.
- `platform-api/src/modules/isp/README.md`.
- `docs/capabilities/nete-autonomous-technical-support.md`.
- Runtime do AquaPark apenas como referência de padrões reutilizáveis de
  agente, escopo de ação e entrega; regras ISP permanecem originais desta vertente.

## Responsabilidades

- Persistir o caso técnico separado da conversa e do histórico do assinante.
- Registrar fonte, horário, disponibilidade e escopo de cada evidência.
- Manter hipóteses como hipóteses e selecionar ações que reduzam incerteza.
- Acompanhar experimentos por vários turnos e por observação agendada.
- Reconsultar fontes quando a ação do cliente puder alterar o estado técnico.
- Preservar identidade, autorização, idempotência, auditoria e minimização.
- Validar decisões e ações, não apenas o texto apresentado ao cliente.

## Limites e restrições

- Não inventar ONU, potência óptica, OLT, ping, DNS, tráfego ou outra telemetria
  que a integração real não forneça.
- Não permitir que o modelo escolha conexão, cliente, setor ou assunto técnico.
- Não tratar falha de consulta como ausência de OS, chamado, incidente ou bloqueio.
- Não encerrar por estado `online`; resolução exige evidência e confirmação do
  cliente quando aplicável.
- Não reimplementar tools, aprovações ou operações IXC existentes.

## Processo

1. Inventariar código, contratos, fontes e limitações reais.
2. Definir um slice verificável do Capability Contract.
3. Implementar estado persistente e decisões seguras no módulo dono.
4. Conectar somente operações comprovadas, com falha observável.
5. Cobrir caminho principal, contradição, timeout, troca de cliente e falha de fonte.
6. Atualizar documentação viva e checkpoint sem declarar Acceptance antecipada.

## Formato de saída

Resultado em pt-BR com arquivos alterados, decisões comprovadas, verificações,
limitações reais, estado do slice e próximo marco da Capability.

## Critérios de aceite

- O caso sobrevive a mensagens e reinício do processo.
- Uma nova informação pode alterar hipótese, experimento ou próxima ação.
- A observação técnica é refeita após ações relevantes do cliente.
- Falha de fonte permanece explícita.
- Troca ou desvínculo de cliente isola o contexto anterior.
- Testes verificam decisões e transições, não frases exatas do modelo.

