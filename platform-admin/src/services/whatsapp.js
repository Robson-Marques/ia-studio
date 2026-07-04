import api, { extractErrorMessage } from '../lib/api';
import { normalizeList } from './users';

// ─── Escopo / Conversas ──────────────────────────────────────

export async function getWhatsappScope() {
  try {
    const { data } = await api.get('/comm/whatsapp/scope');
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar escopo de atendimento')); }
}

export async function listChats(params = {}) {
  try {
    const { data } = await api.get('/comm/whatsapp/chats', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar conversas')); }
}

export async function getChat(id) {
  try {
    const { data } = await api.get(`/comm/whatsapp/chats/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar a conversa')); }
}

export async function listMessages(id, params = {}) {
  try {
    const { data } = await api.get(`/comm/whatsapp/chats/${id}/messages`, { params });
    return Array.isArray(data) ? data : [];
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar mensagens')); }
}

export async function getChatWindow(id) {
  try {
    const { data } = await api.get(`/comm/whatsapp/chats/${id}/window`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao consultar a janela de 24h')); }
}

export async function markChatRead(id) {
  try {
    const { data } = await api.post(`/comm/whatsapp/chats/${id}/read`);
    return data;
  } catch { return null; /* best-effort */ }
}

// Envio: repassa o erro cru quando for takeover (409) pro caller decidir.
export async function sendChatMessage(id, body) {
  try {
    const { data } = await api.post(`/comm/whatsapp/chats/${id}/send`, body);
    return data;
  } catch (err) {
    const code = err?.response?.data?.error;
    const e = new Error(extractErrorMessage(err, 'Erro ao enviar mensagem'));
    e.code = code;
    e.status = err?.response?.status;
    throw e;
  }
}

export async function downloadChatMedia(chatId, mediaId) {
  try {
    const { data } = await api.get(`/comm/whatsapp/chats/${chatId}/media/${mediaId}`);
    return data; // { base64, mime }
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao baixar mídia')); }
}

// ─── Atendimento (claim/transfer/close/reopen/timeline) ──────

export async function claimChat(id) {
  try { const { data } = await api.post(`/comm/whatsapp/chats/${id}/claim`); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao assumir a conversa')); }
}

export async function releaseChat(id) {
  try { const { data } = await api.post(`/comm/whatsapp/chats/${id}/release`); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao liberar a conversa')); }
}

export async function transferChat(id, body) {
  try { const { data } = await api.post(`/comm/whatsapp/chats/${id}/transfer`, body); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao transferir a conversa')); }
}

export async function closeChat(id, reason) {
  try { const { data } = await api.post(`/comm/whatsapp/chats/${id}/close`, { reason }); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao encerrar a conversa')); }
}

export async function reopenChat(id) {
  try { const { data } = await api.post(`/comm/whatsapp/chats/${id}/reopen`); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao reabrir a conversa')); }
}

export async function getChatTimeline(id) {
  try { const { data } = await api.get(`/comm/whatsapp/chats/${id}/timeline`); return Array.isArray(data) ? data : []; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar a trilha da conversa')); }
}

// ─── Templates ───────────────────────────────────────────────

export async function listTemplates(connectionId) {
  try {
    const { data } = await api.get('/comm/whatsapp/templates', { params: { connection_id: connectionId || undefined } });
    return Array.isArray(data) ? data : [];
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar templates')); }
}

export async function createTemplate(body) {
  try { const { data } = await api.post('/comm/whatsapp/templates', body); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar template')); }
}

export async function syncTemplates(connectionId) {
  try { const { data } = await api.post('/comm/whatsapp/templates/sync', { connection_id: connectionId }); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao sincronizar templates')); }
}

// ─── Números (conexões whatsapp-meta) ────────────────────────

export async function listNumbers(params = {}) {
  try {
    const { data } = await api.get('/comm/whatsapp/numbers', { params });
    return Array.isArray(data) ? data : [];
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar números')); }
}

export async function syncNumber(id) {
  try { const { data } = await api.post(`/comm/whatsapp/numbers/${id}/sync`); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao sincronizar o número')); }
}

// ─── Equipes e Filas ─────────────────────────────────────────

export async function listTeams(includeInactive = false) {
  try {
    const { data } = await api.get('/comm/attendance/teams', { params: { include_inactive: includeInactive || undefined } });
    return Array.isArray(data) ? data : [];
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar equipes')); }
}

export async function createTeam(body) {
  try { const { data } = await api.post('/comm/attendance/teams', body); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar equipe')); }
}

export async function updateTeam(id, body) {
  try { const { data } = await api.patch(`/comm/attendance/teams/${id}`, body); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar equipe')); }
}

export async function addTeamMember(teamId, body) {
  try { const { data } = await api.post(`/comm/attendance/teams/${teamId}/members`, body); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao adicionar membro')); }
}

export async function removeTeamMember(teamId, userId) {
  try { const { data } = await api.delete(`/comm/attendance/teams/${teamId}/members/${userId}`); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao remover membro')); }
}

export async function listQueues(includeInactive = false) {
  try {
    const { data } = await api.get('/comm/attendance/queues', { params: { include_inactive: includeInactive || undefined } });
    return Array.isArray(data) ? data : [];
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar filas')); }
}

export async function createQueue(body) {
  try { const { data } = await api.post('/comm/attendance/queues', body); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar fila')); }
}

export async function updateQueue(id, body) {
  try { const { data } = await api.patch(`/comm/attendance/queues/${id}`, body); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar fila')); }
}

export async function listAttendanceUsers() {
  try {
    const { data } = await api.get('/comm/attendance/users');
    return Array.isArray(data) ? data : [];
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar usuários')); }
}
