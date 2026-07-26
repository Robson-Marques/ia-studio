import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, Field, Input, TextArea, Button, useToast } from '@studio-ux-ds/react';
import { createWorkflow } from '../../services/automation';
import { useWorkspace } from '../../context/WorkspaceContext';

// Automação/FluxoNovo — cadastro de um fluxo vazio (v0.10.2).
//
// Rota `/automacao/fluxos/novo`. Era Modal `size="md"`; tem TextArea (descrição),
// então vai pra rota pela regra do Modal do DS. Depois de criar, cai direto no
// editor — que é onde o fluxo de fato é montado.

export default function FluxoNovo() {
  const navigate = useNavigate();
  const toast = useToast();
  const { workspaceId, environmentId } = useWorkspace();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) { toast.error('Dê um nome ao fluxo.'); return; }
    if (!workspaceId || !environmentId) {
      toast.error('Escolha um workspace e um ambiente no topo da tela antes de criar.');
      return;
    }
    setSaving(true);
    try {
      const workflow = await createWorkflow({
        name: name.trim(),
        description: description.trim() || undefined,
        workspace_id: workspaceId,
        environment_id: environmentId,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      toast.success('Fluxo criado — agora monte os passos.');
      navigate(`/automacao/fluxos/${workflow.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Novo fluxo"
        subtitle="O fluxo nasce vazio. Depois de criar, você escolhe o que o dispara e quais passos ele executa."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/automacao/fluxos')} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>
              Criar
            </Button>
          </>
        }
      />

      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          <Field label="Nome" required hint="Como o fluxo aparece na lista.">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Boas-vindas no WhatsApp"
            />
          </Field>

          <Field label="Descrição" hint="Para que serve este fluxo — quem mexer nele depois vai ler isto primeiro.">
            <TextArea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <Field label="Tags" hint="Separadas por vírgula. Servem para achar o fluxo depois.">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="onboarding, whatsapp" />
          </Field>
        </div>
      </Card>
    </div>
  );
}
