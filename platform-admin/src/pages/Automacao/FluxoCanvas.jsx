import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  Handle, Position, addEdge, applyNodeChanges, applyEdgeChanges, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Screen, PageHeader, Badge, Button, IconButton, SegmentedControl, Modal, ConfirmDialog, Field, Input, useToast, Spinner, DSIcon } from '@studio-ux-ds/react';
import {
  getWorkflow, getNodesCatalog, saveWorkflowVersion, listWorkflowVersions,
  exportWorkflow, publishWorkflow, unpublishWorkflow,
} from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { NODE_CATEGORY_ORDER } from './automation.constants';
import WorkflowStatusBadge from './WorkflowStatusBadge';
import TriggerEditor from './editor/TriggerEditor';
import VersionsModal from './editor/VersionsModal';
import ExecuteDrawer from './editor/ExecuteDrawer';
import { NodeFields, useNodeFieldRefs } from './editor/NodeFields';

// Automação/FluxoCanvas — o fluxo desenhado (React Flow). Migrado pro DS na
// v0.10.4. Consome o MESMO grafo `{nodes,edges}` do editor em lista; a posição de
// cada passo mora em `config.__pos`.
//
// Decisões desta frente:
//
//  · **O painel de propriedades continua FIXO à direita** (recolhível), não virou
//    Drawer. É o padrão *inspetor* na sua forma persistente (`DESKTOP` §6): num
//    canvas, cobrir o desenho enquanto se configura um nó tira justamente o que
//    se precisa ver — as ligações dele. O Drawer fica com o editor em lista, onde
//    não há desenho atrás para preservar.
//  · **Os campos do passo agora são compartilhados** (`editor/NodeFields`). Havia
//    dois renderizadores do mesmo catálogo declarativo, e eles já tinham
//    divergido: o tipo `agent` existia aqui e não na lista — lá o campo
//    "Assistente" caía num input de texto pedindo o id na mão.
//  · **As duas vistas passam a ter as mesmas ações** (decisão do Robson): o
//    alternador Canvas/Lista, Gatilho, Exportar, Versões, Rodar agora,
//    Ligar/Desligar e Salvar versão. Antes só o canvas ligava/desligava o fluxo —
//    quem estivesse na lista tinha de descobrir que a ação existia na outra tela.
//  · **Desligar agora pede confirmação.** Rodava direto no clique, sem
//    ConfirmDialog — e é ação que muda estado (para os gatilhos de um fluxo em
//    produção). Os 5 patrasques valem para ela como para publicar.
//  · A **paleta** e os trilhos recolhidos seguem escritos aqui: são infra de
//    canvas/node-editor, que o DS ainda não cobre (está no audit dele como zona
//    cinzenta). Usam tokens `--su-*`, não cor crua.

// Rótulos amigáveis das saídas (handles) — o id do handle = nome do output.
const OUTPUT_LABELS = {
  success: '', // saída padrão não precisa de rótulo
  error: 'erro',
  true: 'verdadeiro',
  false: 'falso',
};
const outputLabel = (out) => (out in OUTPUT_LABELS ? OUTPUT_LABELS[out] : out);

// ─── Nó custom ───────────────────────────────────────────────
function StudioNode({ data, selected }) {
  const def = data.definition;
  const outputs = def?.outputs?.length ? def.outputs : ['success'];
  const isTrigger = def?.kind === 'trigger';
  const category = def?.category;
  return (
    <div style={{
      minWidth: 150, maxWidth: 230, borderRadius: 10, padding: '8px 12px',
      background: 'var(--su-surface-raised)', color: 'var(--su-text-primary)',
      border: `2px solid ${selected ? 'var(--su-action)' : 'var(--su-border-default)'}`,
      fontSize: 12, boxShadow: 'var(--su-elevation-card, 0 1px 3px rgba(0,0,0,0.12))',
    }}>
      {!isTrigger && <Handle type="target" position={Position.Left} style={{ background: 'var(--su-border-strong)' }} />}
      {category && (
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--su-text-muted)' }}>
          {category}
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--su-text-primary)' }} className="truncate">
        {data.name || def?.label || 'Passo'}
      </div>
      {/* Descrição amigável em vez do tipo técnico cru (ex.: era "AGENT"). */}
      {def?.description && (
        <div style={{ color: 'var(--su-text-muted)', fontSize: 10, lineHeight: 1.25 }} className="line-clamp-2">
          {def.description}
        </div>
      )}
      {outputs.map((out, i) => (
        <Handle
          key={out} type="source" id={out} position={Position.Right}
          style={{
            background: out === 'error' ? 'var(--su-danger)' : 'var(--su-border-strong)',
            top: `${((i + 1) * 100) / (outputs.length + 1)}%`,
          }}
        />
      ))}
      {outputs.some((o) => outputLabel(o)) && (
        <div style={{ position: 'absolute', right: -4, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', pointerEvents: 'none' }}>
          {outputs.map((o) => (
            <span key={o} style={{ fontSize: 8, color: o === 'error' ? 'var(--su-danger-fg)' : 'var(--su-text-muted)', transform: 'translateX(100%)', paddingLeft: 6, whiteSpace: 'nowrap' }}>
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
  const { __pos, ...rest } = config || {};
  return rest;
}

function normalizeTrigger(raw) {
  const t = raw || {};
  return { type: t.type || 'manual', event: t.event, schedule: t.schedule };
}

// Trilho do painel recolhido — clique para abrir de volta.
// `icon` é o NOME do glifo no catálogo do DS (string), não um componente. Passar
// componente obrigava o consumidor a importar ícone de outra biblioteca só pra
// ter algo pra passar — e foi por aí que duas famílias de desenho entraram no
// canvas (corrigido na adoção do DS v1.2.41).
function CollapsedRail({ side, icon, label, onExpand }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`Abrir ${label.toLowerCase()}`}
      aria-label={`Abrir ${label.toLowerCase()}`}
      style={{
        width: 34, background: 'var(--su-surface-sunken, var(--su-surface-raised))',
        [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid var(--su-border-default)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        paddingTop: 10, cursor: 'pointer', color: 'var(--su-text-muted)',
        border: 'none', font: 'inherit',
      }}
    >
      <DSIcon name={icon} size="sm" />
      <span style={{ writingMode: 'vertical-rl', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>
        {label}
      </span>
    </button>
  );
}

function groupByCategory(catalog) {
  const map = new Map();
  for (const def of catalog) {
    if (!map.has(def.category)) map.set(def.category, []);
    map.get(def.category).push(def);
  }
  return [...map.entries()].sort(
    (a, b) => NODE_CATEGORY_ORDER.indexOf(a[0]) - NODE_CATEGORY_ORDER.indexOf(b[0]),
  );
}

// ─── Canvas interno (dentro do ReactFlowProvider) ────────────
function FluxoCanvasInner() {
  const toast = useToast();
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
  const [removing, setRemoving] = useState(false);

  const [triggerOpen, setTriggerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [powerConfirm, setPowerConfirm] = useState(null); // 'on' | 'off'
  const [publishing, setPublishing] = useState(false);
  const [executeOpen, setExecuteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const flowWrapRef = useRef(null);

  const defsByType = useMemo(() => Object.fromEntries(catalog.map((d) => [d.type, d])), [catalog]);
  const canWrite = can('automation.workflows.write');

  // As listas de referência (conexões/templates/assistentes) atendem QUALQUER
  // passo que o usuário venha a selecionar, então a união dos campos do catálogo
  // é o que decide o que carregar — não o passo selecionado no momento.
  const allFields = useMemo(() => catalog.flatMap((d) => d.fields || []), [catalog]);
  const { refs } = useNodeFieldRefs(allFields, { enabled: canWrite });

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

  // Rascunhos JSON do nó selecionado, com o valor salvo como ponto de partida.
  const selectedJsonDrafts = useMemo(() => {
    if (!selected || !selectedDef) return {};
    const draftForNode = jsonDrafts[selId] || {};
    const out = {};
    for (const f of (selectedDef.fields || []).filter((x) => x.type === 'json')) {
      if (typeof draftForNode[f.key] === 'string') { out[f.key] = draftForNode[f.key]; continue; }
      const v = selected.data.config?.[f.key];
      out[f.key] = v === undefined || v === null ? '' : JSON.stringify(v, null, 2);
    }
    return out;
  }, [selected, selectedDef, jsonDrafts, selId]);

  // Monta o grafo aplicando os rascunhos JSON (com validação). Null = inválido.
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
          toast.error(`No passo "${n.data.name}", o campo "${f.label}" não está num JSON válido.`);
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
    if (!rfNodes.length) { toast.error('O fluxo precisa de pelo menos um passo.'); return; }
    const graph = buildGraph();
    if (!graph) return; // JSON inválido já avisou
    setSaving(true);
    try {
      const result = await saveWorkflowVersion(id, { graph, trigger, note: saveNote.trim() || undefined });
      toast.success(`v${result.version} salva. Ela ainda não está no ar — use Ligar quando quiser.`);
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
    if (!rfNodes.length) { toast.error('O fluxo precisa de pelo menos um passo.'); return; }
    if (!buildGraph()) return; // valida os rascunhos JSON antes de pedir a nota
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

  async function confirmPower() {
    setPublishing(true);
    try {
      if (powerConfirm === 'on') {
        const v = versions[0]?.version ?? workflow?.current_version ?? 0;
        if (!v) { toast.error('Salve uma versão antes de ligar o fluxo.'); return; }
        await publishWorkflow(id, v);
        toast.success('Fluxo ligado — vai rodar quando o gatilho acontecer.');
      } else {
        await unpublishWorkflow(id);
        toast.success('Fluxo desligado — parou de rodar. Continua salvo.');
      }
      setPowerConfirm(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPublishing(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportWorkflow(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fluxo-${(workflow?.name || 'export').toLowerCase().replace(/\s+/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Arquivo baixado — ele não carrega senhas nem chaves.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  }

  if (loading || !workflow) {
    return (
      <Screen as="div" className="space-y-6">
        <PageHeader title="Carregando…" />
        <Spinner size="lg" center />
      </Screen>
    );
  }

  const ligado = workflow.status === 'PUBLISHED';
  const proximaVersao = (versions[0]?.version ?? 0) + 1;

  return (
    <Screen as="div" className="space-y-3">
      <PageHeader
        title={workflow.name}
        subtitle={workflow.description || undefined}
        actions={
          <>
            <Button variant="ghost" icon="arrow-left" title="Voltar para a lista de fluxos" onClick={() => navigate('/automacao/fluxos')}>
              Voltar
            </Button>
            <Button variant="secondary" icon="zap" title="Escolher o que dispara este fluxo" onClick={() => setTriggerOpen(true)}>
              Gatilho
            </Button>
            <Button variant="secondary" icon="download" loading={exporting} title="Baixa uma cópia do fluxo, sem senhas nem chaves" onClick={handleExport}>
              Exportar
            </Button>
            <Button variant="secondary" icon="history" title="Ver as versões salvas — pôr no ar ou voltar para uma anterior" onClick={openVersions}>
              Versões
            </Button>
            {can('automation.workflows.execute') && (
              <Button variant="secondary" icon="play" title="Roda o fluxo agora, com opção de só simular" onClick={() => setExecuteOpen(true)}>
                Rodar agora
              </Button>
            )}
            {can('automation.workflows.publish') && (
              <Button
                variant={ligado ? 'danger' : 'secondary'}
                icon="power"
                disabled={publishing}
                title={ligado
                  ? 'Desliga: o fluxo para de rodar (continua salvo)'
                  : 'Liga: o fluxo passa a rodar quando o gatilho acontecer'}
                onClick={() => setPowerConfirm(ligado ? 'off' : 'on')}
              >
                {ligado ? 'Desligar' : 'Ligar'}
              </Button>
            )}
            {canWrite && (
              <Button variant="primary" icon="save" title="Guarda o desenho como uma versão nova — o histórico não se perde" onClick={openSave}>
                Salvar versão
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        {/* Duas VISTAS do mesmo fluxo — alternador, não navegação para outro lugar. */}
        <SegmentedControl
          items={[{ id: 'canvas', label: 'Desenho' }, { id: 'lista', label: 'Lista' }]}
          value="canvas"
          onChange={(v) => { if (v === 'lista') navigate(`/automacao/fluxos/${id}/lista`); }}
        />
        <WorkflowStatusBadge status={workflow.status} />
        {workflow.current_version > 0 && <Badge tone="info">v{workflow.current_version} no ar</Badge>}
        {dirty && <Badge tone="warning">alterações ainda não salvas</Badge>}
      </div>

      {/* Editor: paleta + canvas + inspetor */}
      <div style={{
        display: 'flex', height: 'calc(100dvh - 240px)', minHeight: 420,
        border: '1px solid var(--su-border-default)', borderRadius: 12, overflow: 'hidden',
      }}>
        {canWrite && (paletteOpen ? (
          <div style={{ width: 200, borderRight: '1px solid var(--su-border-default)', background: 'var(--su-surface-raised)', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between" style={{ padding: '6px 8px', borderBottom: '1px solid var(--su-border-default)' }}>
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', margin: 0, color: 'var(--su-text-muted)' }}>
                Passos disponíveis
              </p>
              <IconButton icon="chevron-left" aria-label="Recolher a lista de passos" title="Recolher" onClick={() => setPaletteOpen(false)} />
            </div>
            <div style={{ overflowY: 'auto', padding: 8 }}>
              {groupByCategory(catalog).map(([cat, items]) => {
                const open = openCat === cat;
                return (
                  <div key={cat} style={{ marginBottom: 4 }}>
                    <button
                      type="button"
                      onClick={() => setOpenCat(open ? null : cat)}
                      aria-expanded={open}
                      className="w-full flex items-center justify-between"
                      style={{
                        padding: '6px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '.08em',
                        color: 'var(--su-text-muted)', background: open ? 'var(--su-action-tint)' : 'transparent',
                        border: 'none', cursor: 'pointer', font: 'inherit',
                      }}
                    >
                      <span>{cat}</span>
                      <DSIcon name="chevron-down" size="sm" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                    </button>
                    {open && (
                      <div style={{ paddingTop: 4, paddingBottom: 4 }}>
                        {items.map((def) => (
                          <button
                            key={def.type}
                            type="button"
                            onClick={() => addNode(def)}
                            title={def.description}
                            className="w-full text-left flex items-center gap-1"
                            style={{
                              fontSize: 11, borderRadius: 6, padding: '6px 8px', marginBottom: 4,
                              background: 'var(--su-surface-overlay, var(--su-surface-raised))',
                              border: '1px solid var(--su-border-default)',
                              color: 'var(--su-text-secondary)', cursor: 'pointer', font: 'inherit',
                            }}
                          >
                            <DSIcon name="plus" size="sm" className="shrink-0" />
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
          <CollapsedRail side="left" icon="layers" label="Passos" onExpand={() => setPaletteOpen(true)} />
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
            <Background gap={18} color="var(--su-border-default)" />
            <Controls
              showInteractive={false}
              style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--su-border-default)' }}
            />
            <MiniMap
              pannable zoomable
              style={{ width: 132, height: 88, background: 'var(--su-surface-raised)', border: '1px solid var(--su-border-default)', borderRadius: 8 }}
              nodeColor="var(--su-border-strong)"
              nodeStrokeColor="var(--su-text-muted)"
              maskColor="color-mix(in srgb, var(--su-text-muted) 14%, transparent)"
            />
          </ReactFlow>
        </div>

        {/* Inspetor — propriedades do passo selecionado. Fixo de propósito: num
            canvas, cobrir o desenho tira o contexto de que se precisa. */}
        {inspectorOpen ? (
          <div style={{ width: 320, borderLeft: '1px solid var(--su-border-default)', background: 'var(--su-surface-raised)', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between" style={{ padding: '6px 8px', borderBottom: '1px solid var(--su-border-default)' }}>
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', margin: 0, color: 'var(--su-text-muted)' }}>
                Propriedades
              </p>
              <IconButton icon="chevron-right" aria-label="Recolher as propriedades" title="Recolher" onClick={() => setInspectorOpen(false)} />
            </div>
            <div style={{ overflowY: 'auto', padding: 12 }}>
              {!selected ? (
                <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }}>
                  Clique num passo do desenho para configurar.
                </p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                      {selectedDef?.label || 'Passo'}
                    </p>
                    {selectedDef?.description && (
                      <p style={{ fontSize: 11, margin: '2px 0 0', color: 'var(--su-text-muted)' }}>{selectedDef.description}</p>
                    )}
                  </div>

                  <Field label="Nome do passo" hint="Só para você reconhecer o passo no desenho.">
                    <Input
                      value={selected.data.name ?? ''}
                      placeholder={selectedDef?.label}
                      disabled={!canWrite}
                      onChange={(e) => setNodeName(e.target.value)}
                    />
                  </Field>

                  {!selectedDef ? (
                    <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }}>
                      Este passo não existe mais no sistema — remova-o ou troque por outro.
                    </p>
                  ) : (selectedDef.fields || []).length === 0 ? (
                    <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }}>
                      Este passo não precisa de configuração.
                    </p>
                  ) : (
                    <>
                      <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)' }}>
                        Nos campos de texto você pode inserir dados do fluxo entre chaves duplas — por
                        exemplo {'{{input.phone}}'} ou {'{{vars.passo_1.status}}'}.
                      </p>
                      <NodeFields
                        key={selected.id}
                        fields={selectedDef.fields}
                        config={selected.data.config || {}}
                        jsonDrafts={selectedJsonDrafts}
                        refs={refs}
                        disabled={!canWrite}
                        onValue={setField}
                        onJsonDraft={setJsonDraft}
                      />
                    </>
                  )}

                  {canWrite && (
                    <Button variant="secondary" icon="trash" size="sm" className="w-full" onClick={() => setRemoving(true)}>
                      Remover passo
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <CollapsedRail side="right" icon="sliders" label="Propriedades" onExpand={() => setInspectorOpen(true)} />
        )}
      </div>

      <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)' }}>
        Clique num passo para configurar. Arraste dos pontos à direita de um passo até outro para ligá-los;
        a saída "erro"/"falso" cria um caminho alternativo.
      </p>

      {/* Gatilho: campos curtos, sem texto longo → Modal é o container certo.
          (No editor em lista o gatilho é um card fixo — aqui não há espaço para
          um card sem tirar o desenho da tela.) */}
      <Modal open={triggerOpen} onClose={() => setTriggerOpen(false)} title="O que dispara este fluxo" maxWidth={560}>
        <TriggerEditor
          trigger={trigger}
          onChange={(t) => { setTrigger(t); setDirty(true); }}
          webhookToken={workflow.webhook_token}
        />
      </Modal>

      <ConfirmDialog
        open={removing}
        danger
        title="Remover passo"
        message={`Tirar o passo "${selected?.data.name || ''}" do desenho? A versão que está no ar continua como está — a remoção só vale quando você salvar uma versão nova.`}
        confirmLabel="Remover"
        onClose={() => setRemoving(false)}
        onConfirm={removeSelected}
      />

      {/* Ligar/Desligar: os 5 patrasques nos DOIS sentidos. Desligar rodava direto
          no clique, sem confirmação — e é o que para um fluxo em produção. */}
      <ConfirmDialog
        open={!!powerConfirm}
        danger={powerConfirm === 'off'}
        loading={publishing}
        title={powerConfirm === 'off' ? 'Desligar o fluxo' : 'Ligar o fluxo'}
        message={
          powerConfirm === 'off'
            ? `Desligar "${workflow.name}"? Ele para de rodar quando o gatilho acontecer. Nada é apagado — o fluxo e o histórico ficam, e você pode ligar de novo depois.`
            : `Ligar "${workflow.name}"? Ele passa a rodar automaticamente quando o gatilho acontecer.${dirty ? ' Atenção: há alterações não salvas no desenho — elas NÃO entram até você salvar uma versão nova.' : ''}`
        }
        confirmLabel={powerConfirm === 'off' ? 'Desligar' : 'Ligar'}
        onClose={() => setPowerConfirm(null)}
        onConfirm={confirmPower}
      />

      {/* Só um Input (a anotação) → Modal. */}
      <Modal
        open={saveOpen}
        onClose={saving ? undefined : () => setSaveOpen(false)}
        title={`Salvar como v${proximaVersao}`}
        maxWidth={460}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveOpen(false)} disabled={saving}>Cancelar</Button>
            <Button variant="primary" loading={saving} onClick={handleSaveVersion}>Salvar v{proximaVersao}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-secondary)' }}>
            Salvar cria a <strong>v{proximaVersao}</strong> e não muda o que está no ar. Para pôr essa versão em uso, use <strong>Ligar</strong> (ou escolha outra em Versões).
          </p>
          <Field label="O que mudou" hint="Aparece no histórico — ajuda a saber por que essa versão existe.">
            <Input value={saveNote} onChange={(e) => setSaveNote(e.target.value)} placeholder="Ex.: reorganiza o desenho e acrescenta o assistente" />
          </Field>
        </div>
      </Modal>

      <VersionsModal
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        workflow={workflow}
        versions={versions}
        onPublished={() => { setVersionsOpen(false); load(); }}
      />
      <ExecuteDrawer open={executeOpen} onClose={() => setExecuteOpen(false)} workflow={workflow} />
    </Screen>
  );
}

export default function FluxoCanvas() {
  return (
    <ReactFlowProvider>
      <FluxoCanvasInner />
    </ReactFlowProvider>
  );
}
