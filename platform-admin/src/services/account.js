import api, { extractErrorMessage } from '../lib/api';

export async function getLicense() {
  try {
    const { data } = await api.get('/account/license');
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar a licença')); }
}

export async function getSettings() {
  try {
    const { data } = await api.get('/settings');
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar configurações')); }
}

export async function updateSettings(body) {
  try {
    const { data } = await api.patch('/settings', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao salvar configurações')); }
}
