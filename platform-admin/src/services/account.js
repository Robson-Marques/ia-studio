import api, { extractErrorMessage } from '../lib/api';

export async function getLicense() {
  try {
    const { data } = await api.get('/account/license');
    // O back devolve envelope { license, plan, limits, usage } — as telas fazem
    // `data.license || data` e depois leem .plan/.limits/.usage. Quando havia
    // licença, o sub-objeto `license` (só status/chave/datas) era escolhido e
    // plan/limits/usage sumiam. Achata num objeto único.
    const env = data || {};
    return { ...(env.license || {}), plan: env.plan, limits: env.limits, usage: env.usage };
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
