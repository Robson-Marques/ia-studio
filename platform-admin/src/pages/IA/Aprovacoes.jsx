import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Tabs, Card, DataTable, EmptyState, Badge, Button, useToast, Spinner } from '@studio-ux-ds/react';
import { listApprovals, listApprovalPolicies } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
  APPROVAL_STATUS, APPROVAL_TARGET_TYPES, formatDateTime,
  friendlyTarget,
} from './ia.constants';
import { statusToTone } from '../../lib/tone';

// IA/Aprovacoes — migrada pro DS na v0.9.86; padronizada na v0.9.88.
//
// v0.9.88 aplicou 2 regras do DS retroativamente:
//  1) STUDIO_UX_TABLES.md §3 — a linha é o alvo. Os 2 botões (Aprovar/Rejeitar)
//     saíram da linha; clicar na linha abre o detalhe da pendência
//     (/ia/aprovacoes/:id) onde a decisão é tomada com o contexto na frente.
//  2) Modal sem TextArea (v1.2.11+ do DS) — o `RejectModal` (motivo) foi
//     ABSORVIDO pelo detalhe (inline) e o `PolicyModal` (Descrição + Condição
//     JSON) virou a rota /ia/aprovacoes/politicas/nova.
//
// Esta tela ficou sendo só LISTAGEM (fila + políticas) — sem nenhum overlay.

const PAGE_TABS = [
  { id: 'queue',    label: 'Fila' },
  { id: 'policies', label: 'Políticas' },
];

export default function Aprovacoes() {
  const [tab, setTab] = useState('queue');
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pendências"
        subtitle="Ações dos assistentes que exigem sua revisão antes de executar."
      />
      <Tabs items={PAGE_TABS} value={tab} onChange={setTab} />
      {tab === 'queue' ? <QueueTab /> : <PoliciesTab />}
    </div>
  );
}

function QueueTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const { environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listApprovals({ status: 'PENDING', environment_id: environmentId || undefined });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'target', header: 'Ação', render: (a) => (
      <div>
        <span style={{ fontWeight: 500 }}>{friendlyTarget(a.target)}</span>
        {a.context && (
          <p style={{ fontSize: 11, fontFamily: 'var(--su-font-mono, monospace)', color: 'var(--su-text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
            {JSON.stringify(a.context)}
          </p>
        )}
      </div>
    ) },
    { key: 'status', header: 'Status', render: (a) => {
      const st = APPROVAL_STATUS[a.status] || { label: a.status, variant: 'gray' };
      return <Badge tone={statusToTone(st.variant)}>{st.label}</Badge>;
    } },
    { key: 'created_at', header: 'Solicitada', render: (a) => formatDateTime(a.created_at) },
  ];

  return (
    <div className="space-y-4">
      {loading ? (
        <Spinner size="lg" center />
      ) : !items.length ? (
        <Card>
          <EmptyState icon="check-circle" title="Nada pendente" description="Nenhuma ação aguardando aprovação." />
        </Card>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>
            Clique numa pendência para ver o que o assistente quer fazer e decidir.
          </p>
          <DataTable
            columns={columns}
            rows={items}
            getRowId={(a) => a.id}
            onRowClick={(a) => navigate(`/ia/aprovacoes/${a.id}`, { state: { approval: a } })}
            getRowLabel={(a) => `Revisar ${friendlyTarget(a.target)}`}
          />
        </>
      )}
    </div>
  );
}

function PoliciesTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const canDecide = can('ai.approvals.decide');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listApprovalPolicies({ environment_id: environmentId || undefined });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const targetLabel = (t) => APPROVAL_TARGET_TYPES.find((x) => x.value === t)?.label || t;

  const columns = [
    { key: 'name', header: 'Nome', render: (p) => <span style={{ fontWeight: 500 }}>{p.name}</span> },
    { key: 'target', header: 'Alvo', render: (p) => <Badge tone="info">{targetLabel(p.target_type)}</Badge> },
    { key: 'condition', header: 'Condição', render: (p) => (
      <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, color: 'var(--su-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240, display: 'inline-block' }}>
        {p.condition ? JSON.stringify(p.condition) : '—'}
      </span>
    ) },
    { key: 'status', header: 'Status', render: (p) => p.is_active
      ? <Badge tone="success">Ativa</Badge>
      : <Badge tone="neutral">Desligada</Badge>
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-xs flex-1" style={{ color: 'var(--su-text-muted)' }}>
          Políticas definem quais ações exigem aprovação. Nascem desligadas — ative após revisar.
        </p>
        {canDecide && (
          <Button variant="primary" icon="plus" onClick={() => navigate('/ia/aprovacoes/politicas/nova')}>
            Nova política
          </Button>
        )}
      </div>

      {loading ? (
        <Spinner size="lg" center />
      ) : !items.length ? (
        <Card>
          <EmptyState icon="lock" title="Nenhuma política" description="Crie políticas para exigir aprovação em ações sensíveis." />
        </Card>
      ) : (
        // Sem linha clicável e sem menu de ações: o backend só expõe
        // POST /ai/approvals/policies (criar). Não há PATCH — não existe edição
        // de política hoje, então a linha não tem destino pra abrir.
        <DataTable columns={columns} rows={items} getRowId={(p) => p.id} />
      )}
    </div>
  );
}
