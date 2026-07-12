import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Settings, Sparkles, Target, Wrench, BookOpen, ClipboardCheck, Users,
  Play, FlaskConical, Check, Circle, Plus, Trash2, ChevronUp, ChevronDown,
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

// Abas na LÍNGUA DO USUÁRIO (regra máxima de UX do CLAUDE.md): a pessoa descreve
// o atendente que quer; o jargão (modelo/temperatura/conexão) fica em "Ajustes
// avançados". Os campos por baixo continuam os mesmos — só a casca mudou.
const TABS = [
  { id: 'visao',      label: 'Visão geral',      Icon: ClipboardCheck },
  { id: 'quem',       label: 'Quem é',           Icon: Sparkles },
  { id: 'faz',        label: 'O que faz',        Icon: Target },
  { id: 'sabe',       label: 'O que sabe',       Icon: BookOpen },
  { id: 'pode',       label: 'O que pode fazer', Icon: Wrench },
  { id: 'quematende', label: 'Quem atende',      Icon: Users },
  { id: 'testar',     label: 'Testar',           Icon: FlaskConical },
  { id: 'avancado',   label: 'Ajustes avançados', Icon: Settings },
];

const EMPTY = {
  name: '', description: '', connection_id: '', model: '',
  temperature: 0.3, max_steps: 6, max_tokens: null,
  system_prompt: '', goal: '',
  // "O que faz" estruturado — objetivo + passos (ordem) + situações (condicionais).
  roteiro: { objetivo: '', passos: [], situacoes: [] },
  persona: { name: '', tone: '', emojis: false, emojis_ui: '', brevity: 'medium', rules_always: [], rules_never: [] },
  allowed_tools: [], knowledge_base_ids: [], memory_profile_ids: [], action_permissions: [],
  guardrails: { max_cost_usd_per_run: null, blocked_words: [], pii_redact: false },
};

export default function AgentEditorModal({ open, onClose, agent, onSaved, canWrite, workspaceId, environmentId }) {
  const { can } = usePermissions();
  const canExecute = can('ai.agents.execute');
  // Conceder ferramentas que gravam dados exige permissão (anti-escalada).
  const canActions = can('ai.agents.actions');
  const isEdit = !!agent?.id;
  const [savedId, setSavedId] = useState(agent?.id || null);
  const [tab, setTab] = useState('visao');
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
    setTab('visao');
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
  const patchRoteiro = (p) => setForm((prev) => ({ ...prev, roteiro: { ...prev.roteiro, ...p } }));

  // Passos (na ordem) — adicionar / editar / mover / remover.
  const addPasso = () => patchRoteiro({ passos: [...(form.roteiro.passos || []), { titulo: '', descricao: '' }] });
  const setPasso = (i, p) => patchRoteiro({ passos: form.roteiro.passos.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const delPasso = (i) => patchRoteiro({ passos: form.roteiro.passos.filter((_, j) => j !== i) });
  const movePasso = (i, dir) => {
    const arr = [...form.roteiro.passos];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    patchRoteiro({ passos: arr });
  };
  // Situações (Quando... faça...).
  const addSituacao = () => patchRoteiro({ situacoes: [...(form.roteiro.situacoes || []), { quando: '', faca: '' }] });
  const setSituacao = (i, p) => patchRoteiro({ situacoes: form.roteiro.situacoes.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const delSituacao = (i) => patchRoteiro({ situacoes: form.roteiro.situacoes.filter((_, j) => j !== i) });

  const toggleIn = (field, id) => setForm((prev) => {
    const set = new Set(prev[field] || []);
    if (set.has(id)) set.delete(id); else set.add(id);
    return { ...prev, [field]: [...set] };
  });

  const providerKey = useMemo(() => {
    const conn = connections.find((c) => c.id === form.connection_id);
    return (conn?.provider_key || '').toLowerCase();
  }, [connections, form.connection_id]);
  const modelSuggestions = AGENT_MODELS[providerKey] || [];

  // Checklist "pronto para publicar?" — derivado do form, sem estado novo.
  const readiness = useMemo(() => {
    const r = form.roteiro || {};
    const temRoteiro = !!(r.objetivo?.trim()
      || (r.passos || []).some((p) => p.titulo?.trim() || p.descricao?.trim())
      || (r.situacoes || []).some((s) => s.quando?.trim() || s.faca?.trim())
      || form.system_prompt.trim());
    return [
      { ok: !!form.name.trim(), label: 'Tem nome' },
      { ok: temRoteiro, label: 'Tem objetivo e/ou roteiro' },
      { ok: form.knowledge_base_ids.length > 0, label: 'Sabe responder (base de conhecimento)', optional: true },
      { ok: form.allowed_tools.length > 0, label: 'Tem habilidades marcadas' },
    ];
  }, [form.name, form.roteiro, form.system_prompt, form.knowledge_base_ids, form.allowed_tools]);

  // Limpa o roteiro antes de salvar: tira passos/situações vazios.
  function buildRoteiro() {
    const r = form.roteiro || {};
    return {
      objetivo: (r.objetivo || '').trim(),
      passos: (r.passos || [])
        .map((p) => ({ titulo: (p.titulo || '').trim(), descricao: (p.descricao || '').trim() }))
        .filter((p) => p.titulo || p.descricao),
      situacoes: (r.situacoes || [])
        .map((s) => ({ quando: (s.quando || '').trim(), faca: (s.faca || '').trim() }))
        .filter((s) => s.quando || s.faca),
    };
  }

  function buildPersona() {
    const p = form.persona || {};
    const emojis = p.emojis_ui === 'nenhum' ? false
      : (p.emojis_ui === 'moderado' || p.emojis_ui === 'frequente') ? true
      : (p.emojis ?? false);
    return {
      ...(p.name ? { name: p.name } : {}),
      ...(p.tone ? { tone: p.tone } : {}),
      emojis,
      ...(p.brevity ? { brevity: p.brevity } : {}),
      rules_always: p.rules_always || [],
      rules_never: p.rules_never || [],
    };
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Dê um nome ao assistente (aba "Quem é").'); setTab('quem'); return; }
    if (!form.model.trim()) { toast.error('Escolha o modelo em "Ajustes avançados".'); setTab('avancado'); return; }
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
        goal: form.roteiro.objetivo.trim() || undefined, // objetivo do roteiro alimenta o goal legado
        roteiro: buildRoteiro(),
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
      setSavedId(id);
      if (saveVersion && id) {
        const res = await saveAgentVersion(id, { note: note.trim() || undefined });
        toast.success(`Assistente salvo — versão v${res?.version ?? ''} gerada.`);
      } else {
        toast.success('Assistente salvo.');
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
      title={isEdit ? `Editar assistente: ${agent?.name}` : 'Novo assistente'}
      size="xl"
      dismissable={!saving}
      footer={
        <>
          <label className="flex items-center gap-1.5 text-xs mr-auto cursor-pointer" style={{ color: 'var(--ap-text-3)' }}>
            <input type="checkbox" checked={saveVersion} onChange={(e) => setSaveVersion(e.target.checked)} className="w-4 h-4 accent-current" />
            Salvar como nova versão
          </label>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Fechar</button>
          <button className="btn-primary disabled:opacity-60" onClick={() => handleSave()} disabled={saving || !canWrite}>
            {saving && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </>
      }
    >
      <Tabs items={TABS} active={tab} onChange={setTab} />
      {loadingRefs && <div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin" /></div>}

      {/* ── Visão geral ── */}
      {tab === 'visao' && (
        <div className="space-y-3">
          <div className="rounded-lg p-4" style={{ background: 'var(--ap-surface-2)', border: '1px solid var(--ap-border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--ap-text-4)' }}>Pronto para publicar?</p>
            <div className="space-y-1.5">
              {readiness.map((r) => (
                <div key={r.label} className="flex items-center gap-2 text-sm" style={{ color: r.ok ? 'var(--ap-text-1)' : 'var(--ap-text-3)' }}>
                  {r.ok
                    ? <Check size={15} className="text-emerald-500 shrink-0" />
                    : <Circle size={13} className="shrink-0" style={{ color: 'var(--ap-text-5)' }} />}
                  {r.label}
                  {r.optional && <span className="text-[11px]" style={{ color: 'var(--ap-text-5)' }}>(opcional)</span>}
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            Preencha <strong>Quem é</strong> e <strong>O que faz</strong>, ligue <strong>O que sabe</strong> e <strong>O que pode fazer</strong>, e teste.
          </p>
          <FormField label="Nome do assistente" required hint="Nome interno, na sua lista de assistentes.">
            <TextInput value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex.: Atendimento" />
          </FormField>
          <FormField label="Descrição">
            <Textarea rows={2} value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Para que serve este assistente." />
          </FormField>
          {saveVersion && (
            <FormField label="Nota da versão" hint="O que mudou nesta edição (aparece no histórico de versões).">
              <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: ajusta o tom e adiciona a 2ª via de boleto" />
            </FormField>
          )}
        </div>
      )}

      {/* ── Quem é (persona) ── */}
      {tab === 'quem' && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            Como o assistente se apresenta e se comporta na conversa.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label="Nome que a IA usa" hint="Como ela se apresenta. Vazio = sem nome.">
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
          <FormField label="Sempre (uma regra por linha)" hint="O que o assistente deve sempre fazer.">
            <Textarea rows={3} value={(form.persona.rules_always || []).join('\n')} onChange={(e) => patchPersona({ rules_always: linesToArr(e.target.value) })} placeholder={'Confirmar o nome do cliente\nResponder em português'} />
          </FormField>
          <FormField label="Nunca (uma regra por linha)" hint="O que ele nunca deve fazer.">
            <Textarea rows={3} value={(form.persona.rules_never || []).join('\n')} onChange={(e) => patchPersona({ rules_never: linesToArr(e.target.value) })} placeholder={'Prometer prazos sem confirmação\nInventar valores'} />
          </FormField>
        </div>
      )}

      {/* ── O que faz (objetivo + passos + situações) ── */}
      {tab === 'faz' && (
        <div className="space-y-4">
          <FormField label="Objetivo" hint="O que este assistente deve alcançar. Ex.: 'Resolver a dúvida ou encaminhar ao setor certo.'">
            <Textarea rows={2} value={form.roteiro.objetivo} onChange={(e) => patchRoteiro({ objetivo: e.target.value })} placeholder="Identificar o cliente e resolver dúvidas de conexão e financeiro." />
          </FormField>
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            Monte o roteiro que o assistente segue — sem escrever texto corrido. Os <strong>Passos</strong> são feitos na ordem; as <strong>Situações</strong> só acontecem quando a condição ocorre.
          </p>

          {/* Passos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ap-text-4)' }}>Passos (na ordem)</p>
              <button type="button" className="btn-secondary !py-1 !px-2.5 text-xs" onClick={addPasso}><Plus size={13} /> Adicionar passo</button>
            </div>
            {(form.roteiro.passos || []).length === 0 && (
              <p className="text-xs py-3 text-center" style={{ color: 'var(--ap-text-5)' }}>Nenhum passo ainda. O assistente vai agir livremente pelo objetivo e pela persona.</p>
            )}
            <div className="space-y-2">
              {(form.roteiro.passos || []).map((p, i) => (
                <div key={i} className="rounded-lg p-2.5" style={{ border: '1px solid var(--ap-border)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--ap-accent, #6366f1)' }}>Passo {i + 1}</span>
                    <TextInput value={p.titulo || ''} onChange={(e) => setPasso(i, { titulo: e.target.value })} placeholder="Título do passo (ex.: Identificar o cliente)" />
                    <button type="button" className="btn-ghost p-1 disabled:opacity-30" title="Subir" disabled={i === 0} onClick={() => movePasso(i, -1)}><ChevronUp size={15} /></button>
                    <button type="button" className="btn-ghost p-1 disabled:opacity-30" title="Descer" disabled={i === form.roteiro.passos.length - 1} onClick={() => movePasso(i, 1)}><ChevronDown size={15} /></button>
                    <button type="button" className="btn-ghost p-1 text-red-500" title="Remover" onClick={() => delPasso(i)}><Trash2 size={15} /></button>
                  </div>
                  <Textarea rows={2} value={p.descricao || ''} onChange={(e) => setPasso(i, { descricao: e.target.value })} placeholder="O que o assistente faz neste passo." />
                </div>
              ))}
            </div>
          </div>

          {/* Situações */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ap-text-4)' }}>Situações (Quando… faça…)</p>
              <button type="button" className="btn-secondary !py-1 !px-2.5 text-xs" onClick={addSituacao}><Plus size={13} /> Adicionar situação</button>
            </div>
            {(form.roteiro.situacoes || []).length === 0 && (
              <p className="text-xs py-3 text-center" style={{ color: 'var(--ap-text-5)' }}>Nenhuma situação. Ex.: "quando o acesso estiver bloqueado por falta de pagamento, ofereça a 2ª via".</p>
            )}
            <div className="space-y-2">
              {(form.roteiro.situacoes || []).map((s, i) => (
                <div key={i} className="rounded-lg p-2.5" style={{ border: '1px solid var(--ap-border)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--ap-text-4)' }}>Quando</span>
                    <TextInput value={s.quando || ''} onChange={(e) => setSituacao(i, { quando: e.target.value })} placeholder="a condição acontecer (ex.: o cliente pedir cancelamento)" />
                    <button type="button" className="btn-ghost p-1 text-red-500" title="Remover" onClick={() => delSituacao(i)}><Trash2 size={15} /></button>
                  </div>
                  <Textarea rows={2} value={s.faca || ''} onChange={(e) => setSituacao(i, { faca: e.target.value })} placeholder="…faça isto." />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── O que sabe (conhecimento) ── */}
      {tab === 'sabe' && (
        <>
          <p className="text-xs mb-2" style={{ color: 'var(--ap-text-4)' }}>Bases de conhecimento que o assistente consulta para responder.</p>
          <MultiSelectList
            items={bases}
            selected={form.knowledge_base_ids}
            onToggle={(id) => toggleIn('knowledge_base_ids', id)}
            getId={(b) => b.id}
            renderTitle={(b) => b.name}
            renderSub={(b) => `${b.document_count ?? b.documents?.length ?? 0} documento(s)`}
            empty="Nenhuma base de conhecimento criada ainda."
          />
        </>
      )}

      {/* ── O que pode fazer (ferramentas) ── */}
      {tab === 'pode' && (
        <>
          <p className="text-xs mb-2" style={{ color: 'var(--ap-text-4)' }}>
            Marque as habilidades do assistente. As marcadas com <Badge variant="yellow">grava dados</Badge> mudam ou registram algo.
          </p>
          {!canActions && (
            <p className="text-xs mb-2 rounded-lg p-2" style={{ background: 'var(--ap-surface-2)', border: '1px solid var(--ap-border)', color: 'var(--ap-text-3)' }}>
              Você só pode marcar habilidades de <strong>consulta</strong>. As que <em>gravam dados</em> exigem a permissão “Conceder à IA ações que gravam dados”.
            </p>
          )}
          <MultiSelectList
            items={tools}
            selected={form.allowed_tools}
            onToggle={(id) => toggleIn('allowed_tools', id)}
            getId={(t) => t.key}
            renderTitle={(t) => t.name}
            isDisabled={(t) => t.requires_approval && !canActions && !form.allowed_tools.includes(t.key)}
            renderSub={(t) => (
              <>
                {t.requires_approval && <Badge variant="yellow">grava dados</Badge>}
                {t.is_active === false && <Badge variant="gray">desligada</Badge>}
                <span>{t.category || 'geral'}</span>
              </>
            )}
            empty="Nenhuma habilidade disponível no catálogo."
          />
        </>
      )}

      {/* ── Quem atende (roteamento — depende da frente de atendimento) ── */}
      {tab === 'quematende' && (
        <div className="rounded-lg p-4 text-sm space-y-2" style={{ background: 'var(--ap-surface-2)', border: '1px solid var(--ap-border)', color: 'var(--ap-text-3)' }}>
          <p style={{ color: 'var(--ap-text-1)' }} className="font-medium">Quando este assistente atende</p>
          <p>
            O atendimento automático pelo WhatsApp (a IA responder sozinha às mensagens que chegam) ainda
            está sendo montado. Por enquanto, você usa este assistente pela aba <strong>Testar</strong> ou
            ligando-o num fluxo em <strong>Automações</strong> (gatilho de mensagem recebida → Agente de IA).
          </p>
        </div>
      )}

      {/* ── Testar ── */}
      {tab === 'testar' && (
        <TestTab agentId={savedId} canExecute={canExecute} />
      )}

      {/* ── Ajustes avançados (o jargão fica aqui) ── */}
      {tab === 'avancado' && (
        <div className="space-y-3">
          <FormField label="Conexão de IA" hint="Vazio = a plataforma escolhe pelo menor custo.">
            <Select value={form.connection_id} onChange={(e) => patch({ connection_id: e.target.value })}>
              <option value="">— automático —</option>
              {connections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.provider_key})</option>)}
            </Select>
          </FormField>
          <FormField label="Modelo" required hint="Escolha o modelo do assistente.">
            {modelSuggestions.length > 0 ? (
              <Select value={form.model || ''} onChange={(e) => patch({ model: e.target.value })}>
                <option value="" disabled>— escolher um modelo —</option>
                {modelSuggestions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                {form.model && !modelSuggestions.some((m) => m.value === form.model) && (
                  <option value={form.model}>{form.model} (atual)</option>
                )}
              </Select>
            ) : (
              // Provider sem lista curada: cai no identificador livre (raro).
              <TextInput value={form.model} onChange={(e) => patch({ model: e.target.value })} placeholder="gpt-4o-mini" />
            )}
          </FormField>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FormField label="Criatividade" hint="0 = direto ao ponto; 1 = mais criativo.">
              <NumberInput value={form.temperature} onChange={(v) => patch({ temperature: v })} min={0} max={2} step={0.1} />
            </FormField>
            <FormField label="Máx. de passos" hint="Quantas ações a IA encadeia por resposta.">
              <NumberInput value={form.max_steps} onChange={(v) => patch({ max_steps: v })} min={1} max={20} step={1} />
            </FormField>
            <FormField label="Máx. de tokens (opcional)">
              <NumberInput value={form.max_tokens} onChange={(v) => patch({ max_tokens: v })} allowEmpty min={1} step={1} />
            </FormField>
          </div>

          {profiles.length > 0 && (
            <FormField label="Memória" hint="Perfis de memória que o assistente usa (contato, sessão…).">
              <MultiSelectList
                items={profiles}
                selected={form.memory_profile_ids}
                onToggle={(id) => toggleIn('memory_profile_ids', id)}
                getId={(p) => p.id}
                renderTitle={(p) => p.name}
                renderSub={(p) => `escopo: ${p.scope}`}
                empty="Nenhum perfil de memória."
              />
            </FormField>
          )}

          <div className="pt-2" style={{ borderTop: '1px solid var(--ap-border)' }}>
            <FormField label="Instruções adicionais (avançado)" hint="Texto livre acrescentado ao roteiro. Deixe em branco se montou tudo em 'O que faz'.">
              <Textarea rows={4} value={form.system_prompt} onChange={(e) => patch({ system_prompt: e.target.value })} placeholder="Instruções extras para casos que o roteiro não cobre…" />
            </FormField>
          </div>

          <div className="pt-2" style={{ borderTop: '1px solid var(--ap-border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2 mt-2" style={{ color: 'var(--ap-text-4)' }}>Limites de segurança</p>
            <FormField label="Custo máximo por conversa (US$)" hint="Se ultrapassar, a execução para. Vazio = sem limite.">
              <NumberInput value={form.guardrails.max_cost_usd_per_run} onChange={(v) => patchGuard({ max_cost_usd_per_run: v })} allowEmpty min={0} step={0.01} />
            </FormField>
            <FormField label="Palavras bloqueadas (uma por linha)" hint="Respostas com estes termos são bloqueadas.">
              <Textarea rows={2} value={(form.guardrails.blocked_words || []).join('\n')} onChange={(e) => patchGuard({ blocked_words: linesToArr(e.target.value) })} />
            </FormField>
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-1" style={{ color: 'var(--ap-text-2)' }}>
              <input type="checkbox" checked={form.guardrails.pii_redact} onChange={(e) => patchGuard({ pii_redact: e.target.checked })} className="w-4 h-4 accent-current" />
              Ocultar dados pessoais nas respostas
            </label>
          </div>
        </div>
      )}

    </Modal>
  );
}

function TestTab({ agentId, canExecute }) {
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(null);

  if (!agentId) {
    return (
      <p className="text-xs py-6 text-center" style={{ color: 'var(--ap-text-4)' }}>
        Salve o assistente para habilitar o teste.
      </p>
    );
  }
  if (!canExecute) {
    return (
      <p className="text-xs py-6 text-center" style={{ color: 'var(--ap-text-4)' }}>
        Você não tem permissão para testar assistentes.
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
          Escreva uma mensagem como se fosse o cliente. Ex.: "minha internet caiu".
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

function MultiSelectList({ items, selected, onToggle, getId, renderTitle, renderSub, empty, isDisabled }) {
  const set = useMemo(() => new Set(selected || []), [selected]);
  if (!items.length) return <p className="text-xs py-4 text-center" style={{ color: 'var(--ap-text-4)' }}>{empty}</p>;
  return (
    <div className="space-y-1.5">
      {items.map((it) => {
        const id = getId(it);
        const on = set.has(id);
        const disabled = isDisabled ? isDisabled(it) : false;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onToggle(id)}
            className="w-full text-left rounded-lg p-2.5 flex items-center gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:bg-brand/5"
            style={{ border: `1px solid ${on ? 'var(--ap-accent, #6366f1)' : 'var(--ap-border)'}` }}
            title={disabled ? 'Requer a permissão “Conceder à IA ações que gravam dados”.' : undefined}
          >
            <input type="checkbox" readOnly checked={on} disabled={disabled} className="w-4 h-4 accent-current shrink-0" />
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

function emojisToUi(persona) {
  if (typeof persona?.emojis_ui === 'string' && persona.emojis_ui) return persona.emojis_ui;
  if (persona?.emojis === true) return 'moderado';
  if (persona?.emojis === false) return 'nenhum';
  return '';
}

function hydrateRoteiro(agent) {
  const r = agent.roteiro && typeof agent.roteiro === 'object' ? agent.roteiro : {};
  const passos = Array.isArray(r.passos) ? r.passos.map((p) => ({ titulo: p?.titulo || '', descricao: p?.descricao || '' })) : [];
  const situacoes = Array.isArray(r.situacoes) ? r.situacoes.map((s) => ({ quando: s?.quando || '', faca: s?.faca || '' })) : [];
  // Objetivo: usa o do roteiro; se vazio, herda o `goal` legado (migração suave).
  const objetivo = (typeof r.objetivo === 'string' && r.objetivo) || agent.goal || '';
  return { objetivo, passos, situacoes };
}

function hydrate(agent) {
  if (!agent) return { ...EMPTY, roteiro: { objetivo: '', passos: [], situacoes: [] }, persona: { ...EMPTY.persona }, guardrails: { ...EMPTY.guardrails } };
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
    roteiro: hydrateRoteiro(agent),
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
