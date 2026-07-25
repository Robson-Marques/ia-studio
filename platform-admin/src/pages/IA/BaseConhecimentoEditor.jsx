import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageHeader, Card, Field, Input, Select, NumericInput, TextArea,
  Button, useToast,
} from '@studio-ux-ds/react';
import { createKnowledgeBase } from '../../services/ai';
import { listConnections } from '../../services/integrations';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';

// IA/BaseConhecimentoEditor — criação de base de conhecimento (v0.9.89).
// Promovido a rota porque o form tem TextArea de Descrição — a regra do Modal
// do DS (v1.2.12) proíbe TextArea em overlay.
//
// Rota: /ia/conhecimento/nova
//
// Só criação: o `updateKnowledgeBase` existe no serviço mas NUNCA foi ligado a
// nenhuma UI (era import morto no legado). Ligar edição é feature nova, não
// migração — fica registrado como oportunidade, não entra nesta release.

const DEFAULTS = {
  name: '',
  description: '',
  embedding_connection_id: '',
  embedding_model: 'text-embedding-3-small',
  chunk_size: 800,
  chunk_overlap: 120,
};

export default function BaseConhecimentoEditor() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();

  const canWrite = can('ai.knowledge.write');

  const [form, setForm] = useState(DEFAULTS);
  const [connections, setConnections] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listConnections({ category: 'AI' })
      .then((r) => setConnections(r.items))
      .catch(() => setConnections([]));
  }, []);

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSave() {
    if (!canWrite) { toast.error('Sem permissão.'); return; }
    if (!form.name.trim()) { toast.error('Informe o nome da base.'); return; }
    if (!workspaceId || !environmentId) {
      toast.error('Selecione um workspace e um ambiente no topo.'); return;
    }
    setSaving(true);
    try {
      const base = await createKnowledgeBase({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        workspace_id: workspaceId,
        environment_id: environmentId,
        embedding_connection_id: form.embedding_connection_id || null,
        embedding_model: form.embedding_model.trim() || 'text-embedding-3-small',
        chunk_size: form.chunk_size,
        chunk_overlap: form.chunk_overlap,
      });
      toast.success('Base criada — adicione documentos para ela começar a servir.');
      // Vai direto pra base criada (o legado também fazia isso): o próximo passo
      // natural é adicionar documento, e é lá que esse botão vive.
      navigate(`/ia/conhecimento/${base.id}`, { state: { base } });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova base de conhecimento"
        subtitle="Uma coleção de documentos que os assistentes consultam para responder."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/ia/conhecimento')} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!canWrite}
              loading={saving}
              icon="check"
            >
              {saving ? 'Criando…' : 'Criar base'}
            </Button>
          </>
        }
      />

      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          <Field label="Nome">
            <Input
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Ex.: FAQ de suporte"
            />
          </Field>

          <Field label="Descrição" hint="O que esta base contém e quando o assistente deve consultá-la.">
            <TextArea
              rows={4}
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Ex.: Perguntas frequentes de suporte técnico — prazos, planos, procedimentos de troca."
            />
          </Field>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
              Ajustes avançados
            </h2>
            <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: '4px 0 0' }}>
              Os valores padrão funcionam para a maioria dos casos — mexa só se souber o efeito.
            </p>
          </div>

          <Field
            label="Onde gerar a indexação"
            hint="Conexão de IA usada para transformar o texto em índice pesquisável. Vazio = a plataforma escolhe."
          >
            <Select
              value={form.embedding_connection_id}
              onChange={(e) => patch({ embedding_connection_id: e.target.value })}
            >
              <option value="">— a plataforma escolhe automaticamente —</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.provider_key})</option>
              ))}
            </Select>
          </Field>

          <Field label="Modelo de indexação">
            <Input
              value={form.embedding_model}
              onChange={(e) => patch({ embedding_model: e.target.value })}
              placeholder="text-embedding-3-small"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ maxWidth: 520 }}>
            <Field
              label="Tamanho do trecho"
              hint="Em caracteres. Trechos maiores dão mais contexto; menores dão respostas mais precisas."
            >
              <NumericInput
                value={form.chunk_size}
                onChange={(v) => patch({ chunk_size: v })}
                min={100}
                step={50}
                fullWidth
              />
            </Field>
            <Field
              label="Sobreposição entre trechos"
              hint="Evita cortar uma frase importante no meio da divisão."
            >
              <NumericInput
                value={form.chunk_overlap}
                onChange={(v) => patch({ chunk_overlap: v })}
                min={0}
                step={10}
                fullWidth
              />
            </Field>
          </div>
        </div>
      </Card>
    </div>
  );
}
