import api, { extractErrorMessage } from '../lib/api';

// Administração local da instalação, sem escopo de organização: estas ações
// sempre afetam somente a instância em que o painel está autenticado.

export async function getVersion(force = false) {
  try {
    const { data } = await api.get('/system/version', { params: force ? { force: '1' } : {} });
    return {
      current_version: data?.current_version || data?.current || '—',
      available: Array.isArray(data?.available) ? data.available : [],
      backups_retained: data?.backups_retained ?? data?.backupsRetained ?? 0,
      remote_synced: data?.remote_synced !== false,
    };
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar a versão da instalação')); }
}

export async function startUpgrade(version) {
  try {
    const { data } = await api.post('/system/upgrade', { version });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao iniciar a atualização')); }
}

export async function getCurrentUpgrade() {
  try {
    const { data } = await api.get('/system/upgrade/current');
    const row = data?.upgrade ?? (data?.status ? data : null);
    if (!row) return null;
    return {
      status: row.status || null,
      log_lines: Array.isArray(row.log_lines) ? row.log_lines : (Array.isArray(row.logLines) ? row.logLines : []),
      error_step: row.error_step || row.errorStep || null,
      started_at: row.started_at || row.startedAt || null,
      finished_at: row.finished_at || row.finishedAt || null,
      from_version: row.from_version || row.fromVersion || null,
      to_version: row.to_version || row.toVersion || null,
      orphan_lock: Boolean(data?.orphaned ?? row.orphan_lock ?? false),
    };
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao consultar a atualização')); }
}

export async function getUpgradeHistory() {
  try {
    const { data } = await api.get('/system/upgrade/history');
    return Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o histórico')); }
}

export async function releaseUpgradeLock() {
  try {
    const { data } = await api.post('/system/upgrade/release-lock');
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao liberar o lock')); }
}

export async function listBackups() {
  try {
    const { data } = await api.get('/system/backups');
    return Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao listar backups')); }
}

export async function createBackup() {
  try {
    const { data } = await api.post('/system/backups');
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao gerar backup')); }
}

export async function getCurrentBackupOperation(id) {
  try {
    const { data } = await api.get('/system/backups/current', { params: id ? { id } : {} });
    const row = data?.operation ?? (data?.status ? data : null);
    if (!row) return null;
    return {
      id: row.id || null,
      kind: row.kind || null,
      status: row.status || null,
      file_name: row.file_name || row.fileName || null,
      log_lines: Array.isArray(row.log_lines) ? row.log_lines : (Array.isArray(row.logLines) ? row.logLines : []),
      error: row.error || null,
      started_at: row.started_at || row.startedAt || null,
      finished_at: row.finished_at || row.finishedAt || null,
    };
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao consultar a operação de backup')); }
}

export async function downloadBackup(file) {
  try {
    const { data } = await api.get(`/system/backups/${encodeURIComponent(file)}/download`, { responseType: 'blob' });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao baixar backup')); }
}

export async function uploadBackup(file) {
  try {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post('/system/backups/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao enviar backup')); }
}

export async function deleteBackup(file) {
  try {
    const { data } = await api.delete(`/system/backups/${encodeURIComponent(file)}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao excluir backup')); }
}

export async function restoreBackup(file) {
  try {
    const { data } = await api.post('/system/restore', { file });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao iniciar restauração')); }
}
