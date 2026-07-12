import React, { useEffect, useState } from 'react';
import {
  ShieldCheck, Loader2, Check, X, Plus, ListChecks,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Tabs from '../../components/ui/Tabs';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, TextInput, Textarea, Select } from '../../components/ui/FormField';
import {
  listApprovals, decideApproval, listApprovalPolicies, createApprovalPolicy,
} from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { toast } from '../../lib/toast';
import { APPROVAL_STATUS, APPROVAL_TARGET_TYPES, formatDateTime } from './ia.constants';

const PAGE_TABS = [
  { id: 'queue',    label: 'Fila',       Icon: ListChecks },
  { id: 'policies', label: 'Políticas',  Icon: ShieldCheck },
];

// Aprovações: fila de ações pendentes (aprovar/rejeitar com 5 patrasques) +
// políticas de aprovação (CRUD; nascem OFF — is_active default false).
export default function Aprovacoes() {
  const [tab, setTab] = useState('queue');
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Pendências</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
          Ações dos assistentes que exigem sua revisão antes de executar.
        </p>
      </div>
      <Tabs items={PAGE_TABS} active={tab} onChange={setTab} />
      {tab === 'queue' ? <QueueTab /> : <PoliciesTab />}
    </div>
  );
}

function QueueTab() {
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

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card"><EmptyState icon={ShieldCheck} title="Nada pendente" description="Nenhuma ação aguardando aprovação." /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <Table>
            <Thead>
              <Th>Alvo</Th>
              <Th>Status</Th>
              <Th>Solicitada</Th>
              <Th className="text-right">Decisão</Th>
            </Thead>
            <Tbody>
              {items.map((a) => {
                const st = APPROVAL_STATUS[a.status] || { label: a.status, variant: 'gray' };
                return (
                  <Tr key={a.id}>
                    <Td>
                      <span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{friendlyTarget(a.target)}</span>
                      {a.context && <p className="text-[11px] font-mono truncate max-w-[320px]" style={{ color: 'var(--ap-text-4)' }}>{JSON.stringify(a.context)}</p>}
                    </Td>
                    <Td><Badge variant={st.variant}>{st.label}</Badge></Td>
                    <Td>{formatDateTime(a.created_at)}</Td>
                    <Td className="text-right">
                      {canDecide && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 min-h-[36px]"
                            title="Aprovar a ação — o assistente prossegue"
                            onClick={() => setApproving(a)}
                          >
                            <Check size={13} className="inline" /> Aprovar
                          </button>
                          <button
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-500 min-h-[36px]"
                            title="Rejeitar a ação — a execução é encerrada"
                            onClick={() => setRejecting(a)}
                          >
                            <X size={13} className="inline" /> Rejeitar
                          </button>
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </div>
      )}

      {/* 5 patrasques: ConfirmDialog + disclaimer + tooltip + loading + can() */}
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

function RejectModal({ approval, onClose, onRejected }) {
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
      size="sm"
      dismissable={!saving}
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-60"
            onClick={handleReject}
            disabled={saving}
          >
            {saving && <Loader2 size={14} className="animate-spin inline mr-1" />} Rejeitar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--ap-text-2)' }}>
          Rejeitar "{friendlyTarget(approval?.target)}"? A ação NÃO será executada e o assistente encerra este atendimento. Nada é alterado no sistema — é só recusar a execução. Se quiser, registre o motivo abaixo.
        </p>
        <FormField label="Motivo (opcional)">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: destinatários incorretos" />
        </FormField>
      </div>
    </Modal>
  );
}

function PoliciesTab() {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-xs flex-1" style={{ color: 'var(--ap-text-4)' }}>
          Políticas definem quais ações exigem aprovação. Nascem desligadas — ative após revisar.
        </p>
        {canDecide && <button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> Nova política</button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card"><EmptyState icon={ShieldCheck} title="Nenhuma política" description="Crie políticas para exigir aprovação em ações sensíveis." /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <Table>
            <Thead>
              <Th>Nome</Th>
              <Th>Alvo</Th>
              <Th>Condição</Th>
              <Th>Status</Th>
            </Thead>
            <Tbody>
              {items.map((p) => (
                <Tr key={p.id}>
                  <Td><span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{p.name}</span></Td>
                  <Td><Badge variant="purple">{targetLabel(p.target_type)}</Badge></Td>
                  <Td><span className="font-mono text-[11px] truncate max-w-[240px] block" style={{ color: 'var(--ap-text-4)' }}>{p.condition ? JSON.stringify(p.condition) : '—'}</span></Td>
                  <Td>{p.is_active ? <Badge variant="green">Ativa</Badge> : <Badge variant="gray">Desligada</Badge>}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
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
  const [form, setForm] = useState({ name: '', description: '', target_type: 'TOOL', condition: '{}', is_active: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm({ name: '', description: '', target_type: 'TOOL', condition: '{}', is_active: false }); }, [open]);

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Informe o nome.'); return; }
    let condition;
    try { condition = form.condition.trim() ? JSON.parse(form.condition) : {}; } catch { toast.error('Condição: JSON inválido.'); return; }
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
      size="md"
      dismissable={!saving}
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Criar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Nome" required>
          <TextInput value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex.: Aprovar envios em massa" />
        </FormField>
        <FormField label="Descrição">
          <Textarea rows={2} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
        </FormField>
        <FormField label="Tipo de alvo">
          <Select value={form.target_type} onChange={(e) => patch({ target_type: e.target.value })}>
            {APPROVAL_TARGET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Condição (JSON)" hint='Ex.: {"min_recipients": 100} ou {"tool_key": "executar_sql"}.'>
          <Textarea rows={4} className="font-mono text-xs" value={form.condition} onChange={(e) => patch({ condition: e.target.value })} />
        </FormField>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--ap-text-2)' }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => patch({ is_active: e.target.checked })} className="w-4 h-4 accent-current" />
          Ativar imediatamente (por padrão nasce desligada)
        </label>
      </div>
    </Modal>
  );
}
