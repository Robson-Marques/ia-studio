import api, { extractErrorMessage } from '../lib/api';
import { normalizeList } from './users';

export async function listProfiles() {
  try {
    const { data } = await api.get('/profiles');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar perfis')); }
}

export async function createProfile(body) {
  try {
    const { data } = await api.post('/profiles', body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao criar perfil')); }
}

export async function updateProfile(id, body) {
  try {
    const { data } = await api.patch(`/profiles/${id}`, body);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao atualizar perfil')); }
}

export async function deleteProfile(id) {
  try {
    const { data } = await api.delete(`/profiles/${id}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao excluir perfil')); }
}

// Catalogo de permissoes agrupado. Normaliza formatos possiveis:
//   [{ group|name, label?, permissions: [{ key|id, label? } | 'core.users.read'] }]
//   { 'Grupo': ['core.users.read', ...] }
// → [{ id, label, permissions: [{ key, label }] }]
export async function getPermissionsCatalog() {
  try {
    const { data } = await api.get('/profiles/permissions-catalog');
    return normalizeCatalog(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar catálogo de permissões')); }
}

export function normalizeCatalog(raw) {
  if (!raw) return [];
  const normPerm = (p) => {
    if (typeof p === 'string') return { key: p, label: p };
    return { key: p.key || p.id || p.permission || '', label: p.label || p.name || p.key || p.id || '' };
  };

  // Formato oficial do backend: { permissions[], groups[], labels{} }.
  // groups[] = [{ id/key, label, permissions: [chave] }]; labels = { chave: 'Rótulo humano' }.
  // É aqui que o rótulo humano entra — sem isto a tela imprimia a chave crua.
  if (raw && !Array.isArray(raw) && Array.isArray(raw.groups)) {
    const labels = raw.labels || {};
    const humanize = (key) => labels[key] || key;
    return raw.groups.map((g, i) => ({
      id: g.id || g.key || g.label || `group-${i}`,
      label: g.label || g.name || `Grupo ${i + 1}`,
      permissions: (g.permissions || g.items || [])
        .map((k) => (typeof k === 'string' ? { key: k, label: humanize(k) } : normPerm(k)))
        .filter((p) => p.key),
    }));
  }

  if (Array.isArray(raw)) {
    return raw.map((g, i) => ({
      id: g.id || g.group || g.name || `group-${i}`,
      label: g.label || g.name || g.group || `Grupo ${i + 1}`,
      permissions: (g.permissions || g.items || []).map(normPerm).filter((p) => p.key),
    }));
  }
  // Objeto { grupo: perms[] } (formato legado/alternativo).
  return Object.entries(raw).map(([key, perms]) => ({
    id: key,
    label: key,
    permissions: (Array.isArray(perms) ? perms : []).map(normPerm).filter((p) => p.key),
  }));
}
