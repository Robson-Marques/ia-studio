import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListScreen, Badge, Button, useToast } from '@studio-ux-ds/react';
import { listApprovals, listApprovalPolicies } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import {
  APPROVAL_STATUS, APPROVAL_TARGET_TYPES, formatDateTime,
  friendlyTarget,
} from './ia.constants';
import { statusToTone } from '../../lib/tone';

// IA/Aprovacoes — LISTAGEM no molde `ListScreen` do DS (v0.10.34): a tela passa
// a ser `.su-screen`, então a preferência de largura do Personalizar vale aqui.
// As abas Fila / Políticas viraram SEGMENTS do molde (padrão do AquaPark).
// Comportamento preservado: fila com clique-na-linha pro detalhe; políticas
// como lista + criar.

const PAGE_SEGMENTS = [
  { id: 'queue',    label: 'Fila' },
  { id: 'policies', label: 'Políticas' },
];
const PAGE_TITLE = 'Pendências';
const PAGE_SUBTITLE = 'Ações dos assistentes que exigem sua revisão antes de executar.';

export default function Aprovacoes() {
  const [tab, setTab] = useState('queue');
  const seg = { segments: PAGE_SEGMENTS, segment: tab, onSegment: setTab };
  return tab === 'queue' ? <QueueTab seg={seg} /> : <PoliciesTab seg={seg} />;
}

function QueueTab({ seg }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listApprovals({ status: 'PENDING' });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    <ListScreen
      title={PAGE_TITLE}
      subtitle={PAGE_SUBTITLE}
      {...seg}
      loading={loading}
      columns={columns}
      rows={items}
      getRowId={(a) => a.id}
      onRowClick={(a) => navigate(`/ia/aprovacoes/${a.id}`, { state: { approval: a } })}
      getRowLabel={(a) => `Revisar ${friendlyTarget(a.target)}`}
      emptyNew={{ icon: 'check-circle', title: 'Nada pendente', description: 'Nenhuma ação aguardando aprovação.' }}
    />
  );
}

function PoliciesTab({ seg }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const canDecide = can('ai.approvals.decide');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listApprovalPolicies();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    <ListScreen
      title={PAGE_TITLE}
      subtitle={PAGE_SUBTITLE}
      {...seg}
      primaryAction={canDecide && (
        <Button variant="primary" icon="plus" onClick={() => navigate('/ia/aprovacoes/politicas/nova')}>
          Nova política
        </Button>
      )}
      loading={loading}
      columns={columns}
      rows={items}
      getRowId={(p) => p.id}
      emptyNew={{ icon: 'lock', title: 'Nenhuma política', description: 'Crie políticas para exigir aprovação em ações sensíveis.' }}
    />
  );
}
