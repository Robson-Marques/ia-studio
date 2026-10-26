// Padrões nativos: um rascunho por número, preservando edições do usuário.
// Um novo emissor automático fora da janela de 24h deve adicionar sua linha aqui.
export const SEED_CATALOG = [
  {
    event: 'ISP_INCIDENT_TEAM_ALERT',
    name: 'alerta_incidente_plantao',
    language: 'pt_BR',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Possível incidente de rede: {{1}}. Abra o painel ISP para verificar e tratar.',
        example: { body_text: [['instabilidade na região central']] },
      },
    ],
    variableMap: { body: { '1': 'resumo_incidente' } },
  },
  {
    event: 'ISP_INCIDENT_CUSTOMER_NOTICE',
    name: 'aviso_incidente_rede',
    language: 'pt_BR',
    category: 'UTILITY',
    components: [{
      type: 'BODY',
      text: 'Atualização sobre sua conexão: {{1}}. Responda esta mensagem se precisar de atendimento.',
      example: { body_text: [['instabilidade identificada na região']] },
    }],
    variableMap: { body: { '1': 'resumo_incidente' } },
  },
  {
    event: 'ISP_INCIDENT_CUSTOMER_RESOLVED',
    name: 'aviso_normalizacao_rede',
    language: 'pt_BR',
    category: 'UTILITY',
    components: [{
      type: 'BODY',
      text: 'Sua conexão foi normalizada: {{1}}. Responda esta mensagem se precisar de atendimento.',
      example: { body_text: [['serviço restabelecido na região']] },
    }],
    variableMap: { body: { '1': 'resumo_incidente' } },
  },
] as const;
