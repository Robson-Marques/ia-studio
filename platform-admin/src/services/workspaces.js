import api, { extractErrorMessage } from '../lib/api';
import { normalizeList } from './users';

export async function listWorkspaces() {
  try {
    const { data } = await api.get('/workspaces');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar workspaces')); }
}

export async function createWorkspace(body) {
  try {
    const { data } = await api.post('/workspaces', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar workspace')); }
}

export async function updateWorkspace(id, body) {
  try {
    const { data } = await api.patch(`/workspaces/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar workspace')); }
}

export async function listEnvironments(workspaceId) {
  try {
    const { data } = await api.get(`/workspaces/${workspaceId}/environments`);
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar ambientes')); }
}

export async function createEnvironment(workspaceId, body) {
  try {
    const { data } = await api.post(`/workspaces/${workspaceId}/environments`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar ambiente')); }
}

export async function updateEnvironment(workspaceId, envId, body) {
  try {
    const { data } = await api.patch(`/workspaces/${workspaceId}/environments/${envId}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar ambiente')); }
}
