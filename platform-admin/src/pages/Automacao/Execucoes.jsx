import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Loader2, RefreshCcw, RotateCcw, XCircle } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge, Pagination } from '../../components/ui/Table';
import { Select, TextInput } from '../../components/ui/FormField';
import { listExecutions, getExecution, retryExecution, cancelExecution, listWorkflows } from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { useToast } from '@studio-ux-ds/react';
import { EXECUTION_STATUS, TRIGGER_TYPE_LABEL, formatDateTime } from './automation.constants';

const PER_PAGE = 25;

// Execution Monitor (diretriz 13): filtros status/fluxo/trace_id + detalhe
// com timeline por nó + retry/cancel. Aceita ?open=<id> (deep-link).
export default function Execucoes() {
  const toast = useToast();
  const { can } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [workflows, setWorkflows] = useState([]);
  const [status, setStatus] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [traceId, setTraceId] = useState('');
  const [openId, setOpenId] = useState(searchParams.get('open') || null);

  async function load(p = page) {
    setLoading(true);
    try {
      const data = await listExecutions({
        status: status || undefined,
        workflow_id: workflowId || undefined,
        trace_id: traceId.trim() || undefined,
        take: PER_PAGE,
        skip: (p - 1) * PER_PAGE,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); setPage(1); }, [status, workflowId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    listWorkflows().then((r) => setWorkflows(r.items)).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Execuções</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Monitor das automações — status, duração, timeline por passo e trace de ponta a ponta.
          </p>
        </div>
        <button className="btn-secondary" onClick={() => load()} title="Atualizar a lista">
          <RefreshCcw size={14} /> Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[170px]">
          <option value="">Todos os status</option>
          {Object.entries(EXECUTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} className="max-w-[220px]">
          <option value="">Todos os fluxos</option>
          {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
        <TextInput
          value={traceId}
          onChange={(e) => setTraceId(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(1); } }}
          placeholder="Código de rastreio…"
          className="max-w-[220px] font-mono text-xs"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card"><EmptyState icon={Activity} title="Nenhuma execução" description="Execute um fluxo manualmente ou aguarde um gatilho disparar." /></div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block card p-0 overflow-hidden">
            <Table>
              <Thead>
                <Th>Fluxo</Th>
                <Th>Status</Th>
                <Th>Gatilho</Th>
                <Th>Versão</Th>
                <Th>Duração</Th>
                <Th>Início</Th>
              </Thead>
              <Tbody>
                {items.map((e) => (
                  <Tr key={e.id} onClick={() => setOpenId(e.id)}>
                    <Td>
                      <span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{e.workflow?.name || '—'}</span>
                      {e.dry_run && <Badge variant="blue">simulação</Badge>}
                    </Td>
                    <Td><ExecStatusBadge status={e.status} /></Td>
                    <Td>{TRIGGER_TYPE_LABEL[e.trigger_type] || e.trigger_type}</Td>
                    <Td>v{e.version}</Td>
                    <Td>{e.duration_ms != null ? `${e.duration_ms} ms` : '—'}</Td>
                    <Td>{formatDateTime(e.started_at || e.created_at)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            <Pagination page={page} total={total} perPage={PER_PAGE} onPage={(p) => { setPage(p); load(p); }} />
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {items.map((e) => (
              <button key={e.id} className="card w-full text-left" onClick={() => setOpenId(e.id)}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{e.workflow?.name || '—'}</span>
                  <ExecStatusBadge status={e.status} />
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--ap-text-4)' }}>
                  {TRIGGER_TYPE_LABEL[e.trigger_type] || e.trigger_type} · {formatDateTime(e.started_at || e.created_at)}
                </p>
              </button>
            ))}
          </div>
        </>
      )}

      <ExecutionDetailModal
        id={openId}
        onClose={() => { setOpenId(null); setSearchParams({}, { replace: true }); }}
        canRetry={can('automation.executions.retry')}
        onChanged={() => load()}
      />
    </div>
  );
}

function ExecStatusBadge({ status }) {
  const info = EXECUTION_STATUS[status] || { label: status, variant: 'gray' };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

function ExecutionDetailModal({ id, onClose, canRetry, onChanged }) {
  const toast = useToast();
  const [execution, setExecution] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'retry' | 'cancel'
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!id) { setExecution(null); return; }
    setLoading(true);
    getExecution(id)
      .then(setExecution)
      .catch((err) => { toast.error(err.message); onClose(); })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConfirm() {
    setActing(true);
    try {
      if (confirm === 'retry') {
        await retryExecution(id);
        toast.success('Reexecução enfileirada.');
      } else {
        await cancelExecution(id);
        toast.success('Execução cancelada.');
      }
      setConfirm(null);
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  const cancellable = execution && ['QUEUED', 'RUNNING'].includes(execution.status);

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title="Detalhe da execução"
      size="xl"
      footer={
        canRetry && execution ? (
          <>
            {cancellable && (
              <button className="btn-secondary" onClick={() => setConfirm('cancel')} title="Cancela entre passos (cooperativo)">
                <XCircle size={14} className="text-red-500" /> Cancelar execução
              </button>
            )}
            <button className="btn-primary" onClick={() => setConfirm('retry')} title="Cria uma nova execução com o mesmo input">
              <RotateCcw size={14} /> Reexecutar
            </button>
          </>
        ) : undefined
      }
    >
      {loading || !execution ? (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold" style={{ color: 'var(--ap-text-1)' }}>{execution.workflow?.name}</span>
            <ExecStatusBadge status={execution.status} />
            {execution.dry_run && <Badge variant="blue">simulação</Badge>}
            <Badge variant="gray">v{execution.version}</Badge>
            <span className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
              {TRIGGER_TYPE_LABEL[execution.trigger_type] || execution.trigger_type} · {execution.duration_ms != null ? `${execution.duration_ms} ms` : 'em andamento'}
            </span>
          </div>
          <p className="text-[11px] font-mono break-all" style={{ color: 'var(--ap-text-5)' }} title="Código de rastreio da execução">
            Rastreio: {execution.trace_id}
          </p>
          {execution.error && (
            <p className="text-xs rounded-lg p-2 text-red-500" style={{ border: '1px solid var(--ap-border)' }}>{execution.error}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PayloadBox label="Entrada (input)" value={execution.input} />
            <PayloadBox label="Saída (vars por passo)" value={execution.output} />
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--ap-text-5)' }}>Timeline por passo</p>
            <div className="space-y-1">
              {(execution.logs || []).map((log) => (
                <div key={log.id} className="rounded-lg px-3 py-2 text-xs flex items-start gap-2" style={{ border: '1px solid var(--ap-border)' }}>
                  <span
                    className="mt-1 w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: log.level === 'error' ? '#ef4444' : log.level === 'warn' ? '#eab308' : '#22c55e' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p style={{ color: 'var(--ap-text-2)' }}>
                      {log.node_id && <span className="font-mono" style={{ color: 'var(--ap-text-4)' }}>[{log.node_id}] </span>}
                      {log.message}
                    </p>
                    {log.data && (
                      <pre className="mt-1 text-[10px] font-mono overflow-x-auto" style={{ color: 'var(--ap-text-4)' }}>
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px]" style={{ color: 'var(--ap-text-5)' }}>
                    {log.duration_ms != null ? `${log.duration_ms} ms · ` : ''}{formatDateTime(log.created_at)}
                  </span>
                </div>
              ))}
              {!(execution.logs || []).length && <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>Sem logs ainda.</p>}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        danger={confirm === 'cancel'}
        loading={acting}
        title={confirm === 'cancel' ? 'Cancelar execução' : 'Reexecutar'}
        message={
          confirm === 'cancel'
            ? 'Cancelar esta execução? O cancelamento é cooperativo — o passo em andamento termina e o fluxo para em seguida.'
            : 'Criar uma NOVA execução com o mesmo input e versão? A execução original permanece no histórico.'
        }
        confirmLabel={confirm === 'cancel' ? 'Cancelar execução' : 'Reexecutar'}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
      />
    </Modal>
  );
}

function PayloadBox({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--ap-text-5)' }}>{label}</p>
      <pre
        className="rounded-lg p-2 text-[11px] font-mono overflow-x-auto max-h-44 overflow-y-auto"
        style={{ border: '1px solid var(--ap-border)', backgroundColor: 'var(--ap-surface-2)', color: 'var(--ap-text-3)' }}
      >
        {value == null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
