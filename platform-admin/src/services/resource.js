import api, { extractErrorMessage } from '../lib/api';
import { normalizeList } from './users';

// Serviço do Resource Model (Fase 7 — Frente B). Segue o padrão dos demais
// serviços (api + extractErrorMessage + normalizeList). Base do axios já é
// /api/v1; os endpoints da fase vivem sob /resource/*.

// ─── Catálogo de tipos canônicos ─────────────────────────────

// Retorna a lista de tipos canônicos (Customer/Person/.../ServiceOrder/Lead)
// com seus campos e extensões verticais. Resposta é um array puro.
export async function getResourceCatalog() {
  try {
    const { data } = await api.get('/resource/catalog');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o catálogo de recursos')); }
}

// ─── Mapeamentos (CRUD) ──────────────────────────────────────

export async function listMappings(params = {}) {
  try {
    const { data } = await api.get('/resource/mappings', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar mapeamentos')); }
}

export async function getMapping(id) {
  try {
    const { data } = await api.get(`/resource/mappings/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o mapeamento')); }
}

export async function createMapping(body) {
  try {
    const { data } = await api.post('/resource/mappings', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar mapeamento')); }
}

export async function updateMapping(id, body) {
  try {
    const { data } = await api.patch(`/resource/mappings/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar mapeamento')); }
}

export async function deleteMapping(id) {
  try {
    const { data } = await api.delete(`/resource/mappings/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao excluir mapeamento')); }
}

// ─── Mapper Inteligente (sugestão — nunca aplica sozinho) ─────

// Body: { connection_id, resource_type, source_operation, sample_params? }.
// Retorna { resource_type, source_operation, suggested_field_map, unmatched,
// sample_keys, strategy }.
export async function suggestMapping(body) {
  try {
    const { data } = await api.post('/resource/mappings/suggest', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao sugerir mapeamento')); }
}

// ─── Resource Explorer (read-only) ───────────────────────────

// Params: { connection_id, resource_type, query? }. Retorna
// { resource_type, source_operation, mapping_id, count, records, empty }.
export async function exploreResource(params = {}) {
  try {
    const { data } = await api.get('/resource/explore', { params });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao explorar recursos')); }
}
