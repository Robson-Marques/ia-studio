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
estrutura-base IA Studio → repositório da vertente → /opt/<app-id>
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

**Evidência parcial aprovada.** A Newnet já foi instalada do zero na fonte
GitHub atual e o backup `SUCCESS` foi comprovado. Para concluir S4:

1. manter o backup concluído disponível para a prova;
2. executar uma restauração controlada somente quando a janela operacional for
   aprovada, pois ela reinicia os processos Newnet;
3. validar que a restauração afeta apenas Newnet e preserva Ctrl Leads, Finanças
   e demais produtos reais do host.

O backup preso em `RUNNING` não é considerado resolvido por esta auditoria. A
evidência no host confirmou a unidade systemd e o arquivo concluídos, mas
identificou cast `::uuid` incompatível com o id `text` de `system_restores`.
A correção foi validada por novo backup em estado terminal. A restauração
controlada permanece como a única evidência operacional pendente de S4.
