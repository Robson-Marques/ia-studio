import React, { useEffect, useMemo, useState } from 'react';
import {
  Users as UsersIcon, Mail, Plus, Pencil, UserX, UserCheck, Copy, Trash2, Loader2,
} from 'lucide-react';
import Tabs from '../components/ui/Tabs';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge, Pagination } from '../components/ui/Table';
import { FormField, TextInput, Select } from '../components/ui/FormField';
import { listUsers, createUser, updateUser, inactivateUser, activateUser } from '../services/users';
import { listInvites, createInvite, revokeInvite } from '../services/invites';
import { listProfiles } from '../services/profiles';
import { usePermissions } from '../hooks/usePermissions';
import { formatDateTime } from '../lib/format';
import { toast } from '../lib/toast';

const TABS = [
  { id: 'usuarios', label: 'Usuários', Icon: UsersIcon },
  { id: 'convites', label: 'Convites', Icon: Mail },
];

const PER_PAGE = 10;

export default function Usuarios() {
  const [tab, setTab] = useState('usuarios');
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    let alive = true;
    listProfiles()
      .then(({ items }) => { if (alive) setProfiles(items); })
      .catch(() => { /* dropdown fica vazio; erro reportado nas telas */ });
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Usuários e Convites</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
          Gerencie quem acessa a organização e convide novas pessoas.
        </p>
      </div>
      <div className="card px-5 pt-4 pb-5">
        <Tabs items={TABS} active={tab} onChange={setTab} />
        {tab === 'usuarios' ? <UsersTab profiles={profiles} /> : <InvitesTab profiles={profiles} />}
      </div>
    </div>
  );
}

/* ───────────────────────── Usuários ───────────────────────── */

function UsersTab({ profiles }) {
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null); // { user, action: 'inactivate'|'activate' }
  const [acting, setActing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listUsers();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const paged = useMemo(
    () => items.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [items, page],
  );

  async function handleConfirm() {
    if (!confirm) return;
    setActing(true);
    try {
      if (confirm.action === 'inactivate') {
        await inactivateUser(confirm.user.id);
        toast.success('Usuário inativado.');
      } else {
        await activateUser(confirm.user.id);
        toast.success('Usuário reativado.');
      }
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  const profileName = (u) =>
    u.profile?.name || u.profile_name || profiles.find((p) => p.id === u.profile_id)?.name || '—';

  const isActive = (u) => u.is_active !== false && u.status !== 'INACTIVE';

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>{items.length} usuário(s)</p>
        {can('core.users.write') && (
          <button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus size={15} /> Novo usuário
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <EmptyState
          icon={UsersIcon}
          title="Nenhum usuário"
          description="Crie um usuário ou envie um convite pela aba Convites."
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block">
            <Table>
              <Thead>
                <Th>Nome</Th><Th>E-mail</Th><Th>Perfil</Th><Th>Status</Th><Th>Último login</Th><Th className="text-right">Ações</Th>
              </Thead>
              <Tbody>
                {paged.map((u) => (
                  <Tr key={u.id}>
                    <Td className="font-medium">{u.name || '—'}</Td>
                    <Td>{u.email}</Td>
                    <Td>{profileName(u)}</Td>
                    <Td>
                      <Badge variant={isActive(u) ? 'green' : 'gray'}>
                        {isActive(u) ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </Td>
                    <Td>{formatDateTime(u.last_login_at)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        {can('core.users.write') && (
                          <button
                            className="btn-ghost p-1.5"
                            title="Editar usuário"
                            onClick={() => { setEditing(u); setFormOpen(true); }}
                          >
                            <Pencil size={15} className="text-brand" />
                          </button>
                        )}
                        {can('core.users.inactivate') && (isActive(u) ? (
                          <button
                            className="btn-ghost p-1.5"
                            title="Inativar usuário (bloqueia o acesso; pode ser revertido)"
                            onClick={() => setConfirm({ user: u, action: 'inactivate' })}
                          >
                            <UserX size={15} className="text-red-500" />
                          </button>
                        ) : (
                          <button
                            className="btn-ghost p-1.5"
                            title="Reativar usuário (restaura o acesso)"
                            onClick={() => setConfirm({ user: u, action: 'activate' })}
                          >
                            <UserCheck size={15} className="text-emerald-500" />
                          </button>
                        ))}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            <Pagination page={page} total={items.length} perPage={PER_PAGE} onPage={setPage} />
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--ap-border)' }}>
            {paged.map((u) => (
              <div key={u.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--ap-text-1)' }}>{u.name || '—'}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--ap-text-4)' }}>{u.email}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant={isActive(u) ? 'green' : 'gray'}>{isActive(u) ? 'Ativo' : 'Inativo'}</Badge>
                    <span className="text-[11px]" style={{ color: 'var(--ap-text-5)' }}>{profileName(u)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {can('core.users.write') && (
                    <button className="btn-ghost p-2.5" onClick={() => { setEditing(u); setFormOpen(true); }} aria-label="Editar">
                      <Pencil size={16} className="text-brand" />
                    </button>
                  )}
                  {can('core.users.inactivate') && (
                    <button
                      className="btn-ghost p-2.5"
                      onClick={() => setConfirm({ user: u, action: isActive(u) ? 'inactivate' : 'activate' })}
                      aria-label={isActive(u) ? 'Inativar' : 'Reativar'}
                    >
                      {isActive(u)
                        ? <UserX size={16} className="text-red-500" />
                        : <UserCheck size={16} className="text-emerald-500" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <Pagination page={page} total={items.length} perPage={PER_PAGE} onPage={setPage} />
          </div>
        </>
      )}

      <UserFormModal
        open={formOpen}
        editing={editing}
        profiles={profiles}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load(); }}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        danger={confirm?.action === 'inactivate'}
        loading={acting}
        title={confirm?.action === 'inactivate' ? 'Inativar usuário' : 'Reativar usuário'}
        message={confirm?.action === 'inactivate'
          ? `Inativar "${confirm?.user?.name || confirm?.user?.email}"? O acesso é bloqueado imediatamente; pode ser revertido depois.`
          : `Reativar "${confirm?.user?.name || confirm?.user?.email}"? O acesso volta a funcionar imediatamente.`}
        confirmLabel={confirm?.action === 'inactivate' ? 'Inativar' : 'Reativar'}
        onClose={() => !acting && setConfirm(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

function UserFormModal({ open, editing, profiles, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', profile_id: '', password: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(editing
      ? { name: editing.name || '', email: editing.email || '', profile_id: editing.profile_id || editing.profile?.id || '', password: '' }
      : { name: '', email: '', profile_id: '', password: '' });
  }, [open, editing]);

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Nome obrigatório.'); return; }
    if (!editing && !form.email.trim()) { toast.error('E-mail obrigatório.'); return; }
    if (!form.profile_id) { toast.error('Selecione um perfil.'); return; }
    if (!editing && (!form.password || form.password.length < 8)) {
      toast.error('A senha inicial deve ter pelo menos 8 caracteres.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateUser(editing.id, { name: form.name.trim(), profile_id: form.profile_id });
        toast.success('Usuário atualizado.');
      } else {
        await createUser({
          name: form.name.trim(),
          email: form.email.trim(),
          profile_id: form.profile_id,
          password: form.password,
        });
        toast.success('Usuário criado.');
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
      title={editing ? 'Editar usuário' : 'Novo usuário'}
      size="md"
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
        {editing && (
          <p className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--ap-surface-3)', color: 'var(--ap-text-4)' }}>
            O e-mail não pode ser alterado após a criação.
          </p>
        )}
        <FormField label="Nome" required>
          <TextInput value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome completo" />
        </FormField>
        <FormField label="E-mail" required>
          <TextInput
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="pessoa@empresa.com"
            disabled={Boolean(editing)}
          />
        </FormField>
        <FormField label="Perfil de acesso" required>
          <Select value={form.profile_id} onChange={(e) => set('profile_id', e.target.value)}>
            <option value="">Selecione…</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </FormField>
        {!editing && (
          <FormField label="Senha inicial" required hint="Mínimo de 8 caracteres. O usuário pode trocar depois.">
            <TextInput type="password" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </FormField>
        )}
      </div>
    </Modal>
  );
}

/* ───────────────────────── Convites ───────────────────────── */

function InvitesTab({ profiles }) {
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [acting, setActing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listInvites();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function inviteLink(inv) {
    const token = inv.token || inv.invite_token || inv.id;
    return `${window.location.origin}/convite/${token}`;
  }

  async function copyLink(inv) {
    try {
      await navigator.clipboard.writeText(inviteLink(inv));
      toast.success('Link do convite copiado.');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  }

  async function handleRevoke() {
    if (!revoking) return;
    setActing(true);
    try {
      await revokeInvite(revoking.id);
      toast.success('Convite revogado.');
      setRevoking(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  const profileName = (inv) =>
    inv.profile?.name || inv.profile_name || profiles.find((p) => p.id === inv.profile_id)?.name || '—';

  const statusBadge = (inv) => {
    const s = inv.status || (inv.accepted_at ? 'ACCEPTED' : 'PENDING');
    if (s === 'ACCEPTED') return <Badge variant="green">Aceito</Badge>;
    if (s === 'REVOKED')  return <Badge variant="gray">Revogado</Badge>;
    if (s === 'EXPIRED')  return <Badge variant="red">Expirado</Badge>;
    return <Badge variant="yellow">Pendente</Badge>;
  };

  const isPending = (inv) => {
    const s = inv.status || (inv.accepted_at ? 'ACCEPTED' : 'PENDING');
    return s === 'PENDING';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>{items.length} convite(s)</p>
        {can('core.invites.write') && (
          <button className="btn-primary" onClick={() => setFormOpen(true)}>
            <Plus size={15} /> Novo convite
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <EmptyState
          icon={Mail}
          title="Nenhum convite"
          description="Convide alguém informando e-mail e perfil de acesso."
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block">
            <Table>
              <Thead>
                <Th>E-mail</Th><Th>Perfil</Th><Th>Status</Th><Th>Criado em</Th><Th className="text-right">Ações</Th>
              </Thead>
              <Tbody>
                {items.map((inv) => (
                  <Tr key={inv.id}>
                    <Td className="font-medium">{inv.email}</Td>
                    <Td>{profileName(inv)}</Td>
                    <Td>{statusBadge(inv)}</Td>
                    <Td>{formatDateTime(inv.created_at)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        {isPending(inv) && (
                          <button className="btn-ghost p-1.5" title="Copiar link do convite" onClick={() => copyLink(inv)}>
                            <Copy size={15} className="text-brand" />
                          </button>
                        )}
                        {can('core.invites.write') && isPending(inv) && (
                          <button
                            className="btn-ghost p-1.5"
                            title="Revogar convite (o link deixa de funcionar)"
                            onClick={() => setRevoking(inv)}
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
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--ap-border)' }}>
            {items.map((inv) => (
              <div key={inv.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--ap-text-1)' }}>{inv.email}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {statusBadge(inv)}
                    <span className="text-[11px]" style={{ color: 'var(--ap-text-5)' }}>{profileName(inv)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isPending(inv) && (
                    <button className="btn-ghost p-2.5" onClick={() => copyLink(inv)} aria-label="Copiar link">
                      <Copy size={16} className="text-brand" />
                    </button>
                  )}
                  {can('core.invites.write') && isPending(inv) && (
                    <button className="btn-ghost p-2.5" onClick={() => setRevoking(inv)} aria-label="Revogar">
                      <Trash2 size={16} className="text-red-500" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <InviteFormModal
        open={formOpen}
        profiles={profiles}
        onClose={() => setFormOpen(false)}
        onSaved={() => load()}
      />

      <ConfirmDialog
        open={Boolean(revoking)}
        danger
        loading={acting}
        title="Revogar convite"
        message={`Revogar o convite para "${revoking?.email}"? O link deixa de funcionar imediatamente.`}
        confirmLabel="Revogar"
        onClose={() => !acting && setRevoking(null)}
        onConfirm={handleRevoke}
      />
    </div>
  );
}

function InviteFormModal({ open, profiles, onClose, onSaved }) {
  const [email, setEmail] = useState('');
  const [profileId, setProfileId] = useState('');
  const [saving, setSaving] = useState(false);
  const [createdLink, setCreatedLink] = useState('');

  useEffect(() => {
    if (open) { setEmail(''); setProfileId(''); setCreatedLink(''); }
  }, [open]);

  async function handleSave() {
    if (!email.trim()) { toast.error('Informe o e-mail.'); return; }
    if (!profileId) { toast.error('Selecione um perfil.'); return; }
    setSaving(true);
    try {
      const inv = await createInvite({ email: email.trim(), profile_id: profileId });
      const token = inv?.token || inv?.invite_token || inv?.id;
      setCreatedLink(`${window.location.origin}/convite/${token}`);
      toast.success('Convite criado. Copie o link e envie para a pessoa.');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(createdLink);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissable={!saving}
      title="Novo convite"
      size="md"
      footer={
        createdLink ? (
          <button className="btn-primary" onClick={onClose}>Concluir</button>
        ) : (
          <>
            <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />} Criar convite
            </button>
          </>
        )
      }
    >
      {createdLink ? (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--ap-text-2)' }}>
            Convite criado. Envie este link para a pessoa concluir o cadastro:
          </p>
          <div className="flex items-center gap-2">
            <TextInput value={createdLink} readOnly onFocus={(e) => e.target.select()} />
            <button className="btn-secondary shrink-0" onClick={copy} title="Copiar link">
              <Copy size={15} />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <FormField label="E-mail" required>
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" autoFocus />
          </FormField>
          <FormField label="Perfil de acesso" required>
            <Select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              <option value="">Selecione…</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </FormField>
        </div>
      )}
    </Modal>
  );
}
