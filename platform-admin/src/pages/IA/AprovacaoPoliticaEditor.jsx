import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageHeader, Card, Field, Input, Select, TextArea,
  Button, Checkbox, useToast,
} from '@studio-ux-ds/react';
import { createApprovalPolicy } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { APPROVAL_TARGET_TYPES } from './ia.constants';

// IA/AprovacaoPoliticaEditor — página de criação de política de aprovação
// (v0.9.88). Promovida a rota porque o form tem TextArea de Descrição +
// TextArea de Condição (JSON) — a regra do Modal do DS (v1.2.11+) proíbe
// escrita reflexiva em overlay.
//
// Rota: /ia/aprovacoes/politicas/nova
//
// Só criação: o backend expõe POST /ai/approvals/policies e não tem PATCH —
// não existe edição de política hoje. Quando o endpoint de update existir,
// esta mesma página atende /politicas/:id/editar (o form já é o mesmo).

export default function AprovacaoPoliticaEditor() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();

  const canDecide = can('ai.approvals.decide');

  const [form, setForm] = useState({
    name: '',
    description: '',
    target_type: 'TOOL',
    condition: '{}',
    is_active: false,
  });
  const [saving, setSaving] = useState(false);

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSave() {
    if (!canDecide) { toast.error('Sem permissão.'); return; }
    if (!form.name.trim()) { toast.error('Informe o nome.'); return; }
    let condition;
    try {
      condition = form.condition.trim() ? JSON.parse(form.condition) : {};
    } catch {
      toast.error('Formato da condição é inválido (JSON).');
      return;
    }
    setSaving(true);
    try {
      await createApprovalPolicy({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        target_type: form.target_type,
        condition,
        is_active: form.is_active,
        workspace_id: workspaceId || undefined,
        environment_id: environmentId || undefined,
      });
      toast.success('Política criada.');
      navigate('/ia/aprovacoes');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova política de aprovação"
        subtitle="Define quais ações do assistente passam a exigir sua revisão antes de executar."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/ia/aprovacoes')} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!canDecide}
              loading={saving}
              icon="check"
            >
              {saving ? 'Criando…' : 'Criar política'}
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
              placeholder="Ex.: Aprovar envios em massa"
            />
          </Field>

          <Field label="Descrição" hint="Para que serve esta política e quando ela dispara.">
            <TextArea
              rows={4}
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Ex.: Toda vez que o assistente for disparar mensagem pra mais de 100 pessoas, exige minha revisão."
            />
          </Field>

          <div style={{ maxWidth: 320 }}>
            <Field label="Tipo de alvo">
              <Select value={form.target_type} onChange={(e) => patch({ target_type: e.target.value })}>
                {APPROVAL_TARGET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
          </div>

          <Field
            label="Condição (JSON)"
            hint='Quando a política dispara. Ex.: {"min_recipients": 100} ou {"tool_key": "executar_sql"}.'
          >
            <TextArea
              rows={8}
              value={form.condition}
              onChange={(e) => patch({ condition: e.target.value })}
              style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
            />
          </Field>

          <Checkbox
            id="policy-is-active"
            label="Ativar imediatamente (por padrão nasce desligada)"
            checked={form.is_active}
            onChange={(e) => patch({ is_active: e.target.checked })}
          />
        </div>
      </Card>
    </div>
  );
}
