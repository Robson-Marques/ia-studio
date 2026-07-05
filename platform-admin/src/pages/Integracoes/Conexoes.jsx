import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, CheckCircle2, Loader2, Pause, Pencil, Play, Plug, Plus, ScrollText, Wrench, XCircle,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Tabs from '../../components/ui/Tabs';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, Select, TextInput, NumberInput } from '../../components/ui/FormField';
import {
  listConnections, changeConnectionState, testConnection, listConnectionLogs, getMarketplace,
  updateConnection,
} from '../../services/integrations';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatDateTime } from '../../lib/format';
import { toast } from '../../lib/toast';
import { statusMeta } from './integration.constants';
import ConnectionWizard from './ConnectionWizard';
import { ConnectionField, WebhookUrlBox } from './ConnectionFields';
import GoogleOAuthButton from './GoogleOAuthButton';

// Conexões (Instances — diretriz 52): tabela + testar + ativar/desativar/
// manutenção com ConfirmDialog. SEM excluir — conexão só muda de estado.
export default function Conexoes() {
  const { can } = usePermissions();
  const { workspaces } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(null); // id em teste
  const [stateAction, setStateAction] = useState(null); // { connection, action }
  const [acting, setActing] = useState(false);
  const [detail, setDetail] = useState(null); // conexão do modal de detalhe
  const [editing, setEditing] = useState(null); // conexão sendo editada
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wizardFor, setWizardFor] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listConnections();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const scopeName = useMemo(() => {
    const map = new Map();
    workspaces.forEach((ws) => {
      (ws.environments || []).forEach((env) => {
        map.set(`${ws.id}:${env.id}`, `${ws.name} / ${env.name || env.kind || ''}`);
      });
      map.set(`${ws.id}:`, ws.name);
    });
    return (c) => map.get(`${c.workspace_id}:${c.environment_id}`) || map.get(`${c.workspace_id}:`) || '—';
  }, [workspaces]);

  async function handleTest(connection) {
    setTesting(connection.id);
    try {
      const { health } = await testConnection(connection.id);
      if (health?.ok) toast.success(`Teste OK: ${health.detail || 'conexão saudável.'}`);
      else toast.warn(`Teste falhou: ${health?.detail || 'sem detalhe.'}`);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTesting(null);
    }
  }

  async function handleStateConfirm() {
    if (!stateAction) return;
    setActing(true);
    try {
      await changeConnectionState(stateAction.connection.id, stateAction.action);
      toast.success('Estado da conexão atualizado.');
      setStateAction(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  const STATE_ACTIONS = {
    enable:      { label: 'Ativar',               message: 'Reativar esta conexão? Ela volta a aceitar operações imediatamente.' },
    disable:     { label: 'Desativar',            message: 'Desativar esta conexão? Nenhuma operação será executada até reativá-la. A conexão nunca é excluída — só muda de estado.' },
    maintenance: { label: 'Colocar em manutenção', message: 'Colocar em manutenção? Operações ficam suspensas enquanto durar a manutenção.' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Conexões</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Instâncias nomeadas dos conectores instalados. Conexões nunca são excluídas — apenas mudam de estado.
          </p>
        </div>
        {can('integrations.connections.write') && (
          <button className="btn-primary" onClick={() => setPickerOpen(true)}>
            <Plus size={15} /> Nova conexão
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card">
          <EmptyState
            icon={Plug}
            title="Nenhuma conexão"
            description="Instale um conector no Marketplace e crie a primeira conexão pelo wizard."
          />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <Table>
            <Thead>
              <Th>Nome</Th>
              <Th>Conector</Th>
              <Th>Workspace / Ambiente</Th>
              <Th>Tags</Th>
              <Th>Status</Th>
              <Th>Último health</Th>
              <Th className="text-right">Ações</Th>
            </Thead>
            <Tbody>
              {items.map((c) => {
                const meta = statusMeta(c.status);
                return (
                  <Tr key={c.id} onClick={() => setDetail(c)}>
                    <Td>
                      <span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{c.name}</span>
                    </Td>
                    <Td>{c.provider_key}</Td>
                    <Td>{scopeName(c)}</Td>
                    <Td>
                      <div className="flex gap-1 flex-wrap">
                        {(c.tags || []).map((t) => <Badge key={t} variant="blue">{t}</Badge>)}
                        {!(c.tags || []).length && <span style={{ color: 'var(--ap-text-5)' }}>—</span>}
                      </div>
                    </Td>
                    <Td><Badge variant={meta.variant}>{meta.label}</Badge></Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        {c.last_health_ok === true && <CheckCircle2 size={13} className="text-emerald-500" />}
                        {c.last_health_ok === false && <XCircle size={13} className="text-red-500" />}
                        <span className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
                          {c.last_health_at ? formatDateTime(c.last_health_at) : 'nunca'}
                        </span>
                      </div>
                    </Td>
                    <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {can('integrations.connections.write') &&
                          c.provider_key === 'google-workspace' &&
                          c.status !== 'ACTIVE' && (
                            <GoogleOAuthButton connectionId={c.id} size="sm" onActivated={load} />
                          )}
                        {can('integrations.connections.write') && (
                          <button
                            className="btn-ghost p-1.5"
                            title="Editar conexão (nome, tags, credenciais)"
                            onClick={(e) => { e.stopPropagation(); setEditing(c); }}
                          >
                            <Pencil size={14} className="text-brand" />
                          </button>
                        )}
                        {can('integrations.connections.write') && (
                          <button
                            className="btn-ghost p-1.5 disabled:opacity-60"
                            title="Testar conexão (health check)"
                            disabled={testing === c.id}
                            onClick={() => handleTest(c)}
                          >
                            {testing === c.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Activity size={14} className="text-brand" />}
                          </button>
                        )}
                        {can('integrations.connections.write') && c.status !== 'ACTIVE' && (
                          <button
                            className="btn-ghost p-1.5"
                            title="Ativar conexão"
                            onClick={() => setStateAction({ connection: c, action: 'enable' })}
                          >
                            <Play size={14} className="text-emerald-500" />
                          </button>
                        )}
                        {can('integrations.connections.write') && c.status !== 'DISABLED' && (
                          <button
                            className="btn-ghost p-1.5"
                            title="Desativar conexão (não exclui)"
                            onClick={() => setStateAction({ connection: c, action: 'disable' })}
                          >
                            <Pause size={14} className="text-red-500" />
                          </button>
                        )}
                        {can('integrations.connections.write') && c.status !== 'MAINTENANCE' && (
                          <button
                            className="btn-ghost p-1.5"
                            title="Colocar em manutenção"
                            onClick={() => setStateAction({ connection: c, action: 'maintenance' })}
                          >
                            <Wrench size={14} className="text-amber-500" />
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
      )}

      <ConfirmDialog
        open={Boolean(stateAction)}
        danger={stateAction?.action === 'disable'}
        loading={acting}
        title={stateAction ? STATE_ACTIONS[stateAction.action].label : ''}
        message={stateAction ? `${STATE_ACTIONS[stateAction.action].message} (Conexão: ${stateAction.connection.name})` : ''}
        confirmLabel={stateAction ? STATE_ACTIONS[stateAction.action].label : 'Confirmar'}
        onClose={() => setStateAction(null)}
        onConfirm={handleStateConfirm}
      />

      <ConnectionDetailModal
        connection={detail}
        scopeName={scopeName}
        onClose={() => setDetail(null)}
      />

      <EditConnectionModal
        connection={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />

      <NewConnectionPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(provider) => { setPickerOpen(false); setWizardFor(provider); }}
      />
      <ConnectionWizard
        open={Boolean(wizardFor)}
        provider={wizardFor}
        onClose={() => { setWizardFor(null); load(); }}
      />
    </div>
  );
}

// Detalhe da conexão — abas Dados / Logs (padrão único components/ui/Tabs).
function ConnectionDetailModal({ connection, scopeName, onClose }) {
  const { can } = usePermissions();
  const [tab, setTab] = useState('dados');
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    setTab('dados');
    setLogs([]);
  }, [connection?.id]);

  useEffect(() => {
    if (!connection || tab !== 'logs') return;
    let cancelled = false;
    (async () => {
      setLoadingLogs(true);
      try {
        const { items } = await listConnectionLogs(connection.id);
        if (!cancelled) setLogs(items);
      } catch (err) {
        toast.error(err.message);
      } finally {
        if (!cancelled) setLoadingLogs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [connection, tab]);

  if (!connection) return null;
  const meta = statusMeta(connection.status);
  const TABS = [
    { id: 'dados', label: 'Dados', Icon: Plug },
    ...(can('integrations.logs.read') ? [{ id: 'logs', label: 'Logs', Icon: ScrollText }] : []),
  ];

  return (
    <Modal open={Boolean(connection)} onClose={onClose} title={connection.name} size="lg">
      <Tabs items={TABS} active={tab} onChange={setTab} bleed={false} />
      {tab === 'dados' && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <InfoRow label="Conector" value={connection.provider_key} />
          <InfoRow label="Escopo" value={scopeName(connection)} />
          <InfoRow label="Status" value={<Badge variant={meta.variant}>{meta.label}</Badge>} />
          <InfoRow label="Detalhe" value={connection.status_detail || '—'} />
          <InfoRow label="Conectada em" value={connection.connected_at ? formatDateTime(connection.connected_at) : '—'} />
          <InfoRow label="Último health" value={connection.last_health_at ? formatDateTime(connection.last_health_at) : 'nunca'} />
          <InfoRow label="Última utilização" value={connection.last_used_at ? formatDateTime(connection.last_used_at) : 'nunca'} />
          <InfoRow label="Última sincronização" value={connection.last_sync_at ? formatDateTime(connection.last_sync_at) : 'nunca'} />
          <InfoRow label="Prioridade" value={String(connection.priority ?? 0)} />
          <InfoRow
            label="Tags"
            value={(connection.tags || []).length
              ? <div className="flex gap-1 flex-wrap">{connection.tags.map((t) => <Badge key={t} variant="blue">{t}</Badge>)}</div>
              : '—'}
          />
          <div className="md:col-span-2">
            <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--ap-text-4)' }}>Configuração (não sensível)</p>
            <pre
              className="text-xs rounded-lg px-3 py-2 overflow-x-auto"
              style={{ backgroundColor: 'var(--ap-surface-2)', border: '1px solid var(--ap-border-sub)', color: 'var(--ap-text-3)' }}
            >
              {JSON.stringify(connection.config || {}, null, 2)}
            </pre>
          </div>
        </div>
      )}
      {tab === 'logs' && (
        <div className="mt-4">
          {loadingLogs ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
          ) : !logs.length ? (
            <EmptyState icon={ScrollText} title="Sem logs" description="Nenhuma chamada registrada para esta conexão." />
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--ap-border-sub)' }}>
              {logs.map((log) => (
                <div key={log.id} className="py-2 flex items-start gap-2 text-xs">
                  {log.status === 'SUCCESS'
                    ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                    : <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p style={{ color: 'var(--ap-text-2)' }}>
                      <strong>{log.operation}</strong>
                      {typeof log.duration_ms === 'number' && <span style={{ color: 'var(--ap-text-5)' }}> · {log.duration_ms} ms</span>}
                    </p>
                    {log.error && <p className="text-red-500 truncate">{log.error}</p>}
                  </div>
                  <span className="shrink-0" style={{ color: 'var(--ap-text-5)' }}>{formatDateTime(log.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// Edição de conexão — nome/tags/prioridade + credenciais (config não-sensível
// pré-preenchido; secretos em branco = mantém o atual). Reaproveita o
// renderizador de campos do wizard (ConnectionField/WebhookUrlBox).
function EditConnectionModal({ connection, onClose, onSaved }) {
  const [schema, setSchema] = useState(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [name, setName] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [priority, setPriority] = useState(0);
  const [values, setValues] = useState({}); // campos do wizard (config + secrets)
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!connection) return;
    setName(connection.name || '');
    setTagsText((connection.tags || []).join(', '));
    setPriority(connection.priority ?? 0);
    setSchema(null);
    // Pré-preenche APENAS os não-secretos com o config atual; secretos em branco.
    setValues({ ...(connection.config || {}) });
    (async () => {
      setLoadingSchema(true);
      try {
        const { items } = await getMarketplace();
        const provider = items.find((i) => i.key === connection.provider_key);
        setSchema(provider?.wizard_schema || { steps: [] });
      } catch (err) {
        toast.error(err.message);
        setSchema({ steps: [] });
      } finally {
        setLoadingSchema(false);
      }
    })();
  }, [connection?.id]);

  const steps = schema?.steps || [];
  const fields = useMemo(() => steps.flatMap((s) => s.fields || []), [steps]);
  const hasGeneratable = fields.some((f) => f.generatable);

  function setValue(key, value) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Dê um nome para a conexão.'); return; }
    setSaving(true);
    try {
      const config = {};
      const secrets = {};
      fields.forEach((f) => {
        const raw = values[f.key];
        const isSecret = f.secret || f.type === 'password';
        if (isSecret) {
          // Só envia secreto preenchido (não-vazio) — vazio mantém o atual.
          if (raw !== undefined && String(raw).trim() !== '') secrets[f.key] = String(raw);
        } else if (raw !== undefined) {
          config[f.key] = f.type === 'number' && raw !== '' ? Number(raw) : raw;
        }
      });
      const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);
      const body = { name: name.trim(), tags, priority: Number(priority) || 0, config };
      if (Object.keys(secrets).length) body.secrets = secrets;
      await updateConnection(connection.id, body);
      toast.success('Conexão atualizada. Use "Testar" na lista para validar as credenciais.');
      onSaved?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!connection) return null;

  return (
    <Modal
      open={Boolean(connection)}
      onClose={saving ? undefined : onClose}
      dismissable={false}
      title={`Editar conexão — ${connection.name}`}
      size="lg"
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" disabled={saving} onClick={onClose}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" disabled={saving || loadingSchema} onClick={handleSave}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null} Salvar
          </button>
        </>
      }
    >
      {loadingSchema ? (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : (
        <div className="space-y-3">
          <FormField label="Nome da conexão" required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus name="edit-conn-name" autoComplete="off" />
          </FormField>
          <FormField label="Tags" hint="Separadas por vírgula. Ex.: Financeiro, Comercial">
            <TextInput value={tagsText} onChange={(e) => setTagsText(e.target.value)} name="edit-conn-tags" autoComplete="off" />
          </FormField>
          <FormField label="Prioridade" hint="Maior = usada primeiro quando há várias conexões do mesmo tipo.">
            <NumberInput value={priority} onChange={setPriority} min={0} step={1} />
          </FormField>

          {fields.length > 0 && (
            <div className="pt-1 space-y-3 border-t" style={{ borderColor: 'var(--ap-border-sub)' }}>
              <p className="text-xs font-semibold pt-2" style={{ color: 'var(--ap-text-2)' }}>Credenciais</p>
              {fields.map((field) => (
                <ConnectionField
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  onChange={(v) => setValue(field.key, v)}
                  namePrefix={`edit-${connection.provider_key}`}
                  editing
                />
              ))}
              {schema?.webhookPath && hasGeneratable && <WebhookUrlBox webhookPath={schema.webhookPath} />}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-medium" style={{ color: 'var(--ap-text-4)' }}>{label}</p>
      <div className="mt-0.5" style={{ color: 'var(--ap-text-2)' }}>{value}</div>
    </div>
  );
}

// Escolha do conector instalado antes de abrir o wizard.
function NewConnectionPicker({ open, onClose, onPick }) {
  const [providers, setProviders] = useState([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected('');
    (async () => {
      setLoading(true);
      try {
        const { items } = await getMarketplace();
        setProviders(items.filter((i) => i.installed && i.has_implementation));
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova conexão"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary disabled:opacity-60"
            disabled={!selected}
            onClick={() => onPick(providers.find((p) => p.key === selected))}
          >
            Abrir wizard
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !providers.length ? (
        <p className="text-sm" style={{ color: 'var(--ap-text-3)' }}>
          Nenhum conector instalado com conexão disponível. Instale um no Marketplace.
        </p>
      ) : (
        <FormField label="Conector" required>
          <Select value={selected} onChange={(e) => setSelected(e.target.value)} autoFocus>
            <option value="">Selecione…</option>
            {providers.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </Select>
        </FormField>
      )}
    </Modal>
  );
}
