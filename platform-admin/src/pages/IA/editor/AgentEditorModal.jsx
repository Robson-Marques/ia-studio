import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Settings, Sparkles, Target, Wrench, BookOpen, Brain, ShieldCheck, DollarSign,
} from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import Tabs from '../../../components/ui/Tabs';
import { FormField, TextInput, Textarea, Select, NumberInput } from '../../../components/ui/FormField';
import { Badge } from '../../../components/ui/Table';
import {
  createAgent, updateAgent, saveAgentVersion,
  listTools, listKnowledgeBases, listMemoryProfiles,
} from '../../../services/ai';
import { listConnections } from '../../../services/integrations';
import { toast } from '../../../lib/toast';

const TABS = [
  { id: 'geral',       label: 'Geral',       Icon: Settings },
  { id: 'persona',     label: 'Persona',     Icon: Sparkles },
  { id: 'prompt',      label: 'Prompt & Objetivo', Icon: Target },
  { id: 'tools',       label: 'Ferramentas', Icon: Wrench },
  { id: 'knowledge',   label: 'Conhecimento', Icon: BookOpen },
  { id: 'memory',      label: 'Memória',     Icon: Brain },
  { id: 'guardrails',  label: 'Aprovações/Guardrails', Icon: ShieldCheck },
  { id: 'costs',       label: 'Custos',      Icon: DollarSign },
];

const EMPTY = {
  name: '', description: '', connection_id: '', model: '',
  temperature: 0.3, max_steps: 6, max_tokens: null,
  system_prompt: '', goal: '',
  persona: { tone: '', emojis: false, brevity: 'medium', rules_always: [], rules_never: [] },
  allowed_tools: [], knowledge_base_ids: [], memory_profile_ids: [],
  guardrails: { max_cost_usd_per_run: null, blocked_words: [], pii_redact: false },
};

// Editor multi-aba do agente. Criar/editar grava a config; "Salvar como versão"
// (via ação da lista) publica. Aqui persistimos a config draft (createAgent/
// updateAgent) e opcionalmente geramos uma versão nova.
export default function AgentEditorModal({ open, onClose, agent, onSaved, canWrite, workspaceId, environmentId }) {
  const isEdit = !!agent?.id;
  const [tab, setTab] = useState('geral');
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveVersion, setSaveVersion] = useState(true);
  const [note, setNote] = useState('');

  const [connections, setConnections] = useState([]);
  const [tools, setTools] = useState([]);
  const [bases, setBases] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab('geral');
    setNote('');
    setSaveVersion(true);
    setForm(hydrate(agent));
    setLoadingRefs(true);
    Promise.all([
      listConnections({ category: 'AI' }).then((r) => r.items).catch(() => listConnections().then((r) => r.items).catch(() => [])),
      listTools().then((r) => r.items).catch(() => []),
      listKnowledgeBases().then((r) => r.items).catch(() => []),
      listMemoryProfiles().then((r) => r.items).catch(() => []),
    ])
      .then(([conns, tls, bs, prs]) => { setConnections(conns); setTools(tls); setBases(bs); setProfiles(prs); })
      .finally(() => setLoadingRefs(false));
  }, [open, agent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));
  const patchPersona = (p) => setForm((prev) => ({ ...prev, persona: { ...prev.persona, ...p } }));
  const patchGuard = (p) => setForm((prev) => ({ ...prev, guardrails: { ...prev.guardrails, ...p } }));

  const toggleIn = (field, id) => setForm((prev) => {
    const set = new Set(prev[field] || []);
    if (set.has(id)) set.delete(id); else set.add(id);
    return { ...prev, [field]: [...set] };
  });

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Informe o nome do agente.'); setTab('geral'); return; }
    if (!form.model.trim()) { toast.error('Informe o modelo (ex.: gpt-4o-mini).'); setTab('geral'); return; }
    if (!isEdit && (!workspaceId || !environmentId)) { toast.error('Selecione um workspace e um ambiente no topo.'); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        connection_id: form.connection_id || null,
        model: form.model.trim(),
        temperature: form.temperature,
        max_steps: form.max_steps,
        max_tokens: form.max_tokens ?? null,
        system_prompt: form.system_prompt.trim() || undefined,
        goal: form.goal.trim() || undefined,
        persona: form.persona,
        allowed_tools: form.allowed_tools,
        knowledge_base_ids: form.knowledge_base_ids,
        memory_profile_ids: form.memory_profile_ids,
        guardrails: form.guardrails,
      };
      let saved;
      if (isEdit) {
        saved = await updateAgent(agent.id, body);
      } else {
        saved = await createAgent({ ...body, workspace_id: workspaceId, environment_id: environmentId });
      }
      const id = saved?.id || agent?.id;
      if (saveVersion && id) {
        const res = await saveAgentVersion(id, { note: note.trim() || undefined });
        toast.success(`Agente salvo — versão v${res?.version ?? ''} gerada.`);
      } else {
        toast.success('Agente salvo.');
      }
      onSaved(saved);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={isEdit ? `Editar agente: ${agent?.name}` : 'Novo agente'}
      size="xl"
      dismissable={!saving}
      footer={
        <>
          <label className="flex items-center gap-1.5 text-xs mr-auto cursor-pointer" style={{ color: 'var(--ap-text-3)' }}>
            <input type="checkbox" checked={saveVersion} onChange={(e) => setSaveVersion(e.target.checked)} className="w-4 h-4 accent-current" />
            Salvar como nova versão
          </label>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" onClick={() => handleSave()} disabled={saving || !canWrite}>
            {saving && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </>
      }
    >
      <Tabs items={TABS} active={tab} onChange={setTab} />
      {loadingRefs && <div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin" /></div>}

      {tab === 'geral' && (
        <div className="space-y-3">
          <FormField label="Nome" required>
            <TextInput value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex.: Assistente de atendimento" />
          </FormField>
          <FormField label="Descrição">
            <Textarea rows={2} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
          </FormField>
          <FormField label="Conexão de IA (provider)" hint="Connection categoria AI. Vazio = orquestrador escolhe por custo/fallback.">
            <Select value={form.connection_id} onChange={(e) => patch({ connection_id: e.target.value })}>
              <option value="">— orquestrador (automático) —</option>
              {connections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.provider_key})</option>)}
            </Select>
          </FormField>
          <FormField label="Modelo" required hint="Ex.: gpt-4o-mini, claude-3-5-sonnet, gemini-1.5-flash.">
            <TextInput value={form.model} onChange={(e) => patch({ model: e.target.value })} placeholder="gpt-4o-mini" />
          </FormField>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FormField label="Temperatura" hint="0 = determinístico; 1 = criativo.">
              <NumberInput value={form.temperature} onChange={(v) => patch({ temperature: v })} min={0} max={2} step={0.1} />
            </FormField>
            <FormField label="Máx. de passos" hint="Iterações do loop de tool-calling.">
              <NumberInput value={form.max_steps} onChange={(v) => patch({ max_steps: v })} min={1} max={50} step={1} />
            </FormField>
            <FormField label="Máx. tokens (opcional)">
              <NumberInput value={form.max_tokens} onChange={(v) => patch({ max_tokens: v })} allowEmpty min={1} step={1} />
            </FormField>
          </div>
        </div>
      )}

      {tab === 'persona' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label="Tom">
              <TextInput value={form.persona.tone} onChange={(e) => patchPersona({ tone: e.target.value })} placeholder="Ex.: cordial e objetivo" />
            </FormField>
            <FormField label="Concisão">
              <Select value={form.persona.brevity} onChange={(e) => patchPersona({ brevity: e.target.value })}>
                <option value="short">Curta</option>
                <option value="medium">Média</option>
                <option value="long">Detalhada</option>
              </Select>
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--ap-text-2)' }}>
            <input type="checkbox" checked={form.persona.emojis} onChange={(e) => patchPersona({ emojis: e.target.checked })} className="w-4 h-4 accent-current" />
            Permitir emojis nas respostas
          </label>
          <FormField label="Sempre (uma regra por linha)" hint="Regras que o agente deve sempre seguir.">
            <Textarea rows={3} value={(form.persona.rules_always || []).join('\n')} onChange={(e) => patchPersona({ rules_always: linesToArr(e.target.value) })} placeholder={'Confirmar o nome do cliente\nOferecer ajuda adicional'} />
          </FormField>
          <FormField label="Nunca (uma regra por linha)" hint="Regras que o agente nunca deve violar.">
            <Textarea rows={3} value={(form.persona.rules_never || []).join('\n')} onChange={(e) => patchPersona({ rules_never: linesToArr(e.target.value) })} placeholder={'Prometer prazos sem confirmação\nCompartilhar dados sensíveis'} />
          </FormField>
        </div>
      )}

      {tab === 'prompt' && (
        <div className="space-y-3">
          <FormField label="System prompt" hint="Instruções-base do agente. Aceita {{variáveis}}.">
            <Textarea rows={6} value={form.system_prompt} onChange={(e) => patch({ system_prompt: e.target.value })} placeholder="Você é um assistente de atendimento da empresa…" />
          </FormField>
          <FormField label="Objetivo" hint="Meta que o agente busca atingir na conversa.">
            <Textarea rows={3} value={form.goal} onChange={(e) => patch({ goal: e.target.value })} placeholder="Resolver a dúvida do cliente ou encaminhar ao setor correto." />
          </FormField>
        </div>
      )}

      {tab === 'tools' && (
        <MultiSelectList
          items={tools}
          selected={form.allowed_tools}
          onToggle={(id) => toggleIn('allowed_tools', id)}
          getId={(t) => t.key}
          renderTitle={(t) => t.name}
          renderSub={(t) => (
            <>
              <span className="font-mono">{t.key}</span> · {t.category || 'geral'}
              {t.builtin && <Badge variant="blue">builtin</Badge>}
              {t.requires_approval && <Badge variant="yellow">exige aprovação</Badge>}
            </>
          )}
          empty="Nenhuma ferramenta no catálogo."
        />
      )}

      {tab === 'knowledge' && (
        <MultiSelectList
          items={bases}
          selected={form.knowledge_base_ids}
          onToggle={(id) => toggleIn('knowledge_base_ids', id)}
          getId={(b) => b.id}
          renderTitle={(b) => b.name}
          renderSub={(b) => `${b.embedding_model || 'embeddings'} · ${b.document_count ?? b.documents?.length ?? 0} docs`}
          empty="Nenhuma base de conhecimento criada."
        />
      )}

      {tab === 'memory' && (
        <MultiSelectList
          items={profiles}
          selected={form.memory_profile_ids}
          onToggle={(id) => toggleIn('memory_profile_ids', id)}
          getId={(p) => p.id}
          renderTitle={(p) => p.name}
          renderSub={(p) => `escopo: ${p.scope}`}
          empty="Nenhum perfil de memória criado."
        />
      )}

      {tab === 'guardrails' && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            Guardrails limitam o comportamento do agente. Aprovações finas de ações são configuradas em IA → Aprovações (políticas).
          </p>
          <FormField label="Custo máximo por execução (US$)" hint="Se ultrapassar, a execução é encerrada com erro. Vazio = sem limite.">
            <NumberInput value={form.guardrails.max_cost_usd_per_run} onChange={(v) => patchGuard({ max_cost_usd_per_run: v })} allowEmpty min={0} step={0.01} />
          </FormField>
          <FormField label="Palavras bloqueadas (uma por linha)" hint="Respostas contendo estes termos são bloqueadas.">
            <Textarea rows={3} value={(form.guardrails.blocked_words || []).join('\n')} onChange={(e) => patchGuard({ blocked_words: linesToArr(e.target.value) })} />
          </FormField>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--ap-text-2)' }}>
            <input type="checkbox" checked={form.guardrails.pii_redact} onChange={(e) => patchGuard({ pii_redact: e.target.checked })} className="w-4 h-4 accent-current" />
            Redigir dados pessoais (PII) nas respostas
          </label>
        </div>
      )}

      {tab === 'costs' && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            O limite por execução acima também vale como teto de custo. Orçamentos por período (mês) são definidos em IA → Custos.
          </p>
          <FormField label="Custo máximo por execução (US$)" hint="Mesmo campo dos guardrails.">
            <NumberInput value={form.guardrails.max_cost_usd_per_run} onChange={(v) => patchGuard({ max_cost_usd_per_run: v })} allowEmpty min={0} step={0.01} />
          </FormField>
        </div>
      )}

      {saveVersion && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--ap-border)' }}>
          <FormField label="Nota da versão" hint="O que mudou (aparece no histórico de versões).">
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: ajusta persona e adiciona ferramenta de FAQ" />
          </FormField>
        </div>
      )}
    </Modal>
  );
}

function MultiSelectList({ items, selected, onToggle, getId, renderTitle, renderSub, empty }) {
  const set = useMemo(() => new Set(selected || []), [selected]);
  if (!items.length) return <p className="text-xs py-4 text-center" style={{ color: 'var(--ap-text-4)' }}>{empty}</p>;
  return (
    <div className="space-y-1.5">
      {items.map((it) => {
        const id = getId(it);
        const on = set.has(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            className="w-full text-left rounded-lg p-2.5 flex items-center gap-2.5 transition-colors hover:bg-brand/5"
            style={{ border: `1px solid ${on ? 'var(--ap-accent, #6366f1)' : 'var(--ap-border)'}` }}
          >
            <input type="checkbox" readOnly checked={on} className="w-4 h-4 accent-current shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{renderTitle(it)}</p>
              <p className="text-[11px] flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--ap-text-4)' }}>{renderSub(it)}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function linesToArr(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
}

function hydrate(agent) {
  if (!agent) return { ...EMPTY, persona: { ...EMPTY.persona }, guardrails: { ...EMPTY.guardrails } };
  return {
    name: agent.name || '',
    description: agent.description || '',
    connection_id: agent.connection_id || '',
    model: agent.model || '',
    temperature: agent.temperature ?? 0.3,
    max_steps: agent.max_steps ?? 6,
    max_tokens: agent.max_tokens ?? null,
    system_prompt: agent.system_prompt || '',
    goal: agent.goal || '',
    persona: { ...EMPTY.persona, ...(agent.persona || {}) },
    allowed_tools: agent.allowed_tools || [],
    knowledge_base_ids: agent.knowledge_base_ids || [],
    memory_profile_ids: agent.memory_profile_ids || [],
    guardrails: { ...EMPTY.guardrails, ...(agent.guardrails || {}) },
  };
}
