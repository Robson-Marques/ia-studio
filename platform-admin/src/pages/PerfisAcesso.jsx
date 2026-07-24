import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Plus, Pencil, Trash2, Loader2, Lock } from 'lucide-react';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../components/ui/Table';
import { FormField, TextInput, Textarea } from '../components/ui/FormField';
import {
  listProfiles, createProfile, updateProfile, deleteProfile, getPermissionsCatalog,
} from '../services/profiles';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '@studio-ux-ds/react';

export default function PerfisAcesso() {
  const toast = useToast();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [acting, setActing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [{ items: list }, cat] = await Promise.all([
        listProfiles(),
        getPermissionsCatalog(),
      ]);
      setItems(list);
      setCatalog(cat);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const isSystem = (p) => Boolean(p.is_system || p.system);

  async function handleDelete() {
    if (!deleting) return;
    setActing(true);
    try {
      await deleteProfile(deleting.id);
      toast.success('Perfil excluído.');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Perfis de Acesso</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Perfis agrupam permissões. Perfis de sistema não podem ser editados.
          </p>
        </div>
        {can('core.profiles.write') && (
          <button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus size={15} /> Novo perfil
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
        ) : !items.length ? (
          <EmptyState icon={ShieldCheck} title="Nenhum perfil" description="Crie um perfil para atribuir permissões aos usuários." />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block">
              <Table>
                <Thead>
                  <Th>Nome</Th><Th>Descrição</Th><Th>Permissões</Th><Th>Tipo</Th><Th className="text-right">Ações</Th>
                </Thead>
                <Tbody>
                  {items.map((p) => (
                    <Tr key={p.id}>
                      <Td className="font-medium">{p.name}</Td>
                      <Td>{p.description || '—'}</Td>
                      <Td>{Array.isArray(p.permissions) ? p.permissions.length : '—'}</Td>
                      <Td>
                        {isSystem(p)
                          ? <Badge variant="blue">Sistema</Badge>
                          : <Badge variant="gray">Personalizado</Badge>}
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="btn-ghost p-1.5"
                            title={isSystem(p) ? 'Visualizar permissões (perfil de sistema, somente leitura)' : 'Editar perfil'}
                            onClick={() => { setEditing(p); setFormOpen(true); }}
                          >
                            {isSystem(p) ? <Lock size={15} style={{ color: 'var(--ap-text-4)' }} /> : <Pencil size={15} className="text-brand" />}
                          </button>
                          {can('core.profiles.write') && !isSystem(p) && (
                            <button
                              className="btn-ghost p-1.5"
                              title="Excluir perfil (usuários vinculados precisam ser movidos antes)"
                              onClick={() => setDeleting(p)}
                            >
                              <Trash2 size={15} className="text-red-500" />
                            </button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y px-4" style={{ borderColor: 'var(--ap-border)' }}>
              {items.map((p) => (
                <div key={p.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--ap-text-1)' }}>{p.name}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--ap-text-4)' }}>{p.description || '—'}</p>
                    <div className="mt-1.5">
                      {isSystem(p) ? <Badge variant="blue">Sistema</Badge> : <Badge variant="gray">Personalizado</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button className="btn-ghost p-2.5" onClick={() => { setEditing(p); setFormOpen(true); }} aria-label="Editar">
                      {isSystem(p) ? <Lock size={16} style={{ color: 'var(--ap-text-4)' }} /> : <Pencil size={16} className="text-brand" />}
                    </button>
                    {can('core.profiles.write') && !isSystem(p) && (
                      <button className="btn-ghost p-2.5" onClick={() => setDeleting(p)} aria-label="Excluir">
                        <Trash2 size={16} className="text-red-500" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ProfileFormModal
        open={formOpen}
        editing={editing}
        catalog={catalog}
        readOnly={editing ? isSystem(editing) : false}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load(); }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        danger
        loading={acting}
        title="Excluir perfil"
        message={`Excluir o perfil "${deleting?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onClose={() => !acting && setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function ProfileFormModal({ open, editing, catalog, readOnly, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name || '');
    setDescription(editing?.description || '');
    setSelected(new Set(Array.isArray(editing?.permissions) ? editing.permissions : []));
  }, [open, editing]);

  const totalSelected = selected.size;

  function togglePerm(key) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Master checkbox por grupo: marca/desmarca todas as perms do grupo.
  function toggleGroup(group) {
    if (readOnly) return;
    const keys = group.permissions.map((p) => p.key);
    const allOn = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => { if (allOn) next.delete(k); else next.add(k); });
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Nome obrigatório.'); return; }
    if (!selected.size) { toast.error('Selecione pelo menos uma permissão.'); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), description: description.trim(), permissions: Array.from(selected) };
      if (editing) {
        await updateProfile(editing.id, body);
        toast.success('Perfil atualizado.');
      } else {
        await createProfile(body);
        toast.success('Perfil criado.');
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
      title={readOnly ? `Perfil "${editing?.name}" (somente leitura)` : (editing ? 'Editar perfil' : 'Novo perfil')}
      size="lg"
      footer={
        readOnly ? (
          <button className="btn-secondary" onClick={onClose}>Fechar</button>
        ) : (
          <>
            <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />} Salvar
            </button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {readOnly && (
          <p className="text-xs rounded-lg px-3 py-2 flex items-center gap-2" style={{ backgroundColor: 'var(--ap-surface-3)', color: 'var(--ap-text-4)' }}>
            <Lock size={13} /> Perfil de sistema — as permissões são mantidas pela plataforma e não podem ser alteradas.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Nome" required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
          </FormField>
          <FormField label="Descrição">
            <TextInput value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} />
          </FormField>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--ap-text-4)' }}>
            Permissões ({totalSelected} selecionada(s))
          </p>
          {!catalog.length ? (
            <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>Catálogo de permissões indisponível.</p>
          ) : (
            <div className="space-y-3">
              {catalog.map((group) => {
                const keys = group.permissions.map((p) => p.key);
                const onCount = keys.filter((k) => selected.has(k)).length;
                const allOn = onCount === keys.length && keys.length > 0;
                const someOn = onCount > 0 && !allOn;
                return (
                  <div key={group.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--ap-border)' }}>
                    <label
                      className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer select-none"
                      style={{ backgroundColor: 'var(--ap-surface-2)' }}
                    >
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={(el) => { if (el) el.indeterminate = someOn; }}
                        onChange={() => toggleGroup(group)}
                        disabled={readOnly}
                        className="accent-[var(--ap-accent)] w-4 h-4"
                      />
                      <span className="text-sm font-semibold flex-1" style={{ color: 'var(--ap-text-1)' }}>{group.label}</span>
                      <span className="text-[11px]" style={{ color: 'var(--ap-text-5)' }}>{onCount}/{keys.length}</span>
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 px-3 py-2">
                      {group.permissions.map((perm) => (
                        <label key={perm.key} className="flex items-center gap-2.5 py-1.5 cursor-pointer select-none min-h-[36px]">
                          <input
                            type="checkbox"
                            checked={selected.has(perm.key)}
                            onChange={() => togglePerm(perm.key)}
                            disabled={readOnly}
                            className="accent-[var(--ap-accent)] w-4 h-4 shrink-0"
                          />
                          <span className="text-sm truncate" style={{ color: 'var(--ap-text-2)' }} title={perm.label}>
                            {perm.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
