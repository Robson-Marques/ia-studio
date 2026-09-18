# Scripts operacionais — instâncias dedicadas

Os scripts operam uma instância identificada, nunca uma plataforma compartilhada.
Cada instalação tem diretório, banco/role PostgreSQL, Redis, fila, storage,
backup, PM2 e vhost próprios. A fonte SaaS anterior é histórica/rollback e não é
alvo de `db push`, restore ou upgrade.

| Script | Responsabilidade |
|---|---|
| `install.sh` | Encaminha para a instalação dedicada. |
| `install-dedicated.sh` | Cria uma instância com `--instance-id`, domínio, administrador e Redis explícitos. |
| `provision-dedicated-schema.sh` | Inicializa o schema limpo da instância informada. |
| `uninstall.sh` / `uninstall-dedicated.sh` | Remove somente a instância confirmada; nunca dependências ou recursos de outros clientes. |
| `upgrade.sh` | Atualiza uma instância dedicada; `--bootstrap-dedicated` cria a primeira instância limpa a partir do checkout histórico sem tocar no banco legado. |
| `backup-full.sh` / `restore-full.sh` | Backup e restauração completos da instância. |
| `migration/export-isp-operational-data.sh` | Exportação seletiva e somente leitura da base histórica. |
| `migration/backup-saas-historical.sh` / `verify-saas-historical-backup.sh` | Snapshot verificável da fonte SaaS, exclusivo para rollback e nunca restaurável no dedicado. |
| `migration/verify-isp-operational-export.sh` | Valida backup, manifesto, checksums, NDJSON e ausência de chaves sensíveis antes da revisão para importação. |
| `migration/verify-instance-isolation.sh` | Gate S4 estático de recursos e locks exclusivos para dois IDs de instância. |
| `migration/verify-dedicated-cut.sh` | Gate estrutural S1. |
| `migration/verify-console-retirement.sh` | Gate S3 de retirada do Console e preservação da manutenção local. |

Exemplo de criação:

```bash
bash scripts/install.sh --instance-id isp-a --domain ia.exemplo.com \
  --admin-email admin@exemplo.com --admin-password 'senha-forte' \
  --redis-db 2 --email ops@exemplo.com
```

O servidor de produção executa os builds. Não há build local obrigatório no
ambiente de desenvolvimento do Robson.

## Atualização e backup

A operação normal começa no painel local, em **Configurações → Administração da
instalação**. O backend dispara `upgrade.sh` ou os scripts de backup/restauração,
e o painel acompanha o log persistido. Falha é registrada; não há fallback
silencioso nem reversão destrutiva automática.

Install, provisionamento, upgrade, backup e restauração usam lock por
`instance-id`. Uma operação concorrente na mesma instalação falha de forma
explícita; instâncias diferentes não disputam o mesmo lock.

O bootstrap da primeira instância exige tag, `instance-id`, domínio, credenciais
locais e Redis explícito. Toda instalação clona uma `--source-revision` marcada
para o próprio diretório; execute o bootstrap a partir de um checkout temporário
da tag, nunca dentro da instalação SaaS que será preservada.
