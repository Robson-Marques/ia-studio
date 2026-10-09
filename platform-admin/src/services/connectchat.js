import api, { extractErrorMessage } from '../lib/api';

export async function listConnectchatConversations() {
  try {
    const { data } = await api.get('/comm/connectchat/conversations');
    return Array.isArray(data) ? data : [];
  } catch (err) { throw new Error(extractErrorMessage(err, 'Não foi possível carregar as conversas do ConnectChat')); }
}

export async function listConnectchatMessages(conversationId, afterSequence = '0') {
  try {
    const { data } = await api.get(`/comm/connectchat/conversations/${conversationId}/messages`, {
      params: { after_sequence: afterSequence, limit: 100 },
    });
    return Array.isArray(data) ? data : [];
  } catch (err) { throw new Error(extractErrorMessage(err, 'Não foi possível carregar as mensagens')); }
}

export async function sendConnectchatMessage(conversationId, body, clientMessageId) {
  try {
    const { data } = await api.post(`/comm/connectchat/conversations/${conversationId}/messages`, {
      body,
      clientMessageId,
    });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Não foi possível enviar a mensagem')); }
}

export async function setConnectchatTyping(conversationId, status) {
  try {
    await api.post(`/comm/connectchat/conversations/${conversationId}/typing`, { status });
  } catch (err) { throw new Error(extractErrorMessage(err, 'Não foi possível atualizar o estado de digitação')); }
}

export async function markConnectchatRead(conversationId, sequence) {
  try {
    await api.post(`/comm/connectchat/conversations/${conversationId}/receipts/read`, { sequence });
  } catch {
    // Recibo não pode impedir a leitura da conversa; o próximo polling repete.
  }
}

export async function requestConnectchatCustomerLink(conversationId, customerId) {
  try {
    const { data } = await api.post(`/comm/connectchat/conversations/${conversationId}/customer-link-requests`, { customerId });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Não foi possível vincular o cliente')); }
}

export async function unlinkConnectchatCustomer(conversationId) {
  try {
    const { data } = await api.post(`/comm/connectchat/conversations/${conversationId}/customer-unlink`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Não foi possível desvincular o cliente')); }
}

export async function completeConnectchatCustomerLink(conversationId, requestId) {
  try {
    const { data } = await api.post(`/comm/connectchat/conversations/${conversationId}/customer-link-requests/complete`, { requestId });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'O cliente ainda não confirmou o vínculo')); }
}
