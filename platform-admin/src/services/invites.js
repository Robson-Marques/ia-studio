import api, { extractErrorMessage } from '../lib/api';
import { normalizeList } from './users';

export async function listInvites() {
  try {
    const { data } = await api.get('/invites');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar convites')); }
}

export async function createInvite(body) {
  try {
    const { data } = await api.post('/invites', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar convite')); }
}

export async function revokeInvite(id) {
  try {
    const { data } = await api.delete(`/invites/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao revogar convite')); }
}

// Publico — aceite do convite (sem token de auth).
export async function acceptInvite(token, body) {
  try {
    const { data } = await api.post(`/auth/invites/${token}/accept`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao aceitar o convite')); }
}
