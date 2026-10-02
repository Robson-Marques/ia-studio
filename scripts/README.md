# Scripts operacionais — aplicações dedicadas por vertente

Os scripts operam uma aplicação identificada, nunca uma plataforma compartilhada.
Cada vertente nasce em repositório próprio; sua instalação tem diretório,
banco/role PostgreSQL, Redis, fila, storage, backup, PM2 e vhost próprios.

| Script | Responsabilidade |
|---|---|
| `install.sh` | Encaminha para a instalação dedicada. |
| `install-dedicated.sh` | Clona e instala uma vertente com `--app-id`, domínio, administrador e Redis explícitos. |
| `provision-dedicated-schema.sh` | Inicializa o schema limpo da aplicação informada. |
| `uninstall.sh` / `uninstall-dedicated.sh` | Remove somente a aplicação confirmada; nunca dependências ou recursos de outros produtos. |
| `uninstall-discarded-dev-apps.sh` | Removedor transitório e restrito a `ia-dev` e `ia-teste` do modelo antigo, para reinício limpo do desenvolvimento. |
| `uninstall-legacy-saas.sh` | Remove o SaaS antigo somente após prévia e confirmação literal; preserva serviços compartilhados do host. |
| `upgrade.sh` | Atualiza a aplicação dedicada a partir das tags do repositório da própria vertente. |
| `backup-full.sh` / `restore-full.sh` | Backup e restauração completos da aplicação. O dump usa `--clean --if-exists`; a restauração preserva o schema `public`, garante `pgvector` via administrador do cluster e mantém a aplicação parada se não conseguir recuperar o banco. |
| `migration/export-isp-operational-data.sh` | Exportação seletiva e somente leitura da base histórica. |
| `migration/backup-saas-historical.sh` / `verify-saas-historical-backup.sh` | Snapshot verificável da fonte SaaS, exclusivo para rollback e nunca restaurável no dedicado. |
| `migration/verify-isp-operational-export.sh` | Valida backup, manifesto, checksums, NDJSON e ausência de chaves sensíveis antes da revisão para importação. |
| `migration/verify-instance-isolation.sh` | Gate S4 estático de recursos e locks exclusivos para vertentes independentes. |
| `migration/verify-dedicated-cut.sh` | Gate estrutural S1. |
| `migration/verify-console-retirement.sh` | Gate S3 de retirada do Console e preservação da manutenção local. |

Exemplo de criação:

```bash
bash scripts/install.sh --app-id newnet-isp --domain ia.exemplo.com \
  --admin-email admin@exemplo.com --admin-password 'senha-forte' \
  --redis-db 2 --email ops@exemplo.com --source-revision <tag>
```

O servidor de produção executa os builds. Não há build local obrigatório no
ambiente de desenvolvimento do Robson.

## Atualização e backup

A operação normal começa no painel local, em **Configurações → Administração da
aplicação**. O backend dispara `upgrade.sh` ou os scripts de backup/restauração,
e o painel acompanha o log persistido. Falha é registrada; não há fallback
silencioso nem reversão destrutiva automática.

Install, provisionamento, upgrade, backup e restauração usam lock por `app-id`.
Uma operação concorrente na mesma aplicação falha de forma explícita; vertentes
diferentes não disputam o mesmo lock.

Toda instalação exige tag, `app-id`, domínio, credenciais locais e Redis
explícito. Ela clona a `--source-revision` marcada do repositório da vertente em
`/opt/<app-id>`; no servidor de desenvolvimento que será refeito, execute antes
a remoção restrita do legado ou das aplicações descartáveis.
