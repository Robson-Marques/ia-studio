import api, { extractErrorMessage } from '../lib/api';

// Bancada supervisionada de agentes: nenhuma destas rotas envia mensagem ao cliente.
export async function getConnectchatPilotBinding() {
  try {
    const { data } = await api.get('/ai/connectchat-pilot');
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Não foi possível consultar o agente de testes')); }
}

export async function getConnectchatPilotRules() {
  try {
    const { data } = await api.get('/ai/connectchat-pilot/rules');
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Não foi possível consultar as regras da bancada')); }
}

export async function setConnectchatPilotRules(rules) {
  try {
    const { data } = await api.post('/ai/connectchat-pilot/rules', rules);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Não foi possível salvar as regras da bancada')); }
}

export async function setConnectchatPilotBinding(agentId) {
  try {
    const { data } = await api.post('/ai/connectchat-pilot/binding', { agentId: agentId || undefined });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Não foi possível vincular o agente de testes')); }
}

export async function previewConnectchatAgent(conversationId, guidance = '') {
  try {
    const { data } = await api.post(`/ai/connectchat-pilot/conversations/${conversationId}/preview`, { guidance });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Falha ao testar o agente nesta conversa')); }
}

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

export async function getConnectchatTyping(conversationId) {
  try {
    const { data } = await api.get(`/comm/connectchat/conversations/${conversationId}/typing`);
    return data ?? { customerTyping: false, businessTyping: false };
  } catch (err) { throw new Error(extractErrorMessage(err, 'Não foi possível consultar a digitação do cliente')); }
}

export async function markConnectchatDelivered(conversationId, sequence) {
  try {
    await api.post(`/comm/connectchat/conversations/${conversationId}/receipts/delivered`, { sequence });
  } catch (err) {
    console.warn('Não foi possível confirmar a entrega no ConnectChat.', err);
  }
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

export async function sendConnectchatAttachment(conversationId, file, attachmentKind, clientMessageId) {
  try {
    const form = new FormData();
    form.set('file', file, file.name || 'arquivo');
    form.set('attachmentKind', attachmentKind);
    form.set('clientMessageId', clientMessageId);
    const { data } = await api.post(`/comm/connectchat/conversations/${conversationId}/attachments`, form);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Não foi possível enviar o anexo')); }
}

export async function getConnectchatAttachment(attachmentId) {
  try {
    const { data, headers } = await api.get(`/comm/connectchat/attachments/${attachmentId}/content`, { responseType: 'blob' });
    return { url: URL.createObjectURL(data), mimeType: headers['content-type'] || 'application/octet-stream' };
  } catch (err) { throw new Error(extractErrorMessage(err, 'Não foi possível abrir o anexo')); }
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
