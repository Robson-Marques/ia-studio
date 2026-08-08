import api, { extractErrorMessage, normalizeList } from '../lib/api';

export async function getBaseDomain() {
  try {
    const { data } = await api.get('/console/domains/base');
    return data?.base_domain || '';
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o domínio-base')); }
}

export async function saveBaseDomain(baseDomain) {
  try {
    const { data } = await api.patch('/console/domains/base', { base_domain: baseDomain });
    return data?.base_domain || '';
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao salvar o domínio-base')); }
}

/** `organizationId` = 'null' filtra os endereços da plataforma. */
export async function listDomains(params = {}) {
  try {
    const { data } = await api.get('/console/domains', { params });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar os endereços')); }
}

export async function createDomain(body) {
  try {
    const { data } = await api.post('/console/domains', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao cadastrar o endereço')); }
}

export async function updateDomain(id, body) {
  try {
    const { data } = await api.patch(`/console/domains/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar o endereço')); }
}

export async function setPrimaryDomain(id) {
  try {
    const { data } = await api.post(`/console/domains/${id}/primary`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao definir o endereço principal')); }
}

/** Manda o servidor verificar o DNS, publicar o endereço e emitir o certificado. */
export async function activateDomain(id) {
  try {
    const { data } = await api.post(`/console/domains/${id}/activate`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao verificar o endereço')); }
}

export async function getAutoVerify() {
  try {
    const { data } = await api.get('/console/domains/auto-verify');
    return data?.auto_verify === true;
  } catch { return false; }
}

export async function setAutoVerify(enabled) {
  try {
    const { data } = await api.patch('/console/domains/auto-verify', { enabled });
    return data?.auto_verify === true;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao alterar a reverificação automática')); }
}

export async function deleteDomain(id) {
  try {
    const { data } = await api.delete(`/console/domains/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao remover o endereço')); }
}
