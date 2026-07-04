import api, { extractErrorMessage, normalizeList } from '../lib/api';

export async function listFlags() {
  try {
    const { data } = await api.get('/console/flags');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar flags')); }
}

export async function createFlag(body) {
  try {
    const { data } = await api.post('/console/flags', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar flag')); }
}

export async function updateFlag(id, body) {
  try {
    const { data } = await api.patch(`/console/flags/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar flag')); }
}

// Override por organização.
export async function setFlagOverride(flagId, organizationId, enabled) {
  try {
    const { data } = await api.post(`/console/flags/${flagId}/overrides`, {
      organization_id: organizationId,
      enabled,
    });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao salvar override')); }
}

export async function removeFlagOverride(flagId, organizationId) {
  try {
    const { data } = await api.delete(`/console/flags/${flagId}/overrides/${organizationId}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao remover override')); }
}
