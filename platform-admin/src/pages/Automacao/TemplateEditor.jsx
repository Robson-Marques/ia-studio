import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, Card, FormGrid, Field, Input, Select, TextArea, Badge, Button, useToast, Spinner } from '@studio-ux-ds/react';
import {
  listAutomationTemplates, createAutomationTemplate, updateAutomationTemplate,
} from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { CHANNEL_LABEL } from './automation.constants';
import { extractTemplateVars } from './template.helpers';

// Automação/TemplateEditor — um template de mensagem (v0.9.99).
//
// Rotas: `/automacao/templates/novo` e `/automacao/templates/:id`. Era um Modal
// `size="lg"` com um TextArea de 8 linhas dentro — promovido a rota pela regra do
// Modal do DS.
//
// Sem endpoint de "buscar um template": a lista já vem inteira e o editor filtra
// pelo id (mesma escolha do editor de calendário).

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();

  const isEdit = !!id;
  const canWrite = can('automation.templates.write');

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('WHATSAPP');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    listAutomationTemplates({ environment_id: environmentId || undefined })
      .then(({ items }) => {
        const found = items.find((t) => t.id === id);
        if (!found) {
          toast.error('Template não encontrado.');
          navigate('/automacao/templates', { replace: true });
          return;
        }
        setName(found.name || '');
        setChannel(found.channel || 'WHATSAPP');
        setSubject(found.subject || '');
        setBody(found.body || '');
      })
      .catch((err) => {
        toast.error(err.message);
        navigate('/automacao/templates', { replace: true });
      })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const variables = useMemo(() => extractTemplateVars({ subject, body }), [subject, body]);

  async function handleSave() {
    if (!name.trim()) { toast.error('Dê um nome ao template.'); return; }
    if (!body.trim()) { toast.error('Escreva o conteúdo da mensagem.'); return; }
    if (!isEdit && (!workspaceId || !environmentId)) {
      toast.error('Escolha um workspace e um ambiente no topo da tela antes de criar.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await updateAutomationTemplate(id, {
          name: name.trim(),
          subject: subject.trim() || undefined,
          body,
        });
      } else {
        await createAutomationTemplate({
          name: name.trim(),
          channel,
          subject: subject.trim() || undefined,
          body,
          workspace_id: workspaceId,
          environment_id: environmentId,
        });
      }
      toast.success(isEdit ? 'Template atualizado.' : 'Template criado.');
      navigate('/automacao/templates');
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
        title={isEdit ? (name || 'Template') : 'Novo template'}
        subtitle={`Escreva o texto uma vez e deixe como ${'{{variável}}'} tudo que muda de pessoa pra pessoa.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/automacao/templates')} disabled={saving}>
              Cancelar
            </Button>
            {canWrite && (
              <Button variant="primary" loading={saving} onClick={handleSave}>
                Salvar
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          <FormGrid columns={2}>
            <Field label="Nome" required hint="Só pra você achar depois — o cliente não vê.">
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
            </Field>
            <Field
              label="Onde é usado"
              required
              hint={isEdit ? 'Não muda depois de criado — para outro canal, crie outro template.' : undefined}
            >
              <Select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                disabled={isEdit || !canWrite}
              >
                {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </FormGrid>

          <Field label="Assunto" hint="Aparece em e-mail e no sino do sistema. Opcional.">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canWrite} />
          </Field>

          <Field
            label="Conteúdo"
            required
            hint={`Use ${'{{variáveis}}'} — por exemplo ${'{{input.name}}'} ou ${'{{vars.passo_1.status}}'}.`}
          >
            <TextArea rows={12} value={body} onChange={(e) => setBody(e.target.value)} disabled={!canWrite} />
          </Field>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 20 }} className="space-y-2">
          <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
            Variáveis encontradas no texto
          </h2>
          <p className="text-xs" style={{ margin: 0, color: 'var(--su-text-muted)' }}>
            O sistema troca cada uma pelo valor real na hora do envio. Se uma delas não existir no fluxo, o passo falha — vale conferir a grafia.
          </p>
          <div className="flex gap-1 flex-wrap">
            {variables.length
              ? variables.map((v) => <Badge key={v} tone="info">{`{{${v}}}`}</Badge>)
              : <span className="text-xs" style={{ color: 'var(--su-text-muted)' }}>nenhuma — o texto é igual para todos</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}
