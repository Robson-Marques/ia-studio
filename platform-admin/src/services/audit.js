import api, { extractErrorMessage } from '../lib/api';
import { normalizeList } from './users';

export async function listAudit(params = {}) {
  try {
    const clean = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== '' && v != null),
    );
    const { data } = await api.get('/audit', { params: clean });
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar auditoria')); }
}
