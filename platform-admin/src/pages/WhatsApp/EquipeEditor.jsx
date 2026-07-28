import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormScreen, Card, FormGrid, Field, Input, Select, Badge, Button, IconButton, Switch, EmptyState, ConfirmDialog, useToast } from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
  addTeamMember, createTeam, listAttendanceUsers, listQueues, listTeams,
  removeTeamMember, updateTeam,
} from '../../services/whatsapp';

// WhatsApp/EquipeEditor — dados da equipe + quem está nela (v0.10.9).
//
// Rotas: `/whatsapp/equipes/nova` e `/whatsapp/equipes/:id`. Antes eram DOIS
// modais separados abertos por dois ícones da mesma linha (lápis = dados,
// pessoas = membros) — a equipe é um registro só, e agora se edita num lugar só.
//
// Não existe endpoint de "buscar uma equipe": a lista já traz os membros
// (`listTeams(true)`), então o editor filtra pelo id — mesma escolha dos editores
// de calendário e template.

export default function EquipeEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();

  const isEdit = !!id;
  const canManage = can('comm.whatsapp.teams.manage');

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [team, setTeam] = useState(null);
  const [queues, setQueues] = useState([]);
  const [users, setUsers] = useState([]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultQueueId, setDefaultQueueId] = useState('');

  const [novoMembro, setNovoMembro] = useState({ user_id: '', role: 'MEMBER' });
  const [removendo, setRemovendo] = useState(null);
  const [mexendo, setMexendo] = useState(false);

  async function carregarEquipe() {
    const lista = await listTeams(true);
    const found = lista.find((t) => t.id === id);
    if (!found) {
      toast.error('Equipe não encontrada.');
      navigate('/whatsapp/equipes', { replace: true });
      return null;
    }
    setTeam(found);
    setName(found.name || '');
    setDescription(found.description || '');
    setDefaultQueueId(found.default_queue_id || '');
    return found;
  }

  useEffect(() => {
    listQueues(true).then(setQueues).catch(() => setQueues([]));
    listAttendanceUsers().then(setUsers).catch(() => setUsers([]));
    if (!isEdit) return;
    carregarEquipe()
      .catch((err) => {
        toast.error(err.message);
        navigate('/whatsapp/equipes', { replace: true });
      })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!name.trim()) { toast.error('Dê um nome à equipe.'); return; }
    if (!isEdit && (!workspaceId || !environmentId)) {
      toast.error('Escolha um workspace e um ambiente no topo da tela antes de criar.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await updateTeam(id, {
          name: name.trim(),
          description: description.trim() || undefined,
          default_queue_id: defaultQueueId || undefined,
        });
        toast.success('Equipe atualizada.');
      } else {
        await createTeam({
          name: name.trim(),
          description: description.trim() || undefined,
          workspace_id: workspaceId,
          environment_id: environmentId,
        });
        toast.success('Equipe criada. Vincule uma fila padrão para ela receber transferências.');
      }
      navigate('/whatsapp/equipes');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function addMembro() {
    if (!novoMembro.user_id) { toast.error('Escolha quem entra na equipe.'); return; }
    setMexendo(true);
    try {
      await addTeamMember(id, novoMembro);
      toast.success('Pessoa adicionada à equipe.');
      setNovoMembro({ user_id: '', role: 'MEMBER' });
      await carregarEquipe();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMexendo(false);
    }
  }

  // `addTeamMember` faz upsert por (equipe, pessoa): preserva o papel e alterna
  // só o aviso de incidente.
  async function toggleAlerta(m) {
    setMexendo(true);
    try {
      await addTeamMember(id, {
        user_id: m.user_id,
        role: m.role,
        receive_incident_alerts: !m.receive_incident_alerts,
      });
      await carregarEquipe();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMexendo(false);
    }
  }

  async function confirmRemove() {
    setMexendo(true);
    try {
      await removeTeamMember(id, removendo.user_id);
      toast.success('Pessoa removida da equipe.');
      setRemovendo(null);
      await carregarEquipe();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMexendo(false);
    }
  }

  const nomeDe = (userId) => users.find((u) => u.id === userId)?.name || userId;
  const membros = team?.members || [];
  const disponiveis = users.filter((u) => !membros.some((m) => m.user_id === u.id));

  return (
    <>
      <FormScreen
        back={{ label: 'Voltar para equipes e filas', onClick: () => navigate('/whatsapp/equipes') }}
        title={isEdit ? (name || 'Equipe') : 'Nova equipe'}
        subtitle="Equipe é um grupo de pessoas que atende. Criar equipe não liga distribuição automática — alguém assume a conversa, ou ela é transferida para a fila da equipe."
        loading={loading}
        saving={saving}
        canSubmit={canManage}
        onSubmit={handleSave}
        onCancel={() => navigate('/whatsapp/equipes')}
        /* `bare`: os dados da equipe e a lista de membros são dois cartões. */
        bare
      >
        <Card>
          <div style={{ padding: 20 }} className="space-y-4">
            <FormGrid columns={2}>
              <Field label="Nome" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Suporte" disabled={!canManage} />
              </Field>
              <Field label="Para que serve" hint="Aparece na lista, ajuda quem transfere a escolher.">
                <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canManage} />
              </Field>
            </FormGrid>

            {isEdit ? (
              <Field label="Fila padrão" hint="Para onde vai a conversa quando alguém transfere para esta equipe sem escolher fila.">
                <Select value={defaultQueueId} onChange={(e) => setDefaultQueueId(e.target.value)} disabled={!canManage}>
                  <option value="">Sem fila padrão</option>
                  {queues.filter((q) => q.is_active).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                </Select>
              </Field>
            ) : (
              <p className="text-xs" style={{ margin: 0, color: 'var(--su-text-muted)' }}>
                A fila padrão e as pessoas são definidas depois de criar.
              </p>
            )}
          </div>
        </Card>

        {isEdit && (
          <Card>
            <div style={{ padding: 20 }} className="space-y-4">
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                Quem está nesta equipe
              </h2>

              {canManage && (
                <div className="flex flex-wrap items-end gap-2">
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <Field label="Adicionar pessoa">
                      <Select
                        value={novoMembro.user_id}
                        onChange={(e) => setNovoMembro((f) => ({ ...f, user_id: e.target.value }))}
                      >
                        <option value="">Escolha…</option>
                        {disponiveis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <div style={{ width: 180 }}>
                    <Field label="Como" hint="Supervisor enxerga tudo da equipe.">
                      <Select
                        value={novoMembro.role}
                        onChange={(e) => setNovoMembro((f) => ({ ...f, role: e.target.value }))}
                      >
                        <option value="MEMBER">Atende</option>
                        <option value="SUPERVISOR">Supervisiona</option>
                      </Select>
                    </Field>
                  </div>
                  <Button variant="secondary" icon="user-plus" loading={mexendo} onClick={addMembro}>
                    Adicionar
                  </Button>
                </div>
              )}

              {!membros.length ? (
                <EmptyState
                  icon="users"
                  title="Ninguém nesta equipe ainda"
                  description="Sem pessoas, a equipe não recebe atendimento — a fila dela fica esperando alguém assumir."
                />
              ) : (
                <div style={{ borderTop: '1px solid var(--su-border-subtle)' }}>
                  {membros.map((m) => (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center gap-3"
                      style={{ padding: '12px 0', borderBottom: '1px solid var(--su-border-subtle)' }}
                    >
                      <div className="min-w-0" style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, margin: 0, color: 'var(--su-text-primary)' }} className="truncate">
                          {nomeDe(m.user_id)}
                        </p>
                        <Badge tone={m.role === 'SUPERVISOR' ? 'info' : 'neutral'}>
                          {m.role === 'SUPERVISOR' ? 'supervisiona' : 'atende'}
                        </Badge>
                      </div>

                      {/* Era um botão com sininho e o significado só no `title`.
                          Agora é um Switch com rótulo escrito — o estado se lê sem
                          passar o mouse. */}
                      <label className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--su-text-secondary)' }}>
                        <Switch
                          checked={!!m.receive_incident_alerts}
                          aria-label={`Avisar ${nomeDe(m.user_id)} sobre incidentes`}
                          onChange={() => canManage && toggleAlerta(m)}
                        />
                        Avisar sobre incidentes
                      </label>

                      {canManage && (
                        <IconButton
                          icon="trash"
                          aria-label={`Remover ${nomeDe(m.user_id)} da equipe`}
                          title="Tirar da equipe"
                          disabled={mexendo}
                          onClick={() => setRemovendo(m)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}
      </FormScreen>

      {/* O diálogo de remover membro é overlay — vive FORA do formulário, senão
          o Enter dele submeteria a equipe inteira. */}
      <ConfirmDialog
        open={!!removendo}
        danger
        loading={mexendo}
        title="Tirar da equipe"
        message={`Remover ${removendo ? nomeDe(removendo.user_id) : ''} desta equipe? As conversas que a pessoa já atende continuam com ela; o que muda é o que ela passa a ver das conversas da equipe.`}
        confirmLabel="Remover"
        onClose={() => setRemovendo(null)}
        onConfirm={confirmRemove}
      />
    </>
  );
}
