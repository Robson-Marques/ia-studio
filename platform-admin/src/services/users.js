import api, { extractErrorMessage } from '../lib/api';

// Normaliza respostas de listagem: aceita array puro ou { items, total }.
export function normalizeList(data) {
  if (Array.isArray(data)) return { items: data, total: data.length };
  return { items: data?.items || data?.data || [], total: data?.total ?? (data?.items || data?.data || []).length };
}

export async function listUsers() {
  try {
    const { data } = await api.get('/users');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar usuários')); }
}

export async function createUser(body) {
  try {
    const { data } = await api.post('/users', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar usuário')); }
}

export async function updateUser(id, body) {
  try {
    const { data } = await api.patch(`/users/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar usuário')); }
}

export async function inactivateUser(id) {
  try {
    const { data } = await api.post(`/users/${id}/inactivate`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao inativar usuário')); }
}

export async function activateUser(id) {
  try {
    const { data } = await api.post(`/users/${id}/activate`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao reativar usuário')); }
}
