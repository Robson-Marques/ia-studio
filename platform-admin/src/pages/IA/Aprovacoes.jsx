import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Tabs, Card, DataTable, EmptyState, Badge, Modal, ConfirmDialog,
  Field, Input, Select, TextArea, Button, Checkbox, useToast,
} from '@studio-ux-ds/react';
import {
  listApprovals, decideApproval, listApprovalPolicies, createApprovalPolicy,
} from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { APPROVAL_STATUS, APPROVAL_TARGET_TYPES, formatDateTime } from './ia.constants';

// IA/Aprovacoes — 3ª tela migrada pro DS (v0.9.86, 2026-07-24).
// Fila de ações pendentes + políticas de aprovação. Migração inclui refactor
// dos botões inline com Tailwind hardcoded (`bg-emerald-600` verde e `bg-red-600`
// vermelho) — que fugiam do sistema de `.su-btn` — para `<Button variant="primary">`
// (aprovar, primário/ação positiva) e `<Button variant="danger">` (rejeitar,
// destrutivo). Os 5 patrasques do ConfirmDialog preservados.

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

// Nome amigável da ação (o usuário não deve ver a chave técnica crua).
const TARGET_LABELS = {
  abrir_os: 'Abrir chamado',
  desbloqueio_confianca: 'Desbloqueio de confiança',
  enviar_whatsapp: 'Enviar WhatsApp',
  executar_sql: 'Executar SQL',
};
function friendlyTarget(key) {
  return TARGET_LABELS[key] || key;
}

// Mapeamento do status do backend para o `tone` do Badge do DS. O legado usava
// `APPROVAL_STATUS[a.status] → { label, variant: 'gray'|... }`. O DS usa `tone`.
function statusToTone(variant) {
  return { green: 'success', red: 'danger', yellow: 'warning', blue: 'info', purple: 'info', gray: 'neutral' }[variant] || 'neutral';
}

function QueueTab() {
  const toast = useToast();
  const { can } = usePermissions();
  const { environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejecting, setRejecting] = useState(null);

  const canDecide = can('ai.approvals.decide');

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

  async function confirmApprove() {
    setApproveLoading(true);
    try {
      await decideApproval(approving.id, { approve: true });
      toast.success('Ação aprovada — o assistente retoma o atendimento.');
      setApproving(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setApproveLoading(false);
    }
  }

  const columns = [
    { key: 'target', header: 'Alvo', render: (a) => (
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
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      ) : !items.length ? (
        <Card>
          <EmptyState icon="check-circle" title="Nada pendente" description="Nenhuma ação aguardando aprovação." />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          getRowId={(a) => a.id}
          renderRowMenu={canDecide ? (a) => (
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                size="sm"
                icon="check"
                title="Aprovar a ação — o assistente prossegue"
                onClick={() => setApproving(a)}
              >
                Aprovar
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon="close"
                title="Rejeitar a ação — a execução é encerrada"
                onClick={() => setRejecting(a)}
              >
                Rejeitar
              </Button>
            </div>
          ) : undefined}
        />
      )}

      {/* 5 patrasques do DS: ConfirmDialog + disclaimer no message + tooltip nos
          botões + loading + can() gate. */}
      <ConfirmDialog
        open={!!approving}
        loading={approveLoading}
        title="Aprovar ação"
        message={`Aprovar a execução de "${friendlyTarget(approving?.target)}"? A ação será executada de verdade e o assistente prossegue. Verifique o contexto antes de confirmar.`}
        confirmLabel="Aprovar e executar"
        onClose={() => setApproving(null)}
        onConfirm={confirmApprove}
      />
      <RejectModal
        approval={rejecting}
        onClose={() => setRejecting(null)}
        onRejected={() => { setRejecting(null); load(); }}
      />
    </div>
  );
}

function RejectModal({ approval, onClose, onRejected }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (approval) setReason(''); }, [approval]);

  async function handleReject() {
    setSaving(true);
    try {
      await decideApproval(approval.id, { approve: false, reject_reason: reason.trim() || undefined });
      toast.success('Ação rejeitada — o atendimento do assistente foi encerrado.');
      onRejected();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!approval}
      onClose={saving ? undefined : onClose}
      title="Rejeitar ação"
      maxWidth={420}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="danger" onClick={handleReject} disabled={saving} icon={saving ? 'loader-2' : undefined}>
            {saving ? 'Rejeitando…' : 'Rejeitar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p style={{ fontSize: 14, color: 'var(--su-text-secondary)' }}>
          Rejeitar "{friendlyTarget(approval?.target)}"? A ação NÃO será executada e o assistente encerra este atendimento. Nada é alterado no sistema — é só recusar a execução. Se quiser, registre o motivo abaixo.
        </p>
        <Field label="Motivo (opcional)">
          <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: destinatários incorretos" />
        </Field>
      </div>
    </Modal>
  );
}

function PoliciesTab() {
  const toast = useToast();
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

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
          <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>
            Nova política
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      ) : !items.length ? (
        <Card>
          <EmptyState icon="lock" title="Nenhuma política" description="Crie políticas para exigir aprovação em ações sensíveis." />
        </Card>
      ) : (
        <DataTable columns={columns} rows={items} getRowId={(p) => p.id} />
      )}

      <PolicyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        workspaceId={workspaceId}
        environmentId={environmentId}
        onSaved={() => { setCreateOpen(false); load(); }}
      />
    </div>
  );
}

function PolicyModal({ open, onClose, onSaved, workspaceId, environmentId }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', description: '', target_type: 'TOOL', condition: '{}', is_active: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm({ name: '', description: '', target_type: 'TOOL', condition: '{}', is_active: false }); }, [open]);

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Informe o nome.'); return; }
    let condition;
    try {
      condition = form.condition.trim() ? JSON.parse(form.condition) : {};
    } catch {
      toast.error('Condição: JSON inválido.');
      return;
    }
    setSaving(true);
    try {
      await createApprovalPolicy({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        target_type: form.target_type,
        condition,
        is_active: form.is_active,
        workspace_id: workspaceId || undefined,
        environment_id: environmentId || undefined,
      });
      toast.success('Política criada.');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Nova política de aprovação"
      maxWidth={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving} icon={saving ? 'loader-2' : undefined}>
            {saving ? 'Criando…' : 'Criar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nome">
          <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex.: Aprovar envios em massa" />
        </Field>
        <Field label="Descrição">
          <TextArea rows={2} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
        </Field>
        <Field label="Tipo de alvo">
          <Select value={form.target_type} onChange={(e) => patch({ target_type: e.target.value })}>
            {APPROVAL_TARGET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Condição (JSON)" hint='Ex.: {"min_recipients": 100} ou {"tool_key": "executar_sql"}.'>
          <TextArea
            rows={4}
            value={form.condition}
            onChange={(e) => patch({ condition: e.target.value })}
            style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
          />
        </Field>
        <Checkbox
          id="policy-is-active"
          label="Ativar imediatamente (por padrão nasce desligada)"
          checked={form.is_active}
          onChange={(e) => patch({ is_active: e.target.checked })}
        />
      </div>
    </Modal>
  );
}
