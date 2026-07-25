import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Card, Field, Input, Select, NumericInput, TextArea,
  Button, Checkbox, Badge, useToast,
} from '@studio-ux-ds/react';
import { listTools, createTool, updateTool } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';

// IA/FerramentaEditor — página dedicada para criar/editar habilidade custom
// ou ajustar governança de habilidade da plataforma. Promovido a rota
// (v0.9.87) porque o form tem TextArea de Descrição + TextArea de JSON schema
// (escrita reflexiva) — anti-pattern documentado no DS (Modal com TextArea
// de descrição vai pra tela dedicada).
//
// Rotas:
//   /ia/ferramentas/tool/nova       → cadastro do zero
//   /ia/ferramentas/tool/:id/editar → editar existente
//
// Carrega a tool via `location.state.tool` (navegação a partir da lista) OU,
// se o usuário abriu a URL direto/refresh, cai em `listTools + filter` (não
// há GET /ai/tools/:id no backend hoje).

const EMPTY_TOOL = {
  key: '',
  name: '',
  description: '',
  category: '',
  input_schema: '{\n  "type": "object",\n  "properties": {}\n}',
  requires_approval: false,
  is_active: true,
  timeout_ms: '',
};

export default function FerramentaEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { can } = usePermissions();

  const isEdit = !!id;
  const canWrite = can('ai.tools.write');

  const [tool, setTool] = useState(location.state?.tool ?? null);
  const [loading, setLoading] = useState(isEdit && !location.state?.tool);
  const [form, setForm] = useState(EMPTY_TOOL);
  const [saving, setSaving] = useState(false);

  const isBuiltin = !!tool?.builtin;

  // Se veio direto na URL (refresh, deep-link), busca a lista e filtra por id.
  useEffect(() => {
    if (!isEdit || tool) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { items } = await listTools();
        const found = items.find((t) => t.id === id);
        if (!alive) return;
        if (!found) {
          toast.error('Habilidade não encontrada.');
          navigate('/ia/ferramentas', { replace: true });
          return;
        }
        setTool(found);
      } catch (err) {
        if (alive) toast.error(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Popula o form quando a tool chega (ou zera pra cadastro novo).
  useEffect(() => {
    if (isEdit && tool) {
      setForm({
        key: tool.key || '',
        name: tool.name || '',
        description: tool.description || '',
        category: tool.category || '',
        input_schema: JSON.stringify(tool.input_schema || { type: 'object', properties: {} }, null, 2),
        requires_approval: !!tool.requires_approval,
        is_active: tool.is_active !== false,
        timeout_ms: tool.timeout_ms != null ? String(tool.timeout_ms) : '',
      });
    } else if (!isEdit) {
      setForm({ ...EMPTY_TOOL });
    }
  }, [isEdit, tool]);

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSave() {
    if (!canWrite) { toast.error('Sem permissão.'); return; }
    if (!isBuiltin) {
      if (!form.name.trim()) { toast.error('Informe o nome.'); return; }
      if (!isEdit && !form.key.trim()) { toast.error('Informe a chave (identificador) único.'); return; }
    }
    let schema = null;
    if (!isBuiltin) {
      try { schema = JSON.parse(form.input_schema); }
      catch { toast.error('Formato do input schema é inválido (JSON).'); return; }
    }
    const timeoutNum = form.timeout_ms === '' ? undefined : Number(form.timeout_ms);
    if (timeoutNum !== undefined && (Number.isNaN(timeoutNum) || timeoutNum < 1000)) {
      toast.error('Tempo limite mínimo é 1000 ms.'); return;
    }

    setSaving(true);
    try {
      const governance = {
        requires_approval: form.requires_approval,
        ...(timeoutNum !== undefined ? { timeout_ms: timeoutNum } : {}),
      };
      if (isBuiltin) {
        await updateTool(tool.id, { ...governance, is_active: form.is_active });
      } else if (isEdit) {
        await updateTool(tool.id, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          category: form.category.trim() || undefined,
          input_schema: schema,
          is_active: form.is_active,
          ...governance,
        });
      } else {
        await createTool({
          key: form.key.trim(),
          name: form.name.trim(),
          description: form.description.trim(),
          category: form.category.trim() || undefined,
          input_schema: schema,
          ...governance,
        });
      }
      toast.success(isEdit ? 'Habilidade atualizada.' : 'Habilidade criada.');
      navigate('/ia/ferramentas');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const title = useMemo(() => {
    if (!isEdit) return 'Nova habilidade';
    if (!tool) return 'Editar habilidade';
    return isBuiltin ? `Ajustes de "${tool.name}"` : `Editar "${tool.name}"`;
  }, [isEdit, tool, isBuiltin]);

  const subtitle = isBuiltin
    ? 'Habilidade pronta da plataforma — você pode ligar/desligar, exigir aprovação e ajustar o tempo limite.'
    : 'O que essa habilidade faz e como o assistente deve preencher os parâmetros.';

  // Breadcrumb NÃO vai no PageHeader (o componente do DS não tem essa prop) —
  // ele vive na TopBar do AppShell, alimentado pelo mapa BREADCRUMBS do Layout.

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Carregando…" />
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/ia/ferramentas')} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!canWrite}
              loading={saving}
              icon="check"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </>
        }
      />

      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          {isBuiltin && (
            <Badge tone="info">Habilidade da plataforma — texto e schema não são editáveis</Badge>
          )}

          {!isBuiltin && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Identificador" hint="Único, sem espaços. Ex.: consultar_estoque">
                  <Input
                    value={form.key}
                    onChange={(e) => patch({ key: e.target.value })}
                    disabled={isEdit}
                    placeholder="consultar_estoque"
                  />
                </Field>
                <Field label="Nome">
                  <Input
                    value={form.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    placeholder="Consultar estoque"
                  />
                </Field>
              </div>

              <Field label="Categoria">
                <Input
                  value={form.category}
                  onChange={(e) => patch({ category: e.target.value })}
                  placeholder="dados / comunicação / documento…"
                />
              </Field>

              <Field
                label="Descrição"
                hint="Explique ao assistente quando usar esta habilidade e o que ela devolve."
              >
                <TextArea
                  rows={4}
                  value={form.description}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="Ex.: Consulta o estoque atual de um produto pelo SKU. Retorna quantidade e localização."
                />
              </Field>

              <Field
                label="Parâmetros de entrada (JSON Schema)"
                hint="Descreve os campos que o assistente precisa preencher antes de chamar a habilidade."
              >
                <TextArea
                  rows={10}
                  value={form.input_schema}
                  onChange={(e) => patch({ input_schema: e.target.value })}
                  style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
                />
              </Field>
            </>
          )}

          <div className="space-y-2">
            {isEdit && (
              <Checkbox
                id="tool-is-active"
                label="Habilidade ligada"
                checked={form.is_active}
                onChange={(e) => patch({ is_active: e.target.checked })}
              />
            )}
            <Checkbox
              id="tool-requires-approval"
              label="Exige aprovação humana antes de executar"
              checked={form.requires_approval}
              onChange={(e) => patch({ requires_approval: e.target.checked })}
            />
          </div>

          <div style={{ maxWidth: 260 }}>
            <Field label="Tempo limite (ms)" hint="Vazio = padrão (20000). Mínimo 1000.">
              <NumericInput
                value={form.timeout_ms === '' ? '' : Number(form.timeout_ms)}
                onChange={(v) => patch({ timeout_ms: v == null || v === '' ? '' : String(v) })}
                min={1000}
                step={500}
                fullWidth
              />
            </Field>
          </div>
        </div>
      </Card>
    </div>
  );
}
