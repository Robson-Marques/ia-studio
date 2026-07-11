import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshCw, DatabaseBackup, Package, Download, Loader2, Upload, Trash2,
  RotateCcw, Unlock, AlertTriangle, Archive,
} from 'lucide-react';
import Tabs from '../components/ui/Tabs';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../components/ui/Table';
import { usePermissions } from '../hooks/usePermissions';
import { formatDateTime } from '../lib/format';
import { toast } from '../lib/toast';
import {
  getVersion, startUpgrade, getCurrentUpgrade, releaseUpgradeLock,
  listBackups, createBackup, getCurrentBackupOp, downloadBackup, uploadBackup,
  deleteBackup, restoreBackup,
} from '../services/system';

const TABS = [
  { id: 'atualizacao', label: 'Atualização',           Icon: RefreshCw },
  { id: 'backup',      label: 'Backup e Restauração',  Icon: DatabaseBackup },
];

export default function Atualizacao() {
  const [tab, setTab] = useState('atualizacao');
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Atualização e Backup</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
          Atualize a instância para novas versões e gerencie backups de migração.
        </p>
      </div>

      <div className="card px-5 pt-4 pb-5">
        <Tabs items={TABS} active={tab} onChange={setTab} />
        {tab === 'atualizacao' && <TabAtualizacao />}
        {tab === 'backup'      && <TabBackup />}
      </div>
    </div>
  );
}

/* ═══════════════════════ Aba: Atualização ═══════════════════════ */

function TabAtualizacao() {
  const { can } = usePermissions();
  const [version, setVersion] = useState({ current_version: '—', available: [], backups_retained: 0, remote_synced: true });
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [current, setCurrent] = useState(null);   // upgrade em curso
  const [confirmTag, setConfirmTag] = useState(null);
  const [acting, setActing] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const logRef = useRef(null);
  const prevStatusRef = useRef(null);

  // Padrão do Aquapark (comprovado): polling CONTÍNUO que nunca para — 2s
  // enquanto roda, 30s parado. `loadAll` busca versão + status juntos, cada um
  // com catch: durante o restart do backend a API cai, os fetches viram null e
  // o estado anterior é preservado; quando a API volta com SUCCESS, o próximo
  // ciclo detecta e recarrega. Sem start/stop (era aí que as brechas moravam).
  const loadAll = useCallback(async (silent = false, force = false) => {
    if (!silent) setLoading(true);
    try {
      const [v, cur] = await Promise.all([
        getVersion(force).catch(() => null),
        getCurrentUpgrade().catch(() => null),
      ]);
      if (v) setVersion(v);
      if (cur !== undefined) {
        const prev = prevStatusRef.current;
        const status = cur?.status || null;
        // Concluiu: estava RUNNING, agora SUCCESS → recarrega pra pegar a versão nova.
        if (prev === 'RUNNING' && status === 'SUCCESS') {
          toast.success('Atualização concluída. Recarregando…');
          setTimeout(() => window.location.reload(), 2500);
        }
        if (prev === 'RUNNING' && status === 'FAILED') {
          toast.error(`Falha na atualização${cur?.error_step ? ` na etapa "${cur.error_step}"` : ''}.`);
        }
        // Só atualiza a referência/estado quando o fetch respondeu (não durante o
        // restart, pra não perder o "prev = RUNNING").
        if (cur !== null || status !== null) { prevStatusRef.current = status; }
        if (cur !== null) setCurrent(cur);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  async function handleCheckNow() {
    setChecking(true);
    try {
      const v = await getVersion(true).catch(() => null);
      if (v) setVersion(v);
      if (!v) return;
      if (!v.remote_synced) {
        toast.warn('Não foi possível consultar o repositório remoto. A lista pode estar desatualizada.');
      } else if (!v.available?.length) {
        toast.info('Nenhuma versão mais recente que a atual.');
      } else {
        toast.success(`${v.available.length} versão(ões) disponível(is).`);
      }
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => { loadAll(); }, [loadAll]);

  // Polling dinâmico — 2s enquanto roda, 30s parado. NUNCA para.
  const running = current?.status === 'RUNNING';
  useEffect(() => {
    const interval = running ? 2000 : 30000;
    const t = setInterval(() => loadAll(true), interval);
    return () => clearInterval(t);
  }, [running, loadAll]);

  // Auto-scroll do viewer de log.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [current?.log_lines]);

  const orphan = Boolean(current?.orphan_lock) || isStale(current);
  const newer = Array.isArray(version.available) ? version.available : [];

  async function handleUpgrade() {
    if (!confirmTag) return;
    setActing(true);
    try {
      await startUpgrade(confirmTag);
      toast.success('Atualização iniciada. Pode levar alguns minutos.');
      setConfirmTag(null);
      prevStatusRef.current = 'RUNNING';
      // Marca RUNNING localmente → o polling acelera pra 2s e a tela mostra o log.
      setCurrent({ status: 'RUNNING', log_lines: [], started_at: new Date().toISOString(), to_version: confirmTag });
      loadAll(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  async function handleReleaseLock() {
    setReleasing(true);
    try {
      await releaseUpgradeLock();
      toast.success('Lock liberado.');
      prevStatusRef.current = null;
      await loadAll(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReleasing(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Banner de lock órfão */}
      {orphan && (
        <div
          className="rounded-lg px-4 py-3 flex items-start gap-3"
          style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)' }}
        >
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--ap-text-1)' }}>Atualização travada</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-3)' }}>
              Uma atualização está marcada como em execução há mais de 10 minutos ou perdeu o processo (lock órfão).
              Liberar o lock marca a atualização como falha sem reverter arquivos já aplicados.
            </p>
          </div>
          {can('system.upgrade') && (
            <button
              className="btn-secondary shrink-0 disabled:opacity-60"
              onClick={handleReleaseLock}
              disabled={releasing}
              title="Marca a atualização como falha e libera o lock (não reverte)"
            >
              {releasing ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} className="text-amber-500" />}
              Liberar lock
            </button>
          )}
        </div>
      )}

      {/* StatCards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Versão atual" value={version.current_version || '—'} icon={Package} color="brand" />
        <StatCard label="Disponível" value={newer.length ? newer[0] : 'Nenhuma'} sub={newer.length ? `${newer.length} versão(ões) nova(s)` : 'Instância atualizada'} icon={RefreshCw} color={newer.length ? 'blue' : 'green'} />
        <StatCard label="Backups retidos" value={version.backups_retained ?? 0} icon={Archive} color="purple" />
      </div>

      {/* Viewer de log ao vivo (upgrade em curso ou último) */}
      {current && (current.log_lines?.length || running) ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ap-text-4)' }}>
              Log da atualização
            </p>
            <UpgradeStatusBadge status={current.status} />
          </div>
          <div
            ref={logRef}
            className="rounded-lg p-3 font-mono text-[11px] leading-relaxed overflow-y-auto"
            style={{
              backgroundColor: '#0b1120',
              border: '1px solid var(--ap-border)',
              color: '#cbd5e1',
              maxHeight: 320,
              minHeight: 120,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {(current.log_lines || []).length
              ? current.log_lines.map((line, i) => <div key={i}>{line}</div>)
              : <span style={{ color: '#64748b' }}>Aguardando saída do script…</span>}
            {running && <div className="flex items-center gap-2 mt-1" style={{ color: '#64748b' }}><Loader2 size={12} className="animate-spin" /> em execução…</div>}
          </div>
          {current.status === 'FAILED' && current.error_step && (
            <p className="text-xs mt-2 text-red-500">Falhou na etapa: <code>{current.error_step}</code></p>
          )}
        </div>
      ) : null}

      {/* Aviso: o servidor não conseguiu falar com o repositório remoto */}
      {version.remote_synced === false && (
        <div
          className="rounded-lg px-4 py-3 flex items-start gap-3"
          style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)' }}
        >
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--ap-text-1)' }}>Repositório remoto inacessível</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-3)' }}>
              O servidor não conseguiu buscar as versões no repositório (rede ou credencial do git).
              A lista abaixo mostra apenas as versões já conhecidas localmente.
            </p>
          </div>
        </div>
      )}

      {/* Lista de versões disponíveis */}
      <div>
        <div className="flex items-center justify-between mb-2 gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ap-text-4)' }}>
            Versões disponíveis (mais recentes que a atual)
          </p>
          <button
            className="btn-secondary !py-1 !px-2.5 text-xs disabled:opacity-60"
            onClick={handleCheckNow}
            disabled={checking || running}
            title="Consulta o repositório agora (ignora o cache de 5 minutos)"
          >
            {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Verificar agora
          </button>
        </div>
        {!newer.length ? (
          <EmptyState icon={RefreshCw} title="Instância atualizada" description="Não há versões mais recentes que a atual." />
        ) : (
          <div className="space-y-2">
            {newer.map((tag) => (
              <div
                key={tag}
                className="flex items-center gap-3 px-4 py-3 rounded-lg"
                style={{ backgroundColor: 'var(--ap-surface-2)', border: '1px solid var(--ap-border-sub)' }}
              >
                <Package size={16} className="text-brand shrink-0" />
                <span className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: 'var(--ap-text-1)' }}>{tag}</span>
                {can('system.upgrade') && (
                  <button
                    className="btn-primary shrink-0 disabled:opacity-50"
                    onClick={() => setConfirmTag(tag)}
                    disabled={running}
                    title={running ? 'Aguarde a atualização em curso' : `Atualizar a instância para ${tag}`}
                  >
                    <RefreshCw size={14} /> Atualizar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmTag)}
        danger
        loading={acting}
        title="Atualizar a instância"
        message={`Atualizar a instância para a versão "${confirmTag}"? A operação faz backup, atualiza o código e reinicia os serviços — a plataforma pode ficar indisponível por alguns minutos. Não interrompa o processo.`}
        confirmLabel="Atualizar agora"
        onClose={() => !acting && setConfirmTag(null)}
        onConfirm={handleUpgrade}
      />
    </div>
  );
}

function UpgradeStatusBadge({ status }) {
  if (status === 'RUNNING') return <Badge variant="blue">Em execução</Badge>;
  if (status === 'SUCCESS') return <Badge variant="green">Concluída</Badge>;
  if (status === 'FAILED')  return <Badge variant="red">Falhou</Badge>;
  return null;
}

// Considera lock órfão se RUNNING há mais de 10 min.
function isStale(current) {
  if (current?.status !== 'RUNNING' || !current?.started_at) return false;
  const started = new Date(current.started_at).getTime();
  if (Number.isNaN(started)) return false;
  return Date.now() - started > 10 * 60 * 1000;
}

/* ═══════════════════════ Aba: Backup e Restauração ═══════════════════════ */

function TabBackup() {
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [op, setOp] = useState(null);            // operação em curso (backup/restore)
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(null);
  const [confirm, setConfirm] = useState(null);  // { type: 'delete'|'restore', file }
  const [confirmActing, setConfirmActing] = useState(false);

  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  const loadList = useCallback(async () => {
    try {
      const { items: list } = await listBackups();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    }
  }, []);

  const pollOp = useCallback(async () => {
    try {
      const cur = await getCurrentBackupOp();
      setOp(cur);
      if (!cur || cur.status !== 'RUNNING') {
        stopPolling();
        if (cur?.status === 'SUCCESS') {
          toast.success(cur.kind === 'RESTORE' ? 'Restauração concluída.' : 'Backup concluído.');
        } else if (cur?.status === 'FAILED') {
          toast.error(cur.error || (cur.kind === 'RESTORE' ? 'Falha na restauração.' : 'Falha ao gerar backup.'));
        }
        loadList();
      }
    } catch (err) {
      toast.error(err.message);
    }
  }, [loadList]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(pollOp, 2000);
  }, [pollOp]);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      await loadList();
      try {
        const cur = await getCurrentBackupOp();
        if (!alive) return;
        setOp(cur);
        if (cur?.status === 'RUNNING') startPolling();
      } catch (err) {
        if (alive) toast.error(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; stopPolling(); };
  }, [loadList, startPolling]);

  const busy = op?.status === 'RUNNING';

  async function handleGenerate() {
    setGenerating(true);
    try {
      await createBackup();
      toast.success('Geração de backup iniciada.');
      setOp({ kind: 'BACKUP', status: 'RUNNING', started_at: new Date().toISOString() });
      startPolling();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload(file) {
    setDownloadingFile(file);
    try {
      const { blob } = await downloadBackup(file);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDownloadingFile(null);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite reenviar o mesmo arquivo
    if (!file) return;
    setUploading(true);
    try {
      await uploadBackup(file);
      toast.success('Backup enviado.');
      await loadList();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm() {
    if (!confirm) return;
    setConfirmActing(true);
    try {
      if (confirm.type === 'delete') {
        await deleteBackup(confirm.file);
        toast.success('Backup excluído.');
        setConfirm(null);
        await loadList();
      } else {
        await restoreBackup(confirm.file);
        toast.success('Restauração iniciada.');
        setConfirm(null);
        setOp({ kind: 'RESTORE', status: 'RUNNING', file_name: confirm.file, started_at: new Date().toISOString() });
        startPolling();
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConfirmActing(false);
    }
  }

  const confirmContent = confirm?.type === 'delete'
    ? {
        title: 'Excluir backup',
        message: `Excluir o backup "${confirm.file}"? Esta ação é irreversível — o arquivo não poderá ser recuperado.`,
        label: 'Excluir',
      }
    : {
        title: 'Restaurar backup',
        message: `Restaurar a instância a partir de "${confirm?.file}"? IRREVERSÍVEL: o banco e os arquivos atuais serão SUBSTITUÍDOS pelo conteúdo do backup e os serviços serão reiniciados. Gere um backup atual antes de prosseguir.`,
        label: 'Restaurar',
      };

  return (
    <div className="space-y-5">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-2">
        {can('system.backup') && (
          <button
            className="btn-primary disabled:opacity-50"
            onClick={handleGenerate}
            disabled={busy || generating}
            title={busy ? 'Aguarde a operação em curso' : 'Gerar um novo backup completo (banco + arquivos)'}
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <DatabaseBackup size={14} />} Gerar backup
          </button>
        )}
        {can('system.backup') && (
          <>
            <button
              className="btn-secondary disabled:opacity-50"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || uploading}
              title={busy ? 'Aguarde a operação em curso' : 'Enviar um arquivo de backup para o servidor'}
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Enviar backup
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleUpload}
            />
          </>
        )}
      </div>

      {/* Operação em curso */}
      {busy && (
        <div
          className="rounded-lg px-4 py-3 flex items-center gap-3"
          style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)' }}
        >
          <Loader2 size={16} className="animate-spin text-blue-500 shrink-0" />
          <p className="text-sm" style={{ color: 'var(--ap-text-2)' }}>
            {op?.kind === 'RESTORE' ? 'Restauração' : 'Backup'} em andamento{op?.file_name ? ` — ${op.file_name}` : ''}. As demais ações ficam bloqueadas até concluir.
          </p>
        </div>
      )}

      {/* Lista de backups */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
        ) : !items.length ? (
          <EmptyState icon={Archive} title="Nenhum backup" description="Gere um backup para começar." />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block">
              <Table>
                <Thead>
                  <Th>Arquivo</Th><Th className="text-right">Tamanho</Th><Th>Data</Th><Th className="text-right">Ações</Th>
                </Thead>
                <Tbody>
                  {items.map((b) => {
                    const file = backupName(b);
                    return (
                      <Tr key={file}>
                        <Td className="font-mono text-xs">{file}</Td>
                        <Td className="text-right">{formatBytes(backupSize(b))}</Td>
                        <Td>{formatDateTime(backupDate(b))}</Td>
                        <Td>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              className="btn-ghost p-1.5 disabled:opacity-40"
                              title="Baixar backup"
                              onClick={() => handleDownload(file)}
                              disabled={busy || downloadingFile === file}
                            >
                              {downloadingFile === file
                                ? <Loader2 size={15} className="animate-spin" />
                                : <Download size={15} className="text-brand" />}
                            </button>
                            {can('system.restore') && (
                              <button
                                className="btn-ghost p-1.5 disabled:opacity-40"
                                title="Restaurar a partir deste backup (irreversível)"
                                onClick={() => setConfirm({ type: 'restore', file })}
                                disabled={busy}
                              >
                                <RotateCcw size={15} className="text-amber-500" />
                              </button>
                            )}
                            {can('system.backup') && (
                              <button
                                className="btn-ghost p-1.5 disabled:opacity-40"
                                title="Excluir backup (irreversível)"
                                onClick={() => setConfirm({ type: 'delete', file })}
                                disabled={busy}
                              >
                                <Trash2 size={15} className="text-red-500" />
                              </button>
                            )}
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y px-4" style={{ borderColor: 'var(--ap-border)' }}>
              {items.map((b) => {
                const file = backupName(b);
                return (
                  <div key={file} className="py-3">
                    <p className="text-sm font-mono truncate" style={{ color: 'var(--ap-text-1)' }}>{file}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--ap-text-5)' }}>
                      {formatBytes(backupSize(b))} · {formatDateTime(backupDate(b))}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      <button
                        className="btn-secondary flex-1 justify-center disabled:opacity-40"
                        onClick={() => handleDownload(file)}
                        disabled={busy || downloadingFile === file}
                      >
                        {downloadingFile === file ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Baixar
                      </button>
                      {can('system.restore') && (
                        <button
                          className="btn-secondary p-2.5 disabled:opacity-40"
                          onClick={() => setConfirm({ type: 'restore', file })}
                          disabled={busy}
                          aria-label="Restaurar"
                          title="Restaurar (irreversível)"
                        >
                          <RotateCcw size={16} className="text-amber-500" />
                        </button>
                      )}
                      {can('system.backup') && (
                        <button
                          className="btn-secondary p-2.5 disabled:opacity-40"
                          onClick={() => setConfirm({ type: 'delete', file })}
                          disabled={busy}
                          aria-label="Excluir"
                          title="Excluir (irreversível)"
                        >
                          <Trash2 size={16} className="text-red-500" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        danger
        loading={confirmActing}
        title={confirmContent.title}
        message={confirmContent.message}
        confirmLabel={confirmContent.label}
        onClose={() => !confirmActing && setConfirm(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

/* ───── helpers defensivos de shape de backup ───── */
function backupName(b) { return b?.file || b?.file_name || b?.fileName || b?.name || '—'; }
function backupSize(b) { return b?.size ?? b?.bytes ?? b?.size_bytes ?? null; }
function backupDate(b) { return b?.created_at || b?.createdAt || b?.date || b?.modified_at || b?.mtime || null; }

function formatBytes(bytes) {
  if (bytes == null) return '—';
  const n = Number(bytes);
  if (Number.isNaN(n)) return '—';
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
