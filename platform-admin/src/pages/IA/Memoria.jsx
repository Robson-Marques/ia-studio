import React, { useEffect, useState } from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import {
  PageHeader, Card, DataTable, EmptyState, Badge, Modal,
  Field, Input, Select, NumericInput, TextArea, Button, useToast,
} from '@studio-ux-ds/react';
import {
  listMemoryProfiles, createMemoryProfile, updateMemoryProfile, listMemoryEntries,
} from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { MEMORY_SCOPES, formatDateTime } from './ia.constants';

// IA/Memoria — 2ª tela migrada pro DS (v0.9.85, 2026-07-24). Perfis de memória
// (scope/TTL/max_items) + navegação de entries por scope_key (read-only).
// Escrita de entries acontece pelos agentes/tools, não pela UI. Master-detail
// segue via state `selected` (sem rota) — mantido do legado; migração pra
// `?open=<id>` fica pra sub-frente arquitetural futura (registrada em
// docs/adocao-studio-ux.md como pendência).
//
// NumericInput do DS aceita string vazia ("") como valor intermediário e
// devolve string vazia no onChange enquanto o usuário digita. Aproveitamos:
// TTL/max_items opcionais viram `value={form.x ?? ''}` e patch converte de
// volta para null quando vazio antes de salvar.

export default function Memoria() {
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
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (selected) {
    return <EntriesView profile={selected} onBack={() => setSelected(null)} />;
  }

  const scopeLabel = (s) => (MEMORY_SCOPES.find((x) => x.value === s)?.label || s);

  const columns = [
    { key: 'name', header: 'Nome', render: (p) => <span style={{ fontWeight: 500 }}>{p.name}</span> },
    { key: 'scope', header: 'Escopo', render: (p) => <Badge tone="info">{scopeLabel(p.scope)}</Badge> },
    { key: 'ttl', header: 'TTL (s)', align: 'right', render: (p) => p.default_ttl_seconds ?? '—' },
    { key: 'max', header: 'Máx. itens', align: 'right', render: (p) => p.max_items ?? '—' },
  ];

  const newProfileBtn = canWrite ? (
    <Button variant="primary" icon="plus" onClick={() => { setEditing(null); setEditorOpen(true); }}>
      Novo perfil
    </Button>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Memória"
        subtitle="Perfis de memória por escopo (sessão/contato/fluxo/assistente) com validade e limite de itens."
        actions={newProfileBtn}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="settings"
            title="Nenhum perfil de memória"
            description="Crie perfis para o assistente lembrar contexto entre mensagens."
            action={newProfileBtn}
          />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          getRowId={(p) => p.id}
          onRowClick={(p) => setSelected(p)}
          getRowLabel={(p) => `Abrir entradas de ${p.name}`}
          renderRowMenu={canWrite ? (p) => (
            <Button
              variant="ghost"
              size="sm"
              icon="edit"
              aria-label="Editar perfil"
              onClick={() => { setEditing(p); setEditorOpen(true); }}
            />
          ) : undefined}
        />
      )}

      <ProfileModal
        open={editorOpen}
        profile={editing}
        workspaceId={workspaceId}
        environmentId={environmentId}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); load(); }}
      />
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
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [profile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'scope_key', header: 'Scope key', render: (e) => <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12, color: 'var(--su-text-muted)' }}>{e.scope_key}</span> },
    { key: 'key', header: 'Chave' },
    { key: 'value', header: 'Valor', render: (e) => (
      <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, wordBreak: 'break-all', color: 'var(--su-text-muted)' }}>
        {typeof e.value === 'string' ? e.value : JSON.stringify(e.value)}
      </span>
    ) },
    { key: 'expires_at', header: 'Expira', render: (e) => formatDateTime(e.expires_at) },
    { key: 'updated_at', header: 'Atualizado', render: (e) => formatDateTime(e.updated_at) },
  ];

  const filterActions = (
    <div className="flex items-end gap-2">
      <div style={{ minWidth: 220 }}>
        <Field label="Filtrar por scope_key">
          <Input value={scopeKey} onChange={(e) => setScopeKey(e.target.value)} placeholder="contact_id / session_id…" />
        </Field>
      </div>
      <Button variant="secondary" icon="search" onClick={load}>Filtrar</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" icon="arrow-left" aria-label="Voltar" onClick={onBack} />
        <div className="flex-1 min-w-0">
          <PageHeader
            title={profile.name}
            subtitle="Entradas de memória (somente leitura)."
            actions={filterActions}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      ) : !entries.length ? (
        <Card>
          <EmptyState icon="settings" title="Sem entradas" description="Nenhuma entrada para o filtro atual." />
        </Card>
      ) : (
        <DataTable columns={columns} rows={entries} getRowId={(e) => e.id} />
      )}
    </div>
  );
}

function ProfileModal({ open, profile, onClose, onSaved, workspaceId, environmentId }) {
  const toast = useToast();
  const isEdit = !!profile?.id;
  const [form, setForm] = useState({ name: '', scope: 'SESSION', description: '', default_ttl_seconds: '', max_items: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(profile
      ? {
          name: profile.name || '',
          scope: profile.scope || 'SESSION',
          description: profile.description || '',
          default_ttl_seconds: profile.default_ttl_seconds ?? '',
          max_items: profile.max_items ?? '',
        }
      : { name: '', scope: 'SESSION', description: '', default_ttl_seconds: '', max_items: '' });
  }, [open, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Informe o nome do perfil.'); return; }
    if (!isEdit && (!workspaceId || !environmentId)) { toast.error('Selecione um workspace e um ambiente no topo.'); return; }
    setSaving(true);
    try {
      // "" (vazio) vira null antes de mandar pro backend — semântica do legado
      // (TTL vazio = sem expiração; max_items vazio = ilimitado).
      const toNullable = (v) => (v === '' || v === null || v === undefined) ? null : Number(v);
      const body = {
        name: form.name.trim(),
        scope: form.scope,
        description: form.description.trim() || undefined,
        default_ttl_seconds: toNullable(form.default_ttl_seconds),
        max_items: toNullable(form.max_items),
      };
      if (isEdit) await updateMemoryProfile(profile.id, body);
      else await createMemoryProfile({ ...body, workspace_id: workspaceId, environment_id: environmentId });
      toast.success(isEdit ? 'Perfil atualizado.' : 'Perfil criado.');
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
      title={isEdit ? 'Editar perfil de memória' : 'Novo perfil de memória'}
      maxWidth={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving} icon={saving ? 'loader-2' : undefined}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nome">
          <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex.: Contexto do contato" />
        </Field>
        <Field label="Escopo" hint="Define a chave de escopo (contato/sessão/fluxo/assistente).">
          <Select value={form.scope} onChange={(e) => patch({ scope: e.target.value })} disabled={isEdit}>
            {MEMORY_SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Descrição">
          <TextArea rows={2} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="TTL padrão (segundos)" hint="Vazio = sem expiração.">
            <NumericInput
              value={form.default_ttl_seconds}
              onChange={(v) => patch({ default_ttl_seconds: v })}
              min={0}
              step={60}
              fullWidth
            />
          </Field>
          <Field label="Máx. de itens" hint="Vazio = ilimitado.">
            <NumericInput
              value={form.max_items}
              onChange={(v) => patch({ max_items: v })}
              min={1}
              step={1}
              fullWidth
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
