import api, { extractErrorMessage, normalizeList } from '../lib/api';

export async function listPlans() {
  try {
    const { data } = await api.get('/console/plans');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar planos')); }
}

export async function createPlan(body) {
  try {
    const { data } = await api.post('/console/plans', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar plano')); }
}

export async function updatePlan(id, body) {
  try {
    const { data } = await api.patch(`/console/plans/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar plano')); }
}
