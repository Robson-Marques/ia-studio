import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormScreen, FormGrid, Field, Input, Select, useToast } from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import { createQueue, listQueues, listTeams, updateQueue } from '../../services/whatsapp';

// WhatsApp/FilaEditor — uma fila de atendimento (v0.10.9).
//
// Rotas: `/whatsapp/filas/nova` e `/whatsapp/filas/:id`. Os campos são curtos e
// caberiam num Modal pela regra do DS — virou rota por **consistência com a
// equipe**, que está na mesma tela e precisa de rota (tem a coleção de membros).
// Duas abas do mesmo lugar abrindo em containers diferentes ensinariam o usuário
// que a diferença significa algo, e não significa.
//
// Instancia o molde `form` do DS (`FormScreen`, v1.2.46). O que muda em relação
// ao arranjo à mão anterior: o **Enter agora envia** (é um `<form>` de verdade),
// as ações saíram do cabeçalho para o rodapé do cartão — que é onde a leitura
// termina — e sem permissão o Salvar **não é renderizado**, em vez de aparecer
// cinza convidando a tentar.

export default function FilaEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();

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
        await createQueue(body);
        toast.success('Fila criada.');
      }
      navigate('/whatsapp/equipes');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen
      back={{ label: 'Voltar para equipes e filas', onClick: () => navigate('/whatsapp/equipes') }}
      title={isEdit ? (name || 'Fila') : 'Nova fila'}
      subtitle="A fila é onde a conversa espera enquanto ninguém a assume — e é o destino de uma transferência."
      loading={loading}
      saving={saving}
      canSubmit={canManage}
      onSubmit={handleSave}
      onCancel={() => navigate('/whatsapp/equipes')}
    >
      <FormGrid columns={2}>
        <Field label="Nome" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Financeiro" disabled={!canManage} />
        </Field>
        <Field label="Equipe" hint="Quem cuida desta fila. Sem equipe, ela fica visível para quem enxerga todas as conversas.">
          <Select value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={!canManage}>
            <option value="">Sem equipe</option>
            {teams.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Para que serve" wide hint="Ajuda quem transfere a escolher a fila certa.">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canManage} />
        </Field>
      </FormGrid>
    </FormScreen>
  );
}
