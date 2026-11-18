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

export async function getChatCounts(params = {}) {
  try {
    const { data } = await api.get('/comm/whatsapp/chats/counts', { params });
    return data; // { mine, unassigned, team, all }
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar contagem de conversas')); }
}

export async function unlinkCustomer(id) {
  try {
    const { data } = await api.post(`/comm/whatsapp/chats/${id}/unlink-customer`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao desvincular o cliente')); }
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

// Dispara "digitando…" no WhatsApp do cliente enquanto o atendente escreve.
// Best-effort (UX) — a Meta expira sozinha em ~25s ou ao enviar a resposta.
export async function sendTyping(id) {
  try {
    const { data } = await api.post(`/comm/whatsapp/chats/${id}/typing`);
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

// Upload real do aparelho (arquivo ou audio gravado). Repassa o 409 de takeover
// (NEEDS_TAKEOVER_CONFIRMATION) cru pro composer decidir, igual sendChatMessage.
export async function uploadChatMedia(chatId, file, kind, opts = {}) {
  try {
    const form = new FormData();
    // Campos ANTES do arquivo: com @fastify/multipart, req.file() só enxerga
    // os campos que vieram antes da parte de arquivo no stream multipart.
    form.append('kind', kind);
    if (opts.caption) form.append('caption', opts.caption);
    if (opts.voice) form.append('voice', 'true');
    if (opts.confirm_takeover) form.append('confirm_takeover', 'true');
    form.append('file', file, file.name || `${kind}-${Date.now()}`);
    const { data } = await api.post(`/comm/whatsapp/chats/${chatId}/media/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000, // upload de midia pode ser maior que o timeout padrao
    });
    return data;
  } catch (err) {
    const code = err?.response?.data?.error;
    const e = new Error(extractErrorMessage(err, 'Erro ao enviar mídia'));
    e.code = code;
    e.status = err?.response?.status;
    throw e;
  }
}

export async function downloadChatMedia(chatId, mediaId) {
  try {
    const { data } = await api.get(`/comm/whatsapp/chats/${chatId}/media/${mediaId}`, { responseType: 'blob', timeout: 120000 });
    return data;
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

export async function publishTemplate(id) {
  try { const { data } = await api.post(`/comm/whatsapp/templates/${id}/publish`); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao publicar o template')); }
}

export async function getTemplate(id) {
  try { const { data } = await api.get(`/comm/whatsapp/templates/${id}`); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o template')); }
}

// Edita um RASCUNHO local (conteúdo/categoria).
export async function updateTemplate(id, body) {
  try { const { data } = await api.put(`/comm/whatsapp/templates/${id}`, body); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao editar o template')); }
}

// Exclui o template LOCAL (bloqueia se ainda existe na Meta — use deleteTemplateOfficial).
export async function deleteTemplate(id) {
  try { const { data } = await api.delete(`/comm/whatsapp/templates/${id}`); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao excluir o template')); }
}

// Liga/desliga o vínculo do template a um evento do sistema (event vazio desliga).
export async function bindTemplateEvent(id, event) {
  try { const { data } = await api.post(`/comm/whatsapp/templates/${id}/bind`, { event: event || undefined }); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao vincular o template')); }
}

// Duplica o template na mesma conexão (rascunho, nome novo).
export async function duplicateTemplate(id) {
  try { const { data } = await api.post(`/comm/whatsapp/templates/${id}/duplicate`); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao duplicar o template')); }
}

// Replica o template como rascunho em outras conexões.
export async function replicateTemplate(id, connectionIds) {
  try { const { data } = await api.post(`/comm/whatsapp/templates/${id}/replicate`, { connection_ids: connectionIds }); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao replicar o template')); }
}

// Edita um template JÁ publicado direto na Meta (volta a análise).
export async function pushEditTemplate(id, body) {
  try { const { data } = await api.post(`/comm/whatsapp/templates/${id}/push-edit`, body); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao editar o template na Meta')); }
}

// Remove o template DA META e depois localmente.
export async function deleteTemplateOfficial(id) {
  try { const { data } = await api.post(`/comm/whatsapp/templates/${id}/delete-official`); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao remover o template da Meta')); }
}

// Sobe a amostra do cabeçalho de mídia (imagem/vídeo/documento) e devolve
// { handle, format } pro criar/editar. connection_id ANTES do arquivo (mesma
// regra do @fastify/multipart do upload da inbox).
export async function uploadTemplateHeaderMedia(connectionId, file) {
  try {
    const form = new FormData();
    form.append('connection_id', connectionId);
    form.append('file', file, file.name || 'amostra');
    const { data } = await api.post('/comm/whatsapp/templates/header-media', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    return data; // { handle, format }
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao subir a mídia do cabeçalho')); }
}

// ─── Números (Central WhatsApp Nivoo) ────────────────────────

export async function getCentralSetup() {
  const { data } = await api.get('/comm/whatsapp/numbers/setup');
  return data;
}

export async function configureCentralSetup(body) {
  try {
    const { data } = await api.put('/comm/whatsapp/numbers/setup', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao configurar a Central Nivoo')); }
}

export async function startCentralOnboarding() {
  const { data } = await api.post('/comm/whatsapp/numbers/onboarding/sessions');
  return data;
}

export async function getCentralOnboardingSession(sessionId) {
  const { data } = await api.get(`/comm/whatsapp/numbers/onboarding/sessions/${encodeURIComponent(sessionId)}`);
  return data.session;
}

export async function disconnectCentralNumber(id) {
  const { data } = await api.post(`/comm/whatsapp/numbers/${encodeURIComponent(id)}/disconnect`);
  return data;
}

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

export async function createWahaNumber(body) {
  try { const { data } = await api.post('/comm/whatsapp/numbers/waha', body); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar a conexão por QR Code')); }
}

export async function getWahaPairing(id) {
  try { const { data } = await api.get(`/comm/whatsapp/numbers/${id}/waha/pairing`); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o QR Code')); }
}

export async function restartWahaPairing(id) {
  try { const { data } = await api.post(`/comm/whatsapp/numbers/${id}/waha/restart`); return data; }
  catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao gerar um novo QR Code')); }
}

// ─── Assistente do número (vínculo) ──────────────────────────

// Vínculo atual do número (ou null): { connection_id, agent_id, agent_name, is_enabled }.
export async function getNumberAssistant(id) {
  try {
    const { data } = await api.get(`/comm/whatsapp/numbers/${id}/assistant`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o assistente do número')); }
}

// Vincula (ou troca) o assistente que atende o número.
export async function setNumberAssistant(id, body) {
  try {
    const { data } = await api.put(`/comm/whatsapp/numbers/${id}/assistant`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao vincular o assistente ao número')); }
}

// Desvincula o assistente (o número deixa de ter atendimento automático).
export async function removeNumberAssistant(id) {
  try {
    const { data } = await api.delete(`/comm/whatsapp/numbers/${id}/assistant`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao desvincular o assistente')); }
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
