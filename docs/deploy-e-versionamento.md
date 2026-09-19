# Deploy e versionamento — instâncias dedicadas

Cada instalação do IA Studio é independente. Não há deploy SaaS compartilhado,
Console, banco `iastudio_db`, processos PM2 globais ou vhost `/console/`.

## Pré-requisitos do host

- Debian com PostgreSQL, Redis, PM2, Nginx, Node e `git`.
- Um domínio, uma porta HTTP livre e um banco Redis (`0`–`15`) por instância.
- Checkout Git limpo usado somente como fonte para criar instâncias.

## Refazer o servidor de desenvolvimento do zero

Não há dados a preservar neste ambiente. A primeira instância dedicada nasce em
banco limpo sob `/opt/iastudio/instances/<instance-id>`, depois de remover o
legado somente pelo script restrito abaixo. Ele não toca nos demais produtos do
host.

Crie primeiro um checkout temporário da tag. Ele continuará disponível depois
da remoção de `/opt/iastudio` para executar o bootstrap:

```bash
git clone --branch <tag> https://github.com/Robson-Marques/ia-studio.git \
  /opt/iastudio-bootstrap-<tag>
cd /opt/iastudio-bootstrap-<tag>
```

## Remover o SaaS legado (somente quando o ambiente puder ser refeito)

Não use o antigo `uninstall.sh`: ele tinha modo de purge global e poderia afetar
outros produtos instalados no servidor. Primeiro confira a prévia:

```bash
bash scripts/uninstall-legacy-saas.sh --dry-run
```

Se a lista mostrar apenas o legado esperado, execute a remoção restrita:

```bash
bash scripts/uninstall-legacy-saas.sh --remove --confirm LEGACY-IASTUDIO
```

Ele só remove `/opt/iastudio`, `/opt/iastudio-backups`, banco/role
`iastudio_db`/`iastudio`, os dois processos PM2 históricos e vhosts
`iastudio*`. Redis, Node, PostgreSQL, PM2, Nginx, SSL e as aplicações
`ctrl-leads` e `financas-pessoais` permanecem intactos.

Com a remoção concluída, ainda no checkout temporário, crie a primeira
instância dedicada:

```bash
bash scripts/upgrade.sh --bootstrap-dedicated --to <tag> \
  --instance-id ia-dev --domain ia-dev.exemplo.com \
  --admin-email admin@exemplo.com --admin-password '<senha-forte>' \
  --redis-db 1 --email ops@exemplo.com \
  --gitlab-token '<token-do-registry-@studio-ux-ds>'
```

Esse modo clona a tag para a nova instância e chama o instalador dedicado.
Depois da validação, o checkout temporário pode ser removido; ele não é uma
instância em execução.

## Nova instância no mesmo host

```bash
cd /opt/iastudio
bash scripts/install.sh \
  --instance-id cliente-b --domain cliente-b.exemplo.com \
  --admin-email admin@cliente-b.exemplo.com --admin-password '<senha-forte>' \
  --redis-db 2 --email ops@exemplo.com --source-revision <tag> \
  --gitlab-token '<token-do-registry-@studio-ux-ds>'
```

O instalador cria diretório, role/banco PostgreSQL, Redis DB/prefixo, storage,
backup, nomes PM2 e vhost exclusivos. Ele materializa o schema somente a partir
de PostgreSQL vazio, sob lock transacional. A porta PostgreSQL é descoberta no
cluster local e validada por TCP antes de criar qualquer recurso da instância;
ela não é presumida como `5432`. O build do platform-admin usa o registry
privado `@studio-ux-ds` (`git.nivoo.dev.br`); o `--gitlab-token` (ou a variável
`GITLAB_PACKAGE_TOKEN`) é obrigatório e fica gravado no `.env` da instância para
os upgrades seguintes.

## Atualização de uma instância já dedicada

Pelo painel local ou via script, informe uma tag e o `upgrade-id` criado no
registro local. O upgrade só aceita uma instância cuja configuração contenha
`IASTUDIO_INSTANCE_ID`; alterações destrutivas de schema falham explicitamente,
sem `--accept-data-loss` automático.

```bash
bash /opt/iastudio/instances/ia-dev/scripts/upgrade.sh \
  --to <tag> --upgrade-id <uuid> \
  --repo-path /opt/iastudio/instances/ia-dev
```

## Backup, rollback e remoção

- `backup-full.sh` / `restore-full.sh` operam apenas a instância indicada pelo
  `.env` local e usam lock por ID.
- Dados SaaS antigos só seriam preservados por `backup-saas-historical.sh`; como
  o ambiente atual não possui clientes ou dados operacionais aprovados para
  migração, esse caminho não é executado nesta primeira instalação.
- Remova uma instância com confirmação explícita:

```bash
bash scripts/uninstall.sh --instance-id cliente-b --confirm cliente-b
```

Dependências do host e outras instâncias são preservadas.

## Versionamento

Uma tag é criada somente após commit e validação dos gates. A tag não realiza
deploy por si só neste repositório; a aplicação da tag é uma ação explícita no
host, pelos comandos acima. Nunca reutilize uma tag existente.
