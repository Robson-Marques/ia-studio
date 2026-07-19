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

// ─── Mapa setor→fila (para onde a IA encaminha a conversa) ──────────────
export async function getFilaMapping() {
  try {
    const { data } = await api.get('/isp/os-config/filas');
    return data || { suporte: null, financeiro: null };
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar as filas de setor')); }
}

export async function saveFilaMapping(mapping) {
  try {
    const { data } = await api.put('/isp/os-config/filas', mapping);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao salvar as filas de setor')); }
}

// ─── Limite de boletos que a IA envia (0 = todos) ──────────────────────
export async function getBoletoMax() {
  try {
    const { data } = await api.get('/isp/os-config/boleto-max');
    return Number.isFinite(data?.max) ? data.max : 3;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o limite de boletos')); }
}

export async function saveBoletoMax(max) {
  try {
    const { data } = await api.put('/isp/os-config/boleto-max', { max });
    return data?.max;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao salvar o limite de boletos')); }
}

// ─── Link de pagamento (2ª via pública) — config admin ─────────────────
export async function getPagamentoConfig() {
  try {
    const { data } = await api.get('/isp/os-config/pagamento');
    return data || { ttl_horas: 24, base_url: '' };
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar a config de pagamento')); }
}

export async function savePagamentoConfig(cfg) {
  try {
    const { data } = await api.put('/isp/os-config/pagamento', cfg);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao salvar a config de pagamento')); }
}

export async function getPlantaoConfig() {
  try {
    const { data } = await api.get('/isp/os-config/plantao');
    return data || { team_id: null, limiar_pct: 40, template: null, cooldown_min: 60 };
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar a config do plantão')); }
}

export async function savePlantaoConfig(cfg) {
  try {
    const { data } = await api.put('/isp/os-config/plantao', cfg);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao salvar a config do plantão')); }
}

// Público (sem auth): dados da página /pagar/:token.
export async function getPublicPayment(token) {
  try {
    const { data } = await api.get(`/isp/pagamento/${token}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Este link de pagamento expirou ou não é mais válido.')); }
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
