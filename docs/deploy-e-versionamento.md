# Deploy e versionamento — instâncias dedicadas

Cada instalação do IA Studio é independente. Não há deploy SaaS compartilhado,
Console, banco `iastudio_db`, processos PM2 globais ou vhost `/console/`.

## Pré-requisitos do host

- Debian com PostgreSQL, Redis, PM2, Nginx, Node e `git`.
- Um domínio, uma porta HTTP livre e um banco Redis (`0`–`15`) por instância.
- Checkout Git limpo usado somente como fonte para criar instâncias.

## Primeira conversão no servidor de desenvolvimento

O checkout SaaS legado é preservado como fonte/histórico; seu banco não recebe
`db push`, restore nem mudança de schema. A primeira instância dedicada nasce
em banco limpo sob `/opt/iastudio/instances/<instance-id>`.

Depois de obter a tag desta conversão, execute no checkout legado:

```bash
bash scripts/upgrade.sh --bootstrap-dedicated --to <tag> \
  --instance-id ia-dev --domain ia-dev.exemplo.com \
  --admin-email admin@exemplo.com --admin-password '<senha-forte>' \
  --redis-db 1 --email ops@exemplo.com
```

Esse modo clona a tag para a nova instância e chama o instalador dedicado. Ele
não lê, altera, move, restaura ou reaproveita o checkout ou banco SaaS anterior.

## Nova instância no mesmo host

```bash
cd /opt/iastudio
bash scripts/install.sh \
  --instance-id cliente-b --domain cliente-b.exemplo.com \
  --admin-email admin@cliente-b.exemplo.com --admin-password '<senha-forte>' \
  --redis-db 2 --email ops@exemplo.com --source-revision <tag>
```

O instalador cria diretório, role/banco PostgreSQL, Redis DB/prefixo, storage,
backup, nomes PM2 e vhost exclusivos. Ele materializa o schema somente a partir
de PostgreSQL vazio, sob lock transacional.

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
