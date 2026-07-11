// Editor VISUAL do fluxo (canvas React Flow). Porta a UX do WorkflowCanvas do
// Aquapark (paleta recolhível agrupada por categoria, inspector recolhível com
// os campos do nó renderizados inline, nó custom com handles por saída,
// auto-centralização ao adicionar) — mas alimentado pelo catálogo DECLARATIVO
// do IA Studio (getNodesCatalog) e pelo grafo { nodes:[{id,type,name,config}],
// edges:[{from,to,when}] } com a posição em config.__pos. Salvar = nova versão
// imutável (saveWorkflowVersion). Versões/publicar/rollback, dry-run e
// export/import continuam nos modais da Fase 4.
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  Handle, Position, addEdge, applyNodeChanges, applyEdgeChanges, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Download, History,
  Layers, List, Loader2, Play, Plus, Save, SlidersHorizontal, Trash2, Zap,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { FormField, TextInput, Textarea, Select, NumberInput } from '../../components/ui/FormField';
import {
  getWorkflow, getNodesCatalog, saveWorkflowVersion, listWorkflowVersions,
  exportWorkflow, listAutomationTemplates,
} from '../../services/automation';
import { listConnections } from '../../services/integrations';
import { listAgents } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { toast } from '../../lib/toast';
import { NODE_CATEGORY_ORDER } from './automation.constants';
import { StatusBadge } from './Fluxos';
import TriggerEditor from './editor/TriggerEditor';
import VersionsModal from './editor/VersionsModal';
import ExecuteModal from './editor/ExecuteModal';

// Rótulos amigáveis das saídas (handles) — o id do handle = nome do output.
const OUTPUT_LABELS = {
  success: '', // saída padrão não precisa de rótulo
  error: 'erro',
  true: 'verdadeiro',
  false: 'falso',
};
const outputLabel = (out) => (out in OUTPUT_LABELS ? OUTPUT_LABELS[out] : out);

// ─── Nó custom ───────────────────────────────────────────────
// Rótulo + id + handle de entrada (esquerda, exceto gatilhos) + um handle de
// saída por output (direita). Cores via vars do tema.
function StudioNode({ data, selected }) {
  const def = data.definition;
  const outputs = def?.outputs?.length ? def.outputs : ['success'];
  const isTrigger = def?.kind === 'trigger';
  const category = def?.category;
  return (
    <div style={{
      minWidth: 150, maxWidth: 230, borderRadius: 10, padding: '8px 12px',
      background: 'var(--ap-surface)', color: 'var(--ap-text-1)',
      border: `2px solid ${selected ? 'var(--ap-accent, #6366f1)' : 'var(--ap-border)'}`,
      fontSize: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    }}>
      {!isTrigger && <Handle type="target" position={Position.Left} style={{ background: '#64748b' }} />}
      {category && (
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ap-text-5)' }}>{category}</div>
      )}
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--ap-text-1)' }} className="truncate">
        {data.name || def?.label || 'Passo'}
      </div>
      {/* Descrição amigável em vez do tipo técnico cru (ex.: era "AGENT"). */}
      {def?.description && (
        <div style={{ color: 'var(--ap-text-5)', fontSize: 10, lineHeight: 1.25 }} className="line-clamp-2">{def.description}</div>
      )}
      {outputs.map((out, i) => (
        <Handle
          key={out} type="source" id={out} position={Position.Right}
          style={{ background: out === 'error' ? '#ef4444' : '#64748b', top: `${((i + 1) * 100) / (outputs.length + 1)}%` }}
        />
      ))}
      {outputs.some((o) => outputLabel(o)) && (
        <div style={{ position: 'absolute', right: -4, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', pointerEvents: 'none' }}>
          {outputs.map((o) => (
            <span key={o} style={{ fontSize: 8, color: o === 'error' ? '#ef4444' : 'var(--ap-text-4)', transform: 'translateX(100%)', paddingLeft: 6, whiteSpace: 'nowrap' }}>
              {outputLabel(o)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const NODE_TYPES = { studioNode: StudioNode };

// ─── Conversão grafo JSON ↔ React Flow ───────────────────────
function graphToFlow(rawGraph, defsByType) {
  const graph = rawGraph || { nodes: [], edges: [] };
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

  const rfNodes = nodes.map((n, i) => {
    const pos = n.config?.__pos;
    return {
      id: n.id,
      type: 'studioNode',
      position: pos && typeof pos.x === 'number' ? pos : { x: 160, y: 80 + i * 110 },
      data: {
        name: n.name || defsByType[n.type]?.label || n.type,
        nodeType: n.type,
        config: stripPos(n.config),
        definition: defsByType[n.type] || { type: n.type, label: n.name || n.type, outputs: ['success'], kind: 'action' },
      },
    };
  });

  const rfEdges = edges.map((e, i) => ({
    id: e.id || `e_${e.from}_${e.to}_${i}`,
    source: e.from,
    target: e.to,
    // 'when' vira o handle de saída (success = handle padrão).
    sourceHandle: e.when || 'success',
    type: 'default',
  }));

  return { rfNodes, rfEdges };
}

function flowToGraph(rfNodes, rfEdges) {
  return {
    nodes: rfNodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType,
      name: n.data.name,
      // Persiste a posição dentro do config para reidratar o canvas.
      config: { ...(n.data.config || {}), __pos: { x: Math.round(n.position.x), y: Math.round(n.position.y) } },
    })),
    edges: rfEdges.map((e) => ({
      from: e.source,
      to: e.target,
      ...(e.sourceHandle && e.sourceHandle !== 'success' ? { when: e.sourceHandle } : {}),
    })),
  };
}

function stripPos(config) {
  if (!config || typeof config !== 'object') return {};
  const { __pos, ...rest } = config; // eslint-disable-line no-unused-vars
  return rest;
}

function normalizeTrigger(raw) {
  const t = raw || {};
  return { type: t.type || 'manual', event: t.event, schedule: t.schedule };
}

// ─── Paleta recolhível (rail lateral quando fechada) ─────────
function CollapsedRail({ side, icon: Icon, label, onExpand }) {
  return (
    <div style={{
      width: 34, background: 'var(--ap-surface-2)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 8, padding: '8px 0',
      [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid var(--ap-border)',
    }}>
      <button onClick={onExpand} title={`Expandir ${label}`} className="rounded p-1"
        style={{ border: '1px solid var(--ap-border)', background: 'var(--ap-surface)', color: 'var(--ap-text-3)' }}>
        {side === 'left' ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
      <Icon size={14} style={{ color: 'var(--ap-text-4)' }} />
      <span style={{ writingMode: 'vertical-rl', fontSize: 10, letterSpacing: 1, color: 'var(--ap-text-4)', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}

// Agrupa o catálogo por categoria, na ordem oficial (não-listadas vão ao fim).
function groupByCategory(catalog) {
  const map = new Map();
  for (const def of (catalog || [])) {
    if (!map.has(def.category)) map.set(def.category, []);
    map.get(def.category).push(def);
  }
  const order = [
    ...NODE_CATEGORY_ORDER,
    ...[...map.keys()].filter((c) => !NODE_CATEGORY_ORDER.includes(c)),
  ];
  return order.filter((c) => map.has(c)).map((c) => [c, map.get(c)]);
}

// ─── Um campo do Inspector (renderiza a definição declarativa do nó) ──
// Espelha os tipos que o NodeConfigModal já entende: text/textarea/number/
// select/json/connection/template. Campo JSON usa um rascunho de texto pra
// permitir digitação livre (parse no serialize).
function InspectorField({ field, value, jsonDraft, refs, disabled, onChange, onJsonDraft }) {
  const common = { disabled };
  let control = null;
  if (field.type === 'textarea') {
    control = <Textarea rows={3} className="text-xs" value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} {...common} />;
  } else if (field.type === 'number') {
    control = <NumberInput className="text-xs" value={value ?? field.default ?? 0} onChange={(v) => onChange(v)} allowEmpty={false} {...common} />;
  } else if (field.type === 'select') {
    control = (
      <Select className="text-xs" value={value ?? field.default ?? ''} onChange={(e) => onChange(e.target.value)} {...common}>
        {(field.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    );
  } else if (field.type === 'json') {
    control = (
      <Textarea rows={4} className="font-mono text-[11px]" value={jsonDraft ?? ''} placeholder='{ "chave": "valor" }' spellCheck={false}
        onChange={(e) => onJsonDraft(e.target.value)} {...common} />
    );
  } else if (field.type === 'agent') {
    control = (
      <Select className="text-xs" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...common}>
        <option value="">— escolha um assistente —</option>
        {(refs.agents || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Select>
    );
  } else if (field.type === 'connection') {
    control = (
      <Select className="text-xs" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...common}>
        <option value="">— nenhuma —</option>
        {(refs.connections || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.provider_key})</option>)}
      </Select>
    );
  } else if (field.type === 'template') {
    control = (
      <Select className="text-xs" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...common}>
        <option value="">— nenhum —</option>
        {(refs.templates || []).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.channel})</option>)}
      </Select>
    );
  } else {
    control = <TextInput className="text-xs" value={value ?? field.default ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} {...common} />;
  }
  return (
    <FormField label={field.label} required={field.required} hint={field.help}>
      {control}
    </FormField>
  );
}

// ─── Canvas interno (dentro do ReactFlowProvider) ────────────
function FluxoCanvasInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { screenToFlowPosition } = useReactFlow();

  const [workflow, setWorkflow] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [rfNodes, setRfNodes] = useState([]);
  const [rfEdges, setRfEdges] = useState([]);
  const [trigger, setTrigger] = useState({ type: 'manual' });
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  const [selId, setSelId] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [openCat, setOpenCat] = useState(NODE_CATEGORY_ORDER[0]);
  const [jsonDrafts, setJsonDrafts] = useState({}); // { [nodeId]: { [fieldKey]: text } }
  const [refs, setRefs] = useState({ connections: [], templates: [], agents: [] });
  const [removing, setRemoving] = useState(false);

  const [triggerOpen, setTriggerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [executeOpen, setExecuteOpen] = useState(false);

  const flowWrapRef = useRef(null);

  const defsByType = useMemo(() => Object.fromEntries(catalog.map((d) => [d.type, d])), [catalog]);
  const canWrite = can('automation.workflows.write');

  async function load() {
    setLoading(true);
    try {
      const [detail, nodes] = await Promise.all([getWorkflow(id), getNodesCatalog()]);
      const dbt = Object.fromEntries((nodes.items || []).map((d) => [d.type, d]));
      const { rfNodes: rn, rfEdges: re } = graphToFlow(detail.current_graph, dbt);
      setWorkflow(detail);
      setCatalog(nodes.items || []);
      setRfNodes(rn);
      setRfEdges(re);
      setTrigger(normalizeTrigger(detail.current_trigger));
      setVersions(detail.versions || []);
      setJsonDrafts({});
      setSelId(null);
      setDirty(false);
    } catch (err) {
      toast.error(err.message);
      navigate('/automacao/fluxos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Referências (conexões/templates/assistentes) — carregadas uma vez pros campos
  // do inspector. Sem os assistentes aqui, o campo "Assistente" do nó de IA ficava
  // vazio (não dava pra escolher).
  useEffect(() => {
    if (!canWrite) return;
    Promise.allSettled([
      listConnections().then((r) => r.items),
      listAutomationTemplates().then((r) => r.items),
      listAgents().then((r) => r.items),
    ]).then(([c, t, a]) => {
      setRefs({ connections: c.value || [], templates: t.value || [], agents: a.value || [] });
    });
  }, [canWrite]);

  const onNodesChange = useCallback((changes) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds));
    if (changes.some((c) => c.type === 'position' && c.dragging === false)) setDirty(true);
  }, []);

  const onEdgesChange = useCallback((changes) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds));
    if (changes.some((c) => c.type === 'remove')) setDirty(true);
  }, []);

  const onConnect = useCallback((connection) => {
    if (!canWrite) return;
    setRfEdges((eds) => addEdge({ ...connection, sourceHandle: connection.sourceHandle ?? 'success', type: 'default' }, eds));
    setDirty(true);
  }, [canWrite]);

  function addNode(definition) {
    const base = definition.type.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const ids = new Set(rfNodes.map((n) => n.id));
    let seq = rfNodes.length + 1;
    let newId = `${base}_${seq}`;
    while (ids.has(newId)) { seq += 1; newId = `${base}_${seq}`; }
    // Nasce no CENTRO do canvas visível (respeita zoom/pan atuais).
    const rect = flowWrapRef.current?.getBoundingClientRect();
    const position = (screenToFlowPosition && rect)
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 120 + rfNodes.length * 30, y: 80 + rfNodes.length * 20 };
    setRfNodes((nds) => [...nds, {
      id: newId,
      type: 'studioNode',
      position,
      data: { name: definition.label, nodeType: definition.type, config: {}, definition },
    }]);
    setSelId(newId);
    setDirty(true);
    if (!inspectorOpen) setInspectorOpen(true);
  }

  function removeSelected() {
    if (!selId) return;
    setRfNodes((nds) => nds.filter((n) => n.id !== selId));
    setRfEdges((eds) => eds.filter((e) => e.source !== selId && e.target !== selId));
    setJsonDrafts((d) => { const next = { ...d }; delete next[selId]; return next; });
    setSelId(null);
    setRemoving(false);
    setDirty(true);
  }

  const selected = rfNodes.find((n) => n.id === selId) || null;
  const selectedDef = selected ? defsByType[selected.data.nodeType] : null;

  function setNodeName(name) {
    setRfNodes((nds) => nds.map((n) => (n.id === selId ? { ...n, data: { ...n.data, name } } : n)));
    setDirty(true);
  }

  function setField(key, value) {
    setRfNodes((nds) => nds.map((n) => {
      if (n.id !== selId) return n;
      const next = { ...(n.data.config || {}) };
      if (value === '' || value === undefined || value === null) delete next[key]; else next[key] = value;
      return { ...n, data: { ...n.data, config: next } };
    }));
    setDirty(true);
  }

  function setJsonDraft(key, text) {
    setJsonDrafts((d) => ({ ...d, [selId]: { ...(d[selId] || {}), [key]: text } }));
    setDirty(true);
  }

  // Rascunho de texto de um campo JSON do nó selecionado (lazy a partir do config).
  function jsonDraftFor(field) {
    const draftForNode = jsonDrafts[selId] || {};
    if (typeof draftForNode[field.key] === 'string') return draftForNode[field.key];
    const v = selected?.data.config?.[field.key];
    return v === undefined || v === null ? '' : JSON.stringify(v, null, 2);
  }

  // Monta o grafo aplicando os rascunhos JSON (com validação). Retorna null se inválido.
  function buildGraph() {
    const nodes = [];
    for (const n of rfNodes) {
      const def = defsByType[n.data.nodeType];
      const config = { ...(n.data.config || {}) };
      const draftForNode = jsonDrafts[n.id] || {};
      for (const f of (def?.fields || []).filter((x) => x.type === 'json')) {
        if (!(f.key in draftForNode)) continue;
        const raw = String(draftForNode[f.key] ?? '').trim();
        if (!raw) { delete config[f.key]; continue; }
        try { config[f.key] = JSON.parse(raw); } catch {
          toast.error(`Nó "${n.data.name}", campo "${f.label}": JSON inválido.`);
          return null;
        }
      }
      nodes.push({ id: n.id, type: n.data.nodeType, name: n.data.name, config });
    }
    const rfWithConfig = nodes.map((n) => {
      const orig = rfNodes.find((x) => x.id === n.id);
      return { id: n.id, position: orig.position, data: { nodeType: n.type, name: n.name, config: n.config } };
    });
    return flowToGraph(rfWithConfig, rfEdges);
  }

  async function handleSaveVersion() {
    if (!rfNodes.length) { toast.error('Adicione pelo menos um passo.'); return; }
    const graph = buildGraph();
    if (!graph) return; // JSON inválido já avisou
    setSaving(true);
    try {
      const result = await saveWorkflowVersion(id, {
        graph,
        trigger,
        note: saveNote.trim() || undefined,
      });
      toast.success(`Versão v${result.version} salva.`);
      (result.warnings || []).forEach((w) => toast.warn(w));
      setSaveOpen(false);
      setSaveNote('');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openSave() {
    // Valida os rascunhos JSON antes de abrir o modal de nota.
    if (!rfNodes.length) { toast.error('Adicione pelo menos um passo.'); return; }
    if (!buildGraph()) return;
    setSaveOpen(true);
  }

  async function openVersions() {
    try {
      const { items } = await listWorkflowVersions(id);
      setVersions(items);
      setVersionsOpen(true);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleExport() {
    try {
      const data = await exportWorkflow(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fluxo-${(workflow?.name || 'export').toLowerCase().replace(/\s+/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Fluxo exportado (sem segredos).');
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading || !workflow) {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>;
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost p-2" onClick={() => navigate('/automacao/fluxos')} aria-label="Voltar"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-[180px]">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold truncate" style={{ color: 'var(--ap-text-1)' }}>{workflow.name}</h1>
            <StatusBadge status={workflow.status} />
            {workflow.current_version > 0 && <span className="text-xs font-mono" style={{ color: 'var(--ap-text-4)' }}>v{workflow.current_version} ativa</span>}
            {dirty && <span className="text-xs" style={{ color: 'var(--ap-text-4)' }}>alterações não salvas</span>}
          </div>
          {workflow.description && <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>{workflow.description}</p>}
        </div>
        <button className="btn-secondary" onClick={() => navigate(`/automacao/fluxos/${id}/lista`)} title="Abrir o editor em modo lista">
          <List size={14} /> Lista
        </button>
        <button className="btn-secondary" onClick={() => setTriggerOpen(true)} title="Configurar o que dispara este fluxo">
          <Zap size={14} /> Gatilho
        </button>
        <button className="btn-secondary" onClick={handleExport} title="Baixar uma cópia do fluxo (sem senhas nem segredos)">
          <Download size={14} /> Exportar
        </button>
        <button className="btn-secondary" onClick={openVersions} title="Histórico de versões — publicar, reverter e comparar">
          <History size={14} /> Versões
        </button>
        {can('automation.workflows.execute') && (
          <button className="btn-secondary" onClick={() => setExecuteOpen(true)} title="Executar manualmente (com opção de simulação)">
            <Play size={14} /> Executar
          </button>
        )}
        {canWrite && (
          <button className="btn-primary" onClick={openSave} title="Salvar como uma nova versão (o histórico é preservado)">
            <Save size={14} /> Salvar versão
          </button>
        )}
      </div>

      {/* Editor: paleta + canvas + inspector */}
      <div style={{
        display: 'flex', height: 'calc(100dvh - 190px)', minHeight: 420,
        border: '1px solid var(--ap-border)', borderRadius: 12, overflow: 'hidden',
      }}>
        {/* Paleta (biblioteca de nós) */}
        {canWrite && (paletteOpen ? (
          <div style={{ width: 190, borderRight: '1px solid var(--ap-border)', background: 'var(--ap-surface-2)', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between px-2 py-1.5" style={{ borderBottom: '1px solid var(--ap-border)' }}>
              <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--ap-text-4)' }}>Biblioteca de passos</p>
              <button onClick={() => setPaletteOpen(false)} title="Recolher" className="p-0.5 rounded" style={{ color: 'var(--ap-text-4)' }}><ChevronLeft size={14} /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: 8 }}>
              {groupByCategory(catalog).map(([cat, items]) => {
                const open = openCat === cat;
                return (
                  <div key={cat} className="mb-1">
                    <button onClick={() => setOpenCat(open ? null : cat)}
                      className="w-full flex items-center justify-between px-1.5 py-1.5 rounded text-[10px] uppercase tracking-wide font-bold"
                      style={{ color: 'var(--ap-text-4)', background: open ? 'var(--ap-surface-3)' : 'transparent' }}>
                      <span>{cat}</span>
                      <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                    </button>
                    {open && (
                      <div className="pt-1 pb-1">
                        {items.map((def) => (
                          <button key={def.type} onClick={() => addNode(def)} title={def.description}
                            className="w-full text-left text-[11px] rounded px-2 py-1.5 mb-1 flex items-center gap-1"
                            style={{ background: 'var(--ap-surface)', border: '1px solid var(--ap-border)', color: 'var(--ap-text-2)', cursor: 'pointer' }}>
                            <Plus size={11} className="shrink-0" />
                            <span className="truncate">{def.label || def.type}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <CollapsedRail side="left" icon={Layers} label="Passos" onExpand={() => setPaletteOpen(true)} />
        ))}

        {/* Canvas */}
        <div ref={flowWrapRef} style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={NODE_TYPES}
            onSelectionChange={({ nodes: sel }) => setSelId(sel?.[0]?.id ?? null)}
            nodesDraggable={canWrite}
            nodesConnectable={canWrite}
            elementsSelectable
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={18} color="var(--ap-border)" />
            <Controls showInteractive={false}
              style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--ap-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }} />
            <MiniMap pannable zoomable
              style={{ width: 132, height: 88, background: 'var(--ap-surface-2)', border: '1px solid var(--ap-border)', borderRadius: 8 }}
              nodeColor="#94a3b8" nodeStrokeColor="#64748b" maskColor="rgba(100,116,139,0.14)" />
          </ReactFlow>
        </div>

        {/* Inspector (propriedades do nó selecionado) */}
        {inspectorOpen ? (
          <div style={{ width: 260, borderLeft: '1px solid var(--ap-border)', background: 'var(--ap-surface-2)', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between px-2 py-1.5" style={{ borderBottom: '1px solid var(--ap-border)' }}>
              <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--ap-text-4)' }}>Propriedades</p>
              <button onClick={() => setInspectorOpen(false)} title="Recolher" className="p-0.5 rounded" style={{ color: 'var(--ap-text-4)' }}><ChevronRight size={14} /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: 10 }}>
              {!selected ? (
                <p className="text-[11px]" style={{ color: 'var(--ap-text-4)' }}>Clique num passo para configurar.</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--ap-text-1)' }}>{selectedDef?.label || 'Passo'}</p>
                    {selectedDef?.description && <p className="text-[11px] mt-0.5" style={{ color: 'var(--ap-text-4)' }}>{selectedDef.description}</p>}
                  </div>

                  <FormField label="Nome do passo">
                    <TextInput className="text-xs" value={selected.data.name ?? ''} placeholder={selectedDef?.label} disabled={!canWrite}
                      onChange={(e) => setNodeName(e.target.value)} />
                  </FormField>

                  {selectedDef ? (
                    (selectedDef.fields || []).length ? (
                      <div className="space-y-2.5">
                        <p className="text-[10px] mt-1" style={{ color: 'var(--ap-text-5)' }}>
                          Use {'{{ }}'} para inserir dados nos campos de texto — ex.: o telefone do contato ({'{{input.phone}}'}) ou o resultado de um passo anterior.
                        </p>
                        {(selectedDef.fields || []).map((f) => (
                          <InspectorField
                            key={`${selected.id}:${f.key}`}
                            field={f}
                            value={selected.data.config?.[f.key]}
                            jsonDraft={f.type === 'json' ? jsonDraftFor(f) : undefined}
                            refs={refs}
                            disabled={!canWrite}
                            onChange={(v) => setField(f.key, v)}
                            onJsonDraft={(text) => setJsonDraft(f.key, text)}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px]" style={{ color: 'var(--ap-text-4)' }}>Este passo não precisa de configuração.</p>
                    )
                  ) : (
                    <p className="text-[11px]" style={{ color: 'var(--ap-text-4)' }}>Este passo não é mais reconhecido pelo sistema.</p>
                  )}

                  {canWrite && (
                    <button className="btn-secondary text-xs w-full" onClick={() => setRemoving(true)}>
                      <Trash2 size={12} /> Remover passo
                    </button>
                  )}

                </div>
              )}
            </div>
          </div>
        ) : (
          <CollapsedRail side="right" icon={SlidersHorizontal} label="Propriedades" onExpand={() => setInspectorOpen(true)} />
        )}
      </div>

      <p className="text-[11px]" style={{ color: 'var(--ap-text-5)' }}>
        Clique num passo para configurar. Arraste dos pontos à direita de cada passo para ligá-los; a saída "erro"/"falso" cria um caminho alternativo.
      </p>

      {/* Gatilho */}
      <Modal open={triggerOpen} onClose={() => setTriggerOpen(false)} title="Gatilho do fluxo" size="md">
        <TriggerEditor
          trigger={trigger}
          onChange={(t) => { setTrigger(t); setDirty(true); }}
          webhookToken={workflow.webhook_token}
        />
      </Modal>

      {/* Remover passo */}
      <ConfirmDialog
        open={removing}
        danger
        title="Remover passo"
        message={`Remover o passo "${selected?.data.name || ''}" da edição atual? A remoção só vale ao salvar uma nova versão.`}
        confirmLabel="Remover"
        onClose={() => setRemoving(false)}
        onConfirm={removeSelected}
      />

      {/* Salvar versão */}
      <Modal
        open={saveOpen}
        onClose={saving ? undefined : () => setSaveOpen(false)}
        title="Salvar nova versão"
        size="sm"
        dismissable={!saving}
        footer={
          <>
            <button className="btn-secondary disabled:opacity-60" onClick={() => setSaveOpen(false)} disabled={saving}>Cancelar</button>
            <button className="btn-primary disabled:opacity-60" onClick={handleSaveVersion} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />} Salvar v{(versions[0]?.version ?? 0) + 1}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--ap-text-3)' }}>
            Cada vez que você salva, é criada a v{(versions[0]?.version ?? 0) + 1}. Publicar e reverter ficam no botão Versões.
          </p>
          <FormField label="Nota da versão" hint="O que mudou (aparece no histórico).">
            <TextInput value={saveNote} onChange={(e) => setSaveNote(e.target.value)} placeholder="Ex.: reorganiza o fluxo e adiciona o assistente" />
          </FormField>
        </div>
      </Modal>

      <VersionsModal
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        workflow={workflow}
        versions={versions}
        onPublished={() => { setVersionsOpen(false); load(); }}
      />
      <ExecuteModal open={executeOpen} onClose={() => setExecuteOpen(false)} workflow={workflow} />
    </div>
  );
}

// Editor VISUAL do fluxo (canvas React Flow). Consome o MESMO grafo JSON
// { nodes:[{id,type,name,config}], edges:[{from,to,when}] } do editor em lista.
// Salvar = nova versão imutável. Versões/publicar/dry-run/export preservados.
export default function FluxoCanvas() {
  return (
    <ReactFlowProvider>
      <FluxoCanvasInner />
    </ReactFlowProvider>
  );
}
