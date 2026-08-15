import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen, PageHeader, Card, Badge, Button, Modal, ConfirmDialog, EmptyState, SegmentedControl, Field, Input, Select, IconButton, useToast, Spinner } from '@studio-ux-ds/react';
import {
  getWorkflow, getNodesCatalog, saveWorkflowVersion, listWorkflowVersions, exportWorkflow,
  publishWorkflow, unpublishWorkflow,
} from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { NODE_CATEGORY_ORDER } from './automation.constants';
import WorkflowStatusBadge from './WorkflowStatusBadge';
import NodeInspector from './editor/NodeInspector';
import TriggerEditor from './editor/TriggerEditor';
import VersionsModal from './editor/VersionsModal';
import ExecuteDrawer from './editor/ExecuteDrawer';

// Automação/FluxoEditor — o fluxo como LISTA vertical de passos. Migrado pro DS
// na v0.10.2. (O canvas é a rota `/automacao/fluxos/:id`; esta é a `/lista`, e as
// duas consomem o MESMO grafo `{nodes, edges}`.)
//
// Onde cada coisa mora, pela regra dos três containers do DS (v1.2.24):
//
//  · **Configurar um passo → inspetor** (`NodeInspector`, Drawer). Tem TextArea e
//    JSON, e o passo é rascunho da sessão: não é Modal nem rota.
//  · **Rodar agora → inspetor** (`ExecuteDrawer`). Tem TextArea (a entrada) e age
//    sobre o fluxo em foco.
//  · **Escolher o tipo do passo → Modal.** É leitura + escolha, sem campo.
//  · **Salvar versão → Modal.** Só um `Input` (a anotação) — o Modal aceita.
//  · **Versões → Modal.** Leitura (lista + diff) + confirmação.
//
// O cabeçalho virou `PageHeader`: o botão "voltar" desapareceu porque o
// breadcrumb do AppShell já leva de volta pra lista, e ter os dois era o mesmo
// caminho duas vezes.

export default function FluxoEditor() {
  const toast = useToast();
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
  const [exporting, setExporting] = useState(false);
  const [powerConfirm, setPowerConfirm] = useState(null); // 'on' | 'off'
  const [publishing, setPublishing] = useState(false);

  const defsByType = useMemo(() => Object.fromEntries(catalog.map((d) => [d.type, d])), [catalog]);
  const canWrite = can('automation.workflows.write');

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
    setEditingIndex(steps.length); // abre a configuração do passo recém-criado
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
    if (!steps.length) { toast.error('O fluxo precisa de pelo menos um passo.'); return; }
    setSaving(true);
    try {
      const result = await saveWorkflowVersion(id, {
        graph: stepsToGraph(steps),
        trigger,
        note: saveNote.trim() || undefined,
      });
      toast.success(`v${result.version} salva. Ela ainda não está no ar — publique em Versões.`);
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

  // Ligar/Desligar existia SÓ no canvas — quem estivesse aqui tinha de descobrir
  // que a ação morava na outra vista do mesmo fluxo. As duas vistas passaram a
  // oferecer o mesmo conjunto de ações (v0.10.4).
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

  const proximaVersao = (versions[0]?.version ?? 0) + 1;

  return (
    <Screen as="div" className="space-y-6">
      <PageHeader
        title={workflow.name}
        subtitle={workflow.description || undefined}
        actions={
          <>
            {/* O "Voltar" existe porque toda tela precisa de uma saída visível.
                Eu o havia removido na v0.10.2 alegando que o breadcrumb do topo
                levava de volta — e não levava: os itens iam sem `href`, então
                era texto decorativo. Consertado nos dois lugares (o breadcrumb
                virou navegável de verdade), mas o botão fica: uma saída na
                mesma altura das outras ações é mais achável que o caminho na
                barra de cima. */}
            <Button variant="ghost" icon="arrow-left" title="Voltar para a lista de fluxos" onClick={() => navigate('/automacao/fluxos')}>
              Voltar
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
                variant={workflow.status === 'PUBLISHED' ? 'danger' : 'secondary'}
                icon="power"
                disabled={publishing}
                title={workflow.status === 'PUBLISHED'
                  ? 'Desliga: o fluxo para de rodar (continua salvo)'
                  : 'Liga: o fluxo passa a rodar quando o gatilho acontecer'}
                onClick={() => setPowerConfirm(workflow.status === 'PUBLISHED' ? 'off' : 'on')}
              >
                {workflow.status === 'PUBLISHED' ? 'Desligar' : 'Ligar'}
              </Button>
            )}
            {canWrite && (
              <Button variant="primary" icon="save" title="Guarda o que está na tela como uma versão nova — o histórico não se perde" onClick={() => setSaveOpen(true)}>
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
          value="lista"
          onChange={(v) => { if (v === 'canvas') navigate(`/automacao/fluxos/${id}`); }}
        />
        <WorkflowStatusBadge status={workflow.status} />
        {workflow.current_version > 0 && <Badge tone="info">v{workflow.current_version} no ar</Badge>}
        {dirty && <Badge tone="warning">alterações ainda não salvas</Badge>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <div style={{ padding: 20 }} className="space-y-3">
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
              O que dispara
            </h2>
            <TriggerEditor
              trigger={trigger}
              onChange={(t) => { setTrigger(t); setDirty(true); }}
              webhookToken={workflow.webhook_token}
            />
          </div>
        </Card>

        <div className="lg:col-span-2">
          <Card>
            <div style={{ padding: 20 }} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 style={{ flex: 1, fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                  O que ele faz, na ordem
                </h2>
                {canWrite && (
                  <Button variant="secondary" size="sm" icon="plus" onClick={() => setPaletteOpen(true)}>
                    Adicionar passo
                  </Button>
                )}
              </div>

              {!steps.length ? (
                <EmptyState
                  icon="settings"
                  title="Nenhum passo ainda"
                  description="Escolha o que dispara o fluxo ao lado e adicione os passos que ele deve executar."
                  action={canWrite && (
                    <Button variant="primary" icon="plus" onClick={() => setPaletteOpen(true)}>Adicionar passo</Button>
                  )}
                />
              ) : (
                <div className="space-y-1">
                  {steps.map((step, index) => {
                    const def = defsByType[step.type];
                    return (
                      <React.Fragment key={step.id}>
                        <div
                          className="flex items-center gap-2"
                          style={{
                            borderRadius: 8, padding: 12,
                            border: '1px solid var(--su-border-default)',
                            background: 'var(--su-surface-raised)',
                          }}
                        >
                          <span
                            className="shrink-0 flex items-center justify-center"
                            style={{
                              width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                              background: 'var(--su-action-tint)', color: 'var(--su-text-secondary)',
                            }}
                          >
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: 'var(--su-text-primary)' }} className="truncate">
                              {step.name || def?.label || 'Passo'}
                            </p>
                            <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)' }} className="truncate">
                              {def ? `${def.category} · ${def.label}` : 'Este passo não existe mais no sistema'}
                            </p>
                          </div>
                          {canWrite && (
                            <div className="flex items-center gap-1 shrink-0">
                              <IconButton icon="chevron-up" aria-label="Mover para cima" title="Mover para cima" disabled={index === 0} onClick={() => moveStep(index, -1)} />
                              <IconButton icon="chevron-down" aria-label="Mover para baixo" title="Mover para baixo" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)} />
                              <IconButton icon="edit" aria-label="Configurar o passo" title="Configurar o passo" onClick={() => setEditingIndex(index)} />
                              <IconButton icon="trash" aria-label="Remover o passo" title="Remover o passo" onClick={() => setRemovingIndex(index)} />
                            </div>
                          )}
                        </div>

                        {index < steps.length - 1 && (
                          <div className="flex flex-wrap items-center gap-2" style={{ paddingLeft: 32, paddingTop: 2, paddingBottom: 2 }}>
                            <span style={{ fontSize: 11, color: 'var(--su-text-muted)' }}>segue para o próximo se</span>
                            <div style={{ width: 200 }}>
                              <Select
                                value={normalizeWhen(step.next_when, defsByType[step.type])}
                                onChange={(e) => mutateSteps((list) => {
                                  list[index] = { ...list[index], next_when: e.target.value };
                                  return list;
                                })}
                                disabled={!canWrite}
                                aria-label={`Condição para seguir do passo ${index + 1}`}
                              >
                                {(edgeOptionsFor(defsByType[step.type]) || []).map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </Select>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <NodePaletteModal open={paletteOpen} onClose={() => setPaletteOpen(false)} catalog={catalog} onPick={addStep} />

      <NodeInspector
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
        message={`Tirar o passo "${removingIndex !== null ? (steps[removingIndex]?.name || '') : ''}" da edição? A versão que está no ar continua como está — a remoção só vale quando você salvar uma versão nova.`}
        confirmLabel="Remover"
        onClose={() => setRemovingIndex(null)}
        onConfirm={() => {
          mutateSteps((list) => { list.splice(removingIndex, 1); return list; });
          setRemovingIndex(null);
        }}
      />

      {/* Ligar/Desligar: os 5 patrasques nos dois sentidos. */}
      <ConfirmDialog
        open={!!powerConfirm}
        danger={powerConfirm === 'off'}
        loading={publishing}
        title={powerConfirm === 'off' ? 'Desligar o fluxo' : 'Ligar o fluxo'}
        message={
          powerConfirm === 'off'
            ? `Desligar "${workflow.name}"? Ele para de rodar quando o gatilho acontecer. Nada é apagado — o fluxo e o histórico ficam, e você pode ligar de novo depois.`
            : `Ligar "${workflow.name}"? Ele passa a rodar automaticamente quando o gatilho acontecer.${dirty ? ' Atenção: há alterações não salvas — elas NÃO entram até você salvar uma versão nova.' : ''}`
        }
        confirmLabel={powerConfirm === 'off' ? 'Desligar' : 'Ligar'}
        onClose={() => setPowerConfirm(null)}
        onConfirm={confirmPower}
      />

      {/* Só um Input — Modal é o container certo aqui. */}
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
            Salvar cria a <strong>v{proximaVersao}</strong> e não muda o que está no ar. Para pôr essa versão em uso, use <strong>Versões</strong> depois.
          </p>
          <Field label="O que mudou" hint="Aparece no histórico — ajuda a saber por que essa versão existe.">
            <Input value={saveNote} onChange={(e) => setSaveNote(e.target.value)} placeholder="Ex.: passa a avisar antes de encerrar" />
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

// Escolher o tipo do passo: leitura + escolha, sem campo → Modal.
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
    <Modal open={open} onClose={onClose} title="O que este passo deve fazer?" maxWidth={760}>
      <div className="space-y-4">
        {grouped.map(([category, defs]) => (
          <div key={category}>
            <p
              style={{
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em',
                margin: '0 0 6px', color: 'var(--su-text-muted)',
              }}
            >
              {category}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {defs.map((def) => (
                <button
                  key={def.type}
                  type="button"
                  className="text-left"
                  style={{
                    borderRadius: 8, padding: 12, minHeight: 44, cursor: 'pointer',
                    border: '1px solid var(--su-border-default)',
                    background: 'transparent', font: 'inherit',
                  }}
                  onClick={() => onPick(def)}
                >
                  <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: 'var(--su-text-primary)' }}>{def.label}</p>
                  <p style={{ fontSize: 11, margin: '2px 0 0', color: 'var(--su-text-muted)' }}>{def.description}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
        {!grouped.length && (
          <EmptyState icon="settings" title="Nenhum passo disponível" description="O catálogo de passos não respondeu — recarregue a tela." />
        )}
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
    success: 'der certo',
    error: 'der erro',
    true: 'a condição for verdadeira',
    false: 'a condição for falsa',
  };
  const opts = [{ value: '', label: 'der certo (padrão)' }];
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
