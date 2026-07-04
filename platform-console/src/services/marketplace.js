import api, { extractErrorMessage, normalizeList } from '../lib/api';

export async function listProviderDefinitions({ category, search } = {}) {
  try {
    const { data } = await api.get('/console/marketplace', {
      params: { category: category || undefined, search: search || undefined },
    });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar conectores')); }
}

export async function createProviderDefinition(body) {
  try {
    const { data } = await api.post('/console/marketplace', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar conector')); }
}

export async function updateProviderDefinition(id, body) {
  try {
    const { data } = await api.patch(`/console/marketplace/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar conector')); }
}
