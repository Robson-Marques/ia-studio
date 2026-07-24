import React, { useEffect, useState } from 'react';
import {
  Radio, Loader2, Plus, Pencil, Users, Play, CheckCircle2, Send, RefreshCw,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, TextInput, Textarea, Select, NumberInput } from '../../components/ui/FormField';
import {
  listIncidents, createIncident, updateIncident,
  resolveAffected, listTargets, updateTargets,
  activateIncident, resolveIncident, dispatchIncident,
} from '../../services/isp';
import { listConnections } from '../../services/integrations';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useToast } from '@studio-ux-ds/react';

const STATUS_BADGE = {
  DRAFT: { variant: 'gray', label: 'Rascunho' },
  ACTIVE: { variant: 'green', label: 'Ativo' },
  RESOLVED: { variant: 'blue', label: 'Encerrado' },
};
const MODE_LABEL = { REACTIVE: 'Reativo', PROACTIVE: 'Proativo', COMBINED: 'Combinado' };
const SCOPE_FIELDS = [
  { key: 'cidade', label: 'Cidade' },
  { key: 'bairro', label: 'Bairro' },
  { key: 'ip_concentrador', label: 'IP concentrador' },
  { key: 'interface_concentrador', label: 'Interface concentrador' },
  { key: 'id_olt', label: 'OLT' },
  { key: 'id_slot', label: 'Slot' },
  { key: 'id_cto', label: 'CTO' },
];

// Incidentes/Manutenção (Fase 6). Lista + editor (escopo/conexão Altarede/modo/
// toggles), resolver afetados (checkbox include/exclude + manual), ativar/
// encerrar (5 patrasques) e disparo proativo (ConfirmDialog + rate limit).
export default function Incidentes() {
  const toast = useToast();
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [targetsFor, setTargetsFor] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind, incident }
  const [busy, setBusy] = useState(false);

  const canWrite = can('isp.incidents.write');
  const canActivate = can('isp.incidents.activate');
  const canDispatch = can('isp.incidents.dispatch');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listIncidents({
        workspace_id: workspaceId || undefined,
        environment_id: environmentId || undefined,
      });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [workspaceId, environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'activate') {
        const res = await activateIncident(confirm.incident.id, { confirm: true });
        const sent = res?.dispatch?.sent;
        toast.success(sent != null ? `Incidente ativado — ${sent} informativos enviados.` : 'Incidente ativado.');
      } else if (confirm.kind === 'resolve') {
        await resolveIncident(confirm.incident.id, { confirm: true });
        toast.success('Incidente encerrado.');
      }
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Incidentes e Manutenções</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Informativo de rede (ISP). Reativo informa quando o cliente procura; proativo dispara em massa (com confirmação).
          </p>
        </div>
        {canWrite && (
          <button className="btn-primary" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <Plus size={14} /> Novo incidente
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card"><EmptyState icon={Radio} title="Nenhum incidente" description="Crie um incidente para informar clientes sobre manutenções ou quedas." /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <Table>
            <Thead>
              <Th>Título</Th>
              <Th>Modo</Th>
              <Th>Afetados</Th>
              <Th>Status</Th>
              <Th className="text-right">Ações</Th>
            </Thead>
            <Tbody>
              {items.map((it) => {
                const badge = STATUS_BADGE[it.status] || STATUS_BADGE.DRAFT;
                return (
                  <Tr key={it.id}>
                    <Td>
                      <span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{it.title}</span>
                      {it.forecast && <p className="text-[11px]" style={{ color: 'var(--ap-text-4)' }}>Previsão: {it.forecast}</p>}
                    </Td>
                    <Td><Badge variant="gray">{MODE_LABEL[it.comm_mode] || it.comm_mode}</Badge></Td>
                    <Td>{it._count?.targets ?? 0}</Td>
                    <Td><Badge variant={badge.variant}>{badge.label}</Badge></Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {canWrite && (
                          <button className="btn-ghost p-1.5" title="Afetados" onClick={() => setTargetsFor(it)}><Users size={14} /></button>
                        )}
                        {canWrite && it.status !== 'RESOLVED' && (
                          <button className="btn-ghost p-1.5" title="Editar" onClick={() => { setEditing(it); setEditorOpen(true); }}><Pencil size={14} className="text-brand" /></button>
                        )}
                        {canDispatch && it.status === 'ACTIVE' && it.comm_mode !== 'REACTIVE' && (
                          <button className="btn-ghost p-1.5" title="Disparar informativo" onClick={() => setTargetsFor({ ...it, _dispatch: true })}><Send size={14} className="text-brand" /></button>
                        )}
                        {canActivate && it.status !== 'ACTIVE' && (
                          <button className="btn-ghost p-1.5" title="Ativar" onClick={() => setConfirm({ kind: 'activate', incident: it })}><Play size={14} className="text-green-500" /></button>
                        )}
                        {canActivate && it.status === 'ACTIVE' && (
                          <button className="btn-ghost p-1.5" title="Encerrar" onClick={() => setConfirm({ kind: 'resolve', incident: it })}><CheckCircle2 size={14} className="text-blue-500" /></button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </div>
      )}

      <IncidentModal
        open={editorOpen}
        incident={editing}
        workspaceId={workspaceId}
        environmentId={environmentId}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); load(); }}
      />

      <TargetsModal
        incident={targetsFor}
        canDispatch={canDispatch}
        onClose={() => { setTargetsFor(null); load(); }}
      />

      {/* 5 patrasques: ConfirmDialog + disclaimer + tooltip + loading + permission gate. */}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        loading={busy}
        danger={confirm?.kind === 'activate' && confirm?.incident?.comm_mode !== 'REACTIVE'}
        title={confirm?.kind === 'activate' ? 'Ativar incidente' : 'Encerrar incidente'}
        confirmLabel={confirm?.kind === 'activate' ? 'Ativar' : 'Encerrar'}
        message={
          confirm?.kind === 'activate'
            ? (confirm?.incident?.comm_mode !== 'REACTIVE'
                ? 'Ao ativar em modo proativo/combinado, o informativo será DISPARADO EM MASSA por WhatsApp aos afetados incluídos. Esta ação é irreversível para as mensagens já enviadas. Confirma?'
                : 'O incidente ficará ativo e o assistente informará os clientes que procurarem. Confirma?')
            : 'O incidente será encerrado. Se a notificação de normalização estiver ligada (modo proativo/combinado), um aviso será enviado. Confirma?'
        }
      />
    </div>
  );
}

// ─── Editor de incidente ───────────────────────────────────────

function IncidentModal({ open, incident, workspaceId, environmentId, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!incident?.id;
  const [connections, setConnections] = useState([]);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);

  function blankForm() {
    return {
      title: '', message: '', forecast: '', connection_id: '', comm_mode: 'REACTIVE',
      scope: {}, suppress_os: false, inform_forecast: true, notify_normalization: false, auto_detect: false,
    };
  }

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const { items } = await listConnections({ workspace_id: workspaceId || undefined, environment_id: environmentId || undefined });
        setConnections(items.filter((c) => c.provider_key === 'altarede'));
      } catch (err) { toast.error(err.message); }
    })();
    if (incident) {
      const t = incident.toggles || {};
      setForm({
        title: incident.title || '',
        message: incident.message || '',
        forecast: incident.forecast || '',
        connection_id: incident.connection_id || '',
        comm_mode: incident.comm_mode || 'REACTIVE',
        scope: incident.scope || {},
        suppress_os: !!t.suppress_os,
        inform_forecast: t.inform_forecast !== false,
        notify_normalization: !!t.notify_normalization,
        auto_detect: !!incident.auto_detect,
      });
    } else {
      setForm(blankForm());
    }
  }, [open, incident?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));
  const patchScope = (k, v) => setForm((prev) => ({ ...prev, scope: { ...prev.scope, [k]: v } }));

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Informe o título.'); return; }
    if (!form.connection_id) { toast.error('Selecione a conexão Altarede.'); return; }
    if (!isEdit && (!workspaceId || !environmentId)) { toast.error('Selecione workspace e ambiente no topo.'); return; }
    const scope = {};
    for (const f of SCOPE_FIELDS) {
      const v = (form.scope[f.key] || '').trim();
      if (v) scope[f.key] = v;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        message: form.message.trim() || undefined,
        forecast: form.forecast.trim() || undefined,
        connection_id: form.connection_id,
        comm_mode: form.comm_mode,
        scope,
        toggles: {
          suppress_os: form.suppress_os,
          inform_forecast: form.inform_forecast,
          notify_normalization: form.notify_normalization,
        },
        auto_detect: form.auto_detect,
      };
      if (isEdit) await updateIncident(incident.id, body);
      else await createIncident({ ...body, workspace_id: workspaceId, environment_id: environmentId });
      toast.success(isEdit ? 'Incidente atualizado.' : 'Incidente criado.');
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
      title={isEdit ? 'Editar incidente' : 'Novo incidente'}
      size="lg"
      dismissable={!saving}
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Título" required>
          <TextInput value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Manutenção programada — Bairro Centro" />
        </FormField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Conexão Altarede" required hint="ERP que resolve os afetados por conectividade.">
            <Select value={form.connection_id} onChange={(e) => patch({ connection_id: e.target.value })}>
              <option value="">Selecione…</option>
              {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Modo de comunicação">
            <Select value={form.comm_mode} onChange={(e) => patch({ comm_mode: e.target.value })}>
              <option value="REACTIVE">Reativo (só informa quem procurar)</option>
              <option value="PROACTIVE">Proativo (dispara em massa)</option>
              <option value="COMBINED">Combinado</option>
            </Select>
          </FormField>
        </div>
        <FormField label="Mensagem" hint="Informativo exibido ao cliente.">
          <Textarea rows={2} value={form.message} onChange={(e) => patch({ message: e.target.value })} />
        </FormField>
        <FormField label="Previsão de normalização">
          <TextInput value={form.forecast} onChange={(e) => patch({ forecast: e.target.value })} placeholder="Ex.: até 18h de hoje" />
        </FormField>

        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--ap-text-2)' }}>Escopo (filtros de rede)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {SCOPE_FIELDS.map((f) => (
              <FormField key={f.key} label={f.label}>
                <TextInput value={form.scope[f.key] || ''} onChange={(e) => patchScope(f.key, e.target.value)} />
              </FormField>
            ))}
          </div>
        </div>

        <div className="space-y-1.5 pt-1">
          <Toggle label="Suprimir OS duplicada (o assistente não abre OS para clientes cobertos)" checked={form.suppress_os} onChange={(v) => patch({ suppress_os: v })} />
          <Toggle label="Informar previsão ao cliente" checked={form.inform_forecast} onChange={(v) => patch({ inform_forecast: v })} />
          <Toggle label="Avisar normalização ao encerrar (proativo/combinado)" checked={form.notify_normalization} onChange={(v) => patch({ notify_normalization: v })} />
          <Toggle label="Detecção automática de outage (só sugere — nasce desligada)" checked={form.auto_detect} onChange={(v) => patch({ auto_detect: v })} />
        </div>
      </div>
    </Modal>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--ap-text-2)' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-current" />
      {label}
    </label>
  );
}

// ─── Afetados + disparo ────────────────────────────────────────

function TargetsModal({ incident, canDispatch, onClose }) {
  const toast = useToast();
  const open = !!incident;
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [manual, setManual] = useState({ customer_ref: '', name: '', phone: '' });
  const [dispatchConfirm, setDispatchConfirm] = useState(false);
  const [rate, setRate] = useState(5);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!incident) return;
    setLoading(true);
    try {
      const { items } = await listTargets(incident.id);
      setTargets(items);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (open) load(); }, [incident?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResolve() {
    setResolving(true);
    try {
      const res = await resolveAffected(incident.id);
      toast.success(`Afetados resolvidos — ${res?.summary?.offline ?? 0} offline de ${res?.summary?.total ?? 0}.`);
      load();
    } catch (err) { toast.error(err.message); }
    finally { setResolving(false); }
  }

  async function toggleInclude(t) {
    const body = t.included ? { excluded_ids: [t.id] } : { included_ids: [t.id] };
    try {
      await updateTargets(incident.id, body);
      setTargets((prev) => prev.map((x) => (x.id === t.id ? { ...x, included: !x.included } : x)));
    } catch (err) { toast.error(err.message); }
  }

  async function addManual() {
    if (!manual.customer_ref.trim()) { toast.error('Informe o login/CPF do cliente.'); return; }
    try {
      await updateTargets(incident.id, { manual: [manual] });
      setManual({ customer_ref: '', name: '', phone: '' });
      toast.success('Cliente vinculado.');
      load();
    } catch (err) { toast.error(err.message); }
  }

  async function runDispatch() {
    setBusy(true);
    try {
      const res = await dispatchIncident(incident.id, { confirm: true, rate_per_sec: rate });
      toast.success(`Disparo concluído — ${res?.sent ?? 0} enviados, ${res?.failed ?? 0} falhas.`);
      setDispatchConfirm(false);
      onClose();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  const included = targets.filter((t) => t.included).length;

  return (
    <>
      <Modal open={open && !incident?._dispatch} onClose={onClose} title={`Afetados — ${incident?.title ?? ''}`} size="lg">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-xs flex-1" style={{ color: 'var(--ap-text-4)' }}>
              {included} de {targets.length} incluídos no disparo. Marque/desmarque ou adicione clientes fora da região.
            </p>
            <button className="btn-secondary disabled:opacity-60" onClick={handleResolve} disabled={resolving}>
              {resolving ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Resolver afetados
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
          ) : !targets.length ? (
            <EmptyState icon={Users} title="Nenhum afetado" description="Clique em “Resolver afetados” para buscar por conectividade ou adicione manualmente." />
          ) : (
            <div className="card p-0 overflow-hidden max-h-[320px] overflow-y-auto">
              <Table>
                <Thead>
                  <Th>Incluir</Th><Th>Cliente</Th><Th>Telefone</Th><Th>Status</Th><Th>Origem</Th>
                </Thead>
                <Tbody>
                  {targets.map((t) => (
                    <Tr key={t.id}>
                      <Td><input type="checkbox" checked={t.included} onChange={() => toggleInclude(t)} className="w-4 h-4 accent-current" /></Td>
                      <Td>
                        <span className="font-mono text-xs" style={{ color: 'var(--ap-text-2)' }}>{t.customer_ref}</span>
                        {t.name && <p className="text-[11px]" style={{ color: 'var(--ap-text-4)' }}>{t.name}</p>}
                      </Td>
                      <Td>{t.phone || '—'}</Td>
                      <Td>{t.last_status || '—'}</Td>
                      <Td><Badge variant={t.source === 'MANUAL' ? 'purple' : 'gray'}>{t.source === 'MANUAL' ? 'Manual' : 'Escopo'}</Badge></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end pt-1">
            <FormField label="Login/CPF"><TextInput value={manual.customer_ref} onChange={(e) => setManual((m) => ({ ...m, customer_ref: e.target.value }))} /></FormField>
            <FormField label="Nome"><TextInput value={manual.name} onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))} /></FormField>
            <FormField label="Telefone"><TextInput value={manual.phone} onChange={(e) => setManual((m) => ({ ...m, phone: e.target.value }))} /></FormField>
            <button className="btn-secondary" onClick={addManual}><Plus size={14} /> Vincular</button>
          </div>
        </div>
      </Modal>

      {/* Disparo proativo dedicado (ConfirmDialog com rate limit). */}
      <Modal
        open={open && incident?._dispatch === true && !dispatchConfirm}
        onClose={onClose}
        title={`Disparar informativo — ${incident?.title ?? ''}`}
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            {canDispatch && <button className="btn-primary" onClick={() => setDispatchConfirm(true)}><Send size={14} /> Continuar</button>}
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--ap-text-2)' }}>
            O informativo será enviado por WhatsApp aos afetados incluídos. Ajuste o limite de envio por segundo.
          </p>
          <FormField label="Mensagens por segundo (rate limit)" hint="Entre 1 e 60. Recomendado 5.">
            <NumberInput value={rate} min={1} max={60} onChange={(v) => setRate(v)} />
          </FormField>
        </div>
      </Modal>

      <ConfirmDialog
        open={dispatchConfirm}
        onClose={() => setDispatchConfirm(false)}
        onConfirm={runDispatch}
        loading={busy}
        danger
        title="Confirmar disparo em massa"
        confirmLabel="Disparar"
        message="Esta ação envia mensagens WhatsApp reais a todos os afetados incluídos e é irreversível. Confirma o disparo?"
      />
    </>
  );
}
