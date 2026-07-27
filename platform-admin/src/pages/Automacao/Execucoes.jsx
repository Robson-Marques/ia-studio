import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader, Card, DataTable, EmptyState, Badge, Pagination, Select, Input, Button, useToast, Spinner } from '@studio-ux-ds/react';
import { listExecutions, listWorkflows } from '../../services/automation';
import { EXECUTION_STATUS, TRIGGER_TYPE_LABEL, formatDateTime } from './automation.constants';
import { statusToTone } from '../../lib/tone';

// Automação/Execuções — monitor das automações. Migrada pro DS na v0.9.99.
//
// O detalhe (payloads + timeline por passo + reexecutar/cancelar) era um Modal
// `size="xl"` aberto por `?open=<id>`. Virou **rota** `/automacao/execucoes/:id`:
//  · a URL já carregava o id — ou seja, o requisito de endereçar uma execução
//    específica já existia; o que faltava era a URL ser honesta em vez de um
//    parâmetro que abre overlay;
//  · o conteúdo não é tarefa curta (dois payloads com scroll interno + N passos
//    de timeline), que é o critério do DS para não usar Modal.
// O `?open=<id>` legado continua funcionando: redireciona para a rota, então
// link antigo em notificação/e-mail não quebra.

const PER_PAGE = 25;

export default function Execucoes() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [workflows, setWorkflows] = useState([]);
  const [status, setStatus] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [traceId, setTraceId] = useState('');

  // Compatibilidade com o deep-link antigo `?open=<id>`.
  useEffect(() => {
    const open = searchParams.get('open');
    if (open) {
      setSearchParams({}, { replace: true });
      navigate(`/automacao/execucoes/${open}`, { replace: true });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

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
  useEffect(() => { listWorkflows().then((r) => setWorkflows(r.items)).catch(() => {}); }, []);

  const columns = [
    { key: 'workflow', header: 'Fluxo', render: (e) => (
      <div className="flex items-center gap-2">
        <span style={{ fontWeight: 500, color: 'var(--su-text-primary)' }}>{e.workflow?.name || '—'}</span>
        {e.dry_run && <Badge tone="info">simulação</Badge>}
      </div>
    ) },
    { key: 'status', header: 'Situação', render: (e) => {
      const info = EXECUTION_STATUS[e.status] || { label: e.status, variant: 'gray' };
      return <Badge tone={statusToTone(info.variant)}>{info.label}</Badge>;
    } },
    { key: 'trigger', header: 'O que disparou', render: (e) => TRIGGER_TYPE_LABEL[e.trigger_type] || e.trigger_type },
    { key: 'version', header: 'Versão', render: (e) => `v${e.version}` },
    { key: 'duration', header: 'Durou', align: 'right', render: (e) => e.duration_ms != null ? `${e.duration_ms} ms` : '—' },
    { key: 'started_at', header: 'Começou', render: (e) => formatDateTime(e.started_at || e.created_at) },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2" style={{ padding: 'var(--su-space-2) var(--su-space-4)' }}>
      <div style={{ width: 180 }}>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por situação">
          <option value="">Todas as situações</option>
          {Object.entries(EXECUTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </div>
      <div style={{ width: 220 }}>
        <Select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} aria-label="Filtrar por fluxo">
          <option value="">Todos os fluxos</option>
          {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      </div>
      <div style={{ width: 220 }}>
        <Input
          value={traceId}
          onChange={(e) => setTraceId(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(1); } }}
          placeholder="Código de rastreio…"
          aria-label="Filtrar por código de rastreio"
          style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
        />
      </div>
      <Button variant="ghost" icon="refresh" loading={loading} aria-label="Atualizar" onClick={() => load()} />
    </div>
  );

  const filtrando = !!(status || workflowId || traceId.trim());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Execuções"
        subtitle="Cada vez que uma automação rodou — o que disparou, quanto durou, e onde parou passo a passo."
      />

      {loading && !items.length ? (
        <Spinner size="lg" center />
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="dashboard"
            title={filtrando ? 'Nenhuma execução com esses filtros' : 'Nenhuma automação rodou ainda'}
            description={filtrando
              ? 'Limpe os filtros para ver todas as execuções.'
              : 'Execute um fluxo pela tela de Fluxos, ou espere um gatilho disparar — cada rodada aparece aqui.'}
          />
        </Card>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>
            Clique numa execução para ver o passo a passo, o que entrou, o que saiu — e reexecutar se precisar.
          </p>
          <DataTable
            columns={columns}
            rows={items}
            getRowId={(e) => e.id}
            onRowClick={(e) => navigate(`/automacao/execucoes/${e.id}`)}
            getRowLabel={(e) => `Abrir execução de ${e.workflow?.name || 'fluxo'}`}
            toolbar={toolbar}
            footer={
              <Pagination
                page={page}
                pageCount={Math.ceil(total / PER_PAGE)}
                total={total}
                itemLabel={['execução', 'execuções']}
                onChange={(p) => { setPage(p); load(p); }}
              />
            }
          />
        </>
      )}
    </div>
  );
}
