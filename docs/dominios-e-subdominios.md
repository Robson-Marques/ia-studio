# Endereços (domínios e subdomínios) — como funciona e runbook

> Estado vigente da frente de tenancy por Host. Especialidade que governa:
> `ia-studio.tenant-domains@1.0.0` (`docs/prompt-framework/especialidades/tenant-domains.md`).

## O desenho em uma frase

O **app é a fonte da verdade do registro** de endereços (quem atende em qual host);
o **servidor materializa** esse registro (vhost + certificado) por um script de
operação — **de propósito fora do deploy por tag**, porque o `upgrade.sh` não
toca no nginx.

## As peças

| Camada | Onde | O quê |
|---|---|---|
| Registro | `core_platform_domains` (model `PlatformDomain`) | Um registro por hostname: escopo, superfície, tipo, principal, situação, certificado |
| Regras | `platform-api/.../organizations/domains/platform-domains.service.ts` | Cadastro, classificação subdomínio×domínio próprio, primário único por escopo, auditoria |
| Resolução | `.../domains/host-resolver.service.ts` | Host → contexto (marca/superfície), cache 30s, **degradação graciosa** |
| Contexto público | `GET /api/v1/public/tenant-context` | A tela de login lê para vestir a marca do cliente |
| Gestão | Console → **Endereços** (`/dominios`) | Domínio-base, cadastro, promover principal, remover |
| Ativação | Botão **Verificar e ativar** → `POST /console/domains/:id/activate` | Dispara a operação no servidor (spawn detached, mesmo padrão do `upgrade.sh`) |
| Automático | `DomainVerifyCron` + toggle `platform.domains.auto_verify` | Retenta os pendentes a cada 30 min — **nasce OFF** |
| Operação | `scripts/domains-sync.sh` | Cria o vhost e emite o certificado; aceita `--host` e `--dry-run` |

### Escopo e superfície

- **Escopo** `PLATFORM` (`organization_id` nulo) = endereços do próprio SaaS;
  `ORGANIZATION` = endereço de um cliente.
- **Superfície** `ADMIN` (painel do cliente) · `CONSOLE` · `API` — é o que permite
  **trocar o subdomínio do Console** como um endereço de primeira classe.
- **Tipo** `SUBDOMAIN` (filho do domínio-base → nasce coberto) vs `CUSTOM`
  (domínio próprio do cliente → nasce com token de verificação de posse).

### Isolamento (regra que não se afrouxa)

O Host decide **apenas a apresentação** (marca no login, qual superfície o
endereço serve). Quem governa acesso a dado continua sendo o **JWT +
`organization_id`** em toda query. Host nunca concede acesso a organização
nenhuma. Endereço não cadastrado resolve `null` e o sistema se comporta como a
instalação de domínio único de hoje.

## Runbook — colocar um endereço no ar (pelo painel, sem terminal)

1. **Console → Endereços**: defina o **domínio-base** (uma vez) e cadastre o
   endereço (subdomínio pelo nome, ou domínio próprio completo). Ele nasce em
   *Aguardando DNS*.
2. **DNS**: aponte o host para o IP deste servidor (registro `A`/`AAAA`).
   - Subdomínio seu: crie o registro no domínio-base.
   - Domínio próprio do cliente: **quem cria é o cliente**, no DNS dele.
3. **Clique em "Verificar e ativar"** na linha do endereço. O sistema confere o
   DNS, publica o vhost, emite o certificado e atualiza a situação para *No ar*.
   Se o DNS ainda não propagou, o endereço volta para *Aguardando DNS* — e o
   motivo aparece na própria linha.
4. Opcional: ligue **"Verificar sozinho os endereços pendentes"** (no card do
   domínio-base). A cada 30 min o sistema tenta de novo o que está pendente e
   coloca no ar assim que o DNS propagar. Nasce **desligado** (automatismo é
   opt-in, regra do projeto).

### Fallback por linha de comando (diagnóstico)

O mesmo trabalho pode ser feito no servidor, como root — útil para ver a saída
completa quando algo falha:

```bash
cd /opt/iastudio && bash scripts/domains-sync.sh --dry-run          # confere tudo
cd /opt/iastudio && bash scripts/domains-sync.sh                    # aplica tudo
cd /opt/iastudio && bash scripts/domains-sync.sh --host meu.com.br  # só um
cd /opt/iastudio && bash scripts/domains-sync.sh --pending          # só os que faltam
```

**Console em domínio dedicado:** o build do Console é feito com `base=/console/`
(o `index.html` pede `/console/assets/…` e o router usa `basename=/console/`).
Por isso o vhost de um host `CONSOLE` **redireciona `/` para `/console/`** em vez
de servir o `dist` na raiz — servir na raiz deixa a página **branca** (assets 404
+ rota sem match). Se o vhost já existia de uma versão anterior do script, recrie:
`bash scripts/domains-sync.sh --host console.seudominio.com.br --force-vhost`.

Duas proteções embutidas: o sweep automático usa `--pending` (não re-chama o
certbot em quem já está no ar, poupando o limite do Let's Encrypt) e **um endereço
`ACTIVE` nunca é rebaixado** pelo teste local de DNS — que dá falso-negativo atrás
de NAT/proxy/CDN.

O script pula quem ainda não aponta para cá (evita queimar o limite de emissão
do Let's Encrypt), cria o vhost, roda `nginx -t`, recarrega, emite o certificado
(`--keep-until-expiring`, idempotente) e **grava a situação de volta no registro**.

## Decisões e porquês

- **Certificado por host (HTTP-01), não wildcard.** Wildcard (`*.base`) exige
  desafio **DNS-01**, que exige credencial da API do provedor de DNS. Emitir por
  host com `certbot --nginx` não exige nada além do DNS já apontado, e atende
  igual subdomínio e domínio próprio. Com um plugin de DNS configurado, o
  wildcard vira otimização — não pré-requisito.
- **Fora do deploy por tag.** Aplicar nginx/TLS junto do `upgrade.sh` misturaria
  release com operação e quebraria o fail-safe do painel. São passos separados.
- **O vhost é criado, nunca sobrescrito.** Depois da primeira emissão quem passa
  a ser dono do arquivo é o certbot (o bloco 443/TLS é dele). Reescrever do
  template a cada rodada derrubaria o endereço para HTTP puro — e o deixaria sem
  TLS se aquela rodada do certbot falhasse. Para regerar um vhost do zero, apague
  `/etc/nginx/sites-available/iastudio-domain-<host>` e rode o script de novo.
- **`slug` e `custom_domain` seguem intactos** (coexistência). O registro novo é
  autoritativo; a migração dos valores legados é passo posterior, deliberado.

## Limitações conhecidas

- A ativação pelo painel faz a API **disparar o script no servidor** (spawn
  detached, como o `upgrade.sh` já fazia) — ele roda com o usuário do PM2, que
  nesta instalação é root. O endpoint é super-only (`@PlatformAdminOnly`) e o
  hostname é validado contra `^[a-z0-9.-]+$` antes de virar argumento.
- A verificação de **posse** do domínio próprio (token TXT em `verify_token`)
  está modelada mas ainda não é conferida automaticamente: hoje a prova de
  controle é o próprio DNS apontar + o certificado emitir.
- Cache de resolução é por processo (TTL 30s): api e worker podem divergir por
  até 30s na marca exibida. Nunca afeta acesso a dado.
