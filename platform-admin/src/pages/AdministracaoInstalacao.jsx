import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge, Banner, Button, Card, ConfirmDialog, EmptyState, PageHeader,
  Screen, Spinner, Tabs, useToast,
} from '@studio-ux-ds/react';
import { formatDateTime } from '../lib/format';
import {
  createBackup, deleteBackup, downloadBackup, getCurrentBackupOperation,
  getCurrentUpgrade, getUpgradeHistory, getVersion, listBackups,
  releaseUpgradeLock, restoreBackup, startUpgrade, uploadBackup,
} from '../services/system';

const PAGE_TABS = [
  { id: 'update', label: 'Atualização', icon: 'refresh' },
  { id: 'backup', label: 'Backup e restauração', icon: 'database' },
];

export default function AdministracaoInstalacao() {
  const [tab, setTab] = useState('update');
  return (
    <Screen as="div" className="space-y-6">
      <PageHeader
        title="Administração da instalação"
        subtitle="Atualize esta instância e administre os backups operacionais. Essas ações afetam somente este IA Studio."
      />
      <Tabs items={PAGE_TABS} value={tab} onChange={setTab} />
      {tab === 'update' ? <Atualizacao /> : <Backups />}
    </Screen>
  );
}

function Atualizacao() {
  const toast = useToast();
  const [version, setVersion] = useState({ current_version: '—', available: [], backups_retained: 0, remote_synced: true });
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [confirmVersion, setConfirmVersion] = useState(null);
  const [starting, setStarting] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const previousStatus = useRef(null);

  const load = useCallback(async (silent = false, force = false) => {
    if (!silent) setLoading(true);
    try {
      const [info, running, entries] = await Promise.all([
        getVersion(force).catch(() => null),
        getCurrentUpgrade().catch(() => null),
        getUpgradeHistory().catch(() => []),
      ]);
      if (info) setVersion(info);
      setHistory(entries);
      if (running) {
        const prior = previousStatus.current;
        if (prior === 'RUNNING' && running.status === 'SUCCESS') toast.success('Atualização concluída. A versão instalada foi recarregada.');
        if (prior === 'RUNNING' && running.status === 'FAILED') toast.error(`Atualização falhou${running.error_step ? ` na etapa ${running.error_step}` : ''}.`);
        previousStatus.current = running.status;
        setCurrent(running);
      }
    } catch (err) {
      if (!silent) toast.error(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  const running = current?.status === 'RUNNING';
  useEffect(() => {
    const timer = setInterval(() => load(true), running ? 2_000 : 30_000);
    return () => clearInterval(timer);
  }, [load, running]);

  async function refresh() {
    setChecking(true);
    try {
      await load(true, true);
      toast.success('Versões verificadas.');
    } finally { setChecking(false); }
  }

  async function confirmUpgrade() {
    if (!confirmVersion) return;
    setStarting(true);
    try {
      await startUpgrade(confirmVersion);
      previousStatus.current = 'RUNNING';
      setCurrent({ status: 'RUNNING', to_version: confirmVersion, log_lines: [], started_at: new Date().toISOString() });
      setConfirmVersion(null);
      toast.success('Atualização iniciada. O log será exibido abaixo.');
      await load(true);
    } catch (err) { toast.error(err.message); }
    finally { setStarting(false); }
  }

  async function releaseLock() {
    setReleasing(true);
    try {
      await releaseUpgradeLock();
      previousStatus.current = null;
      await load(true);
      toast.success('Lock órfão liberado e registrado como falha.');
    } catch (err) { toast.error(err.message); }
    finally { setReleasing(false); }
  }

  const orphan = Boolean(current?.orphan_lock) || (running && current?.started_at && Date.now() - new Date(current.started_at).getTime() > 10 * 60 * 1000);
  const available = version.available || [];

  return (
    <div className="space-y-4">
      {orphan && (
        <Banner tone="warning" title="Atualização travada">
          O processo está marcado como em execução há mais de 10 minutos. Liberar o lock registra falha e permite nova tentativa; não reverte arquivos já aplicados.
          <div className="mt-3"><Button variant="secondary" loading={releasing} onClick={releaseLock}>Liberar lock</Button></div>
        </Banner>
      )}
      {!version.remote_synced && <Banner tone="warning">Não foi possível consultar o repositório remoto. A lista de versões pode estar desatualizada.</Banner>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Metric label="Versão instalada" value={version.current_version} />
        <Metric label="Versões disponíveis" value={available.length ? available[0] : 'Nenhuma'} detail={available.length ? `${available.length} versão(ões) pronta(s)` : 'Instância atualizada'} />
        <Metric label="Backups retidos" value={String(version.backups_retained ?? 0)} />
      </div>
      <Card><div className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold m-0">Atualizar software</p><p className="text-sm m-0" style={{ color: 'var(--su-text-muted)' }}>O processo é exclusivo desta instância e grava o histórico para auditoria.</p></div>
          <Button variant="secondary" loading={checking} onClick={refresh}>Verificar versões</Button>
        </div>
        {loading ? <Spinner size="md" /> : available.length === 0 ? <EmptyState icon="check-circle" title="Tudo atualizado" description="Nenhuma versão mais recente está disponível." /> : (
          <div className="space-y-2">
            {available.map((item) => <div key={item} className="flex flex-wrap items-center justify-between gap-3 rounded p-3" style={{ border: '1px solid var(--su-border-default)' }}>
              <code style={{ fontFamily: 'var(--su-font-mono, monospace)' }}>{item}</code>
              <Button variant="primary" disabled={running} onClick={() => setConfirmVersion(item)}>Atualizar para esta versão</Button>
            </div>)}
          </div>
        )}
      </div></Card>
      {current && <UpgradeLog current={current} />}
      <Card><div className="p-5 space-y-3">
        <p className="font-semibold m-0">Histórico de atualização</p>
        {!history.length ? <p className="text-sm m-0" style={{ color: 'var(--su-text-muted)' }}>Ainda não houve atualização registrada nesta instância.</p> : <History entries={history} />}
      </div></Card>
      <ConfirmDialog
        open={Boolean(confirmVersion)}
        onClose={() => !starting && setConfirmVersion(null)}
        onConfirm={confirmUpgrade}
        loading={starting}
        title="Iniciar atualização"
        message={`Atualizar esta instância para ${confirmVersion || ''}? Um backup recente é recomendado antes de continuar.`}
        confirmLabel="Iniciar atualização"
      />
    </div>
  );
}

function Backups() {
  const toast = useToast();
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [operation, setOperation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [files, current] = await Promise.all([listBackups(), getCurrentBackupOperation()]);
      setItems(files);
      setOperation(current);
    } catch (err) { if (!silent) toast.error(err.message); }
    finally { if (!silent) setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  const active = operation?.status === 'RUNNING';
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => load(true), 2_000);
    return () => clearInterval(timer);
  }, [active, load]);

  async function generate() {
    setBusy(true);
    try { await createBackup(); setOperation({ kind: 'BACKUP', status: 'RUNNING', log_lines: [] }); toast.success('Backup iniciado.'); await load(true); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try { await uploadBackup(file); toast.success('Backup enviado.'); await load(true); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }
  async function download(file) {
    setBusy(true);
    try {
      const blob = await downloadBackup(file);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = file; link.click(); URL.revokeObjectURL(url);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }
  async function actConfirmed() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.type === 'delete') { await deleteBackup(confirm.file); toast.success('Backup excluído.'); }
      else { await restoreBackup(confirm.file); setOperation({ kind: 'RESTORE', status: 'RUNNING', file_name: confirm.file, log_lines: [] }); toast.success('Restauração iniciada.'); }
      setConfirm(null); await load(true);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <Banner tone="warning" title="Restauração substitui a instância">Antes de restaurar, gere e baixe um backup atual. A restauração substitui banco e arquivos e reinicia os serviços.</Banner>
    {active && <OperationLog operation={operation} />}
    <Card><div className="p-5 space-y-4">
      <div className="flex flex-wrap gap-2"><Button variant="primary" loading={busy} disabled={active} onClick={generate}>Gerar backup</Button><Button variant="secondary" disabled={busy || active} onClick={() => inputRef.current?.click()}>Enviar backup</Button><input ref={inputRef} className="hidden" type="file" onChange={upload} /></div>
      {loading ? <Spinner size="md" /> : !items.length ? <EmptyState icon="database" title="Nenhum backup" description="Gere um backup antes de qualquer manutenção de risco." /> : <div className="space-y-2">{items.map((backup) => {
        const file = backup.file || backup.file_name || backup.name;
        return <div key={file} className="flex flex-wrap items-center justify-between gap-3 rounded p-3" style={{ border: '1px solid var(--su-border-default)' }}><div className="min-w-0"><code className="block truncate" style={{ fontFamily: 'var(--su-font-mono, monospace)' }}>{file}</code><span className="text-xs" style={{ color: 'var(--su-text-muted)' }}>{bytes(backup.size_bytes ?? backup.size)} · {formatDateTime(backup.created_at)}</span></div><div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" disabled={busy || active} onClick={() => download(file)}>Baixar</Button><Button variant="secondary" size="sm" disabled={busy || active} onClick={() => setConfirm({ type: 'restore', file })}>Restaurar</Button><Button variant="danger" size="sm" disabled={busy || active} onClick={() => setConfirm({ type: 'delete', file })}>Excluir</Button></div></div>;
      })}</div>}
    </div></Card>
    <ConfirmDialog open={Boolean(confirm)} onClose={() => !busy && setConfirm(null)} onConfirm={actConfirmed} loading={busy} danger title={confirm?.type === 'restore' ? 'Restaurar backup' : 'Excluir backup'} message={confirm?.type === 'restore' ? `Restaurar ${confirm?.file || ''}? Banco e arquivos atuais serão substituídos.` : `Excluir ${confirm?.file || ''}? Esta ação não pode ser desfeita.`} confirmLabel={confirm?.type === 'restore' ? 'Restaurar' : 'Excluir'} />
  </div>;
}

function Metric({ label, value, detail }) { return <Card><div className="p-5"><p className="text-sm m-0" style={{ color: 'var(--su-text-muted)' }}>{label}</p><p className="text-xl font-bold mt-1 mb-0">{value}</p>{detail && <p className="text-xs m-0" style={{ color: 'var(--su-text-muted)' }}>{detail}</p>}</div></Card>; }
function statusTone(status) { return status === 'SUCCESS' ? 'success' : status === 'FAILED' ? 'danger' : status === 'RUNNING' ? 'warning' : 'neutral'; }
function UpgradeLog({ current }) { return <Card><div className="p-5 space-y-3"><div className="flex items-center justify-between gap-3"><p className="font-semibold m-0">Atualização {current.to_version ? `para ${current.to_version}` : ''}</p><Badge tone={statusTone(current.status)}>{current.status || 'desconhecido'}</Badge></div>{current.error_step && <Banner tone="danger">Falha na etapa: {current.error_step}</Banner>}<Log lines={current.log_lines} empty={current.status === 'RUNNING' ? 'Aguardando saída do script…' : 'Nenhum log registrado.'} /></div></Card>; }
function OperationLog({ operation }) { return <Card><div className="p-5 space-y-3"><div className="flex items-center justify-between gap-3"><p className="font-semibold m-0">{operation.kind === 'RESTORE' ? 'Restauração' : 'Backup'} em andamento</p><Badge tone={statusTone(operation.status)}>{operation.status}</Badge></div><Log lines={operation.log_lines} empty="Aguardando saída da operação…" /></div></Card>; }
function Log({ lines, empty }) { return <pre style={{ margin: 0, padding: 12, maxHeight: 320, overflow: 'auto', borderRadius: 8, border: '1px solid var(--su-border-default)', background: 'var(--su-surface-subtle)', color: 'var(--su-text-secondary)', fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{lines?.length ? lines.join('\n') : empty}</pre>; }
function History({ entries }) { return <div className="space-y-2">{entries.map((entry) => <div key={entry.id || `${entry.started_at}-${entry.to_version}`} className="flex flex-wrap items-center justify-between gap-3 rounded p-3" style={{ border: '1px solid var(--su-border-default)' }}><div><code style={{ fontFamily: 'var(--su-font-mono, monospace)' }}>{entry.from_version || '—'} → {entry.to_version || '—'}</code><p className="text-xs m-0" style={{ color: 'var(--su-text-muted)' }}>{formatDateTime(entry.started_at || entry.created_at)}</p></div><Badge tone={statusTone(entry.status)}>{entry.status || 'desconhecido'}</Badge></div>)}</div>; }
function bytes(value) { const n = Number(value); if (!Number.isFinite(n)) return '—'; if (!n) return '0 B'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(n) / Math.log(1024)); return `${(n / (1024 ** i)).toFixed(i ? 1 : 0)} ${units[i]}`; }
