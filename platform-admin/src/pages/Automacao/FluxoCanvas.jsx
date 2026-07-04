import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  Handle, Position, addEdge, applyNodeChanges, applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, Download, GitBranch, History, Loader2, Play, Plus, Save, Zap, List,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { FormField, TextInput } from '../../components/ui/FormField';
import {
  getWorkflow, getNodesCatalog, saveWorkflowVersion, listWorkflowVersions,
  exportWorkflow,
} from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { toast } from '../../lib/toast';
import { NODE_CATEGORY_ORDER } from './automation.constants';
import { StatusBadge } from './Fluxos';
import NodeConfigModal from './editor/NodeConfigModal';
import TriggerEditor from './editor/TriggerEditor';
import VersionsModal from './editor/VersionsModal';
import ExecuteModal from './editor/ExecuteModal';

// Editor VISUAL do fluxo (canvas React Flow — Fase 5). Consome o MESMO grafo
// JSON {nodes:[{id,type,name,config}], edges:[{from,to,when}]} do editor em
// lista. Duplo-clique num nó abre o NodeConfigModal existente. Salvar = nova
// versão imutável. Versões/publicar/dry-run/export são preservados da Fase 4.
export default function FluxoCanvas() {
  return (
    <ReactFlowProvider>
      <FluxoCanvasInner />
    </ReactFlowProvider>
  );
}

const nodeTypes = { studioNode: StudioNode };

function FluxoCanvasInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();

  const [workflow, setWorkflow] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [rfNodes, setRfNodes] = useState([]);
  const [rfEdges, setRfEdges] = useState([]);
  const [trigger, setTrigger] = useState({ type: 'manual' });
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [executeOpen, setExecuteOpen] = useState(false);

  const defsByType = useMemo(() => Object.fromEntries(catalog.map((d) => [d.type, d])), [catalog]);
  const canWrite = can('automation.workflows.write');

  async function load() {
    setLoading(true);
    try {
      const [detail, nodes] = await Promise.all([getWorkflow(id), getNodesCatalog()]);
      setWorkflow(detail);
      setCatalog(nodes.items);
      const { rfNodes: rn, rfEdges: re } = graphToFlow(detail.current_graph, Object.fromEntries(nodes.items.map((d) => [d.type, d])));
      setRfNodes(rn);
      setRfEdges(re);
      setTrigger(normalizeTrigger(detail.current_trigger));
      setVersions(detail.versions || []);
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
    setRfEdges((eds) => addEdge({ ...connection, type: 'default' }, eds));
    setDirty(true);
  }, [canWrite]);

  const onNodeDoubleClick = useCallback((_ev, node) => {
    setEditingNodeId(node.id);
  }, []);

  function addNode(definition) {
    const seq = rfNodes.length + 1;
    const newId = `passo_${Date.now().toString(36)}_${seq}`;
    const position = { x: 120 + (seq % 4) * 60, y: 80 + rfNodes.length * 90 };
    setRfNodes((nds) => [...nds, {
      id: newId,
      type: 'studioNode',
      position,
      data: { name: definition.label, nodeType: definition.type, config: {}, definition },
    }]);
    setDirty(true);
    setPaletteOpen(false);
    setEditingNodeId(newId);
  }

  const editingNode = useMemo(() => {
    const n = rfNodes.find((x) => x.id === editingNodeId);
    if (!n) return null;
    // Adapta o shape do canvas para o formato que o NodeConfigModal espera.
    return { id: n.id, type: n.data.nodeType, name: n.data.name, config: n.data.config };
  }, [editingNodeId, rfNodes]);

  function applyNodeConfig(updated) {
    setRfNodes((nds) => nds.map((n) => (n.id === updated.id
      ? { ...n, data: { ...n.data, name: updated.name, config: updated.config } }
      : n)));
    setEditingNodeId(null);
    setDirty(true);
  }

  async function handleSaveVersion() {
    if (!rfNodes.length) { toast.error('Adicione pelo menos um passo.'); return; }
    setSaving(true);
    try {
      const result = await saveWorkflowVersion(id, {
        graph: flowToGraph(rfNodes, rfEdges),
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
        <button className="btn-secondary" onClick={() => navigate(`/automacao/fluxos/${id}/lista`)} title="Abrir o editor em lista (fallback)">
          <List size={14} /> Lista
        </button>
        <button className="btn-secondary" onClick={() => setTriggerOpen(true)} title="Configurar gatilho">
          <Zap size={14} /> Gatilho
        </button>
        <button className="btn-secondary" onClick={handleExport} title="Baixar o JSON do fluxo (sem segredos)">
          <Download size={14} /> Exportar
        </button>
        <button className="btn-secondary" onClick={openVersions} title="Histórico de versões — publicar/rollback/diff">
          <History size={14} /> Versões
        </button>
        {can('automation.workflows.execute') && (
          <button className="btn-secondary" onClick={() => setExecuteOpen(true)} title="Executar manualmente (com opção de simulação)">
            <Play size={14} /> Executar
          </button>
        )}
        {canWrite && (
          <>
            <button className="btn-secondary" onClick={() => setPaletteOpen(true)} title="Adicionar passo ao canvas">
              <Plus size={14} /> Adicionar passo
            </button>
            <button className="btn-primary" onClick={() => setSaveOpen(true)} title="Salvar como nova versão imutável">
              <Save size={14} /> Salvar versão
            </button>
          </>
        )}
      </div>

      {/* Canvas */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--ap-border)', height: 'calc(100dvh - 190px)', minHeight: 420, background: 'var(--ap-surface-2)' }}
      >
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          nodeTypes={nodeTypes}
          nodesDraggable={canWrite}
          nodesConnectable={canWrite}
          edgesFocusable={canWrite}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} color="var(--ap-border)" />
          <Controls />
          <MiniMap pannable zoomable style={{ background: 'var(--ap-surface)' }} />
        </ReactFlow>
      </div>

      <p className="text-[11px]" style={{ color: 'var(--ap-text-5)' }}>
        Duplo-clique num passo abre a configuração. Arraste das alças (handles) para ligar os passos; a alça de saída "erro" cria a aresta condicional.
      </p>

      {/* Paleta */}
      <NodePaletteModal open={paletteOpen} onClose={() => setPaletteOpen(false)} catalog={catalog} onPick={addNode} />

      {/* Gatilho */}
      <Modal open={triggerOpen} onClose={() => setTriggerOpen(false)} title="Gatilho do fluxo" size="md">
        <TriggerEditor
          trigger={trigger}
          onChange={(t) => { setTrigger(t); setDirty(true); }}
          webhookToken={workflow.webhook_token}
        />
      </Modal>

      {/* Config do passo (reusa o modal declarativo da Fase 4) */}
      <NodeConfigModal
        open={editingNodeId !== null}
        node={editingNode}
        definition={editingNode ? defsByType[editingNode.type] : null}
        onClose={() => setEditingNodeId(null)}
        onSave={applyNodeConfig}
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
            Versões são imutáveis: salvar cria a v{(versions[0]?.version ?? 0) + 1}. Publicar/rollback ficam no botão Versões.
          </p>
          <FormField label="Nota da versão" hint="O que mudou (aparece no histórico).">
            <TextInput value={saveNote} onChange={(e) => setSaveNote(e.target.value)} placeholder="Ex.: reorganiza o canvas e adiciona nó de agente" />
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

// Nó custom: label + handle de entrada (topo) + um handle de saída por output
// (base). O id do handle de saída = nome do output ('success','error',...).
function StudioNode({ data }) {
  const outputs = data.definition?.outputs?.length ? data.definition.outputs : ['success'];
  const category = data.definition?.category;
  return (
    <div
      className="rounded-lg px-3 py-2 shadow-sm"
      style={{ background: 'var(--ap-surface)', border: '1px solid var(--ap-border)', minWidth: 150, maxWidth: 220 }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'var(--ap-accent, #6366f1)' }} />
      {category && (
        <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ap-text-5)' }}>{category}</p>
      )}
      <p className="text-sm font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{data.name || data.definition?.label || data.nodeType}</p>
      <div className="flex justify-around mt-1">
        {outputs.map((out, i) => (
          <div key={out} className="relative flex flex-col items-center" style={{ width: `${100 / outputs.length}%` }}>
            <span className="text-[9px]" style={{ color: out === 'error' ? '#ef4444' : 'var(--ap-text-5)' }}>{out}</span>
            <Handle
              type="source"
              id={out}
              position={Position.Bottom}
              style={{
                left: `${((i + 0.5) / outputs.length) * 100}%`,
                background: out === 'error' ? '#ef4444' : 'var(--ap-accent, #6366f1)',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function NodePaletteModal({ open, onClose, catalog, onPick }) {
  const grouped = useMemo(() => {
    const map = new Map();
    for (const def of catalog) {
      if (!map.has(def.category)) map.set(def.category, []);
      map.get(def.category).push(def);
    }
    return [...map.entries()].sort(
      (a, b) => NODE_CATEGORY_ORDER.indexOf(a[0]) - NODE_CATEGORY_ORDER.indexOf(b[0]),
    );
  }, [catalog]);

  return (
    <Modal open={open} onClose={onClose} title="Adicionar passo" size="lg">
      <div className="space-y-4">
        {grouped.map(([category, defs]) => (
          <div key={category}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--ap-text-5)' }}>{category}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {defs.map((def) => (
                <button
                  key={def.type}
                  className="rounded-lg p-3 text-left transition-colors min-h-[44px] hover:bg-brand/5"
                  style={{ border: '1px solid var(--ap-border)' }}
                  onClick={() => onPick(def)}
                >
                  <p className="text-sm font-medium" style={{ color: 'var(--ap-text-1)' }}>{def.label}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--ap-text-4)' }}>{def.description}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ─── Conversão grafo JSON ↔ React Flow ───────────────────────

// Layout automático em cadeia quando o grafo salvo não traz posições
// (a posição fica em node.config.__pos para persistir sem sujar o config real).
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
        definition: defsByType[n.type] || { type: n.type, label: n.name || n.type, outputs: ['success'] },
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
