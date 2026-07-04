import api, { extractErrorMessage, normalizeList } from '../lib/api';

export async function listOrganizations() {
  try {
    const { data } = await api.get('/console/organizations');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar clientes')); }
}

export async function getOrganization(id) {
  try {
    const { data } = await api.get(`/console/organizations/${id}`);
    return data;
  } catch (err) {
    // Fallback: backend pode nao expor GET por id — busca na listagem.
    if (err?.response?.status === 404 || err?.response?.status === 405) {
      const { items } = await listOrganizations();
      const found = items.find((o) => o.id === id);
      if (found) return found;
    }
    throw new Error(extractErrorMessage(err, 'Erro ao carregar cliente'));
  }
}

export async function createOrganization(body) {
  try {
    const { data } = await api.post('/console/organizations', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar cliente')); }
}

export async function updateOrganization(id, body) {
  try {
    const { data } = await api.patch(`/console/organizations/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar cliente')); }
}
