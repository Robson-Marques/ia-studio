import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen, PageHeader, Tabs, Card, FormGrid, Field, Input, Select, NumericInput, TextArea, Button, Checkbox, CheckGroup, Badge, EmptyState, useToast, Spinner } from '@studio-ux-ds/react';
import {
  getAgent, createAgent, updateAgent, saveAgentVersion, executeAgent,
  exportAgent, listAgentVersions, listAgentRuns,
  listTools, listKnowledgeBases, listMemoryProfiles,
} from '../../services/ai';
import { listConnections, listCodexModels } from '../../services/integrations';
import { usePermissions } from '../../hooks/usePermissions';
import {
  AGENT_MODELS, PERSONA_TONES, PERSONA_EMOJIS, PERSONA_BREVITY,
  RUN_STATUS, formatTokens, formatUsd,
} from './ia.constants';
import { statusToTone } from '../../lib/tone';
import AgentVersionsModal from './editor/AgentVersionsModal';
import ContentReviewTab from './editor/ContentReviewTab';

// IA/AgenteEditor — editor de assistente (v0.9.90).
//
// Rotas: /ia/agentes/nova  ·  /ia/agentes/:id
//
// Era `editor/AgentEditorModal.jsx`: um Modal `size="xl"` com 8 abas e ~12
// TextArea dentro (persona sempre/nunca, objetivo, descrição de cada passo,
// "faça" de cada situação, instruções adicionais, palavras bloqueadas, mensagem
// de teste). O caso mais extremo da regra do Modal do DS (v1.2.12): a pessoa
// escreve a personalidade e o roteiro inteiro de um atendente — trabalho de
// composição longo — atrás de um scrim, sem ver nada do resto do sistema.
//
// Consolidações desta migração:
//  · A aba **Testar** absorveu o `AgentExecuteModal` (que a lista abria pelo
//    botão ▶ da linha). Eram DUAS UIs de teste no código; agora é uma. Por isso
//    a rota é `ai.agents.read` com o Salvar gateado por `ai.agents.write` —
//    quem só tem `execute` continua conseguindo testar.
//  · **Versões** e **Exportar** saíram da linha da lista e vivem no cabeçalho
//    daqui (regra do STUDIO_UX_TABLES.md §3: ação secundária desce pra tela de
//    destino, onde tem contexto).
//  · O checkbox "Salvar como nova versão" saiu do rodapé do modal e ficou junto
//    da "Nota da versão", na aba Visão geral — é onde ele faz sentido.
//  · `AgentVersionsModal` **segue Modal**: não tem campo nenhum (lista de
//    versões + publicar/rollback), então respeita a regra.

// 5 abas (porte da direção do Aquapark). "O que pode fazer" (ferramentas) foi
// dobrado em "O que faz"; "Ajustes avançados" virou seção recolhível em "Visão
// geral"; "Quem atende" (era um placeholder sem campos) saiu.
const TABS = [
  { id: 'visao',  label: 'Visão geral' },
  { id: 'quem',   label: 'Quem é' },
  { id: 'faz',    label: 'O que faz' },
  { id: 'sabe',   label: 'O que sabe' },
  { id: 'revisao', label: 'Revisão' },
  { id: 'testar', label: 'Testar' },
];

const EMPTY = {
  name: '', description: '', connection_id: '', model: '',
  temperature: 0.3, max_steps: 6, max_tokens: '',
  system_prompt: '', goal: '',
  roteiro: { objetivo: '', passos: [], situacoes: [] },
  persona: { name: '', tone: '', emojis: false, emojis_ui: '', brevity: 'medium', rules_always: [], rules_never: [] },
  allowed_tools: [], knowledge_base_ids: [], memory_profile_ids: [], action_permissions: [],
  guardrails: { max_cost_usd_per_run: '', blocked_words: [], pii_redact: false },
  conversation: { auto_reply: false, debounce_seconds: 12, split_paragraphs: false, supervised: false },
};

export default function AgenteEditor() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();

  const canWrite = can('ai.agents.write');
  const canExecute = can('ai.agents.execute');
  // Conceder habilidades que gravam dados exige permissão (anti-escalada).
  const canActions = can('ai.agents.actions');

  const isEdit = !!routeId;
  const [savedId, setSavedId] = useState(routeId || null);
  const [agentName, setAgentName] = useState('');
  // Guardado só para o AgentVersionsModal saber qual versão está em uso (e o que
  // é "voltar para" vs "publicar"). Sem isto o badge "Em uso" nunca aparece.
  const [currentVersion, setCurrentVersion] = useState(0);
  const [tab, setTab] = useState('visao');
  const [advExpanded, setAdvExpanded] = useState(false);
  const [technicalExpanded, setTechnicalExpanded] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [saveVersion, setSaveVersion] = useState(true);
  const [note, setNote] = useState('');

  const [connections, setConnections] = useState([]);
  const [codexModels, setCodexModels] = useState([]);
  const [loadingCodexModels, setLoadingCodexModels] = useState(false);
  const [tools, setTools] = useState([]);
  const [bases, setBases] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);

  // Carrega o assistente (quando é edição).
  useEffect(() => {
    if (!isEdit) { setForm(hydrate(null)); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const full = await getAgent(routeId);
        if (!alive) return;
        setAgentName(full.name || '');
        setCurrentVersion(full.current_version ?? 0);
        setForm(hydrate(full));
        setSavedId(full.id);
      } catch (err) {
        if (!alive) return;
        toast.error(err.message);
        navigate('/ia/agentes', { replace: true });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [routeId, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Relê só os metadados de versão (após salvar nova versão ou publicar/reverter).
  // Não re-hidrata o form — o usuário pode ter edições não salvas na tela.
  async function refreshVersionMeta(idToRead) {
    try {
      const full = await getAgent(idToRead);
      setCurrentVersion(full.current_version ?? 0);
    } catch { /* silencioso: é metadado de apoio, não bloqueia o fluxo */ }
  }

  // Carrega as listas de referência (conexões, habilidades, bases, memória).
  useEffect(() => {
    let alive = true;
    setLoadingRefs(true);
    Promise.all([
      listConnections({ category: 'AI' }).then((r) => r.items).catch(() => listConnections().then((r) => r.items).catch(() => [])),
      listTools().then((r) => r.items).catch(() => []),
      listKnowledgeBases().then((r) => r.items).catch(() => []),
      listMemoryProfiles().then((r) => r.items).catch(() => []),
    ])
      .then(([conns, tls, bs, prs]) => {
        if (!alive) return;
        setConnections(conns); setTools(tls); setBases(bs); setProfiles(prs);
      })
      .finally(() => { if (alive) setLoadingRefs(false); });
    return () => { alive = false; };
  }, []);

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));
  const patchPersona = (p) => setForm((prev) => ({ ...prev, persona: { ...prev.persona, ...p } }));
  const patchGuard = (p) => setForm((prev) => ({ ...prev, guardrails: { ...prev.guardrails, ...p } }));
  const patchRoteiro = (p) => setForm((prev) => ({ ...prev, roteiro: { ...prev.roteiro, ...p } }));
  const patchConversation = (p) => setForm((prev) => ({ ...prev, conversation: { ...prev.conversation, ...p } }));

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

  const toggleIn = (field, itemId) => setForm((prev) => {
    const set = new Set(prev[field] || []);
    if (set.has(itemId)) set.delete(itemId); else set.add(itemId);
    return { ...prev, [field]: [...set] };
  });

  const providerKey = useMemo(() => {
    const conn = connections.find((c) => c.id === form.connection_id);
    return (conn?.provider_key || '').toLowerCase();
  }, [connections, form.connection_id]);
  // Todos os provedores suportados apresentam opções selecionáveis.
  // Conexões OpenAI-compatible sem catálogo próprio reutilizam as sugestões
  // OpenAI; nunca misturar IDs de API na conexão da conta ChatGPT (Codex CLI).
  const modelSuggestions = providerKey === 'codex-cli'
    ? (codexModels.length ? codexModels : AGENT_MODELS['codex-cli'])
    : (AGENT_MODELS[providerKey] || AGENT_MODELS.openai);

  useEffect(() => {
    if (providerKey !== 'codex-cli' || !form.connection_id) {
      setCodexModels([]);
      setLoadingCodexModels(false);
      return undefined;
    }
    let active = true;
    setCodexModels([]);
    setLoadingCodexModels(true);
    listCodexModels(form.connection_id)
      .then((res) => {
        if (active) setCodexModels(Array.isArray(res?.models) ? res.models : []);
      })
      .catch(() => { if (active) setCodexModels([]); })
      .finally(() => { if (active) setLoadingCodexModels(false); });
    return () => { active = false; };
  }, [providerKey, form.connection_id]);
  const currentConnection = connections.find((c) => c.id === form.connection_id);
  const isCodex = providerKey === 'codex-cli';
  const currentModelKnown = modelSuggestions.some((m) => m.value === form.model);

  function selectAiConnection(id) {
    const selected = connections.find((c) => c.id === id);
    const key = selected?.provider_key?.toLowerCase() || '';
    const choices = AGENT_MODELS[key] || AGENT_MODELS.openai;
    // Trocar de API OpenAI para conta Codex precisa remover o ID de modelo
    // da API, pois o Codex CLI aceita "default" sem --model.
    const model = key === 'codex-cli'
      ? 'default'
      : (choices.some((item) => item.value === form.model)
        ? form.model : (choices[0]?.value || ''));
    patch({ connection_id: id, model });
  }

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
    if (!canWrite) { toast.error('Sem permissão.'); return; }
    if (!form.name.trim()) { toast.error('Dê um nome ao assistente (aba "Visão geral").'); setTab('visao'); return; }
    if (!form.model.trim()) { toast.error('Selecione o modelo na Visão geral.'); setTab('visao'); return; }
    if (form.connection_id && currentConnection?.status !== 'ACTIVE') {
      toast.error('A conexão escolhida ainda não está ativa. Conecte ou teste a conta antes de salvar.');
      setTab('visao');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        connection_id: form.connection_id || null,
        model: form.model.trim(),
        temperature: form.temperature,
        max_steps: form.max_steps,
        max_tokens: toNullable(form.max_tokens),
        system_prompt: form.system_prompt.trim() || undefined,
        goal: form.roteiro.objetivo.trim() || undefined, // objetivo do roteiro alimenta o goal legado
        roteiro: buildRoteiro(),
        persona: buildPersona(),
        allowed_tools: form.allowed_tools,
        knowledge_base_ids: form.knowledge_base_ids,
        memory_profile_ids: form.memory_profile_ids,
        action_permissions: form.action_permissions,
        guardrails: {
          ...form.guardrails,
          max_cost_usd_per_run: toNullable(form.guardrails.max_cost_usd_per_run),
        },
        conversation: {
          auto_reply: !!form.conversation.auto_reply,
          // Clampa 1..120; vazio/NaN volta pro padrão 12.
          debounce_seconds: Math.min(120, Math.max(1, Number(form.conversation.debounce_seconds) || 12)),
          split_paragraphs: !!form.conversation.split_paragraphs,
          supervised: !!form.conversation.supervised,
        },
      };
      let saved;
      if (savedId) saved = await updateAgent(savedId, body);
      else saved = await createAgent(body);

      const id = saved?.id || savedId;
      setSavedId(id);
      setAgentName(saved?.name || form.name.trim());

      if (saveVersion && id) {
        const res = await saveAgentVersion(id, { note: note.trim() || undefined });
        toast.success(`Assistente salvo — versão v${res?.version ?? ''} gerada.`);
        await refreshVersionMeta(id);
      } else {
        toast.success('Assistente salvo.');
      }
      setNote('');

      // Criação: passa a ser edição da rota do assistente novo (sem recarregar
      // a página), pra habilitar Testar/Versões/Exportar imediatamente.
      if (!isEdit && id) navigate(`/ia/agentes/${id}`, { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function openVersions() {
    try {
      const { items: vs } = await listAgentVersions(savedId);
      setVersions(vs);
      setVersionsOpen(true);
    } catch (err) { toast.error(err.message); }
  }

  async function handleExport() {
    try {
      const data = await exportAgent(savedId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agente-${(agentName || 'export').toLowerCase().replace(/\s+/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Assistente exportado (sem segredos).');
    } catch (err) { toast.error(err.message); }
  }

  if (loading) {
    return (
      <Screen as="div" className="space-y-6">
        <PageHeader title="Carregando…" />
        <Spinner size="lg" center />
      </Screen>
    );
  }

  return (
    <Screen as="div" className="space-y-6">
      <PageHeader
        title={isEdit ? (agentName || 'Assistente') : 'Novo assistente'}
        subtitle="Quem atende: personalidade, o que faz, o que sabe e o que pode fazer."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/ia/agentes')} disabled={saving}>
              Voltar
            </Button>
            {savedId && (
              <>
                <Button variant="secondary" icon="refresh" title="Histórico de versões — publicar ou voltar a uma anterior" onClick={openVersions}>
                  Versões
                </Button>
                <Button variant="secondary" icon="download" title="Baixar a configuração deste assistente (sem segredos)" onClick={handleExport}>
                  Exportar
                </Button>
              </>
            )}
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

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {loadingRefs && (
        <div className="flex justify-center py-2">
          <Spinner />
        </div>
      )}

      {tab === 'visao' && (
        <div className="space-y-4">
          <Card>
            <div style={{ padding: 20 }} className="space-y-3">
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                Pronto para publicar?
              </h2>
              <div className="space-y-1.5">
                {readiness.map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center gap-2"
                    style={{ fontSize: 14, color: r.ok ? 'var(--su-text-primary)' : 'var(--su-text-muted)' }}
                  >
                    <span aria-hidden="true" style={{ color: r.ok ? 'var(--su-success)' : 'var(--su-text-muted)' }}>
                      {r.ok ? '✓' : '○'}
                    </span>
                    {r.label}
                    {r.optional && <span style={{ fontSize: 11, color: 'var(--su-text-muted)' }}>(opcional)</span>}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
                Preencha <strong>Quem é</strong> e <strong>O que faz</strong>, ligue <strong>O que sabe</strong> e{' '}
                <strong>O que pode fazer</strong>, e teste.
              </p>
            </div>
          </Card>

          <Card>
            <div style={{ padding: 20 }} className="space-y-4">
              <Field label="Nome do assistente" hint="Nome interno, na sua lista de assistentes.">
                <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex.: Atendimento" />
              </Field>
              <Field label="Descrição" hint="Para que serve este assistente.">
                <TextArea rows={3} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
              </Field>

              <div className="space-y-3" style={{ borderTop: '1px solid var(--su-border-default)', paddingTop: 16 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                  Inteligência artificial
                </h2>
                <p style={{ fontSize: 12, color: 'var(--su-text-secondary)', margin: 0 }}>
                  Escolha a conta que vai responder e qual modelo ela utilizará.
                  Você não precisa preencher códigos ou parâmetros técnicos.
                </p>
                <Field label="Conta de IA" hint="Selecione uma conexão ativa em Integrações.">
                  <Select value={form.connection_id} onChange={(e) => selectAiConnection(e.target.value)}>
                    <option value="">Selecionar automaticamente uma conexão de API</option>
                    {connections
                      .filter((c) => c.status === 'ACTIVE' || c.id === form.connection_id)
                      .map((c) => (
                        <option key={c.id} value={c.id} disabled={c.status !== 'ACTIVE'}>
                          {c.name}{c.status !== 'ACTIVE' ? ' — precisa conectar' : ''}
                        </option>
                      ))}
                  </Select>
                </Field>
                {isCodex && (
                  <p style={{ fontSize: 12, color: 'var(--su-text-secondary)', margin: 0 }}>
                    Esta conexão usa a conta ChatGPT autenticada pelo Codex CLI, sem chave de API.
                  </p>
                )}
                <Field label="Modelo de IA" hint={isCodex
                  ? 'O Codex usa o modelo padrão disponível para a conta conectada.'
                  : 'Escolha uma opção da lista. A disponibilidade depende da conexão contratada.'}>
                  <Select value={form.model || ''} onChange={(e) => patch({ model: e.target.value })}>
                    <option value="" disabled>Selecione um modelo</option>
                    {modelSuggestions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    {form.model && !currentModelKnown && (
                      <option value={form.model}>{form.model} — configuração atual</option>
                    )}
                  </Select>
                </Field>
                {isCodex && loadingCodexModels && (
                  <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
                    Consultando modelos disponíveis nesta conta…
                  </p>
                )}
                {isCodex && !loadingCodexModels && modelSuggestions.length === 1 && (
                  <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
                    O catálogo de modelos não está disponível nesta instalação.
                    A opção “Padrão da conta” continua funcionando sem configurar um ID manualmente.
                  </p>
                )}
                {isCodex && form.model && form.model !== 'default' && (
                  <p style={{ fontSize: 12, color: 'var(--su-warning, var(--su-text-secondary))', margin: 0 }}>
                    Este assistente ainda usa um identificador de modelo antigo. Selecione
                    “Padrão da conta ChatGPT” para evitar incompatibilidade com o Codex CLI.
                  </p>
                )}
              </div>

              <Checkbox
                id="agent-save-version"
                label="Salvar como nova versão"
                checked={saveVersion}
                onChange={(e) => setSaveVersion(e.target.checked)}
              />
              {saveVersion && (
                <Field label="Nota da versão" hint="O que mudou nesta edição (aparece no histórico de versões).">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: ajusta o tom e adiciona a 2ª via de boleto" />
                </Field>
              )}
            </div>
          </Card>

          {/* Ajustes avançados: modelo, criatividade, memória e salvaguardas —
              recolhidos por padrão (a maioria não precisa mexer). */}
          <Button variant="ghost" size="sm" icon={advExpanded ? 'chevron-down' : 'chevron-right'} onClick={() => setAdvExpanded((v) => !v)}>
            Ajustes avançados
          </Button>
        </div>
      )}

      {tab === 'quem' && (
        <div className="space-y-4">
        <Card>
          <div style={{ padding: 20 }} className="space-y-4">
            <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
              Como o assistente se apresenta e se comporta na conversa.
            </p>
            <FormGrid columns={2}>
              <Field label="Nome que o assistente usa" hint="Como ele se apresenta. Vazio = sem nome.">
                <Input value={form.persona.name || ''} onChange={(e) => patchPersona({ name: e.target.value })} placeholder="Ex.: Luan" />
              </Field>
              <Field label="Tom de voz">
                <Select value={form.persona.tone || ''} onChange={(e) => patchPersona({ tone: e.target.value })}>
                  {PERSONA_TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Emojis">
                <Select value={form.persona.emojis_ui || ''} onChange={(e) => patchPersona({ emojis_ui: e.target.value })}>
                  {PERSONA_EMOJIS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Tamanho das respostas">
                <Select value={form.persona.brevity || ''} onChange={(e) => patchPersona({ brevity: e.target.value })}>
                  {PERSONA_BREVITY.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </Field>
            </FormGrid>
            <Field label="Sempre (uma regra por linha)" hint="O que o assistente deve sempre fazer.">
              <LinesTextArea
                rows={4}
                value={form.persona.rules_always}
                onChange={(arr) => patchPersona({ rules_always: arr })}
                placeholder={'Confirmar o nome do cliente\nResponder em português'}
              />
            </Field>
            <Field label="Nunca (uma regra por linha)" hint="O que ele nunca deve fazer.">
              <LinesTextArea
                rows={4}
                value={form.persona.rules_never}
                onChange={(arr) => patchPersona({ rules_never: arr })}
                placeholder={'Prometer prazos sem confirmação\nInventar valores'}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <div style={{ padding: 20 }} className="space-y-4">
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>Como conversa</p>
            <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
              Como o assistente conduz a conversa no WhatsApp. Vale quando ele está vinculado a um número (em WhatsApp → Números).
            </p>
            <Checkbox
              id="conv-auto-reply"
              label="Atender automaticamente (responder sozinho as mensagens recebidas)"
              checked={!!form.conversation.auto_reply}
              onChange={(e) => patchConversation({ auto_reply: e.target.checked })}
            />
            <FormGrid columns={2}>
              <Field label="Espera antes de responder (segundos)" hint="Junta as mensagens enviadas em sequência antes de responder. Padrão 12, máximo 120.">
                <NumericInput
                  value={form.conversation.debounce_seconds}
                  onChange={(v) => patchConversation({ debounce_seconds: v })}
                  min={1}
                  max={120}
                  step={1}
                  fullWidth
                />
              </Field>
            </FormGrid>
            <Checkbox
              id="conv-split"
              label="Quebrar a resposta em parágrafos curtos (bolhas separadas)"
              checked={!!form.conversation.split_paragraphs}
              onChange={(e) => patchConversation({ split_paragraphs: e.target.checked })}
            />
            <Checkbox
              id="conv-supervised"
              label="Modo supervisionado (atende sozinho enquanto não houver atendente humano)"
              checked={!!form.conversation.supervised}
              onChange={(e) => patchConversation({ supervised: e.target.checked })}
            />
          </div>
        </Card>
        </div>
      )}

      {tab === 'faz' && (
        <div className="space-y-4">
          <Card>
            <div style={{ padding: 20 }} className="space-y-3">
              <Field label="Objetivo" hint="O que este assistente deve alcançar.">
                <TextArea
                  rows={3}
                  value={form.roteiro.objetivo}
                  onChange={(e) => patchRoteiro({ objetivo: e.target.value })}
                  placeholder="Identificar o cliente e resolver dúvidas de conexão e financeiro."
                />
              </Field>
              <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
                Monte o roteiro que o assistente segue — sem escrever texto corrido. Os <strong>Passos</strong> são
                feitos na ordem; as <strong>Situações</strong> só acontecem quando a condição ocorre.
              </p>
            </div>
          </Card>

          <Card>
            <div style={{ padding: 20 }} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                  Passos (na ordem)
                </h2>
                <Button variant="secondary" size="sm" icon="plus" onClick={addPasso}>Adicionar passo</Button>
              </div>
              {(form.roteiro.passos || []).length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--su-text-muted)', textAlign: 'center', padding: '12px 0', margin: 0 }}>
                  Nenhum passo ainda. O assistente vai agir livremente pelo objetivo e pela personalidade.
                </p>
              ) : (
                <div className="space-y-2">
                  {(form.roteiro.passos || []).map((p, i) => (
                    <div key={i} style={{ border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12 }} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 12, fontWeight: 600, flexShrink: 0, color: 'var(--su-action)' }}>
                          Passo {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <Input
                            value={p.titulo || ''}
                            onChange={(e) => setPasso(i, { titulo: e.target.value })}
                            placeholder="Título do passo (ex.: Identificar o cliente)"
                          />
                        </div>
                        <Button variant="ghost" size="sm" icon="chevron-up" aria-label="Subir" disabled={i === 0} onClick={() => movePasso(i, -1)} />
                        <Button variant="ghost" size="sm" icon="chevron-down" aria-label="Descer" disabled={i === form.roteiro.passos.length - 1} onClick={() => movePasso(i, 1)} />
                        <Button variant="ghost" size="sm" icon="trash" aria-label="Remover passo" onClick={() => delPasso(i)} />
                      </div>
                      <TextArea
                        rows={2}
                        value={p.descricao || ''}
                        onChange={(e) => setPasso(i, { descricao: e.target.value })}
                        placeholder="O que o assistente faz neste passo."
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div style={{ padding: 20 }} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                  Situações (Quando… faça…)
                </h2>
                <Button variant="secondary" size="sm" icon="plus" onClick={addSituacao}>Adicionar situação</Button>
              </div>
              {(form.roteiro.situacoes || []).length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--su-text-muted)', textAlign: 'center', padding: '12px 0', margin: 0 }}>
                  Nenhuma situação. Ex.: "quando o acesso estiver bloqueado por falta de pagamento, ofereça a 2ª via".
                </p>
              ) : (
                <div className="space-y-2">
                  {(form.roteiro.situacoes || []).map((s, i) => (
                    <div key={i} style={{ border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12 }} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 12, fontWeight: 600, flexShrink: 0, color: 'var(--su-text-muted)' }}>
                          Quando
                        </span>
                        <div className="flex-1 min-w-0">
                          <Input
                            value={s.quando || ''}
                            onChange={(e) => setSituacao(i, { quando: e.target.value })}
                            placeholder="a condição acontecer (ex.: o cliente pedir cancelamento)"
                          />
                        </div>
                        <Button variant="ghost" size="sm" icon="trash" aria-label="Remover situação" onClick={() => delSituacao(i)} />
                      </div>
                      <TextArea
                        rows={2}
                        value={s.faca || ''}
                        onChange={(e) => setSituacao(i, { faca: e.target.value })}
                        placeholder="…faça isto."
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === 'sabe' && (
        <Card>
          <div style={{ padding: 20 }} className="space-y-3">
            <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
              Bases de conhecimento que o assistente consulta para responder.
            </p>
            <MultiSelectList
              items={bases}
              selected={form.knowledge_base_ids}
              onToggle={(itemId) => toggleIn('knowledge_base_ids', itemId)}
              getId={(b) => b.id}
              renderTitle={(b) => b.name}
              renderSub={(b) => `${b.document_count ?? b.documents?.length ?? 0} documento(s)`}
              empty="Nenhuma base de conhecimento criada ainda."
            />
          </div>
        </Card>
      )}

      {tab === 'faz' && (
        <Card>
          <div style={{ padding: 20 }} className="space-y-3">
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
              O que pode fazer
            </h2>
            <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
              Marque as habilidades do assistente. As marcadas com <Badge tone="warning">grava dados</Badge> mudam ou
              registram algo no sistema.
            </p>
            {!canActions && (
              <p style={{ fontSize: 12, color: 'var(--su-text-secondary)', border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12, margin: 0 }}>
                Você só pode marcar habilidades de <strong>consulta</strong>. As que <em>gravam dados</em> exigem a
                permissão “Conceder à IA ações que gravam dados”.
              </p>
            )}
            <MultiSelectList
              items={tools}
              selected={form.allowed_tools}
              onToggle={(itemId) => toggleIn('allowed_tools', itemId)}
              getId={(t) => t.key}
              renderTitle={(t) => t.name}
              isDisabled={(t) => t.requires_approval && !canActions && !form.allowed_tools.includes(t.key)}
              disabledHint="Requer a permissão “Conceder à IA ações que gravam dados”."
              renderSub={(t) => (
                <>
                  {t.requires_approval && <Badge tone="warning">grava dados</Badge>}
                  {t.is_active === false && <Badge tone="neutral">desligada</Badge>}
                  <span>{t.category || 'geral'}</span>
                </>
              )}
              empty="Nenhuma habilidade disponível no catálogo."
            />
          </div>
        </Card>
      )}

      {tab === 'revisao' && <ContentReviewTab agentId={savedId} canReview={canWrite} />}

      {tab === 'testar' && <TestTab agentId={savedId} canExecute={canExecute} />}

      {tab === 'visao' && advExpanded && (
        <div className="space-y-4">
          <Card>
            <div style={{ padding: 20 }} className="space-y-4">
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                Preferências de atendimento
              </h2>
              <p style={{ fontSize: 12, color: 'var(--su-text-secondary)', margin: 0 }}>
                Os padrões já funcionam para a maioria dos assistentes. Ajuste somente se necessário.
              </p>
              <FormGrid columns={isCodex ? 1 : 2}>
                <Field label="Profundidade do atendimento"
                  hint="Controla quantas etapas de análise e uso de ferramentas o assistente pode realizar antes de responder.">
                  <Select value={String(form.max_steps)} onChange={(e) => patch({ max_steps: Number(e.target.value) })}>
                    <option value="4">Simples — até 4 etapas</option>
                    <option value="6">Equilibrado — até 6 etapas (padrão)</option>
                    <option value="10">Detalhado — até 10 etapas</option>
                    <option value="15">Investigação extensa — até 15 etapas</option>
                    {![4, 6, 10, 15].includes(Number(form.max_steps)) && (
                      <option value={String(form.max_steps)}>Personalizado — {form.max_steps} etapas</option>
                    )}
                  </Select>
                </Field>
                {!isCodex && (
                  <Field label="Estilo das respostas" hint="Define o equilíbrio entre respostas objetivas e variedade de linguagem.">
                    <Select value={String(form.temperature)} onChange={(e) => patch({ temperature: Number(e.target.value) })}>
                      <option value="0.2">Objetivo e consistente</option>
                      <option value="0.3">Equilibrado (padrão)</option>
                      <option value="0.6">Mais flexível</option>
                      <option value="1">Mais criativo</option>
                      {![0.2, 0.3, 0.6, 1].includes(Number(form.temperature)) && (
                        <option value={String(form.temperature)}>Personalizado — {form.temperature}</option>
                      )}
                    </Select>
                  </Field>
                )}
              </FormGrid>
              <Button variant="ghost" size="sm" icon={technicalExpanded ? 'chevron-down' : 'chevron-right'}
                onClick={() => setTechnicalExpanded((v) => !v)}>
                Opções técnicas (uso avançado)
              </Button>
              {technicalExpanded && (
                <div className="space-y-3" style={{ borderTop: '1px solid var(--su-border-default)', paddingTop: 12 }}>
                  {!isCodex && (
                    <Field label="Limite de saída (tokens)"
                      hint="Limita o tamanho da resposta gerada pela API. Em branco, usa o padrão do modelo.">
                      <NumericInput value={form.max_tokens} onChange={(v) => patch({ max_tokens: v })}
                        min={1} step={1} fullWidth />
                    </Field>
                  )}
                  {isCodex && (
                    <p style={{ fontSize: 12, color: 'var(--su-text-secondary)', margin: 0 }}>
                      O Codex gerencia automaticamente o tamanho da resposta e o estilo de geração.
                      Essas configurações não precisam ser preenchidas.
                    </p>
                  )}
                  {!isCodex && (
                    <Field label="Modelo personalizado (somente para integração técnica)"
                      hint="Altera o ID do modelo enviado à API. Use apenas se não aparecer na lista acima.">
                      <Input value={form.model} onChange={(e) => patch({ model: e.target.value })}
                        placeholder="ID fornecido pelo provedor" />
                    </Field>
                  )}
                </div>
              )}
            </div>
          </Card>

          {profiles.length > 0 && (
            <Card>
              <div style={{ padding: 20 }} className="space-y-3">
                <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>Memória</h2>
                <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
                  Perfis de memória que o assistente usa para lembrar contexto entre mensagens.
                </p>
                <MultiSelectList
                  items={profiles}
                  selected={form.memory_profile_ids}
                  onToggle={(itemId) => toggleIn('memory_profile_ids', itemId)}
                  getId={(p) => p.id}
                  renderTitle={(p) => p.name}
                  renderSub={(p) => `escopo: ${p.scope}`}
                  empty="Nenhum perfil de memória."
                />
              </div>
            </Card>
          )}

          <Card>
            <div style={{ padding: 20 }}>
              <Field
                label="Instruções adicionais"
                hint="Texto livre acrescentado ao roteiro. Deixe em branco se montou tudo em 'O que faz'."
              >
                <TextArea
                  rows={6}
                  value={form.system_prompt}
                  onChange={(e) => patch({ system_prompt: e.target.value })}
                  placeholder="Instruções extras para casos que o roteiro não cobre…"
                />
              </Field>
            </div>
          </Card>

          <Card>
            <div style={{ padding: 20 }} className="space-y-4">
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                Limites de segurança
              </h2>
              <div style={{ maxWidth: 280 }}>
                <Field label="Custo máximo por conversa (US$)" hint="Se ultrapassar, a execução para. Vazio = sem limite.">
                  <NumericInput
                    value={form.guardrails.max_cost_usd_per_run}
                    onChange={(v) => patchGuard({ max_cost_usd_per_run: v })}
                    min={0}
                    step={0.01}
                    fullWidth
                  />
                </Field>
              </div>
              <Field label="Palavras bloqueadas (uma por linha)" hint="Respostas com estes termos são bloqueadas.">
                <LinesTextArea
                  rows={3}
                  value={form.guardrails.blocked_words}
                  onChange={(arr) => patchGuard({ blocked_words: arr })}
                />
              </Field>
              <Checkbox
                id="agent-pii-redact"
                label="Ocultar dados pessoais nas respostas"
                checked={form.guardrails.pii_redact}
                onChange={(e) => patchGuard({ pii_redact: e.target.checked })}
              />
            </div>
          </Card>
        </div>
      )}

      <AgentVersionsModal
        open={versionsOpen}
        agent={savedId ? { id: savedId, name: agentName, current_version: currentVersion } : null}
        versions={versions}
        onClose={() => setVersionsOpen(false)}
        onPublished={async () => {
          setVersionsOpen(false);
          if (savedId) await refreshVersionMeta(savedId);
        }}
      />
    </Screen>
  );
}

function TestTab({ agentId, canExecute }) {
  const toast = useToast();
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(null);
  const [runs, setRuns] = useState([]);

  // Histórico de execuções — antes a aba só mostrava a última. As linhas são
  // clicáveis para rever o resultado de uma execução anterior.
  async function loadRuns() {
    if (!agentId) return [];
    try {
      const { items } = await listAgentRuns(agentId, { take: 20 });
      const list = items || [];
      setRuns(list);
      return list;
    } catch { return []; }
  }

  useEffect(() => { if (agentId && canExecute) loadRuns(); }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!agentId) {
    return (
      <Card>
        <EmptyState
          icon="settings"
          title="Salve antes de testar"
          description="O teste roda contra o assistente salvo — clique em Salvar para habilitar."
        />
      </Card>
    );
  }
  if (!canExecute) {
    return (
      <Card>
        <EmptyState
          icon="lock"
          title="Sem permissão para testar"
          description="Você pode editar este assistente, mas não executá-lo."
        />
      </Card>
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
      // Recarrega o histórico e mostra a execução recém-criada (linha do banco,
      // com tokens/custo já consolidados).
      const list = await loadRuns();
      if (list.length) setRun(list[0]);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  const statusInfo = run ? (RUN_STATUS[run.status] || { label: run.status, variant: 'gray' }) : null;

  return (
    <div className="space-y-4">
      <Card>
        <div style={{ padding: 20 }} className="space-y-3">
          <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
            Escreva uma mensagem como se fosse o cliente. Ex.: "minha internet caiu".
          </p>
          <Field label="Mensagem de teste">
            <TextArea
              rows={4}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite uma mensagem de teste…"
            />
          </Field>
          <div className="flex justify-end">
            <Button variant="primary" icon="send" loading={running} onClick={handleRun}>
              {running ? 'Executando…' : 'Testar'}
            </Button>
          </div>
        </div>
      </Card>

      {run && (
        <Card>
          <div style={{ padding: 20 }} className="space-y-3">
            <div className="flex flex-wrap items-center gap-3" style={{ fontSize: 12, color: 'var(--su-text-secondary)' }}>
              {statusInfo && <Badge tone={statusToTone(statusInfo.variant)}>{statusInfo.label}</Badge>}
              {run.total_tokens != null && (
                <span>Tokens: <strong style={{ color: 'var(--su-text-primary)' }}>{formatTokens(run.total_tokens)}</strong></span>
              )}
              {run.cost_usd != null && (
                <span>Custo: <strong style={{ color: 'var(--su-text-primary)' }}>{formatUsd(run.cost_usd)}</strong></span>
              )}
            </div>
            {run.error && (
              <p style={{ fontSize: 12, color: 'var(--su-danger)', border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12, margin: 0 }}>
                {run.error}
              </p>
            )}
            {run.output && (
              <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12, margin: 0, color: 'var(--su-text-secondary)', fontFamily: 'var(--su-font-mono, monospace)' }}>
                {run.output}
              </pre>
            )}
          </div>
        </Card>
      )}

      {runs.length > 0 && (
        <Card>
          <div style={{ padding: 20 }} className="space-y-2">
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>Execuções recentes</p>
            <div style={{ border: '1px solid var(--su-border-default)', borderRadius: 8, overflow: 'hidden' }}>
              {runs.map((r, i) => {
                const info = RUN_STATUS[r.status] || { label: r.status, variant: 'gray' };
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRun(r)}
                    className="flex items-center gap-3 w-full text-left px-3 py-2"
                    style={{
                      background: run?.id === r.id ? 'var(--su-surface-hover, var(--su-surface-overlay))' : 'transparent',
                      border: 0, borderTop: i ? '1px solid var(--su-border-subtle, var(--su-border-default))' : 'none',
                      cursor: 'pointer', font: 'inherit',
                    }}
                  >
                    <Badge tone={statusToTone(info.variant)}>{info.label}</Badge>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--su-text-muted)' }}>
                      {r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : ''}
                    </span>
                    {r.total_tokens != null && (
                      <span style={{ fontSize: 12, color: 'var(--su-text-muted)' }}>{formatTokens(r.total_tokens)} tok</span>
                    )}
                    {r.cost_usd != null && (
                      <span style={{ fontSize: 12, color: 'var(--su-text-muted)' }}>{formatUsd(r.cost_usd)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function MultiSelectList({ items, selected, onToggle, getId, renderTitle, renderSub, empty, isDisabled, disabledHint }) {
  const set = useMemo(() => new Set(selected || []), [selected]);
  if (!items.length) {
    return (
      <p style={{ fontSize: 12, color: 'var(--su-text-muted)', textAlign: 'center', padding: '16px 0', margin: 0 }}>
        {empty}
      </p>
    );
  }
  // `CheckGroup` + `Checkbox variant="card"` do DS. Antes daqui isto era um
  // `<label>` com borda e `<input>` soltos montados na mão: mesma aparência, mas
  // sem foco visível, com a borda de "marcado" sincronizada por JS e o motivo do
  // desabilitado escondido num `title`. O DS assumiu os três (v1.2.20).
  // `columns="auto"`: rótulos curtos ("2ª via de boleto", "Data e hora atual") —
  // usa quantas colunas couberem, que é a densidade que o Robson aprovou.
  return (
    <CheckGroup columns="auto">
      {items.map((it) => {
        const itemId = getId(it);
        const on = set.has(itemId);
        const disabled = isDisabled ? isDisabled(it) : false;
        return (
          <Checkbox
            key={itemId}
            id={`opt-${itemId}`}
            variant="card"
            label={renderTitle(it)}
            // O motivo do bloqueio aparece NA TELA em vez de só no hover — regra
            // do DS: informação essencial não vive em tooltip.
            meta={disabled && disabledHint
              ? <><Badge tone="neutral">sem permissão</Badge>{renderSub(it)}</>
              : renderSub(it)}
            checked={on}
            disabled={disabled}
            onChange={() => !disabled && onToggle(itemId)}
          />
        );
      })}
    </CheckGroup>
  );
}

// LinesTextArea — campo "uma coisa por linha" cujo VALOR é um array.
//
// Bug que isto corrige (existia desde o legado): o campo fazia round-trip
// `array → join('\n')` no value e `split('\n') + filter(Boolean)` no onChange.
// O `filter(Boolean)` descarta linhas vazias — então, no instante em que o
// usuário aperta Enter, o valor "aa\n" virava ["aa"] e voltava como "aa". A
// quebra era apagada no mesmo keystroke e era **impossível** chegar na segunda
// linha. Valia para Sempre / Nunca / Palavras bloqueadas.
//
// Solução: o texto cru vive num state local enquanto o campo está sendo editado
// (aí a quebra sobrevive) e só é convertido para array no `blur`. O array de
// fora só re-hidrata o texto quando NÃO se está editando — assim o campo não
// briga com o valor que o pai guarda.
function LinesTextArea({ value, onChange, rows = 4, placeholder }) {
  const arr = React.useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const [text, setText] = useState(() => arr.join('\n'));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(arr.join('\n'));
  }, [arr, editing]);

  return (
    <TextArea
      rows={rows}
      value={text}
      placeholder={placeholder}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setEditing(false);
        onChange(linesToArr(text));
      }}
    />
  );
}

function toNullable(v) {
  return (v === '' || v === null || v === undefined) ? null : Number(v);
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
  if (!agent) {
    return {
      ...EMPTY,
      roteiro: { objetivo: '', passos: [], situacoes: [] },
      persona: { ...EMPTY.persona },
      guardrails: { ...EMPTY.guardrails },
    };
  }
  const persona = agent.persona || {};
  const guard = agent.guardrails || {};
  return {
    name: agent.name || '',
    description: agent.description || '',
    connection_id: agent.connection_id || '',
    model: agent.model || '',
    temperature: agent.temperature ?? 0.3,
    max_steps: agent.max_steps ?? 6,
    // '' é o valor intermediário que o NumericInput do DS usa para "vazio".
    max_tokens: agent.max_tokens ?? '',
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
    guardrails: {
      ...EMPTY.guardrails,
      ...guard,
      max_cost_usd_per_run: guard.max_cost_usd_per_run ?? '',
    },
    conversation: {
      ...EMPTY.conversation,
      ...(agent.conversation && typeof agent.conversation === 'object' ? agent.conversation : {}),
    },
  };
}
