// Constantes visuais do grupo ISP (labels pt-BR + tones do DS).
// Criado na migração pro DS (v0.9.92): os mapas estavam locais no
// `Incidentes.jsx` e passaram a ser usados também pelo editor de incidente.

export const INCIDENT_STATUS = {
  DRAFT:    { label: 'Rascunho',  tone: 'neutral' },
  ACTIVE:   { label: 'Ativo',     tone: 'success' },
  RESOLVED: { label: 'Encerrado', tone: 'info' },
};

export const INCIDENT_MODE_LABEL = {
  REACTIVE:  'Reativo',
  PROACTIVE: 'Proativo',
  COMBINED:  'Combinado',
};

// Opções do seletor, com a consequência escrita no rótulo (linguagem do usuário:
// o dono do negócio precisa saber que "proativo" significa disparar em massa).
export const INCIDENT_MODES = [
  { value: 'REACTIVE',  label: 'Reativo — só informa quem procurar' },
  { value: 'PROACTIVE', label: 'Proativo — dispara aviso em massa' },
  { value: 'COMBINED',  label: 'Combinado — dispara e também informa quem procurar' },
];

// Filtros de rede que delimitam quem é afetado. Vêm do ERP.
export const SCOPE_FIELDS = [
  { key: 'cidade',                  label: 'Cidade' },
  { key: 'bairro',                  label: 'Bairro' },
  { key: 'ip_concentrador',         label: 'IP do concentrador' },
  { key: 'interface_concentrador',  label: 'Interface do concentrador' },
  { key: 'id_olt',                  label: 'OLT' },
  { key: 'id_slot',                 label: 'Slot' },
  { key: 'id_cto',                  label: 'CTO' },
];
