# Conectar a IA do IA Studio pela conta ChatGPT (Codex CLI)

## Objetivo

Além das Connections OpenAI/Anthropic por API Key, a instalação dedicada oferece
**ChatGPT — Codex CLI (conta)**, reaproveitando a integração oficial empregada
no `nivoo-ai-manager`: `codex login --device-auth` e `codex exec --json`.

Não é um proxy da API Chat Completions, não aceita cookies de sessão e não
transforma uma assinatura ChatGPT em créditos de API. O uso permanece sujeito
aos limites e termos da conta.

## Instalação e autenticação

1. Instale o CLI oficial no host onde o `platform-api` executa:
   `npm install -g @openai/codex` (Node 22 recomendado).
2. Garanta que o usuário do serviço PM2 consiga executar o binário no `PATH`.
   Se necessário, aponte o caminho absoluto em `IASTUDIO_CODEX_BIN`.
3. No IA Studio: **Integrações → Conexões → Nova conexão →
   ChatGPT — Codex CLI (conta)**; dê um nome e salve.
4. Clique em **Entrar com ChatGPT** e abra
   `https://auth.openai.com/codex/device`. Informe o código exibido.
5. Clique **Testar e ativar**. Se o login estiver válido, a Connection fica ACTIVE.
6. No agente de IA, selecione essa Connection e configure o modelo Codex
   compatível com sua conta, ou use `default` para respeitar o padrão do CLI.

O binário oficial mantém os tokens no `CODEX_HOME` da Connection, em
`~/.iastudio-codex-connections/<connection-id>` (ou
`IASTUDIO_CODEX_HOME_ROOT`), com criação em modo 0700. Não copiar os
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

- **Não executar o processo PM2 como root** em instalações expostas a usuários
  ou conteúdo não confiável. `--sandbox read-only` evita escrita pelo Codex,
  mas não é uma garantia absoluta contra leitura de arquivos acessíveis ao
  usuário Unix. Para isolamento mais forte, rodar a execução em worker Unix
  dedicado com HOME e acesso a arquivos restritos.
- Requer suporte funcional a sandbox/namespaces na hospedagem. Se a sandbox
  falhar, a execução deve falhar; não usar `--dangerously-bypass-approvals-and-sandbox`.
- Não armazenar saída bruta do login, código após uso nem mensagens em logs
  públicos; nenhuma credencial é recuperada de `auth.json` pelo aplicativo.
- O login por código expira em 15 minutos e pode ser cancelado.
- Nenhuma alteração em WAHA, Prisma, atualizador, migrations ou outros serviços.
- Testar a autenticação/execução com a conta autorizada antes de selecionar
  a Connection em agentes que respondem automaticamente no WhatsApp.
