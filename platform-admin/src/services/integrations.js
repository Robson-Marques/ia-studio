import api, { extractErrorMessage } from '../lib/api';
import { normalizeList } from './users';

// ─── Providers disponíveis para novas conexões ─────────────────

export async function listConnectionProviders() {
  try {
    const { data } = await api.get('/connections/providers');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar conectores disponíveis')); }
}

// ─── Conexões ────────────────────────────────────────────────

export async function listConnections(params = {}) {
  try {
    const { data } = await api.get('/connections', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar conexões')); }
}

export async function createConnection(body) {
  try {
    const { data } = await api.post('/connections', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar conexão')); }
}

export async function updateConnection(id, body) {
  try {
    const { data } = await api.patch(`/connections/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar conexão')); }
}

export async function changeConnectionState(id, action) {
  try {
    const { data } = await api.patch(`/connections/${id}/state`, { action });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao mudar estado da conexão')); }
}

export async function testConnection(id) {
  try {
    const { data } = await api.post(`/connections/${id}/test`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao testar conexão')); }
}

// Schema Discovery: lista os recursos que a conexão expõe (assuntos de OS,
// setores, planos, números, templates...). Read-only — nada é persistido.
export async function discoverConnection(id) {
  try {
    const { data } = await api.post(`/connections/${id}/discover`);
    return Array.isArray(data?.resources) ? data.resources : [];
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao descobrir recursos')); }
}

export async function listConnectionLogs(id, take = 50) {
  try {
    const { data } = await api.get(`/connections/${id}/logs`, { params: { take } });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar logs da conexão')); }
}

// ─── Codex CLI: login oficial por código de dispositivo ───────────

export async function getCodexLoginStatus(connectionId) {
  try {
    const { data } = await api.get(`/connections/${connectionId}/codex-login`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao consultar login Codex')); }
}

export async function startCodexLogin(connectionId) {
  try {
    const { data } = await api.post(`/connections/${connectionId}/codex-login`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao iniciar login Codex')); }
}

export async function cancelCodexLogin(connectionId) {
  try {
    const { data } = await api.post(`/connections/${connectionId}/codex-login/cancel`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao cancelar login Codex')); }
}

// ─── OAuth Google (Email Platform — Fase 7) ──────────────────

// O endpoint de start é VERSION_NEUTRAL (/api/integrations/... sem /v1). Usamos
// a instância axios com baseURL absoluta para escapar do prefixo /api/v1.
export async function startGoogleOAuth(connectionId) {
  try {
    const { data } = await api.get('/integrations/oauth/google/start', {
      baseURL: '/api',
      params: { connection_id: connectionId },
    });
    return data; // { url }
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao iniciar login com Google')); }
}

export async function getConnection(id) {
  try {
    const { data } = await api.get(`/connections/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao consultar conexão')); }
}

// ─── Cofre de Segredos ───────────────────────────────────────

export async function listSecrets() {
  try {
    const { data } = await api.get('/secrets');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar segredos')); }
}

export async function rotateSecret(id, values) {
  try {
    const { data } = await api.post(`/secrets/${id}/rotate`, { values });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao rotacionar segredo')); }
}
