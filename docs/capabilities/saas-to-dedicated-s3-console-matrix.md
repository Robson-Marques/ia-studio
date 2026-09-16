# S3 — Matriz de aposentadoria do Console SaaS

**Capability:** `ia-studio.capability.saas-to-dedicated-installation`
**Estado:** `completed`
**Objetivo:** transferir as operações úteis do antigo `platform-console` para a
administração local da própria instância e retirar as superfícies cuja única
razão de existir era operar vários clientes.

| Função do Console antigo | Decisão | Destino ou razão |
|---|---|---|
| Versão instalada, versões disponíveis e atualização | migrar | `platform-admin` → Configurações → Administração da instalação → Atualização e backup; API local `/system/*`. |
| Log ao vivo, falha, lock órfão, recuperação e histórico de atualização | migrar | Mesma tela e serviços `SystemUpgrade`; autorização local explícita. |
| Gerar, enviar, baixar, excluir e restaurar backup | migrar | Mesma tela; operações continuam auditadas e serializadas por instância. |
| Auditoria | substituir | A auditoria já existe no painel local em `/auditoria`; a visão global por organização é removida. |
| Catálogo e instalação de integrações | substituir | O marketplace operacional local já existe em `/integracoes/marketplace`; a curadoria global de `ProviderDefinition` não pertence à instalação. |
| Feature flags | substituir | A curadoria global e overrides por organização deixam de existir. Flags e overrides por usuário/perfil continuam como configuração técnica local em `/administration/flags`, restrita ao administrador da instalação. |
| Dashboard consolidado | remover | Era uma visão de operação SaaS. O painel dedicado usa o Dashboard local. |
| Organizações, usuários por organização e memberships | remover | Não há clientes ou organizações dentro de uma instância dedicada. |
| Planos, licenças, trial, billing, cupons e consumo comercial | remover | Conceitos SaaS eliminados pela Capability. |
| Domínio-base, subdomínios, canonicalização do Console e vhosts por organização | remover | O domínio único é provisionado e isolado pelos scripts da instância; não é dado de negócio nem tela administrativa. |

## Critério de remoção

Antes de apagar `platform-console`, cada capacidade marcada como **migrar** deve
existir no painel local e usar somente rotas locais. As flags substituídas têm
API administrativa local, sem uma tela global SaaS. Nenhuma rota, menu,
permissão, build ou vhost pode apontar para `/console/` após este slice.

## Evidência esperada

- administrador local consegue iniciar e acompanhar atualização, inclusive
  falha, lock órfão, recuperação e histórico;
- administrador local executa backup/restauração, acompanha a operação e tem
  as ações auditadas;
- flags técnicas não recebem organização; a curadoria e os overrides por
  organização não existem;
- usuários sem `system.maintain` não navegam nem acessam a API de manutenção;
- `platform-console` e controladores/rotas exclusivos do Console não existem;
- instalador, upgrade, sincronização de domínio e documentação não constroem,
  publicam nem servem `/console/`.

## Evidência registrada

`bash scripts/migration/verify-console-retirement.sh` valida a ausência de
superfície executável do Console e a presença da administração local. O gate S1
continua obrigatório e independente:
`bash scripts/migration/verify-dedicated-cut.sh --check`.
