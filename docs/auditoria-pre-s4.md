# Auditoria de prontidão — S4: coabitação de vertentes

- **Data:** 2026-10-02
- **Especialidade:** `ia-studio.dedicated-instance-operations@2.0.0`
- **Capability:** `ia-studio.capability.saas-to-dedicated-installation`
  (`in-progress`)
- **Recorte:** instalação, atualização, backup, restauração e remoção de uma
  aplicação de vertente própria, sem alcançar outros produtos do host.

## Decisão operacional

`ia-dev` e `ia-teste` foram instalações descartáveis usadas para confirmar que
recursos de host não colidiam. Elas não representam o modelo de produto e não
serão mantidas como clientes fictícios. O modelo aprovado é:

```text
IA Studio base → repositório da vertente → /opt/<app-id>
```

Uma vertente futura de loja, por exemplo, recebe seu próprio repositório e só os
módulos aprovados para ela; não atualiza nem compartilha checkout com Newnet.

## Contratos verificados estaticamente

- `app-id` obrigatório, validado e nunca inferido de domínio, banco ou host.
- Diretório da aplicação em `/opt/<app-id>`; configuração, dados e backups em
  árvores exclusivas sob `/etc/iastudio/apps`, `/var/lib/iastudio/apps` e
  `/var/backups/iastudio/apps`.
- Banco/role, Redis/prefixo, PM2, lock, porta e vhost derivados do `app-id`.
- Redis DB, porta HTTP e domínio recusados quando já pertencem a outro serviço.
- Install clona uma tag do `origin` da própria vertente; upgrade consulta esse
  mesmo repositório.
- Schema inicial é criado exclusivamente de PostgreSQL vazio, com advisory lock;
  upgrade não aceita perda de dados automaticamente.
- Wrappers invocam Bash explicitamente; o build da aplicação força as
  dependências necessárias sem mudar o ambiente de produção do PM2.
- Backup e restauração executam fora da árvore do PM2. Backup contém segredos de
  restauração e deve permanecer em armazenamento restrito.

## Evidência executada

Os gates S1, S2 operacional, S3, removedor SaaS e S4 passaram no checkout após
a correção de contrato. A validação local inclui sintaxe Bash com Git Bash; build
Nest/Vite segue obrigatório no host, que contém Node e o registry privado.

## Go / No-Go para o host

**GO para criar a tag da base corrigida.** Antes de instalar Newnet do zero:

1. criar/publicar o repositório da vertente Newnet a partir da tag da base;
2. executar `uninstall-discarded-dev-apps.sh` em prévia e, então, com a
   confirmação literal `RESET-IASTUDIO-DEV`; ele só aceita `ia-dev` e
   `ia-teste`;
3. instalar a vertente Newnet em `/opt/<app-id>`;
4. validar seus processos, banco, Redis, domínio e backup sem efeito em Finanças,
   Mercado e demais produtos reais do host.

O backup preso em `RUNNING` não é considerado resolvido por esta auditoria. A
evidência no host confirmou a unidade systemd e o arquivo concluídos, mas
identificou cast `::uuid` incompatível com o id `text` de `system_restores`.
A correção deve ser validada por um novo backup em estado terminal antes de
concluir S4; recriar o ambiente não substitui essa evidência.
