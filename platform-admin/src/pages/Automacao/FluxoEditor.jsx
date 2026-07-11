import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown, ArrowLeft, ArrowUp, Download, GitBranch, History, Loader2,
  Pencil, Play, Plus, Save, Trash2, Zap,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { FormField, TextInput, Select } from '../../components/ui/FormField';
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

// Editor do fluxo — LISTA VERTICAL de passos nesta fase (o canvas React Flow
// chega na Fase 5 e consome o MESMO grafo {nodes, edges}). Salvar = sempre
// nova versão imutável; publicar/rollback no modal de versões (diretriz 3).
export default function FluxoEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();

  const [workflow, setWorkflow] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [steps, setSteps] = useState([]);
  const [trigger, setTrigger] = useState({ type: 'manual' });
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [removingIndex, setRemovingIndex] = useState(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [executeOpen, setExecuteOpen] = useState(false);

  const defsByType = useMemo(() => Object.fromEntries(catalog.map((d) => [d.type, d])), [catalog]);

  async function load() {
    setLoading(true);
    try {
      const [detail, nodes] = await Promise.all([getWorkflow(id), getNodesCatalog()]);
      setWorkflow(detail);
      setCatalog(nodes.items);
      setSteps(graphToSteps(detail.current_graph));
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

  function mutateSteps(fn) {
    setSteps((prev) => fn([...prev]));
    setDirty(true);
  }

  function addStep(definition) {
    const seq = steps.length + 1;
    mutateSteps((list) => [...list, {
      id: `passo_${Date.now().toString(36)}_${seq}`,
      type: definition.type,
      name: definition.label,
      config: {},
      next_when: '',
    }]);
    setPaletteOpen(false);
    setEditingIndex(steps.length); // abre a config do passo recém-criado
  }

  function moveStep(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    mutateSteps((list) => {
      const [item] = list.splice(index, 1);
      list.splice(target, 0, item);
      return list;
    });
  }

  async function handleSaveVersion() {
    if (!steps.length) { toast.error('Adicione pelo menos um passo.'); return; }
    setSaving(true);
    try {
      const result = await saveWorkflowVersion(id, {
        graph: stepsToGraph(steps),
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

  const canWrite = can('automation.workflows.write');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost p-2" onClick={() => navigate('/automacao/fluxos')} aria-label="Voltar">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-[180px]">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold truncate" style={{ color: 'var(--ap-text-1)' }}>{workflow.name}</h1>
            <StatusBadge status={workflow.status} />
            {workflow.current_version > 0 && (
              <span className="text-xs font-mono" style={{ color: 'var(--ap-text-4)' }}>v{workflow.current_version} ativa</span>
            )}
            {dirty && <span className="text-xs" style={{ color: 'var(--ap-text-4)' }}>alterações não salvas</span>}
          </div>
          {workflow.description && <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>{workflow.description}</p>}
        </div>
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
          <button className="btn-primary" onClick={() => setSaveOpen(true)} title="Salvar como uma nova versão (o histórico é preservado)">
            <Save size={14} /> Salvar versão
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gatilho */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-brand" />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--ap-text-1)' }}>Gatilho</h2>
          </div>
          <TriggerEditor
            trigger={trigger}
            onChange={(t) => { setTrigger(t); setDirty(true); }}
            webhookToken={workflow.webhook_token}
          />
        </div>

        {/* Passos (lista vertical) */}
        <div className="lg:col-span-2 card space-y-3">
          <div className="flex items-center gap-2">
            <GitBranch size={15} className="text-brand" />
            <h2 className="text-sm font-semibold flex-1" style={{ color: 'var(--ap-text-1)' }}>Passos</h2>
            {canWrite && (
              <button className="btn-secondary text-xs" onClick={() => setPaletteOpen(true)}>
                <Plus size={13} /> Adicionar passo
              </button>
            )}
          </div>

          {!steps.length ? (
            <EmptyState
              icon={GitBranch}
              title="Fluxo vazio"
              description="Adicione um gatilho e os passos da automação."
              action={canWrite && <button className="btn-primary" onClick={() => setPaletteOpen(true)}><Plus size={14} /> Adicionar passo</button>}
            />
          ) : (
            <div className="space-y-1">
              {steps.map((step, index) => {
                const def = defsByType[step.type];
                return (
                  <React.Fragment key={step.id}>
                    <div className="rounded-lg p-3 flex items-center gap-2" style={{ border: '1px solid var(--ap-border)', backgroundColor: 'var(--ap-surface-2)' }}>
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                        style={{ backgroundColor: 'var(--ap-surface-3)', color: 'var(--ap-text-3)' }}
                      >
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{step.name || def?.label || 'Passo'}</p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--ap-text-4)' }}>
                          {def ? `${def.category} · ${def.label}` : 'Passo não reconhecido'}
                        </p>
                      </div>
                      {canWrite && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button className="btn-ghost p-1.5 disabled:opacity-30" onClick={() => moveStep(index, -1)} disabled={index === 0} title="Mover para cima">
                            <ArrowUp size={13} />
                          </button>
                          <button className="btn-ghost p-1.5 disabled:opacity-30" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} title="Mover para baixo">
                            <ArrowDown size={13} />
                          </button>
                          <button className="btn-ghost p-1.5" onClick={() => setEditingIndex(index)} title="Configurar o passo">
                            <Pencil size={13} className="text-brand" />
                          </button>
                          <button className="btn-ghost p-1.5" onClick={() => setRemovingIndex(index)} title="Remover o passo">
                            <Trash2 size={13} className="text-red-500" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Condição da aresta pro próximo passo */}
                    {index < steps.length - 1 && (
                      <div className="flex items-center gap-2 pl-8 py-0.5">
                        <ArrowDown size={12} style={{ color: 'var(--ap-text-5)' }} />
                        <span className="text-[11px]" style={{ color: 'var(--ap-text-4)' }}>continua se</span>
                        <Select
                          value={normalizeWhen(step.next_when, defsByType[step.type])}
                          onChange={(e) => mutateSteps((list) => {
                            list[index] = { ...list[index], next_when: e.target.value };
                            return list;
                          })}
                          disabled={!canWrite}
                          className="text-xs py-1 max-w-[190px]"
                        >
                          {(edgeOptionsFor(defsByType[step.type]) || []).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </Select>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Paleta de nós */}
      <NodePaletteModal open={paletteOpen} onClose={() => setPaletteOpen(false)} catalog={catalog} onPick={addStep} />

      {/* Config do passo */}
      <NodeConfigModal
        open={editingIndex !== null}
        node={editingIndex !== null ? steps[editingIndex] : null}
        definition={editingIndex !== null ? defsByType[steps[editingIndex]?.type] : null}
        onClose={() => setEditingIndex(null)}
        onSave={(updated) => {
          mutateSteps((list) => { list[editingIndex] = { ...list[editingIndex], ...updated }; return list; });
          setEditingIndex(null);
        }}
      />

      <ConfirmDialog
        open={removingIndex !== null}
        danger
        title="Remover passo"
        message={`Remover o passo "${removingIndex !== null ? (steps[removingIndex]?.name || '') : ''}" da edição atual? A remoção só vale ao salvar uma nova versão.`}
        confirmLabel="Remover"
        onClose={() => setRemovingIndex(null)}
        onConfirm={() => {
          mutateSteps((list) => { list.splice(removingIndex, 1); return list; });
          setRemovingIndex(null);
        }}
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
            <TextInput value={saveNote} onChange={(e) => setSaveNote(e.target.value)} placeholder="Ex.: adiciona condição de horário" />
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

// ─── Conversão grafo ↔ lista vertical ────────────────────────

function graphToSteps(rawGraph) {
  const graph = rawGraph || { nodes: [], edges: [] };
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  if (!nodes.length) return [];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hasIncoming = new Set(edges.map((e) => e.to));
  const start = nodes.find((n) => String(n.type || '').startsWith('TRIGGER_'))
    || nodes.find((n) => !hasIncoming.has(n.id))
    || nodes[0];

  const ordered = [];
  const seen = new Set();
  let current = start;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const edge = edges.find((e) => e.from === current.id);
    ordered.push({ ...current, next_when: edge?.when || '' });
    current = edge ? byId.get(edge.to) : null;
  }
  // Nós fora da cadeia principal (grafos vindos do import) entram no fim.
  for (const n of nodes) {
    if (!seen.has(n.id)) ordered.push({ ...n, next_when: '' });
  }
  return ordered;
}

function stepsToGraph(steps) {
  return {
    nodes: steps.map(({ next_when, ...node }) => node),
    edges: steps.slice(0, -1).map((step, i) => ({
      from: step.id,
      to: steps[i + 1].id,
      ...(step.next_when ? { when: step.next_when } : {}),
    })),
  };
}

function normalizeTrigger(raw) {
  const t = raw || {};
  return { type: t.type || 'manual', event: t.event, schedule: t.schedule };
}

function edgeOptionsFor(definition) {
  const outputs = definition?.outputs || ['success', 'error'];
  const LABELS = {
    success: 'sucesso',
    error: 'erro',
    true: 'condição verdadeira',
    false: 'condição falsa',
  };
  const opts = [{ value: '', label: 'sucesso (padrão)' }];
  for (const o of outputs) {
    if (o === 'success') continue;
    opts.push({ value: o, label: LABELS[o] || o });
  }
  return opts;
}

function normalizeWhen(when, definition) {
  const valid = new Set(['', ...(definition?.outputs || [])]);
  return valid.has(when) ? when : '';
}
