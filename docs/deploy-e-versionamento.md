# Deploy e versionamento — vertentes dedicadas

O repositório IA Studio é a estrutura-base. Cada cliente recebe uma vertente em
repositório Git próprio, com identidade, módulos e ciclo de versões próprios.
O host pode executar várias aplicações independentes — incluindo outros produtos
da Nivoo — mas não há uma aplicação SaaS compartilhada nem uma coleção de cópias
idênticas sob um único checkout.

## Contrato de uma aplicação instalada

Uma vertente é instalada com um `app-id` explícito. O instalador clona a tag do
**repositório da própria vertente** para `/opt/<app-id>` e deriva os demais
recursos exclusivamente desse identificador:

- configuração: `/etc/iastudio/apps/<app-id>.env`;
- dados e storage: `/var/lib/iastudio/apps/<app-id>`;
- backups: `/var/backups/iastudio/apps/<app-id>`;
- PostgreSQL: role e banco `iastudio_<app_id>`;
- Redis: DB explícito e prefixo `iastudio:<app-id>`;
- PM2, lock e vhost: nomes exclusivos da aplicação;
- domínio e porta HTTP: recusados se já pertencerem a outro produto do host.

`app-id` não representa tenant, workspace nem cliente dentro da aplicação. É
somente a identidade operacional de uma instalação de uma vertente já dedicada.

## Preparar uma nova vertente

1. Parta de uma tag da estrutura-base e crie no GitLab o repositório da
   vertente, por exemplo `newnet-ia-studio`.
2. Aplique nesse repositório somente os módulos, integrações e identidade
   aprovados para aquele cliente.
3. Versione a vertente em uma tag própria. Atualizações futuras dessa aplicação
   consultam apenas esse mesmo `origin`.

Criar a vertente é uma decisão de produto e repositório; o instalador não cria
branches nem escolhe módulos por conta própria.

## Replicar a base de referência

A tag de referência é uma fotografia completa da vertente Newnet, inclusive os
módulos ISP/IXC. Para iniciar uma nova aplicação, crie primeiro um diretório e
repositório próprios a partir de uma tag estável. Não reutilize o checkout, o
`app-id`, os recursos ou os scripts de upgrade da instalação Newnet.

Antes de adaptar a cópia, consulte `docs/base-replicavel.md`. A matriz desse
documento identifica a vertical Newnet que pode ser avaliada em uma tarefa
futura para outro segmento, mas não autoriza remoção automática. A nova
vertente deve ter contrato aprovado, alterações versionadas, build no servidor
e smoke test próprios antes de ganhar uma tag estável.

## Recriar o ambiente de desenvolvimento do zero

Não há dados a preservar no ambiente atual. A tag que materializa este contrato
inclui um removedor de migração limitado aos dois ambientes descartáveis
`ia-dev` e `ia-teste`; ele não aceita outros identificadores e não toca em
Finanças, Mercado, Redis de outros DBs, certificados ou demais produtos do host.

Execute primeiro a prévia e só então a remoção confirmada:

```bash
bash scripts/uninstall-discarded-dev-apps.sh --dry-run
bash scripts/uninstall-discarded-dev-apps.sh --remove --confirm RESET-IASTUDIO-DEV
```

Depois, clone temporariamente a tag da **vertente Newnet** em um diretório que
não seja o destino de produção:

```bash
git clone --branch <tag-da-vertente> <url-git-da-vertente> \
  /opt/newnet-ia-studio-source
cd /opt/newnet-ia-studio-source
```

Instale a aplicação limpa a partir dessa fonte:

```bash
bash scripts/install.sh \
  --app-id newnet-ia-studio \
  --domain <dominio-newnet> \
  --admin-email <email-admin> \
  --admin-password '<senha-forte>' \
  --redis-db <db-livre-0-a-15> \
  --email <email-ssl> \
  --source-dir /opt/newnet-ia-studio-source \
  --source-revision <tag-da-vertente> \
  --gitlab-token '<token-do-registry-@studio-ux-ds>'
```

O checkout temporário é somente fonte de instalação; a aplicação em execução
fica em `/opt/newnet-ia-studio`. Depois da validação ele pode ser removido.

## Atualizar uma aplicação instalada

A atualização normal acontece pelo painel local em **Configurações →
Administração da instalação**. O processo consulta as tags do repositório da
vertente instalada, cria backup próprio, compila e reinicia somente seus
processos. Em caso de falha, a aplicação permanece na revisão anterior.

Na instalação Newnet que possui ConnectChat em `/opt/connectchat-newnet`, a
mesma ação também aplica a mesma tag no serviço ConnectChat. A etapa usa a
chave de deploy já existente em `/root/.ssh/connectchat_deploy`, cria o backup
criptografado do Chat, executa suas migrações, reconstrói os containers e só
conclui após `GET /v1/health` responder saudável. IA Studio e ConnectChat
continuam com bancos, processos, volumes e segredos separados; a tag conjunta
é uma coordenação de release, não uma fusão de runtime.

Uso manual excepcional:

```bash
bash /opt/newnet-ia-studio/scripts/upgrade.sh \
  --to <tag-da-vertente> --upgrade-id <uuid> \
  --repo-path /opt/newnet-ia-studio
```

## Backup, restauração e remoção

- `backup-full.sh` e `restore-full.sh` só leem o `.env` da aplicação em que
  vivem e usam lock por `app-id`.
- Backup contém segredos necessários para restaurar dados cifrados; mantenha o
  arquivo com permissões restritas e armazenamento seguro.
- Dados SaaS históricos, quando existirem, usam o fluxo seletivo auditável e
  nunca são restaurados diretamente na aplicação dedicada.
- A remoção exige confirmação literal e só atua na aplicação indicada:

```bash
bash /opt/newnet-ia-studio/scripts/uninstall.sh \
  --app-id newnet-ia-studio --confirm newnet-ia-studio
```

PostgreSQL, Redis, Nginx, PM2, certificados e aplicações de outros produtos são
preservados.

## Versionamento

Cada repositório de vertente possui seu próprio histórico e tags. Uma tag é
criada somente após commit e validação dos gates; a aplicação da tag no host é
uma ação explícita pelo painel local. Nunca reutilize uma tag existente.
