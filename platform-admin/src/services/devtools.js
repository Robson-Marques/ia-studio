import api, { extractErrorMessage } from '../lib/api';

// Serviço do Console do Desenvolvedor (Fase 7 — Frente B). Base do axios já é
// /api/v1; os endpoints vivem sob /devtools/*. Cada chamada devolve o resultado
// bruto da execução (JSON) para exibição.

// Execute — testa IProvider.execute via connection.
// Body: { connection_id, operation, params? }.
export async function runExecute(body) {
  try {
    const { data } = await api.post('/devtools/execute', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao executar operação')); }
}

// SQL — read-only por default. Body: { connection_id, sql }.
export async function runSql(body) {
  try {
    const { data } = await api.post('/devtools/sql', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao executar SQL')); }
}

// HTTP — chamada HTTP livre. Body: { method, url, headers?, body?, connection_id?, timeout_ms? }.
// headers no formato [{ key, value }].
export async function runHttp(body) {
  try {
    const { data } = await api.post('/devtools/http', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro na requisição HTTP')); }
}

// IA — chat via connection AI. Body: { connection_id, model, prompt, system?, temperature?, max_tokens? }.
export async function runAi(body) {
  try {
    const { data } = await api.post('/devtools/ai', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao chamar a IA')); }
}

// Tool — roda uma tool do catálogo. Body: { tool_key, input, connection_id? }.
export async function runTool(body) {
  try {
    const { data } = await api.post('/devtools/tool', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao executar a ferramenta')); }
}
