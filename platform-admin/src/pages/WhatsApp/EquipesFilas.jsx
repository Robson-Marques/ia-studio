import React, { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Users, ListOrdered, Trash2, UserPlus, Bell, BellOff } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Tabs from '../../components/ui/Tabs';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Badge, Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table';
import { FormField, Select, TextInput } from '../../components/ui/FormField';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { toast } from '../../lib/toast';
import {
  addTeamMember, createQueue, createTeam, listAttendanceUsers,
  listQueues, listTeams, removeTeamMember, updateQueue, updateTeam,
} from '../../services/whatsapp';

const TABS = [
  { id: 'teams', label: 'Equipes', Icon: Users },
  { id: 'queues', label: 'Filas', Icon: ListOrdered },
];

// Equipes e Filas da Central de Atendimento — CRUD + membros. Exclusão é
// SOFT-DELETE (desativar) com checagem de conversas abertas no backend.
export default function EquipesFilas() {
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();
  const [tab, setTab] = useState('teams');
  const [teams, setTeams] = useState([]);
  const [queues, setQueues] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [teamModal, setTeamModal] = useState(null); // { editing?, name, description, default_queue_id }
  const [queueModal, setQueueModal] = useState(null);
  const [membersFor, setMembersFor] = useState(null); // equipe do modal de membros
  const [memberForm, setMemberForm] = useState({ user_id: '', role: 'MEMBER' });
  const [deactivate, setDeactivate] = useState(null); // { kind, item }
  const [saving, setSaving] = useState(false);

  const manageTeams = can('comm.whatsapp.teams.manage');
  const manageQueues = can('comm.whatsapp.queues.manage');

  async function load() {
    setLoading(true);
    try {
      const [t, q] = await Promise.all([listTeams(true), listQueues(true)]);
      setTeams(t);
      setQueues(q);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    listAttendanceUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  function scopeGuard() {
    if (!workspaceId || !environmentId) {
      toast.error('Selecione workspace e ambiente no topo antes de criar.');
      return false;
    }
    return true;
  }

  async function saveTeam() {
    const m = teamModal;
    if (!m.name?.trim()) { toast.error('Nome da equipe é obrigatório.'); return; }
    setSaving(true);
    try {
      if (m.editing) {
        await updateTeam(m.editing.id, {
          name: m.name, description: m.description || undefined,
          default_queue_id: m.default_queue_id || undefined,
        });
        toast.success('Equipe atualizada.');
      } else {
        if (!scopeGuard()) { setSaving(false); return; }
        await createTeam({ name: m.name, description: m.description || undefined, workspace_id: workspaceId, environment_id: environmentId });
        toast.success('Equipe criada. Vincule uma fila padrão pra receber transferências.');
      }
      setTeamModal(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveQueue() {
    const m = queueModal;
    if (!m.name?.trim()) { toast.error('Nome da fila é obrigatório.'); return; }
    setSaving(true);
    try {
      if (m.editing) {
        await updateQueue(m.editing.id, { name: m.name, description: m.description || undefined, team_id: m.team_id || undefined });
        toast.success('Fila atualizada.');
      } else {
        if (!scopeGuard()) { setSaving(false); return; }
        await createQueue({
          name: m.name, description: m.description || undefined, team_id: m.team_id || undefined,
          workspace_id: workspaceId, environment_id: environmentId,
        });
        toast.success('Fila criada.');
      }
      setQueueModal(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    const { kind, item } = deactivate;
    setSaving(true);
    try {
      if (kind === 'team') await updateTeam(item.id, { is_active: !item.is_active });
      else await updateQueue(item.id, { is_active: !item.is_active });
      toast.success(item.is_active ? 'Desativado.' : 'Reativado.');
      setDeactivate(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMember() {
    if (!memberForm.user_id) { toast.error('Selecione o usuário.'); return; }
    setSaving(true);
    try {
      await addTeamMember(membersFor.id, memberForm);
      toast.success('Membro adicionado.');
      setMemberForm({ user_id: '', role: 'MEMBER' });
      const fresh = await listTeams(true);
      setTeams(fresh);
      setMembersFor(fresh.find((t) => t.id === membersFor.id) || null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleIncidentAlert(m) {
    setSaving(true);
    try {
      // addTeamMember faz upsert (team+user): preserva o papel e alterna o opt-in.
      await addTeamMember(membersFor.id, {
        user_id: m.user_id,
        role: m.role,
        receive_incident_alerts: !m.receive_incident_alerts,
      });
      const fresh = await listTeams(true);
      setTeams(fresh);
      setMembersFor(fresh.find((t) => t.id === membersFor.id) || null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(userId) {
    setSaving(true);
    try {
      await removeTeamMember(membersFor.id, userId);
      toast.success('Membro removido.');
      const fresh = await listTeams(true);
      setTeams(fresh);
      setMembersFor(fresh.find((t) => t.id === membersFor.id) || null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const userName = (id) => users.find((u) => u.id === id)?.name || id;
  const queueName = (id) => queues.find((q) => q.id === id)?.name || '—';
  const teamName = (id) => teams.find((t) => t.id === id)?.name || '—';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold flex-1" style={{ color: 'var(--ap-text-1)' }}>Equipes e Filas</h2>
        {tab === 'teams' && manageTeams && (
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={() => setTeamModal({ name: '', description: '' })}>
            <Plus size={14} /> Nova equipe
          </button>
        )}
        {tab === 'queues' && manageQueues && (
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={() => setQueueModal({ name: '', description: '', team_id: '' })}>
            <Plus size={14} /> Nova fila
          </button>
        )}
      </div>

      <Tabs items={TABS} active={tab} onChange={setTab} bleed={false} />

      {loading ? (
        <div className="py-10 text-center"><Loader2 size={18} className="animate-spin inline" /></div>
      ) : tab === 'teams' ? (
        teams.length === 0 ? (
          <EmptyState icon={Users} title="Nenhuma equipe" description="Crie equipes pra organizar o atendimento. Roteamento é manual (claim/transferência) na V1." />
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--ap-surface)', border: '1px solid var(--ap-border)' }}>
            <Table>
              <Thead>
                <Th>Equipe</Th><Th>Fila padrão</Th><Th>Membros</Th><Th>Status</Th><Th className="w-36">Ações</Th>
              </Thead>
              <Tbody>
                {teams.map((t) => (
                  <Tr key={t.id}>
                    <Td>
                      <span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{t.name}</span>
                      {t.description && <p className="text-[11px]" style={{ color: 'var(--ap-text-4)' }}>{t.description}</p>}
                    </Td>
                    <Td>{queueName(t.default_queue_id)}</Td>
                    <Td>{t.members?.length ?? 0}</Td>
                    <Td><Badge variant={t.is_active ? 'green' : 'gray'}>{t.is_active ? 'Ativa' : 'Inativa'}</Badge></Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        {manageTeams && (
                          <>
                            <button title="Editar equipe" className="text-brand" onClick={() => setTeamModal({ editing: t, name: t.name, description: t.description || '', default_queue_id: t.default_queue_id || '' })}>
                              <Pencil size={15} />
                            </button>
                            <button title="Gerenciar membros" className="text-brand" onClick={() => setMembersFor(t)}>
                              <UserPlus size={15} />
                            </button>
                            <button title={t.is_active ? 'Desativar (soft-delete)' : 'Reativar'} className="text-red-500" onClick={() => setDeactivate({ kind: 'team', item: t })}>
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        )
      ) : queues.length === 0 ? (
        <EmptyState icon={ListOrdered} title="Nenhuma fila" description="Filas são o destino das transferências e a casa (owner) das conversas." />
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--ap-surface)', border: '1px solid var(--ap-border)' }}>
          <Table>
            <Thead>
              <Th>Fila</Th><Th>Equipe</Th><Th>Status</Th><Th className="w-24">Ações</Th>
            </Thead>
            <Tbody>
              {queues.map((q) => (
                <Tr key={q.id}>
                  <Td>
                    <span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{q.name}</span>
                    {q.description && <p className="text-[11px]" style={{ color: 'var(--ap-text-4)' }}>{q.description}</p>}
                  </Td>
                  <Td>{teamName(q.team_id)}</Td>
                  <Td><Badge variant={q.is_active ? 'green' : 'gray'}>{q.is_active ? 'Ativa' : 'Inativa'}</Badge></Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      {manageQueues && (
                        <>
                          <button title="Editar fila" className="text-brand" onClick={() => setQueueModal({ editing: q, name: q.name, description: q.description || '', team_id: q.team_id || '' })}>
                            <Pencil size={15} />
                          </button>
                          <button title={q.is_active ? 'Desativar (soft-delete)' : 'Reativar'} className="text-red-500" onClick={() => setDeactivate({ kind: 'queue', item: q })}>
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {/* Modal equipe */}
      <Modal open={!!teamModal} onClose={saving ? undefined : () => setTeamModal(null)}
        title={teamModal?.editing ? 'Editar equipe' : 'Nova equipe'} size="md" dismissable={false}
        footer={
          <>
            <button className="btn-secondary" disabled={saving} onClick={() => setTeamModal(null)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={saveTeam}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </>
        }>
        {teamModal && (
          <div className="space-y-3">
            <FormField label="Nome" required>
              <TextInput value={teamModal.name} onChange={(e) => setTeamModal((m) => ({ ...m, name: e.target.value }))} />
            </FormField>
            <FormField label="Descrição">
              <TextInput value={teamModal.description} onChange={(e) => setTeamModal((m) => ({ ...m, description: e.target.value }))} />
            </FormField>
            {teamModal.editing && (
              <FormField label="Fila padrão" hint="Destino de transferências direcionadas à equipe.">
                <Select value={teamModal.default_queue_id || ''} onChange={(e) => setTeamModal((m) => ({ ...m, default_queue_id: e.target.value }))}>
                  <option value="">Sem fila padrão</option>
                  {queues.filter((q) => q.is_active).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                </Select>
              </FormField>
            )}
          </div>
        )}
      </Modal>

      {/* Modal fila */}
      <Modal open={!!queueModal} onClose={saving ? undefined : () => setQueueModal(null)}
        title={queueModal?.editing ? 'Editar fila' : 'Nova fila'} size="md" dismissable={false}
        footer={
          <>
            <button className="btn-secondary" disabled={saving} onClick={() => setQueueModal(null)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={saveQueue}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </>
        }>
        {queueModal && (
          <div className="space-y-3">
            <FormField label="Nome" required>
              <TextInput value={queueModal.name} onChange={(e) => setQueueModal((m) => ({ ...m, name: e.target.value }))} />
            </FormField>
            <FormField label="Descrição">
              <TextInput value={queueModal.description} onChange={(e) => setQueueModal((m) => ({ ...m, description: e.target.value }))} />
            </FormField>
            <FormField label="Equipe">
              <Select value={queueModal.team_id || ''} onChange={(e) => setQueueModal((m) => ({ ...m, team_id: e.target.value }))}>
                <option value="">Sem equipe</option>
                {teams.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </FormField>
          </div>
        )}
      </Modal>

      {/* Modal membros */}
      <Modal open={!!membersFor} onClose={saving ? undefined : () => setMembersFor(null)}
        title={`Membros — ${membersFor?.name || ''}`} size="md"
        footer={<button className="btn-secondary" onClick={() => setMembersFor(null)}>Fechar</button>}>
        {membersFor && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select className="flex-1" value={memberForm.user_id} onChange={(e) => setMemberForm((f) => ({ ...f, user_id: e.target.value }))}>
                <option value="">Selecione o usuário…</option>
                {users.filter((u) => !(membersFor.members || []).some((m) => m.user_id === u.id))
                  .map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
              <Select className="w-36" value={memberForm.role} onChange={(e) => setMemberForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="MEMBER">Membro</option>
                <option value="SUPERVISOR">Supervisor</option>
              </Select>
              <button className="btn-primary" disabled={saving} onClick={handleAddMember}>Adicionar</button>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
              {(membersFor.members || []).map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm" style={{ color: 'var(--ap-text-1)' }}>{userName(m.user_id)}</p>
                    <p className="text-[11px]" style={{ color: 'var(--ap-text-4)' }}>{m.role === 'SUPERVISOR' ? 'Supervisor' : 'Membro'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleToggleIncidentAlert(m)}
                      title={m.receive_incident_alerts
                        ? 'Recebe alerta de incidente por WhatsApp — clique para desligar'
                        : 'Não recebe alerta de incidente — clique para ligar'}
                      className="flex items-center gap-1 text-[11px] disabled:opacity-50"
                      style={{ color: m.receive_incident_alerts ? 'var(--ap-brand, #2563eb)' : 'var(--ap-text-4)' }}
                    >
                      {m.receive_incident_alerts ? <Bell size={14} /> : <BellOff size={14} />}
                      <span className="hidden sm:inline">Alerta de incidente</span>
                    </button>
                    <button title="Remover da equipe" className="text-red-500" disabled={saving} onClick={() => handleRemoveMember(m.user_id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
              {(membersFor.members || []).length === 0 && (
                <p className="text-xs py-3" style={{ color: 'var(--ap-text-4)' }}>Nenhum membro ainda.</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Desativar/reativar */}
      <ConfirmDialog
        open={!!deactivate}
        danger={deactivate?.item?.is_active}
        loading={saving}
        title={deactivate?.item?.is_active ? 'Desativar' : 'Reativar'}
        message={deactivate?.item?.is_active
          ? `Desativar "${deactivate?.item?.name}"? Nada é excluído (soft-delete) — o backend bloqueia se houver conversas abertas vinculadas.`
          : `Reativar "${deactivate?.item?.name}"?`}
        confirmLabel={deactivate?.item?.is_active ? 'Desativar' : 'Reativar'}
        onClose={() => setDeactivate(null)}
        onConfirm={handleDeactivate}
      />
    </div>
  );
}
