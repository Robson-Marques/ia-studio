import api, { extractErrorMessage } from '../lib/api';
import { normalizeList } from './users';

// ─── Fluxos ──────────────────────────────────────────────────

export async function listWorkflows(params = {}) {
  try {
    const { data } = await api.get('/automation/workflows', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar fluxos')); }
}

export async function getWorkflow(id) {
  try {
    const { data } = await api.get(`/automation/workflows/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o fluxo')); }
}

export async function createWorkflow(body) {
  try {
    const { data } = await api.post('/automation/workflows', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar fluxo')); }
}

export async function updateWorkflow(id, body) {
  try {
    const { data } = await api.patch(`/automation/workflows/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar fluxo')); }
}

export async function archiveWorkflow(id) {
  try {
    const { data } = await api.post(`/automation/workflows/${id}/archive`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao arquivar fluxo')); }
}

export async function deleteWorkflow(id) {
  try {
    const { data } = await api.delete(`/automation/workflows/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao excluir fluxo')); }
}

export async function saveWorkflowVersion(id, body) {
  try {
    const { data } = await api.post(`/automation/workflows/${id}/versions`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao salvar versão')); }
}

export async function listWorkflowVersions(id) {
  try {
    const { data } = await api.get(`/automation/workflows/${id}/versions`);
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar versões')); }
}

export async function publishWorkflow(id, version) {
  try {
    const { data } = await api.post(`/automation/workflows/${id}/publish`, { version });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao publicar versão')); }
}

export async function executeWorkflow(id, body) {
  try {
    const { data } = await api.post(`/automation/workflows/${id}/execute`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao executar fluxo')); }
}

export async function exportWorkflow(id) {
  try {
    const { data } = await api.get(`/automation/workflows/${id}/export`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao exportar fluxo')); }
}

export async function importWorkflow(body) {
  try {
    const { data } = await api.post('/automation/workflows/import', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao importar fluxo')); }
}

export async function rotateWebhookToken(id) {
  try {
    const { data } = await api.post(`/automation/workflows/${id}/webhook-token/rotate`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao gerar novo token')); }
}

export async function getNodesCatalog() {
  try {
    const { data } = await api.get('/automation/workflows/nodes/catalog');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar catálogo de nós')); }
}

// ─── Execuções ───────────────────────────────────────────────

export async function listExecutions(params = {}) {
  try {
    const { data } = await api.get('/automation/executions', { params });
    return data; // { total, items }
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar execuções')); }
}

export async function getExecution(id) {
  try {
    const { data } = await api.get(`/automation/executions/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar execução')); }
}

export async function retryExecution(id) {
  try {
    const { data } = await api.post(`/automation/executions/${id}/retry`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao reexecutar')); }
}

export async function cancelExecution(id) {
  try {
    const { data } = await api.post(`/automation/executions/${id}/cancel`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao cancelar execução')); }
}

// ─── Scheduler / Calendários ─────────────────────────────────

export async function previewSchedule(def) {
  try {
    const { data } = await api.post('/automation/schedule/preview', def);
    return data; // { description, next_runs }
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao calcular próximas execuções')); }
}

export async function listSchedules() {
  try {
    const { data } = await api.get('/automation/schedule');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar agendamentos')); }
}

export async function listCalendars() {
  try {
    const { data } = await api.get('/automation/schedule/calendars');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar calendários')); }
}

export async function createCalendar(body) {
  try {
    const { data } = await api.post('/automation/schedule/calendars', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar calendário')); }
}

export async function updateCalendar(id, body) {
  try {
    const { data } = await api.patch(`/automation/schedule/calendars/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar calendário')); }
}

export async function deleteCalendar(id) {
  try {
    const { data } = await api.delete(`/automation/schedule/calendars/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao excluir calendário')); }
}

// ─── Templates ───────────────────────────────────────────────

export async function listAutomationTemplates(params = {}) {
  try {
    const { data } = await api.get('/automation/templates', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar templates')); }
}

export async function createAutomationTemplate(body) {
  try {
    const { data } = await api.post('/automation/templates', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar template')); }
}

export async function updateAutomationTemplate(id, body) {
  try {
    const { data } = await api.patch(`/automation/templates/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar template')); }
}

export async function deleteAutomationTemplate(id) {
  try {
    const { data } = await api.delete(`/automation/templates/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao excluir template')); }
}

export async function renderAutomationTemplate(id, data) {
  try {
    const { data: out } = await api.post(`/automation/templates/${id}/render`, { data });
    return out;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao renderizar template')); }
}

// ─── Eventos (Event Bus) ─────────────────────────────────────

export async function listEvents(params = {}) {
  try {
    const { data } = await api.get('/automation/events', { params });
    return data; // { total, items }
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar eventos')); }
}

export async function replayEvent(id) {
  try {
    const { data } = await api.post(`/automation/events/${id}/replay`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao reprocessar evento')); }
}

// ─── Notificações ────────────────────────────────────────────

export async function getNotificationsInbox(take = 20) {
  try {
    const { data } = await api.get('/automation/notifications/inbox', { params: { take } });
    return data; // { items, unread }
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar notificações')); }
}

export async function markNotificationRead(id) {
  try {
    const { data } = await api.post(`/automation/notifications/inbox/${id}/read`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao marcar como lida')); }
}

export async function markAllNotificationsRead() {
  try {
    const { data } = await api.post('/automation/notifications/inbox/read-all');
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao marcar todas como lidas')); }
}

export async function getNotificationsLog(params = {}) {
  try {
    const { data } = await api.get('/automation/notifications/log', { params });
    return data; // { total, items }
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar log de notificações')); }
}
