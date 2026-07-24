import React, { useEffect, useState } from 'react';
import { Boxes, Plus, Pencil, Loader2, Layers } from 'lucide-react';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Table';
import { FormField, TextInput, Select } from '../components/ui/FormField';
import {
  listWorkspaces, createWorkspace, updateWorkspace, createEnvironment, updateEnvironment,
} from '../services/workspaces';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../context/AuthContext';
import { useToast } from '@studio-ux-ds/react';

const ENV_TYPES = [
  { value: 'PRODUCTION',  label: 'Produção',        variant: 'green' },
  { value: 'STAGING',     label: 'Homologação',     variant: 'yellow' },
  { value: 'DEVELOPMENT', label: 'Desenvolvimento', variant: 'blue' },
];

const envInfo = (type) => ENV_TYPES.find((e) => e.value === type) || { label: type, variant: 'gray' };

export default function Workspaces() {
  const toast = useToast();
  const { can } = usePermissions();
  const { refreshMe } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wsForm, setWsForm] = useState(null);   // { editing? }
  const [envForm, setEnvForm] = useState(null); // { workspace, editing? }

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listWorkspaces();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function afterChange() {
    await load();
    // Atualiza o seletor de workspace do Header.
    try { await refreshMe(); } catch { /* nao critico */ }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Workspaces e Ambientes</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Workspaces isolam projetos; cada workspace tem ambientes (produção, homologação, desenvolvimento).
          </p>
        </div>
        {can('core.workspaces.write') && (
          <button className="btn-primary" onClick={() => setWsForm({})}>
            <Plus size={15} /> Novo workspace
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card">
          <EmptyState icon={Boxes} title="Nenhum workspace" description="Crie o primeiro workspace para organizar seus projetos." />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((ws) => (
            <div key={ws.id} className="card p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-brand/10 text-brand shrink-0">
                  <Boxes size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--ap-text-1)' }}>{ws.name}</p>
                  <p className="text-[11px]" style={{ color: 'var(--ap-text-5)' }}>
                    {(ws.environments || []).length} ambiente(s)
                  </p>
                </div>
                {can('core.workspaces.write') && (
                  <button
                    className="btn-ghost p-2"
                    title="Editar workspace"
                    onClick={() => setWsForm({ editing: ws })}
                  >
                    <Pencil size={15} className="text-brand" />
                  </button>
                )}
              </div>

              <div className="mt-4 space-y-1.5">
                {(ws.environments || []).map((env) => {
                  const info = envInfo(env.type);
                  return (
                    <div
                      key={env.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{ backgroundColor: 'var(--ap-surface-2)', border: '1px solid var(--ap-border-sub)' }}
                    >
                      <Layers size={13} style={{ color: 'var(--ap-text-4)' }} />
                      <span className="text-sm flex-1 truncate" style={{ color: 'var(--ap-text-2)' }}>
                        {env.name || info.label}
                      </span>
                      <Badge variant={info.variant}>{info.label}</Badge>
                      {can('core.workspaces.write') && (
                        <button
                          className="btn-ghost p-1"
                          title="Renomear ambiente"
                          onClick={() => setEnvForm({ workspace: ws, editing: env })}
                        >
                          <Pencil size={13} style={{ color: 'var(--ap-text-4)' }} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {!(ws.environments || []).length && (
                  <p className="text-xs py-1" style={{ color: 'var(--ap-text-5)' }}>Nenhum ambiente cadastrado.</p>
                )}
              </div>

              {can('core.workspaces.write') && (
                <button className="btn-ghost mt-3 text-brand" onClick={() => setEnvForm({ workspace: ws })}>
                  <Plus size={14} /> Adicionar ambiente
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <WorkspaceFormModal
        open={Boolean(wsForm)}
        editing={wsForm?.editing}
        onClose={() => setWsForm(null)}
        onSaved={() => { setWsForm(null); afterChange(); }}
      />
      <EnvironmentFormModal
        open={Boolean(envForm)}
        workspace={envForm?.workspace}
        editing={envForm?.editing}
        onClose={() => setEnvForm(null)}
        onSaved={() => { setEnvForm(null); afterChange(); }}
      />
    </div>
  );
}

function WorkspaceFormModal({ open, editing, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setName(editing?.name || '');
  }, [open, editing]);

  async function handleSave() {
    if (!name.trim()) { toast.error('Nome obrigatório.'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateWorkspace(editing.id, { name: name.trim() });
        toast.success('Workspace atualizado.');
      } else {
        await createWorkspace({ name: name.trim() });
        toast.success('Workspace criado.');
      }
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
      dismissable={!saving}
      title={editing ? 'Editar workspace' : 'Novo workspace'}
      size="sm"
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </>
      }
    >
      <FormField label="Nome" required>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Atendimento" autoFocus />
      </FormField>
    </Modal>
  );
}

function EnvironmentFormModal({ open, workspace, editing, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState('DEVELOPMENT');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name || '');
    setType(editing?.type || 'DEVELOPMENT');
  }, [open, editing]);

  async function handleSave() {
    setSaving(true);
    try {
      if (editing) {
        await updateEnvironment(workspace.id, editing.id, { name: name.trim() || undefined });
        toast.success('Ambiente atualizado.');
      } else {
        await createEnvironment(workspace.id, { name: name.trim() || undefined, type });
        toast.success('Ambiente criado.');
      }
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
      dismissable={!saving}
      title={editing ? `Renomear ambiente — ${workspace?.name}` : `Novo ambiente — ${workspace?.name}`}
      size="sm"
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
        <FormField label="Nome" hint="Opcional — sem nome, usa o tipo do ambiente.">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Produção BR" />
        </FormField>
        {!editing && (
          <FormField label="Tipo" required>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {ENV_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </FormField>
        )}
      </div>
    </Modal>
  );
}
