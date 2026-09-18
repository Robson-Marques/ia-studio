# S2 — disposição de dados da primeira instância dedicada

**Decisão:** não há clientes nem dados operacionais aprovados para migração na
instalação de desenvolvimento atual. Portanto, a exportação NDJSON e a
importação seletiva são **não aplicáveis** à primeira instância dedicada.

Isso não equivale a restaurar backup vazio nem a reutilizar o schema SaaS:

- o schema da nova instância é gerado de PostgreSQL vazio por
  `provision-dedicated-schema.sh`;
- o banco SaaS legado não recebe `db push`, restore ou conversão in-place;
- o checkout histórico só serve de fonte de código para o bootstrap;
- se uma instalação futura possuir dados operacionais válidos, ela deverá usar
  `backup-saas-historical.sh`, seleção explícita, exportação NDJSON e os gates
  correspondentes antes de qualquer importação.

**Evidência de decisão:** confirmação do responsável pelo produto em 2026-09-18
de que o IA Studio permanece em desenvolvimento, sem clientes.
