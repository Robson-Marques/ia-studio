import api, { extractErrorMessage, normalizeList } from '../lib/api';

// Gestao dos usuarios de uma organization cliente pelo Console.
// Rotas: /console/organizations/:orgId/users (platform-admin only no backend).

export async function listOrgUsers(orgId) {
  try {
    const { data } = await api.get(`/console/organizations/${orgId}/users`);
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar usuários')); }
}

export async function updateOrgUser(orgId, userId, body) {
  try {
    const { data } = await api.patch(`/console/organizations/${orgId}/users/${userId}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar usuário')); }
}

export async function resetOrgUserPassword(orgId, userId, new_password) {
  try {
    const { data } = await api.post(`/console/organizations/${orgId}/users/${userId}/reset-password`, { new_password });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao redefinir senha')); }
}
