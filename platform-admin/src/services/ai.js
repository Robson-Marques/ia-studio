import api, { extractErrorMessage } from '../lib/api';
import { normalizeList } from './users';

// Serviço da AI Platform (Fase 5). Segue o padrão dos demais serviços
// (api + extractErrorMessage + normalizeList). Base do axios já é /api/v1;
// os endpoints da fase vivem sob /ai/*.

// ─── Agentes ─────────────────────────────────────────────────

export async function listAgents(params = {}) {
  try {
    const { data } = await api.get('/ai/agents', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar agentes')); }
}

export async function getAgent(id) {
  try {
    const { data } = await api.get(`/ai/agents/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o agente')); }
}

export async function createAgent(body) {
  try {
    const { data } = await api.post('/ai/agents', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar agente')); }
}

export async function updateAgent(id, body) {
  try {
    const { data } = await api.patch(`/ai/agents/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar agente')); }
}

export async function listAgentVersions(id) {
  try {
    const { data } = await api.get(`/ai/agents/${id}/versions`);
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar versões do agente')); }
}

export async function saveAgentVersion(id, body) {
  try {
    const { data } = await api.post(`/ai/agents/${id}/versions`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao salvar versão do agente')); }
}

export async function publishAgent(id, version) {
  try {
    const { data } = await api.post(`/ai/agents/${id}/publish`, { version });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao publicar versão do agente')); }
}

export async function listAgentRuns(id, params = {}) {
  try {
    const { data } = await api.get(`/ai/agents/${id}/runs`, { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar execuções do agente')); }
}

export async function executeAgent(id, body) {
  try {
    const { data } = await api.post(`/ai/agents/${id}/execute`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao executar agente')); }
}

export async function exportAgent(id) {
  try {
    const { data } = await api.get(`/ai/agents/${id}/export`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao exportar agente')); }
}

export async function importAgent(body) {
  try {
    const { data } = await api.post('/ai/agents/import', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao importar agente')); }
}

// ─── Bases de Conhecimento (RAG) ─────────────────────────────

export async function listKnowledgeBases(params = {}) {
  try {
    const { data } = await api.get('/ai/knowledge/bases', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar bases de conhecimento')); }
}

export async function getKnowledgeBase(id) {
  try {
    const { data } = await api.get(`/ai/knowledge/bases/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar a base de conhecimento')); }
}

export async function createKnowledgeBase(body) {
  try {
    const { data } = await api.post('/ai/knowledge/bases', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar base de conhecimento')); }
}

export async function updateKnowledgeBase(id, body) {
  try {
    const { data } = await api.patch(`/ai/knowledge/bases/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar base de conhecimento')); }
}

export async function deleteKnowledgeBase(id) {
  try {
    const { data } = await api.delete(`/ai/knowledge/bases/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao excluir base de conhecimento')); }
}

export async function addKnowledgeDocument(id, body) {
  try {
    const { data } = await api.post(`/ai/knowledge/bases/${id}/documents`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao adicionar documento')); }
}

export async function queryKnowledgeBase(id, body) {
  try {
    const { data } = await api.post(`/ai/knowledge/bases/${id}/query`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao consultar a base de conhecimento')); }
}

// ─── Memória ─────────────────────────────────────────────────

export async function listMemoryProfiles(params = {}) {
  try {
    const { data } = await api.get('/ai/memory/profiles', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar perfis de memória')); }
}

export async function getMemoryProfile(id) {
  try {
    const { data } = await api.get(`/ai/memory/profiles/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o perfil de memória')); }
}

export async function createMemoryProfile(body) {
  try {
    const { data } = await api.post('/ai/memory/profiles', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar perfil de memória')); }
}

export async function updateMemoryProfile(id, body) {
  try {
    const { data } = await api.patch(`/ai/memory/profiles/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar perfil de memória')); }
}

export async function listMemoryEntries(id, params = {}) {
  try {
    const { data } = await api.get(`/ai/memory/profiles/${id}/entries`, { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar entradas de memória')); }
}

// ─── Ferramentas (catálogo) ──────────────────────────────────

export async function listTools(params = {}) {
  try {
    const { data } = await api.get('/ai/tools', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar ferramentas')); }
}

export async function createTool(body) {
  try {
    const { data } = await api.post('/ai/tools', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar ferramenta')); }
}

export async function updateTool(id, body) {
  try {
    const { data } = await api.patch(`/ai/tools/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar ferramenta')); }
}

// ─── MCP Servers ─────────────────────────────────────────────

export async function listMcpServers(params = {}) {
  try {
    const { data } = await api.get('/ai/mcp', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar servidores MCP')); }
}

export async function createMcpServer(body) {
  try {
    const { data } = await api.post('/ai/mcp', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao cadastrar servidor MCP')); }
}

export async function getMcpServerTools(id) {
  try {
    const { data } = await api.get(`/ai/mcp/${id}/tools`);
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar tools do servidor MCP')); }
}

export async function syncMcpServer(id) {
  try {
    const { data } = await api.post(`/ai/mcp/${id}/sync`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao sincronizar servidor MCP')); }
}

// ─── Aprovações ──────────────────────────────────────────────

export async function listApprovals(params = {}) {
  try {
    const { data } = await api.get('/ai/approvals', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar aprovações')); }
}

export async function decideApproval(id, body) {
  try {
    const { data } = await api.post(`/ai/approvals/${id}/decide`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao decidir aprovação')); }
}

export async function listApprovalPolicies(params = {}) {
  try {
    const { data } = await api.get('/ai/approvals/policies', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar políticas de aprovação')); }
}

export async function createApprovalPolicy(body) {
  try {
    const { data } = await api.post('/ai/approvals/policies', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar política de aprovação')); }
}

// ─── Custos ──────────────────────────────────────────────────

export async function getCostsSummary(params = {}) {
  try {
    const { data } = await api.get('/ai/costs/summary', { params });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar consumo de IA')); }
}

export async function listBudgets(params = {}) {
  try {
    const { data } = await api.get('/ai/costs/budgets', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar orçamentos')); }
}

export async function createBudget(body) {
  try {
    const { data } = await api.post('/ai/costs/budgets', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar orçamento')); }
}

export async function updateBudget(id, body) {
  try {
    const { data } = await api.patch(`/ai/costs/budgets/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar orçamento')); }
}

export async function simulateCost(body) {
  try {
    const { data } = await api.post('/ai/costs/simulate', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao simular custo')); }
}

// ─── Colaboração entre agentes ───────────────────────────────

export async function listCollaborations(params = {}) {
  try {
    const { data } = await api.get('/ai/collaboration', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar colaborações')); }
}

export async function createCollaboration(body) {
  try {
    const { data } = await api.post('/ai/collaboration', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar colaboração')); }
}

// ─── Análise de atendimento ──────────────────────────────────

// Lista as análises (uma linha por sugestão; a tela agrupa por trace).
export async function listAttendanceAnalyses(params = {}) {
  try {
    const { data } = await api.get('/ai/attendance-analysis', { params });
    return Array.isArray(data) ? data : [];
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar análises de atendimento')); }
}

// Dispara a análise de uma conversa. Gasta IA; só quem tem ai.analysis.run.
export async function analyzeAttendanceChat(chatId) {
  try {
    const { data } = await api.post('/ai/attendance-analysis/analyze-chat', { chat_id: chatId });
    return data; // { trace_id, chat_id, contact_name, suggestions }
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao analisar a conversa')); }
}

// ─── Revisão de conteúdo do assistente ───────────────────────

// Histórico de revisões de um assistente (cada uma com result_json).
export async function listContentReviews(agentId) {
  try {
    const { data } = await api.get(`/ai/agents/${agentId}/content-reviews`);
    return Array.isArray(data) ? data : [];
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar revisões de conteúdo')); }
}

// Dispara a revisão: compara as fontes do assistente. Gasta IA; ai.agents.write.
export async function reviewAgentContent(agentId) {
  try {
    const { data } = await api.post(`/ai/agents/${agentId}/content-reviews`);
    return data; // a revisão criada (status/result_json/...)
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao revisar o conteúdo do assistente')); }
}

// Baixa uma revisão já produzida (PDF/TXT). Retorna binário — dispara o download
// no navegador (não é artifact, então <a download> funciona normalmente).
export async function exportContentReview(agentId, reviewId, format = 'pdf') {
  try {
    const { data, headers } = await api.get(
      `/ai/agents/${agentId}/content-reviews/${reviewId}/export`,
      { params: { format }, responseType: 'blob' },
    );
    const cd = headers?.['content-disposition'] || '';
    const match = /filename="?([^"]+)"?/.exec(cd);
    const filename = match ? match[1] : `revisao-ia.${format}`;
    const url = window.URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao exportar a revisão')); }
}
