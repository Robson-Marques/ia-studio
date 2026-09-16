# Exportação seletiva para a instância ISP dedicada

Este procedimento migra dados operacionais do SaaS histórico **sem** restaurar o
schema SaaS e sem copiar segredos. Ele é parte do S1 da Capability
`ia-studio.capability.saas-to-dedicated-installation`.

## Princípios obrigatórios

- A instalação SaaS atual é preservada como fonte histórica e rollback.
- Primeiro gera-se e verifica-se o backup completo com `backup-full.sh`.
- A exportação é somente leitura, filtrada pela organização SaaS de origem e
  gravada em NDJSON. Ela não produz SQL importável.
- O destino é uma base dedicada limpa; um importador futuro fará mapeamento
  explícito para o schema dedicado e registrará sua auditoria.
- `integration_secrets`, variáveis de ambiente, chaves, tokens e valores
  decifráveis não são exportados. Credenciais são recriadas no destino.
- Nenhum conjunto de dados é implícito. A seleção é revisada antes da execução.

## Conjuntos permitidos

| Chave | Dados de origem | Observação |
|---|---|---|
| `ISP_CONFIGURATION` | configuração ISP | Configuração operacional, sem credenciais. |
| `ISP_INCIDENT_HISTORY` | incidentes, disparos, alertas e links de pagamento | Pode conter dados operacionais e pessoais; só com necessidade confirmada. |
| `INTEGRATION_METADATA` | metadados de conexões | Não leva o Secret associado. |
| `WHATSAPP_CONFIGURATION` | templates, equipes, filas e vínculos | Sem conversas ou mensagens. |
| `WHATSAPP_HISTORY` | chats, mensagens e eventos | Dados pessoais/sensíveis; deve ser selecionado explicitamente. |
| `AI_CONFIGURATION` | agentes, tools, bases, memória, políticas, regras, budgets e MCP | Importador futuro precisa revisar referências de conexão/usuário. |
| `AUTOMATION_CONFIGURATION` | fluxos, agendas, calendários e templates | Importador futuro precisa revisar referências e estados ativos. |

Relações filhas que não carregam `organization_id` não são inferidas pelo
exportador. Elas entram somente quando o importador dedicado tiver uma regra de
mapeamento, integridade e auditoria própria.

## Execução controlada

1. Gere o backup completo da origem e guarde o arquivo fora do destino.
2. Crie um arquivo de seleção com as chaves aprovadas, uma por linha.
3. Execute o exportador com a `SOURCE_DATABASE_URL` apenas no ambiente de origem.
4. Arquive o diretório gerado e valide `source-backup.sha256`, `checksums.sha256`
   e `manifest.json` antes de qualquer importação.

Exemplo de seleção deliberada:

```text
ISP_CONFIGURATION
WHATSAPP_CONFIGURATION
```

O comando completo está no cabeçalho de
`scripts/migration/export-isp-operational-data.sh`. Não passe credenciais como
argumento de linha de comando.

## Fora de escopo deste exportador

- Criar o banco dedicado ou importar os arquivos.
- Converter senhas, tokens, secrets ou variáveis de ambiente.
- Recriar organização, workspace, ambiente, plano, licença, billing, trial,
  metering ou quaisquer equivalentes SaaS.
- Selecionar dados em nome do cliente sem revisão operacional.
