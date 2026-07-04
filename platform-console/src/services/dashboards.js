import api, { extractErrorMessage, normalizeList } from '../lib/api';

// Serviço do Console para o dashboard consolidado (agregações read-only).

export async function getOverview() {
  try {
    const { data } = await api.get('/console/dashboards/overview');
    const d = data || {};
    return {
      organizations: d.organizations ?? 0,
      executions: d.executions ?? 0,
      execution_errors: d.execution_errors ?? d.executionErrors ?? 0,
      ai_cost_usd: d.ai_cost_usd ?? d.aiCostUsd ?? 0,
      ai_tokens: d.ai_tokens ?? d.aiTokens ?? 0,
      whatsapp_messages: d.whatsapp_messages ?? d.whatsappMessages ?? 0,
      emails: d.emails ?? 0,
      // Listas: normaliza para arrays de itens.
      connections_health: normalizeList(d.connections_health ?? d.connectionsHealth).items,
      queues: normalizeList(d.queues).items,
    };
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o dashboard')); }
}
