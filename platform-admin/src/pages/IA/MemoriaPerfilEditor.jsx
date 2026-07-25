import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Card, Field, Input, Select, NumericInput, TextArea,
  Button, useToast,
} from '@studio-ux-ds/react';
import { getMemoryProfile, createMemoryProfile, updateMemoryProfile } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { MEMORY_SCOPES } from './ia.constants';

// IA/MemoriaPerfilEditor — criar/editar perfil de memória (v0.9.88).
// Promovido a rota porque o form tem TextArea de Descrição — a regra do Modal
// do DS (v1.2.11+) proíbe escrita reflexiva em overlay.
//
// Rotas:
//   /ia/memoria/perfis/nova
//   /ia/memoria/perfis/:id/editar
//
// Diferente do editor de habilidade, aqui existe GET /ai/memory/profiles/:id
// (getMemoryProfile) — então o carregamento em refresh/deep-link é direto.
//
// NumericInput do DS aceita '' como valor intermediário; `toNullable` converte
// de volta pra null antes de salvar (TTL vazio = sem expiração, máx. de itens
// vazio = ilimitado — semântica preservada do legado).

const EMPTY = { name: '', scope: 'SESSION', description: '', default_ttl_seconds: '', max_items: '' };

export default function MemoriaPerfilEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();

  const isEdit = !!id;
  const canWrite = can('ai.memory.write');

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [profileName, setProfileName] = useState('');

  useEffect(() => {
    if (!isEdit) { setForm(EMPTY); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const p = await getMemoryProfile(id);
        if (!alive) return;
        setProfileName(p.name || '');
        setForm({
          name: p.name || '',
          scope: p.scope || 'SESSION',
          description: p.description || '',
          default_ttl_seconds: p.default_ttl_seconds ?? '',
          max_items: p.max_items ?? '',
        });
      } catch (err) {
        if (!alive) return;
        toast.error(err.message);
        navigate('/ia/memoria', { replace: true });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSave() {
    if (!canWrite) { toast.error('Sem permissão.'); return; }
    if (!form.name.trim()) { toast.error('Informe o nome do perfil.'); return; }
    if (!isEdit && (!workspaceId || !environmentId)) {
      toast.error('Selecione um workspace e um ambiente no topo.'); return;
    }
    setSaving(true);
    try {
      const toNullable = (v) => (v === '' || v === null || v === undefined) ? null : Number(v);
      const body = {
        name: form.name.trim(),
        scope: form.scope,
        description: form.description.trim() || undefined,
        default_ttl_seconds: toNullable(form.default_ttl_seconds),
        max_items: toNullable(form.max_items),
      };
      if (isEdit) {
        await updateMemoryProfile(id, body);
        toast.success('Perfil atualizado.');
        navigate(`/ia/memoria/${id}`);
      } else {
        await createMemoryProfile({ ...body, workspace_id: workspaceId, environment_id: environmentId });
        toast.success('Perfil criado.');
        navigate('/ia/memoria');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const cancelTo = isEdit ? `/ia/memoria/${id}` : '/ia/memoria';

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
        title={isEdit ? `Editar "${profileName}"` : 'Novo perfil de memória'}
        subtitle="Define o que o assistente lembra, por quanto tempo e quantos itens no máximo."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(cancelTo)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving || !canWrite}
              icon={saving ? 'loader-2' : 'check'}
            >
              {saving ? 'Salvando…' : 'Salvar'}
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
              placeholder="Ex.: Contexto do contato"
            />
          </Field>

          <div style={{ maxWidth: 320 }}>
            <Field
              label="Escopo"
              hint={isEdit
                ? 'Não pode mudar depois de criado — a chave de escopo já está em uso.'
                : 'Define a chave de escopo (contato / sessão / fluxo / assistente).'}
            >
              <Select value={form.scope} onChange={(e) => patch({ scope: e.target.value })} disabled={isEdit}>
                {MEMORY_SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="Descrição" hint="Para que serve este perfil e o que ele guarda.">
            <TextArea
              rows={4}
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Ex.: Guarda nome, plano e último assunto tratado de cada contato."
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ maxWidth: 520 }}>
            <Field label="Validade padrão (segundos)" hint="Vazio = nunca expira.">
              <NumericInput
                value={form.default_ttl_seconds}
                onChange={(v) => patch({ default_ttl_seconds: v })}
                min={0}
                step={60}
                fullWidth
              />
            </Field>
            <Field label="Máx. de itens" hint="Vazio = ilimitado.">
              <NumericInput
                value={form.max_items}
                onChange={(v) => patch({ max_items: v })}
                min={1}
                step={1}
                fullWidth
              />
            </Field>
          </div>
        </div>
      </Card>
    </div>
  );
}
