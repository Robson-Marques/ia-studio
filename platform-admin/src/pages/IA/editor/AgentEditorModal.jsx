import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Settings, Sparkles, Target, Wrench, BookOpen, Brain, ShieldCheck, DollarSign,
  Play, FlaskConical,
} from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import Tabs from '../../../components/ui/Tabs';
import { FormField, TextInput, Textarea, Select, NumberInput } from '../../../components/ui/FormField';
import { Badge } from '../../../components/ui/Table';
import {
  createAgent, updateAgent, saveAgentVersion, executeAgent,
  listTools, listKnowledgeBases, listMemoryProfiles,
} from '../../../services/ai';
import { listConnections } from '../../../services/integrations';
import { usePermissions } from '../../../hooks/usePermissions';
import { toast } from '../../../lib/toast';
import {
  AGENT_MODELS, PERSONA_TONES, PERSONA_EMOJIS, PERSONA_BREVITY, RUN_STATUS,
} from '../ia.constants';

const TABS = [
  { id: 'geral',       label: 'Geral',       Icon: Settings },
  { id: 'persona',     label: 'Persona',     Icon: Sparkles },
  { id: 'prompt',      label: 'Prompt & Objetivo', Icon: Target },
  { id: 'tools',       label: 'Ferramentas', Icon: Wrench },
  { id: 'knowledge',   label: 'Conhecimento', Icon: BookOpen },
  { id: 'memory',      label: 'Memória',     Icon: Brain },
  { id: 'guardrails',  label: 'Aprovações/Guardrails', Icon: ShieldCheck },
  { id: 'costs',       label: 'Custos',      Icon: DollarSign },
  { id: 'test',        label: 'Testar',      Icon: FlaskConical },
];

const EMPTY = {
  name: '', description: '', connection_id: '', model: '',
  temperature: 0.3, max_steps: 6, max_tokens: null,
  system_prompt: '', goal: '',
  // persona guiada — emojis_ui é só de UI (mapeia pro boolean emojis no save).
  persona: { name: '', tone: '', emojis: false, emojis_ui: '', brevity: 'medium', rules_always: [], rules_never: [] },
  allowed_tools: [], knowledge_base_ids: [], memory_profile_ids: [], action_permissions: [],
  guardrails: { max_cost_usd_per_run: null, blocked_words: [], pii_redact: false },
};

// Editor multi-aba do agente. Criar/editar grava a config; "Salvar como versão"
// publica uma versão nova. Aba "Testar" executa uma run síncrona sem sair do
// editor (porta da UX do Aquapark). Persona guiada compila no backend
// (agent-persona.ts): tone/emojis(boolean)/brevity/rules_always/rules_never.
export default function AgentEditorModal({ open, onClose, agent, onSaved, canWrite, workspaceId, environmentId }) {
  const { can } = usePermissions();
  const canExecute = can('ai.agents.execute');
  const isEdit = !!agent?.id;
  const [savedId, setSavedId] = useState(agent?.id || null);
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
    setSavedId(agent?.id || null);
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

  // Modelos sugeridos pro provider da conexão escolhida (fallback: input livre).
  const providerKey = useMemo(() => {
    const conn = connections.find((c) => c.id === form.connection_id);
    return (conn?.provider_key || '').toLowerCase();
  }, [connections, form.connection_id]);
  const modelSuggestions = AGENT_MODELS[providerKey] || [];

  function buildPersona() {
    const p = form.persona || {};
    // emojis_ui (3 níveis) → boolean que o backend entende.
    const emojis = p.emojis_ui === 'nenhum' ? false
      : (p.emojis_ui === 'moderado' || p.emojis_ui === 'frequente') ? true
      : (p.emojis ?? false);
    const persona = {
      ...(p.name ? { name: p.name } : {}),
      ...(p.tone ? { tone: p.tone } : {}),
      emojis,
      ...(p.brevity ? { brevity: p.brevity } : {}),
      rules_always: p.rules_always || [],
      rules_never: p.rules_never || [],
    };
    return persona;
  }

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
        persona: buildPersona(),
        allowed_tools: form.allowed_tools,
        knowledge_base_ids: form.knowledge_base_ids,
        memory_profile_ids: form.memory_profile_ids,
        action_permissions: form.action_permissions,
        guardrails: form.guardrails,
      };
      let saved;
      if (savedId) {
        saved = await updateAgent(savedId, body);
      } else {
        saved = await createAgent({ ...body, workspace_id: workspaceId, environment_id: environmentId });
      }
      const id = saved?.id || savedId;
      setSavedId(id); // habilita a aba Testar após o 1º save
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
          <FormField label="Modelo" required hint="Selecione um sugerido ou digite o identificador do modelo.">
            {modelSuggestions.length > 0 && (
              <Select
                value={modelSuggestions.some((m) => m.value === form.model) ? form.model : ''}
                onChange={(e) => e.target.value && patch({ model: e.target.value })}
                className="mb-2"
              >
                <option value="">— escolher um modelo sugerido —</option>
                {modelSuggestions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            )}
            <TextInput value={form.model} onChange={(e) => patch({ model: e.target.value })} placeholder="gpt-4o-mini" />
          </FormField>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FormField label="Temperatura" hint="0 = determinístico; 1 = criativo.">
              <NumberInput value={form.temperature} onChange={(v) => patch({ temperature: v })} min={0} max={2} step={0.1} />
            </FormField>
            <FormField label="Máx. de passos" hint="Iterações do loop de tool-calling.">
              <NumberInput value={form.max_steps} onChange={(v) => patch({ max_steps: v })} min={1} max={20} step={1} />
            </FormField>
            <FormField label="Máx. tokens (opcional)">
              <NumberInput value={form.max_tokens} onChange={(v) => patch({ max_tokens: v })} allowEmpty min={1} step={1} />
            </FormField>
          </div>
        </div>
      )}

      {tab === 'persona' && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            A persona guia o comportamento do agente — o sistema a compila num bloco de instruções.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label="Nome do agente" hint="Como a IA se apresenta. Vazio = sem nome.">
              <TextInput value={form.persona.name || ''} onChange={(e) => patchPersona({ name: e.target.value })} placeholder="Ex.: Luan" />
            </FormField>
            <FormField label="Tom de voz">
              <Select value={form.persona.tone || ''} onChange={(e) => patchPersona({ tone: e.target.value })}>
                {PERSONA_TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </FormField>
            <FormField label="Emojis">
              <Select value={form.persona.emojis_ui || ''} onChange={(e) => patchPersona({ emojis_ui: e.target.value })}>
                {PERSONA_EMOJIS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </FormField>
            <FormField label="Tamanho das respostas">
              <Select value={form.persona.brevity || ''} onChange={(e) => patchPersona({ brevity: e.target.value })}>
                {PERSONA_BREVITY.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </FormField>
          </div>
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
          <FormField label="Instruções avançadas (system prompt)" hint="Complementa a Persona. Aceita {{variáveis}}. Pode deixar em branco.">
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
              {t.is_active === false && <Badge variant="gray">desligada</Badge>}
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

      {tab === 'test' && (
        <TestTab agentId={savedId} canExecute={canExecute} />
      )}

      {saveVersion && tab !== 'test' && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--ap-border)' }}>
          <FormField label="Nota da versão" hint="O que mudou (aparece no histórico de versões).">
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: ajusta persona e adiciona ferramenta de FAQ" />
          </FormField>
        </div>
      )}
    </Modal>
  );
}

// Aba de teste embutida (porta da UX do Aquapark): só disponível após salvar o
// agente. Aceita texto simples (a mensagem). Executa uma run síncrona e mostra
// status + saída + tokens/custo.
function TestTab({ agentId, canExecute }) {
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(null);

  if (!agentId) {
    return (
      <p className="text-xs py-6 text-center" style={{ color: 'var(--ap-text-4)' }}>
        Salve o agente para habilitar o teste.
      </p>
    );
  }
  if (!canExecute) {
    return (
      <p className="text-xs py-6 text-center" style={{ color: 'var(--ap-text-4)' }}>
        Você não tem permissão para testar agentes.
      </p>
    );
  }

  async function handleRun() {
    if (!input.trim()) { toast.error('Escreva uma mensagem de teste.'); return; }
    setRunning(true);
    setRun(null);
    try {
      const result = await executeAgent(agentId, { input: input.trim() });
      setRun(result);
      const st = result?.status;
      if (st === 'AWAITING_APPROVAL') toast.warn('Execução aguardando aprovação de uma ação.');
      else if (st === 'ERROR') toast.error('A execução terminou com erro.');
      else toast.success('Execução concluída.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  const statusInfo = run ? (RUN_STATUS[run.status] || { label: run.status, variant: 'gray' }) : null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--ap-surface-2)', border: '1px solid var(--ap-border)' }}>
        <p className="text-[11px]" style={{ color: 'var(--ap-text-4)' }}>
          Escreva uma mensagem como se fosse o usuário. Ex.: "Qual o horário de atendimento?".
        </p>
        <div className="flex gap-2 items-start">
          <Textarea rows={2} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Digite uma mensagem de teste…" />
          <button className="btn-primary shrink-0 disabled:opacity-60" onClick={handleRun} disabled={running}>
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Testar
          </button>
        </div>
      </div>

      {run && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--ap-text-3)' }}>
            {statusInfo && <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>}
            {run.total_tokens != null && <span>Tokens: <strong style={{ color: 'var(--ap-text-1)' }}>{Number(run.total_tokens).toLocaleString('pt-BR')}</strong></span>}
            {run.cost_usd != null && <span>Custo: <strong style={{ color: 'var(--ap-text-1)' }}>US$ {Number(run.cost_usd).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</strong></span>}
          </div>
          {run.error && (
            <p className="text-xs rounded-lg p-2 text-red-500" style={{ border: '1px solid var(--ap-border)' }}>{run.error}</p>
          )}
          {run.output && (
            <pre className="text-xs whitespace-pre-wrap break-words rounded-lg p-2.5" style={{ background: 'var(--ap-surface)', border: '1px solid var(--ap-border)', color: 'var(--ap-text-2)' }}>{run.output}</pre>
          )}
        </div>
      )}
    </div>
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

// Deriva o valor de emojis_ui (3 níveis) a partir do boolean persistido.
function emojisToUi(persona) {
  if (typeof persona?.emojis_ui === 'string' && persona.emojis_ui) return persona.emojis_ui;
  if (persona?.emojis === true) return 'moderado';
  if (persona?.emojis === false) return 'nenhum';
  return '';
}

function hydrate(agent) {
  if (!agent) return { ...EMPTY, persona: { ...EMPTY.persona }, guardrails: { ...EMPTY.guardrails } };
  const persona = agent.persona || {};
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
    persona: {
      name: typeof persona.name === 'string' ? persona.name : '',
      tone: persona.tone || '',
      emojis: persona.emojis ?? false,
      emojis_ui: emojisToUi(persona),
      brevity: persona.brevity || 'medium',
      rules_always: Array.isArray(persona.rules_always) ? persona.rules_always : [],
      rules_never: Array.isArray(persona.rules_never) ? persona.rules_never : [],
    },
    allowed_tools: agent.allowed_tools || [],
    knowledge_base_ids: agent.knowledge_base_ids || [],
    memory_profile_ids: agent.memory_profile_ids || [],
    action_permissions: agent.action_permissions || [],
    guardrails: { ...EMPTY.guardrails, ...(agent.guardrails || {}) },
  };
}
