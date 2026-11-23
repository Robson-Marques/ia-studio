# Auditoria de prontidão — antes da prova operacional do S4

- **Data:** 2026-09-21
- **Especialidade:** `ia-studio.dedicated-instance-operations@1.0.0` (via `workflow.prompt-alignment@2.4.0`)
- **Capability:** `ia-studio.capability.saas-to-dedicated-installation` (estado `in-progress`)
- **Recorte:** prontidão da superfície operacional dedicada (install/upgrade/backup/restore/uninstall, gates, isolamento, deploy por tag/painel, segurança operacional, docs vivos). **Não** cobre auditoria linha-a-linha da API (domínio/ACL de todos os módulos) nem LGPD a fundo — áreas ainda não catalogadas.
- **Veredito:** **NO-GO** até corrigir o Achado nº 1 (gate S4 vermelho) e rodar os quatro gates verdes no bootstrap. Depois disso, **GO** com o checklist de host abaixo.

## Método

- Gate S4 (`verify-instance-isolation.sh`) **executado** no container contra os scripts reais (rg 14.1.0).
- Leitura dirigida de todos os scripts operacionais e da lib de contrato de instância.
- Isolamento por instância derivado de `scripts/lib/instance.sh` e conferido pela função `derive()` do próprio gate (dois ids distintos).
- Gates S1/S2/S3 (`verify-dedicated-cut`, `verify-operational-dedicated`, `verify-console-retirement`) conferidos por leitura das asserções; a execução real exige a árvore `platform-api/src`/`platform-admin/src` e fica recomendada no bootstrap/CI.

## Achados

### Nº 1 — CRÍTICO (bloqueia o S4): a v0.11.10 deixou o gate S4 vermelho

O comentário adicionado em `scripts/provision-dedicated-schema.sh` (v0.11.10) contém, em prosa, os literais `--accept-data-loss` e `prisma db push`. O gate `verify-instance-isolation.sh` proíbe esses literais por `rg` (sem distinguir comentário de código), então acusa dois falsos positivos e falha:

```
FALHA: instalação ou atualização dedicada não pode aceitar perda de dados automaticamente.
FALHA: provisionamento dedicado deve usar migrations a partir de banco vazio, não db push.
EXIT=1
```

Evidência de que é só o comentário: reescrevendo-o (sem os literais), o gate passa — `S4 isolamento: aprovado estaticamente` / `EXIT=0`. Não há impacto operacional (o `provision` continua usando `migrate diff`, nunca `db push`), mas a **evidência do S4 está vermelha**.

**Correção proposta:** reescrever o comentário sem os tokens literais (prosa neutra). Sem mudança de comportamento.

### Nº 2 — MÉDIO (evidência): gates S1/S2/S3 não re-rodados nesta auditoria

Precisam da árvore `platform-api/src`/`platform-admin/src` para rodar. Estavam verdes no registro (S1 100% em 2026-09-15). **Recomendado** rodar os quatro no checkout do bootstrap antes do S4:

```bash
cd /opt/iastudio-bootstrap
for g in verify-dedicated-cut verify-operational-dedicated verify-console-retirement verify-instance-isolation; do
  echo "== $g =="; bash scripts/migration/$g.sh || echo "FALHOU: $g"
done
```

### Nº 3 — MÉDIO (segurança operacional): o pacote de backup contém segredos em claro

`backup-full.sh` grava no `manifest.json` (dentro do `.tar.gz`) `ENCRYPTION_KEY`, `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL` e credenciais Google, em texto claro — por design (o destino precisa decifrar os secrets AES na restauração). O arquivo sai com `chmod 600`. **Risco:** o pacote de backup é material sensível; se sair do host sem proteção, expõe todos os segredos da instância. **Recomendação:** documentar explicitamente que o pacote deve ser guardado cifrado/restrito e, idealmente, cifrar o `.tar.gz` na origem ou exigir destino seguro. Não bloqueia o S4, mas deve constar na operação.

### Nº 4 — BAIXO: v0.11.13 (docs) pendente de aplicação

O checkpoint de docs (ESTADO + contrato) foi gravado no working tree; confirmar `commit + tag v0.11.13` aplicado para o handoff refletir o estado real.

### Nº 5 — INFO: motores dormentes

Gemini/Ollama (LLM) e os providers WhatsApp Baileys seguem registrados por baixo, sem card no marketplace (retirados em v0.11.11/v0.11.12). Sem risco; removíveis num refactor futuro se desejado.

### Nº 6 — INFO: token de registry por instância

`GITLAB_PACKAGE_TOKEN` é gravado no `.env` de cada instância (`chmod 600`). É o mesmo segredo de build em todas as instâncias; aceitável, mas registrar a rotação num único lugar seria desejável no futuro.

## O que está correto (verificado)

- **Isolamento por instância completo.** Cada recurso é derivado do `instance-id`: diretório (`/opt/iastudio/instances/<id>`), banco/role (`iastudio_<key>`), Redis DB (explícito, recusado se ocupado) + prefixo (`iastudio:<id>`), PM2 (`iastudio-<id>-api`/`-worker`), vhost (`iastudio-<id>`), backup, log, porta (`3000+redis-db`, com checagem de colisão) e lock (`/var/lock/iastudio-<id>.lock`). O gate confere isso para dois ids distintos.
- **`iastudio_meta` é local ao banco dedicado** de cada instância (não compartilhado) — sem colisão entre instâncias.
- **Scripts operacionais seguros:** lock por instância; sem `--accept-data-loss` automático no install/upgrade; backup antes de qualquer upgrade; rollback em falha (evita "release fantasma"); degradação explícita, sem fallback silencioso; nenhum recurso global fixo (gate confirma).
- **`uninstall-legacy-saas`:** prévia obrigatória + confirmação literal; recusa remover a role legada se ela tiver outros bancos; preserva PostgreSQL/Redis/PM2/Nginx e os demais produtos do host.
- **`db_url_for_psql`** aplicado em todos os scripts que falam com o PostgreSQL (upgrade/backup/restore) — a normalização do `?schema` é fonte única na `lib`.
- **Correções da sessão presentes e coerentes:** descoberta de porta do PostgreSQL, token do registry na instalação, permissão do web root do painel, bookkeeping fora do `public`.
- **`ecosystem.config.js`, `install.sh`, `uninstall.sh`** corretos (wrappers; PM2 parametrizado por env, lança erro se faltar variável de instância).

## Go / No-Go para o S4

**NO-GO** enquanto o Achado nº 1 não for corrigido (gate S4 verde) e os quatro gates não rodarem verdes no bootstrap.

Após isso, **GO** para a prova operacional, com este checklist de isolamento no host (segunda instância vs. `ia-dev`, sem cruzamento):

- diretório `/opt/iastudio/instances/<b>` distinto;
- banco `iastudio_<b>` e role própria; `iastudio_meta` dentro do banco de `<b>`;
- Redis DB diferente do da `ia-dev` (e prefixo `iastudio:<b>`);
- processos PM2 `iastudio-<b>-api/-worker` distintos e online;
- porta HTTP distinta (derivada do `--redis-db`);
- vhost/domínio próprio, sem sobrescrever o da `ia-dev`;
- backup/log próprios;
- operar `<b>` (upgrade/backup/restore) **não** afeta a `ia-dev`.
