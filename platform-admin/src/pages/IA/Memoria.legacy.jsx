// LEGADO (2026-07-24). Versão anterior de IA/Memoria preservada para rollback:
// se a migração pro DS causar regressão, basta trocar o import em App.jsx
// (Memoria → Memoria.legacy). Este arquivo NÃO é referenciado enquanto o novo
// estiver ativo.
import React, { useEffect, useState } from 'react';
import { Brain, Loader2, Plus, ArrowLeft, Pencil, Search } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, TextInput, Textarea, Select, NumberInput } from '../../components/ui/FormField';
import {
  listMemoryProfiles, createMemoryProfile, updateMemoryProfile, listMemoryEntries,
} from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useToast } from '@studio-ux-ds/react';
import { MEMORY_SCOPES, formatDateTime } from './ia.constants';

export default function MemoriaLegacy() {
  const toast = useToast();
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canWrite = can('ai.memory.write');
  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listMemoryProfiles({ environment_id: environmentId || undefined });
      setItems(list);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [environmentId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (selected) return <EntriesView profile={selected} onBack={() => setSelected(null)} />;
  const scopeLabel = (s) => (MEMORY_SCOPES.find((x) => x.value === s)?.label || s);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Memória</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Perfis de memória por escopo (sessão/contato/fluxo/assistente) com validade e limite de itens.
          </p>
        </div>
        {canWrite && <button className="btn-primary" onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus size={14} /> Novo perfil</button>}
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card">
          <EmptyState icon={Brain} title="Nenhum perfil de memória" description="Crie perfis para o assistente lembrar contexto entre mensagens."
            action={canWrite && <button className="btn-primary" onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus size={14} /> Novo perfil</button>} />
        </div>
      ) : (
        <>
          <div className="hidden md:block card p-0 overflow-hidden">
            <Table>
              <Thead>
                <Th>Nome</Th><Th>Escopo</Th><Th>TTL (s)</Th><Th>Máx. itens</Th><Th className="text-right">Ações</Th>
              </Thead>
              <Tbody>
                {items.map((p) => (
                  <Tr key={p.id} onClick={() => setSelected(p)}>
                    <Td><span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{p.name}</span></Td>
                    <Td><Badge variant="purple">{scopeLabel(p.scope)}</Badge></Td>
                    <Td>{p.default_ttl_seconds ?? '—'}</Td>
                    <Td>{p.max_items ?? '—'}</Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button className="btn-ghost p-1.5" title="Ver entradas" onClick={(ev) => { ev.stopPropagation(); setSelected(p); }}><Search size={14} /></button>
                        {canWrite && <button className="btn-ghost p-1.5" title="Editar" onClick={(ev) => { ev.stopPropagation(); setEditing(p); setEditorOpen(true); }}><Pencil size={14} className="text-brand" /></button>}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
          <div className="md:hidden space-y-2">
            {items.map((p) => (
              <button key={p.id} className="card w-full text-left" onClick={() => setSelected(p)}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{p.name}</span>
                  <Badge variant="purple">{scopeLabel(p.scope)}</Badge>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      <ProfileModal open={editorOpen} profile={editing} workspaceId={workspaceId} environmentId={environmentId}
        onClose={() => setEditorOpen(false)} onSaved={() => { setEditorOpen(false); load(); }} />
    </div>
  );
}

function EntriesView({ profile, onBack }) {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scopeKey, setScopeKey] = useState('');
  async function load() {
    setLoading(true);
    try {
      const { items } = await listMemoryEntries(profile.id, { scope_key: scopeKey || undefined });
      setEntries(items);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [profile.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost p-2" onClick={onBack} aria-label="Voltar"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-[180px]">
          <h1 className="text-lg font-bold truncate" style={{ color: 'var(--ap-text-1)' }}>{profile.name}</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>Entradas de memória (somente leitura).</p>
        </div>
        <div className="flex items-end gap-2">
          <FormField label="Filtrar por scope_key" className="w-56">
            <TextInput value={scopeKey} onChange={(e) => setScopeKey(e.target.value)} placeholder="contact_id / session_id…" />
          </FormField>
          <button className="btn-secondary" onClick={load}><Search size={14} /> Filtrar</button>
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
        ) : !entries.length ? (
          <EmptyState icon={Brain} title="Sem entradas" description="Nenhuma entrada para o filtro atual." />
        ) : (
          <Table>
            <Thead>
              <Th>Scope key</Th><Th>Chave</Th><Th>Valor</Th><Th>Expira</Th><Th>Atualizado</Th>
            </Thead>
            <Tbody>
              {entries.map((e) => (
                <Tr key={e.id}>
                  <Td><span className="font-mono text-xs" style={{ color: 'var(--ap-text-3)' }}>{e.scope_key}</span></Td>
                  <Td>{e.key}</Td>
                  <Td><span className="font-mono text-[11px] break-all" style={{ color: 'var(--ap-text-3)' }}>{typeof e.value === 'string' ? e.value : JSON.stringify(e.value)}</span></Td>
                  <Td>{formatDateTime(e.expires_at)}</Td>
                  <Td>{formatDateTime(e.updated_at)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  );
}

function ProfileModal({ open, profile, onClose, onSaved, workspaceId, environmentId }) {
  const toast = useToast();
  const isEdit = !!profile?.id;
  const [form, setForm] = useState({ name: '', scope: 'SESSION', description: '', default_ttl_seconds: null, max_items: null });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(profile
      ? { name: profile.name || '', scope: profile.scope || 'SESSION', description: profile.description || '', default_ttl_seconds: profile.default_ttl_seconds ?? null, max_items: profile.max_items ?? null }
      : { name: '', scope: 'SESSION', description: '', default_ttl_seconds: null, max_items: null });
  }, [open, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));
  async function handleSave() {
    if (!form.name.trim()) { toast.error('Informe o nome do perfil.'); return; }
    if (!isEdit && (!workspaceId || !environmentId)) { toast.error('Selecione um workspace e um ambiente no topo.'); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(), scope: form.scope, description: form.description.trim() || undefined,
        default_ttl_seconds: form.default_ttl_seconds ?? null, max_items: form.max_items ?? null,
      };
      if (isEdit) await updateMemoryProfile(profile.id, body);
      else await createMemoryProfile({ ...body, workspace_id: workspaceId, environment_id: environmentId });
      toast.success(isEdit ? 'Perfil atualizado.' : 'Perfil criado.');
      onSaved();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={saving ? undefined : onClose} title={isEdit ? 'Editar perfil de memória' : 'Novo perfil de memória'} size="md" dismissable={!saving}
      footer={<>
        <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Salvar</button>
      </>}
    >
      <div className="space-y-3">
        <FormField label="Nome" required><TextInput value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex.: Contexto do contato" /></FormField>
        <FormField label="Escopo" hint="Define a chave de escopo (contato/sessão/fluxo/assistente).">
          <Select value={form.scope} onChange={(e) => patch({ scope: e.target.value })} disabled={isEdit}>
            {MEMORY_SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Descrição"><Textarea rows={2} value={form.description} onChange={(e) => patch({ description: e.target.value })} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="TTL padrão (segundos)" hint="Vazio = sem expiração.">
            <NumberInput value={form.default_ttl_seconds} onChange={(v) => patch({ default_ttl_seconds: v })} allowEmpty min={0} step={60} />
          </FormField>
          <FormField label="Máx. de itens" hint="Vazio = ilimitado.">
            <NumberInput value={form.max_items} onChange={(v) => patch({ max_items: v })} allowEmpty min={1} step={1} />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}
