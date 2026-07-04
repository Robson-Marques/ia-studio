import api, { extractErrorMessage } from '../lib/api';
import { normalizeList } from './users';

// ─── Marketplace ─────────────────────────────────────────────

export async function getMarketplace({ category, search } = {}) {
  try {
    const { data } = await api.get('/marketplace', { params: { category: category || undefined, search: search || undefined } });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o marketplace')); }
}

export async function installProvider(key) {
  try {
    const { data } = await api.post(`/marketplace/${key}/install`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao instalar conector')); }
}

export async function uninstallProvider(key) {
  try {
    const { data } = await api.post(`/marketplace/${key}/uninstall`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao desinstalar conector')); }
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

export async function listConnectionLogs(id, take = 50) {
  try {
    const { data } = await api.get(`/connections/${id}/logs`, { params: { take } });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar logs da conexão')); }
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
