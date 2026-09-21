# Auditoria de prontidão — antes da prova operacional do S4

- **Data:** 2026-09-21
- **Especialidade:** `ia-studio.dedicated-instance-operations@1.0.0` (via `workflow.prompt-alignment@2.4.0`)
- **Capability:** `ia-studio.capability.saas-to-dedicated-installation` (estado `in-progress`)
- **Recorte:** prontidão da superfície operacional dedicada (install/upgrade/backup/restore/uninstall, gates, isolamento, deploy por tag/painel, segurança operacional, docs vivos). **Não** cobre auditoria linha-a-linha da API (domínio/ACL de todos os módulos) nem LGPD a fundo — áreas ainda não catalogadas.
- **Veredito:** **GO** para a prova operacional do S4. Os dois bloqueios levantados nesta auditoria (Achados nº 1 e nº 2) foram corrigidos; os quatro gates rodam verdes. Segue o checklist de host abaixo.

## Método

- Os quatro gates (`verify-dedicated-cut`, `verify-operational-dedicated`, `verify-console-retirement`, `verify-instance-isolation`) **executados** contra os scripts e a árvore reais (`platform-api/src`/`platform-admin/src`), com ripgrep presente — todos `EXIT=0`.
- Leitura dirigida de todos os scripts operacionais e da lib de contrato de instância.
- Isolamento por instância derivado de `scripts/lib/instance.sh` e conferido pela função `derive()` do próprio gate S4 (dois ids distintos).

## Achados

### Nº 1 — CRÍTICO (bloqueava o S4) — CORRIGIDO em v0.11.14

O comentário adicionado em `scripts/provision-dedicated-schema.sh` (v0.11.10) continha, em prosa, os literais da flag de perda de dados e do comando de sincronização de schema do Prisma. O gate `verify-instance-isolation.sh` proíbe esses literais por `rg` (sem distinguir comentário de código), então acusava dois falsos positivos e falhava (`EXIT=1`). Não havia impacto operacional (o `provision` sempre usou `migrate diff`, nunca sincronização de schema), mas a evidência do S4 ficava vermelha.

**Correção aplicada (v0.11.14):** comentário reescrito em prosa neutra, sem os tokens literais. Gate volta a `EXIT=0`. Sem mudança de comportamento.

### Nº 2 — CRÍTICO (evidência dos gates) — CORRIGIDO em v0.11.15

Ao rodar os quatro gates num host **sem ripgrep**, a evidência mentia: o S1 usa `rg ... || true` e ficava **falso-verde**, enquanto S2/S3/S4 usam `rg ... || fail` e ficavam **falso-vermelhos**. A ausência da ferramenta se confundia com falha de conteúdo — exatamente o que aconteceu na primeira execução no host (`ia-dev`), diagnosticada só depois como ripgrep ausente; instalado o ripgrep (14.1.1), os quatro passaram verdes.

**Correção aplicada (v0.11.15):** cada gate passa a exigir o `rg` logo após `set -euo pipefail` (`command -v rg ... || { echo 'ERRO: ripgrep (rg) é obrigatório...'; exit 2; }`). Sem a ferramenta, o gate para com `exit 2` (erro de ambiente) e mensagem clara, em vez de mascarar de verde ou vermelho. Com ripgrep presente, os quatro seguem `EXIT=0`.

### Nº 3 — MÉDIO (segurança operacional): o pacote de backup contém segredos em claro

`backup-full.sh` grava no `manifest.json` (dentro do `.tar.gz`) `ENCRYPTION_KEY`, `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL` e credenciais Google, em texto claro — por design (o destino precisa decifrar os secrets AES na restauração). O arquivo sai com `chmod 600`. **Risco:** o pacote de backup é material sensível; se sair do host sem proteção, expõe todos os segredos da instância. **Recomendação:** documentar explicitamente que o pacote deve ser guardado cifrado/restrito e, idealmente, cifrar o `.tar.gz` na origem ou exigir destino seguro. Não bloqueia o S4, mas deve constar na operação.

### Nº 4 — INFO: motores dormentes

Gemini/Ollama (LLM) e os providers WhatsApp Baileys seguem registrados por baixo, sem card no marketplace (retirados em v0.11.11/v0.11.12). Sem risco operacional imediato; são alvo explícito da frente de faxina de código/arquivos mortos (política dormente a definir: excluir de verdade vs. arquivar).

### Nº 5 — INFO: token de registry por instância

`GITLAB_PACKAGE_TOKEN` é gravado no `.env` de cada instância (`chmod 600`). É o mesmo segredo de build em todas as instâncias; aceitável, mas registrar a rotação num único lugar seria desejável no futuro.

## O que está correto (verificado)

- **Isolamento por instância completo.** Cada recurso é derivado do `instance-id`: diretório (`/opt/iastudio/instances/<id>`), banco/role (`iastudio_<key>`), Redis DB (explícito, recusado se ocupado) + prefixo (`iastudio:<id>`), PM2 (`iastudio-<id>-api`/`-worker`), vhost (`iastudio-<id>`), backup, log, porta (`3000+redis-db`, com checagem de colisão) e lock (`/var/lock/iastudio-<id>.lock`). O gate confere isso para dois ids distintos.
- **`iastudio_meta` é local ao banco dedicado** de cada instância (não compartilhado) — sem colisão entre instâncias.
- **Scripts operacionais seguros:** lock por instância; sem aceite automático de perda de dados no install/upgrade; backup antes de qualquer upgrade; rollback em falha (evita "release fantasma"); degradação explícita, sem fallback silencioso; nenhum recurso global fixo (gate confirma).
- **`uninstall-legacy-saas`:** prévia obrigatória + confirmação literal; recusa remover a role legada se ela tiver outros bancos; preserva PostgreSQL/Redis/PM2/Nginx e os demais produtos do host.
- **`db_url_for_psql`** aplicado em todos os scripts que falam com o PostgreSQL (upgrade/backup/restore) — a normalização do `?schema` é fonte única na `lib`.
- **Correções da sessão presentes e coerentes:** descoberta de porta do PostgreSQL, token do registry na instalação, permissão do web root do painel, bookkeeping fora do `public`.
- **`ecosystem.config.js`, `install.sh`, `uninstall.sh`** corretos (wrappers; PM2 parametrizado por env, lança erro se faltar variável de instância).
- **Gates blindados contra ambiente:** exigem ripgrep e param com erro claro na ausência dele (não mais falso-verde/falso-vermelho).

## Go / No-Go para o S4

**GO.** Os dois bloqueios (Achados nº 1 e nº 2) estão corrigidos e os quatro gates rodam verdes (`EXIT=0`) com ripgrep presente.

Checklist de isolamento no host para a prova (segunda instância vs. `ia-dev`, sem cruzamento):

- diretório `/opt/iastudio/instances/<b>` distinto;
- banco `iastudio_<b>` e role própria; `iastudio_meta` dentro do banco de `<b>`;
- Redis DB diferente do da `ia-dev` (e prefixo `iastudio:<b>`);
- processos PM2 `iastudio-<b>-api/-worker` distintos e online;
- porta HTTP distinta (derivada do `--redis-db`);
- vhost/domínio próprio, sem sobrescrever o da `ia-dev`;
- backup/log próprios;
- operar `<b>` (upgrade/backup/restore) **não** afeta a `ia-dev`.
