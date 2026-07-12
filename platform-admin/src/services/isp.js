import api, { extractErrorMessage } from '../lib/api';
import { normalizeList } from './users';

// Serviço da solução ISP (Fase 6). Segue o padrão dos demais serviços
// (api + extractErrorMessage + normalizeList). Base do axios já é /api/v1;
// os endpoints da fase vivem sob /isp/*.

// ─── Incidentes / Manutenção ─────────────────────────────────

// ─── Config de abertura de OS (setor↔assunto por conexão) ───────────────
export async function discoverOsResources(connectionId) {
  try {
    const { data } = await api.get('/isp/os-config/discover', {
      params: connectionId ? { connection_id: connectionId } : {},
    });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao descobrir setores/assuntos do ERP')); }
}

export async function getOsConfig(connectionId) {
  try {
    const { data } = await api.get('/isp/os-config', { params: { connection_id: connectionId } });
    return normalizeList(data).items;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar a configuração de OS')); }
}

export async function saveOsConfig(connectionId, pairs) {
  try {
    const { data } = await api.put('/isp/os-config', { connection_id: connectionId, pairs });
    return normalizeList(data).items;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao salvar a configuração de OS')); }
}

export async function listIncidents(params = {}) {
  try {
    const { data } = await api.get('/isp/incidents', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar incidentes')); }
}

export async function getIncident(id) {
  try {
    const { data } = await api.get(`/isp/incidents/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o incidente')); }
}

export async function createIncident(body) {
  try {
    const { data } = await api.post('/isp/incidents', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar incidente')); }
}

export async function updateIncident(id, body) {
  try {
    const { data } = await api.patch(`/isp/incidents/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar incidente')); }
}

// ─── Afetados (targets) ──────────────────────────────────────

export async function listTargets(id) {
  try {
    const { data } = await api.get(`/isp/incidents/${id}/targets`);
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar afetados')); }
}

export async function resolveAffected(id) {
  try {
    const { data } = await api.post(`/isp/incidents/${id}/resolve-affected`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao resolver afetados')); }
}

export async function updateTargets(id, body) {
  try {
    const { data } = await api.patch(`/isp/incidents/${id}/targets`, body);
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar afetados')); }
}

// ─── Ciclo de vida + disparo ─────────────────────────────────

export async function activateIncident(id, body = { confirm: true }) {
  try {
    const { data } = await api.post(`/isp/incidents/${id}/activate`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao ativar incidente')); }
}

export async function resolveIncident(id, body = { confirm: true }) {
  try {
    const { data } = await api.post(`/isp/incidents/${id}/resolve`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao encerrar incidente')); }
}

export async function dispatchIncident(id, body) {
  try {
    const { data } = await api.post(`/isp/incidents/${id}/dispatch`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao disparar informativo')); }
}

export async function listDispatches(id) {
  try {
    const { data } = await api.get(`/isp/incidents/${id}/dispatches`);
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar disparos')); }
}
