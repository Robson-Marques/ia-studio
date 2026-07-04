import api, { extractErrorMessage } from '../lib/api';
import { normalizeList } from './users';

// Serviço do Developer Center — API Keys (Fase 7 — Frente B). Base do axios já é
// /api/v1; os endpoints vivem sob /developer/api-keys. A chave em claro só existe
// na resposta de criação (campo `plaintext`) — nunca mais é exibida.

export async function listApiKeys() {
  try {
    const { data } = await api.get('/developer/api-keys');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar chaves de API')); }
}

// Body: { name, scopes?, expires_at? }. Retorna { key, plaintext }.
export async function createApiKey(body) {
  try {
    const { data } = await api.post('/developer/api-keys', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar chave de API')); }
}

export async function revokeApiKey(id) {
  try {
    const { data } = await api.post(`/developer/api-keys/${id}/revoke`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao revogar chave de API')); }
}
