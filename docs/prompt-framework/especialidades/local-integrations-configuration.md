---
schema: prompt-framework/v1
id: ia-studio.local-integrations-configuration
kind: task
version: 1.0.0
status: released
title: Configurar integrações locais da instalação dedicada
extends: workflow.system-change-base@1.1.0
policy_refs:
  - ia-studio.project-rules
  - ia-studio.source-of-truth
inputs:
  - approved_alignment_report
  - provider_catalog
  - connection_contract
outputs:
  - local_integration_change
  - validation_evidence
  - checkpoint
owners: [robson]
reviewers: [robson]
reviewed_at: "2026-10-05"
released_at: "2026-10-05"
change_reason: Cria a especialidade aprovada no relatório de alinhamento para governar providers embarcados e conexões locais sem reinstalar um catálogo SaaS.
---

# Configurar integrações locais da instalação dedicada

## Missão

Governar mudanças no catálogo interno de providers e no ciclo de vida de
conexões da instalação dedicada, para que um sistema já embarcado seja
configurado diretamente como conexão, sem reintroduzir curadoria, instalação
por organização ou outro comportamento SaaS.

## Contexto aceito

- `approved_alignment_report`: relatório aprovado que delimita a mudança.
- `provider_catalog`: Registry e definições que descrevem providers disponíveis
  e os campos de configuração de cada um.
- `connection_contract`: módulo, schema e superfícies que criam, testam, ativam
  ou desativam conexões e seus segredos.

## Conhecimento e referências

- `workflow.system-change-base@1.1.0`: execução coesa, validação e checkpoint.
- `CLAUDE.md`: instalação dedicada, Provider Registry, Secrets Manager, ACL e
  documentação viva.
- `docs/diretrizes-arquiteturais.md`: fronteiras de integração aplicáveis.
- `platform-api/src/modules/integration/README.md`: contrato vivo do módulo de
  integrações.
- Rotas, menu e telas de `platform-admin/src/pages/Integracoes/`: superfície
  administrativa das conexões.

## Responsabilidades

- Mapear o fluxo real entre Registry, catálogo interno, conexões, segredos, ACL
  e a superfície administrativa antes de alterar comportamento.
- Preservar conexões, segredos, logs e histórico operacional existentes; uma
  conexão nunca é apagada apenas por uma mudança de catálogo.
- Fazer a criação de conexão partir de providers embarcados e implementados,
  usando seus metadados internos para renderizar o wizard correto.
- Remover estados, permissões, rotas e textos que só existam para uma etapa
  SaaS de curadoria ou instalação, somente após confirmar seus consumidores.
- Manter erros explícitos, loading, estado vazio, permission gates e auditoria
  das mutations sensíveis.
- Atualizar a documentação viva e o CHANGELOG junto com a mudança.

## Limites e restrições

- Não criar provider, contrato de API externa, credencial ou integração nova.
- Não reintroduzir organização, workspace, ambiente, Console, billing ou
  catálogo SaaS.
- Não expor segredos nem mudar o Secrets Manager.
- Não excluir conexões, logs, recursos ou dados persistidos sem decisão
  explícita e uma migração segura aprovada.
- Não trocar o Provider Registry por imports diretos de SDK ou API externa.
- Não confundir remover uma superfície viva com faxina de código morto; o
  comportamento novo precisa de validação de ponta a ponta proporcional.

## Processo

1. Ler o alinhamento aprovado e as fontes vivas do módulo afetado.
2. Inventariar providers, definições, conexões, permissões, rotas, menus,
   schema e consumidores do estado a mudar.
3. Desenhar a alteração mínima que preserva dados e deixa a configuração de
   conexão como única ação operacional do usuário.
4. Alterar backend, frontend, ACL e persistência somente quando cada fronteira
   necessária estiver confirmada; não usar sweep cego.
5. Validar criação, edição, teste e ativação de uma conexão, inclusive erros e
   usuários sem permissão.
6. Atualizar documentação, CHANGELOG e emitir checkpoint objetivo.

## Formato de saída

Resposta em pt-BR com resultado primeiro, arquivos alterados, evidências de
validação, riscos ou pendências reais e checkpoint. Quando houver impacto no
host, incluir comandos PowerShell de commit/tag/push e indicar a atualização
pelo painel da instalação.

## Critérios de aceite

| Caso | Resultado esperado |
|---|---|
| Provider embarcado e implementado | Pode ser escolhido diretamente ao criar uma conexão |
| Provider indisponível | Não aparece como opção configurável e informa motivo claro |
| Conexão existente | Continua acessível, testável e preserva seus segredos e logs |
| Usuário sem permissão | Não vê nem executa mutation de conexão |
| Remoção de estado SaaS | Não deixa rota, menu, ACL, texto ou consumidor órfão |
| Alteração concluída | Documentação viva, CHANGELOG e validação técnica proporcional atualizados |

## Registro de revisão

| Versão | Estado | Revisão | Impacto |
|---|---|---|---|
| 1.0.0 | released | Aprovado por Robson em 2026-10-05 | Especialidade local criada após relatório de alinhamento para substituir o fluxo de instalação SaaS pela configuração direta de conexões. |
