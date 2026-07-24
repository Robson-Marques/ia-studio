import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Tabs, StatCard, Card, DataTable, EmptyState, Badge,
  Field, Input, Select, NumericInput, Button, Checkbox, Modal,
  useToast,
} from '@studio-ux-ds/react';
import {
  getCostsSummary, listBudgets, createBudget, updateBudget, simulateCost,
} from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { PROVIDER_KINDS, formatUsd, formatTokens } from './ia.constants';

// IA/Custos — 1ª tela migrada pro DS na frente de família IA Studio (v0.9.84,
// 2026-07-24). Substitui components/ui/* locais por @studio-ux-ds/react:
// PageHeader + Tabs + Card + StatCard (tone info/success/neutral) + DataTable
// + EmptyState + Modal + Field + Input + Select + NumericInput + Button +
// Checkbox. Dados/lógica idênticos ao Custos.legacy — apenas a casca visual
// mudou. Modal do DS usa `maxWidth` (número, não `size`). NumericInput onChange
// recebe number direto. Tabs usa `value`/`onChange` (não `active`).

const PAGE_TABS = [
  { id: 'summary',   label: 'Consumo' },
  { id: 'budgets',   label: 'Orçamentos' },
  { id: 'simulator', label: 'Simulador' },
];

export default function Custos() {
  const [tab, setTab] = useState('summary');
  return (
    <div className="space-y-6">
      <PageHeader
        title="Custos de IA"
        subtitle="Consumo de IA e custo por provedor e assistente, com orçamentos e simulador."
      />
      <Tabs items={PAGE_TABS} value={tab} onChange={setTab} />
      {tab === 'summary' && <SummaryTab />}
      {tab === 'budgets' && <BudgetsTab />}
      {tab === 'simulator' && <SimulatorTab />}
    </div>
  );
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function SummaryTab() {
  const toast = useToast();
  const { environmentId } = useWorkspace();
  const [period, setPeriod] = useState(currentPeriod());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setSummary(await getCostsSummary({ period, environment_id: environmentId || undefined }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [period, environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = summary?.totals || summary || {};
  const rows = summary?.records || summary?.items || summary?.breakdown || [];
  const providerLabel = (k) => PROVIDER_KINDS.find((p) => p.value === k)?.label || k;

  const columns = [
    { key: 'provider_kind', header: 'Provedor', render: (r) => <Badge tone="info">{providerLabel(r.provider_kind)}</Badge> },
    { key: 'model', header: 'Modelo', render: (r) => <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12, color: 'var(--su-text-muted)' }}>{r.model}</span> },
    { key: 'agent', header: 'Assistente', render: (r) => r.agent_name || r.agent_id || '—' },
    { key: 'tokens_prompt', header: 'Tokens (prompt)', align: 'right', render: (r) => formatTokens(r.tokens_prompt) },
    { key: 'tokens_completion', header: 'Tokens (resposta)', align: 'right', render: (r) => formatTokens(r.tokens_completion) },
    { key: 'cost_usd', header: 'Custo', align: 'right', render: (r) => <span style={{ fontWeight: 500 }}>{formatUsd(r.cost_usd)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div style={{ maxWidth: 180 }}>
        <Field label="Mês">
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Custo total" value={formatUsd(totals.cost_usd ?? totals.total_cost_usd)} tone="success" />
            <StatCard label="Tokens" value={formatTokens((totals.tokens_prompt ?? 0) + (totals.tokens_completion ?? 0) || totals.total_tokens)} delta="prompt + resposta" tone="info" />
            <StatCard label="Assistentes ativos" value={formatTokens(totals.agent_count ?? rows.length)} tone="neutral" />
          </div>

          {!rows.length ? (
            <Card>
              <EmptyState icon="chart-bar" title="Sem consumo no período" description="Nenhum registro de custo para o período selecionado." />
            </Card>
          ) : (
            <DataTable columns={columns} rows={rows} getRowId={(r, i) => r.id || i} />
          )}
        </>
      )}
    </div>
  );
}

function BudgetsTab() {
  const toast = useToast();
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const canManage = can('ai.costs.manage');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listBudgets({ environment_id: environmentId || undefined });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'limit', header: 'Limite', render: (b) => <span style={{ fontWeight: 500 }}>{formatUsd(b.limit_usd)}/mês</span> },
    { key: 'alert', header: 'Alerta em', render: (b) => `${b.alert_threshold_pct ?? 80}%` },
    { key: 'block', header: 'Bloqueio', render: (b) => b.block_on_exceed
      ? <Badge tone="danger">Bloqueia</Badge>
      : <span style={{ fontSize: 12, color: 'var(--su-text-muted)' }}>só alerta</span>
    },
    { key: 'status', header: 'Status', render: (b) => b.is_active
      ? <Badge tone="success">Ativo</Badge>
      : <Badge tone="neutral">Desligado</Badge>
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-xs flex-1" style={{ color: 'var(--su-text-muted)' }}>
          Orçamentos mensais com alerta e bloqueio opcional. Alerta e bloqueio nascem desligados.
        </p>
        {canManage && (
          <Button variant="primary" icon="plus" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            Novo orçamento
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      ) : !items.length ? (
        <Card>
          <EmptyState icon="file" title="Nenhum orçamento" description="Crie um orçamento para controlar o gasto mensal com IA." />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          getRowId={(b) => b.id}
          renderRowMenu={canManage ? (b) => (
            <Button variant="ghost" size="sm" icon="edit" aria-label="Editar" onClick={() => { setEditing(b); setEditorOpen(true); }} />
          ) : undefined}
        />
      )}

      <BudgetModal
        open={editorOpen}
        budget={editing}
        workspaceId={workspaceId}
        environmentId={environmentId}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); load(); }}
      />
    </div>
  );
}

function BudgetModal({ open, budget, onClose, onSaved, workspaceId, environmentId }) {
  const toast = useToast();
  const isEdit = !!budget?.id;
  const [form, setForm] = useState({ limit_usd: 100, alert_threshold_pct: 80, block_on_exceed: false, is_active: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(budget
      ? { limit_usd: budget.limit_usd ?? 100, alert_threshold_pct: budget.alert_threshold_pct ?? 80, block_on_exceed: !!budget.block_on_exceed, is_active: !!budget.is_active }
      : { limit_usd: 100, alert_threshold_pct: 80, block_on_exceed: false, is_active: false });
  }, [open, budget?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSave() {
    if (!isEdit && (!workspaceId || !environmentId)) { toast.error('Selecione um workspace e um ambiente no topo.'); return; }
    setSaving(true);
    try {
      // Corpos separados: create aceita period_kind (imutável) mas não is_active;
      // update aceita is_active mas não period_kind (whitelist do backend).
      const base = {
        limit_usd: form.limit_usd,
        alert_threshold_pct: form.alert_threshold_pct,
        block_on_exceed: form.block_on_exceed,
      };
      if (isEdit) await updateBudget(budget.id, { ...base, is_active: form.is_active });
      else await createBudget({ ...base, is_active: form.is_active, period_kind: 'MONTHLY', workspace_id: workspaceId, environment_id: environmentId });
      toast.success(isEdit ? 'Orçamento atualizado.' : 'Orçamento criado.');
      onSaved();
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
      title={isEdit ? 'Editar orçamento' : 'Novo orçamento'}
      maxWidth={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving} icon={saving ? 'loader-2' : undefined}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Limite mensal (US$)">
            <NumericInput value={form.limit_usd} onChange={(v) => patch({ limit_usd: v })} min={0} step={1} />
          </Field>
          <Field label="Alerta em (%)">
            <NumericInput value={form.alert_threshold_pct} onChange={(v) => patch({ alert_threshold_pct: v })} min={1} max={100} step={5} />
          </Field>
        </div>
        <Checkbox
          id="budget-block-on-exceed"
          label="Bloquear execuções ao ultrapassar o limite"
          checked={form.block_on_exceed}
          onChange={(e) => patch({ block_on_exceed: e.target.checked })}
        />
        <Checkbox
          id="budget-is-active"
          label="Ativar o orçamento (nasce desligado)"
          checked={form.is_active}
          onChange={(e) => patch({ is_active: e.target.checked })}
        />
      </div>
    </Modal>
  );
}

function SimulatorTab() {
  const toast = useToast();
  const [form, setForm] = useState({ provider_kind: 'OPENAI', model: 'gpt-4o-mini', prompt_tokens: 1000, completion_tokens: 500, runs: 1 });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSimulate() {
    if (!form.model.trim()) { toast.error('Informe o modelo.'); return; }
    setRunning(true);
    setResult(null);
    try {
      const res = await simulateCost({
        model: form.model.trim(),
        prompt_tokens: form.prompt_tokens,
        completion_tokens: form.completion_tokens,
        runs_per_month: form.runs,
      });
      setResult(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4" style={{ maxWidth: 720 }}>
      <Card>
        <div style={{ padding: 20 }} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Provedor">
              <Select value={form.provider_kind} onChange={(e) => patch({ provider_kind: e.target.value })}>
                {PROVIDER_KINDS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </Field>
            <Field label="Modelo">
              <Input value={form.model} onChange={(e) => patch({ model: e.target.value })} placeholder="gpt-4o-mini" />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Tokens de prompt">
              <NumericInput value={form.prompt_tokens} onChange={(v) => patch({ prompt_tokens: v })} min={0} step={100} />
            </Field>
            <Field label="Tokens de resposta">
              <NumericInput value={form.completion_tokens} onChange={(v) => patch({ completion_tokens: v })} min={0} step={100} />
            </Field>
            <Field label="Nº de execuções">
              <NumericInput value={form.runs} onChange={(v) => patch({ runs: v })} min={1} step={1} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={handleSimulate} disabled={running} icon={running ? 'loader-2' : 'settings'}>
              {running ? 'Simulando…' : 'Simular custo'}
            </Button>
          </div>
        </div>
      </Card>

      {result && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatCard label="Custo por execução" value={formatUsd(result.cost_per_run ?? result.unit_cost_usd)} tone="info" />
          <StatCard label="Custo total estimado" value={formatUsd(result.total_cost_usd ?? result.cost_usd)} delta={`${form.runs} execuções`} tone="success" />
        </div>
      )}
    </div>
  );
}
