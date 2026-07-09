import api, { extractErrorMessage, normalizeList } from '../lib/api';

// Serviço do Console para Atualização (upgrade) e Backup/Restauração da instância.
// Endpoints sob /console/system (platform-admin only). Shapes tratados
// defensivamente — normalizeList onde vier lista.

/* ───────────────────────── Atualização ───────────────────────── */

// force=true ignora o cache de 5min do backend e refaz o `git fetch --tags`.
export async function getVersion(force = false) {
  try {
    const { data } = await api.get('/console/system/version', { params: force ? { force: '1' } : {} });
    return {
      current_version: data?.current_version || data?.current || '—',
      available: Array.isArray(data?.available) ? data.available : [],
      backups_retained: data?.backups_retained ?? data?.backupsRetained ?? 0,
      // false = o git fetch falhou (sem rede/credencial): a lista pode estar velha.
      remote_synced: data?.remote_synced !== false,
    };
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar versão')); }
}

export async function startUpgrade(version) {
  try {
    const { data } = await api.post('/console/system/upgrade', { version });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao iniciar atualização')); }
}

export async function getCurrentUpgrade() {
  try {
    const { data } = await api.get('/console/system/upgrade/current');
    if (!data) return null;
    return {
      status: data.status || null,
      log_lines: Array.isArray(data.log_lines) ? data.log_lines : (Array.isArray(data.logLines) ? data.logLines : []),
      error_step: data.error_step || data.errorStep || null,
      started_at: data.started_at || data.startedAt || null,
      to_version: data.to_version || data.toVersion || null,
      orphan_lock: Boolean(data.orphan_lock ?? data.orphanLock ?? false),
    };
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao consultar atualização em curso')); }
}

export async function getUpgradeHistory() {
  try {
    const { data } = await api.get('/console/system/upgrade/history');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar histórico de atualizações')); }
}

export async function releaseUpgradeLock() {
  try {
    const { data } = await api.post('/console/system/upgrade/release-lock');
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao liberar lock')); }
}

/* ───────────────────────── Backup / Restauração ───────────────────────── */

export async function listBackups() {
  try {
    const { data } = await api.get('/console/system/backups');
    return normalizeList(data);
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar backups')); }
}

export async function createBackup() {
  try {
    const { data } = await api.post('/console/system/backups');
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao gerar backup')); }
}

export async function getCurrentBackupOp() {
  try {
    const { data } = await api.get('/console/system/backups/current');
    if (!data) return null;
    return {
      kind: data.kind || null,
      status: data.status || null,
      file_name: data.file_name || data.fileName || null,
      log_lines: Array.isArray(data.log_lines) ? data.log_lines : (Array.isArray(data.logLines) ? data.logLines : []),
      error: data.error || null,
      started_at: data.started_at || data.startedAt || null,
    };
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao consultar operação em curso')); }
}

// Baixa o backup como blob (stream) — o chamador cria um anchor/objeto-URL.
export async function downloadBackup(file) {
  try {
    const { data, headers } = await api.get(
      `/console/system/backups/${encodeURIComponent(file)}/download`,
      { responseType: 'blob' },
    );
    return { blob: data, contentType: headers?.['content-type'] };
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao baixar backup')); }
}

export async function uploadBackup(fileObj, onProgress) {
  try {
    const form = new FormData();
    form.append('file', fileObj);
    const { data } = await api.post('/console/system/backups/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100));
      },
    });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao enviar backup')); }
}

export async function deleteBackup(file) {
  try {
    const { data } = await api.delete(`/console/system/backups/${encodeURIComponent(file)}`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao excluir backup')); }
}

export async function restoreBackup(file) {
  try {
    const { data } = await api.post('/console/system/restore', { file });
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao iniciar restauração')); }
}
