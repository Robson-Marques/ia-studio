# Conectar a IA do IA Studio pela conta ChatGPT (Codex CLI)

## Objetivo

Além das Connections OpenAI/Anthropic por API Key, a instalação dedicada oferece
**ChatGPT — Codex CLI (conta)**, reaproveitando a integração oficial empregada
no `nivoo-ai-manager`: `codex login --device-auth` e `codex exec --json`.

Não é um proxy da API Chat Completions, não aceita cookies de sessão e não
transforma uma assinatura ChatGPT em créditos de API. O uso permanece sujeito
aos limites e termos da conta.

## Instalação e autenticação

1. O instalador `scripts/install-dedicated.sh` e o atualizador
   `scripts/upgrade.sh` executam automaticamente o hook opcional
   `scripts/install-codex-cli.sh <app-id>`. Ele cria a conta Unix restrita
   **exclusiva daquela instalação** e instala `@openai/codex` em
   `/opt/iastudio-codex` se o executável ainda não existir. Se npm/rede falhar,
   a atualização principal continua; o painel informa que o CLI está ausente.
   Os logs de atualização usam a etapa `CODEX_CLI`.
2. A API PM2 não executa o Codex diretamente: o launcher faz
   `runuser -u icx-<hash-app-id>`, repassa somente variáveis não sensíveis e
   usa HOME isolado. Não é necessária chave de API.
3. No IA Studio: **Integrações → Conexões → Nova conexão →
   ChatGPT — Codex CLI (conta)**; dê um nome e salve.
4. Clique em **Entrar com ChatGPT** e abra
   `https://auth.openai.com/codex/device`. Informe o código exibido.
5. Clique **Testar e ativar**. Se o login estiver válido, a Connection fica ACTIVE.
6. No agente de IA, selecione essa Connection e configure o modelo Codex
   compatível com sua conta, ou use `default` para respeitar o padrão do CLI.

O binário oficial mantém os tokens no `CODEX_HOME` da Connection, em
`/var/lib/iastudio-codex/<app-id>/<connection-id>`, com criação em modo 0700. Não copiar os
arquivos de autenticação para o banco nem para o frontend.

## Funcionamento

- O `AgentRunner` mantém prompt, persona, conhecimento e histórico existentes.
- O `LlmProviderService` escolhe transporte `codex-cli` só na Connection
  específica; os outros provedores seguem por API.
- Cada chamada usa `codex exec --json --output-schema ... --sandbox read-only`
  em diretório de trabalho temporário; o Codex devolve conteúdo ou propostas
  estruturadas de ferramentas. A execução efetiva de ferramentas continua
  no `ToolRuntimeService` com permissões e aprovação do IA Studio.
- O resultado registra tokens quando informados. `costUsd=0` indica que
  não houve chamada faturada à API OpenAI; não significa uso ilimitado.
- Codex CLI não fornece embeddings por este adaptador: RAG/embeddings
  continuam requerendo um provedor de embedding configurado.
- Duas execuções simultâneas no máximo por instância da API, timeout de
  três minutos; não há fallback silencioso para API paga.

## Segurança e implantação

- Na instalação atual, o PM2 executa como root, mas o processo Codex é sempre
  rebaixado com `runuser` para a conta Unix exclusiva `icx-<hash-app-id>`.
  Sem conta provisionada, a chamada deve falhar, nunca executar como root.
  A sandbox `read-only` é adicional: não substitui a separação Unix.
  Arquivos legíveis globalmente no host continuam potencialmente acessíveis
  a esse usuário; para cargas não confiáveis com risco elevado, considerar
  container/VM com isolamento de rede e filesystem.
- Requer suporte funcional a sandbox/namespaces na hospedagem. Se a sandbox
  falhar, a execução deve falhar; não usar `--dangerously-bypass-approvals-and-sandbox`.
- Não armazenar saída bruta do login, código após uso nem mensagens em logs
  públicos; nenhuma credencial é recuperada de `auth.json` pelo aplicativo.
- O login por código expira em 15 minutos e pode ser cancelado.
- Nenhuma alteração em WAHA, Prisma, atualizador, migrations ou outros serviços.
- A rotina de instalação não executa `codex login` por conta própria: a
  autorização por código de dispositivo continua exclusivamente no painel.
- Testar a autenticação/execução com a conta autorizada antes de selecionar
  a Connection em agentes que respondem automaticamente no WhatsApp.
