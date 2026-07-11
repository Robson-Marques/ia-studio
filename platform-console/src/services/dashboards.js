import api, { extractErrorMessage, normalizeList } from '../lib/api';

// Serviço do Console para o dashboard consolidado (agregações read-only).

export async function getOverview() {
  try {
    const { data } = await api.get('/console/dashboards/overview');
    const d = data || {};
    // O backend devolve ANINHADO: executions:{total,errors}, ai:{cost_usd,tokens},
    // connections:{total,active,error}. Ler plano (d.executions, d.ai_cost_usd...)
    // dava NaN em "Execuções" e 0 em custo/tokens/erros.
    return {
      organizations: d.organizations ?? 0,
      executions: d.executions?.total ?? 0,
      execution_errors: d.executions?.errors ?? 0,
      ai_cost_usd: d.ai?.cost_usd ?? 0,
      ai_tokens: d.ai?.tokens ?? 0,
      whatsapp_messages: d.whatsapp_messages ?? d.whatsappMessages ?? 0,
      emails: d.emails ?? 0,
      // Saúde de conexões: o back manda o agregado {total,active,error}.
      connections: d.connections ?? { total: 0, active: 0, error: 0 },
      connections_health: normalizeList(d.connections_health ?? d.connectionsHealth).items,
      queues: normalizeList(d.queues).items,
    };
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o dashboard')); }
}
