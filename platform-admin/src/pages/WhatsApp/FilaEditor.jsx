import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, Card, Field, Input, Select, Button, useToast, Spinner } from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { createQueue, listQueues, listTeams, updateQueue } from '../../services/whatsapp';

// WhatsApp/FilaEditor — uma fila de atendimento (v0.10.9).
//
// Rotas: `/whatsapp/filas/nova` e `/whatsapp/filas/:id`. Os campos são curtos e
// caberiam num Modal pela regra do DS — virou rota por **consistência com a
// equipe**, que está na mesma tela e precisa de rota (tem a coleção de membros).
// Duas abas do mesmo lugar abrindo em containers diferentes ensinariam o usuário
// que a diferença significa algo, e não significa.

export default function FilaEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();

  const isEdit = !!id;
  const canManage = can('comm.whatsapp.queues.manage');

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [teams, setTeams] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState('');

  useEffect(() => {
    listTeams(true).then(setTeams).catch(() => setTeams([]));
    if (!isEdit) return;
    listQueues(true)
      .then((lista) => {
        const found = lista.find((q) => q.id === id);
        if (!found) {
          toast.error('Fila não encontrada.');
          navigate('/whatsapp/equipes', { replace: true });
          return;
        }
        setName(found.name || '');
        setDescription(found.description || '');
        setTeamId(found.team_id || '');
      })
      .catch((err) => {
        toast.error(err.message);
        navigate('/whatsapp/equipes', { replace: true });
      })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!name.trim()) { toast.error('Dê um nome à fila.'); return; }
    if (!isEdit && (!workspaceId || !environmentId)) {
      toast.error('Escolha um workspace e um ambiente no topo da tela antes de criar.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        team_id: teamId || undefined,
      };
      if (isEdit) {
        await updateQueue(id, body);
        toast.success('Fila atualizada.');
      } else {
        await createQueue({ ...body, workspace_id: workspaceId, environment_id: environmentId });
        toast.success('Fila criada.');
      }
      navigate('/whatsapp/equipes');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Carregando…" />
        <Spinner size="lg" center />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? (name || 'Fila') : 'Nova fila'}
        subtitle="A fila é onde a conversa espera enquanto ninguém a assume — e é o destino de uma transferência."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/whatsapp/equipes')} disabled={saving}>
              Cancelar
            </Button>
            {canManage && <Button variant="primary" loading={saving} onClick={handleSave}>Salvar</Button>}
          </>
        }
      />

      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          <Field label="Nome" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Financeiro" disabled={!canManage} />
          </Field>
          <Field label="Para que serve" hint="Ajuda quem transfere a escolher a fila certa.">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canManage} />
          </Field>
          <Field label="Equipe" hint="Quem cuida desta fila. Sem equipe, ela fica visível para quem enxerga todas as conversas.">
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={!canManage}>
              <option value="">Sem equipe</option>
              {teams.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        </div>
      </Card>
    </div>
  );
}
