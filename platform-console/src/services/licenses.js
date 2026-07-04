import api, { extractErrorMessage } from '../lib/api';

export async function getLicense(orgId) {
  try {
    const { data } = await api.get(`/console/licenses/${orgId}`);
    return data?.license || data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar licença')); }
}

// PATCH /console/licenses/:orgId — troca de plano, mudança de status ou
// geração de nova chave ({ regenerate_key: true }).
export async function updateLicense(orgId, body) {
  try {
    const { data } = await api.patch(`/console/licenses/${orgId}`, body);
    return data?.license || data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar licença')); }
}
