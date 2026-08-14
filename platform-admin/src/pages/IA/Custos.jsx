import React, { useEffect, useState } from 'react';
import { DashboardScreen, StatCard, Card, DataTable, EmptyState, Badge, DSIcon, FormGrid, Field, Input, Select, NumericInput, Button, Checkbox, Modal, useToast } from '@studio-ux-ds/react';
import {
  getCostsSummary, listBudgets, createBudget, updateBudget, simulateCost,
} from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { PROVIDER_KINDS, formatUsd, formatTokens } from './ia.constants';

// IA/Custos — MOLDE `DashboardScreen` do DS (v0.10.34). Antes era <div> comum +
// PageHeader + Tabs: como não era `.su-screen`, a preferência de largura do
// Personalizar não a alcançava (era a única tela do IA Studio que faltava).
// Não é lista — é um painel (indicadores + tabela + calculadora), então o molde
// certo é o DashboardScreen, o mesmo que o AquaPark usa nos painéis. As abas
// Consumo / Orçamentos / Simulador são as `tabs` do molde; os KPIs (que são do
// Consumo) entram no slot `stats` só nessa aba.

const PAGE_TABS = [
  { id: 'summary',   label: 'Consumo' },
  { id: 'budgets',   label: 'Orçamentos' },
  { id: 'simulator', label: 'Simulador' },
];
const PAGE_TITLE = 'Custos de IA';
const PAGE_SUBTITLE = 'Consumo de IA e custo por provedor e assistente, com orçamentos e simulador.';

export default function Custos() {
  const [tab, setTab] = useState('summary');
  const seg = { tabs: PAGE_TABS, tab, onTab: setTab };
  if (tab === 'summary') return <SummaryTab seg={seg} />;
  if (tab === 'budgets') return <BudgetsTab seg={seg} />;
  return <SimulatorTab seg={seg} />;
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function SummaryTab({ seg }) {
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

  // KPIs do Consumo — no slot `stats` do DashboardScreen (matiz por assunto,
  // igual ao Painel: custo=verde-água, tokens=roxo, gente=azul).
  const stats = loading ? [] : [
    { label: 'Custo total', value: formatUsd(totals.cost_usd ?? totals.total_cost_usd), icon: <DSIcon name="chart-bar" />, hue: 'teal' },
    { label: 'Tokens', value: formatTokens((totals.tokens_prompt ?? 0) + (totals.tokens_completion ?? 0) || totals.total_tokens), sub: 'prompt + resposta', icon: <DSIcon name="message" />, hue: 'indigo' },
    { label: 'Assistentes ativos', value: formatTokens(totals.agent_count ?? rows.length), icon: <DSIcon name="users" />, hue: 'blue' },
  ];

  const columns = [
    { key: 'provider_kind', header: 'Provedor', render: (r) => <Badge tone="info">{providerLabel(r.provider_kind)}</Badge> },
    { key: 'model', header: 'Modelo', render: (r) => <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12, color: 'var(--su-text-muted)' }}>{r.model}</span> },
    { key: 'agent', header: 'Assistente', render: (r) => r.agent_name || r.agent_id || '—' },
    { key: 'tokens_prompt', header: 'Tokens (prompt)', align: 'right', render: (r) => formatTokens(r.tokens_prompt) },
    { key: 'tokens_completion', header: 'Tokens (resposta)', align: 'right', render: (r) => formatTokens(r.tokens_completion) },
    { key: 'cost_usd', header: 'Custo', align: 'right', render: (r) => <span style={{ fontWeight: 500 }}>{formatUsd(r.cost_usd)}</span> },
  ];

  return (
    <DashboardScreen title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} {...seg} stats={stats} statsCount={3} loading={loading}>
      <div style={{ maxWidth: 180 }}>
        <Field label="Mês">
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
      </div>
      {!rows.length ? (
        <Card>
          <EmptyState icon="chart-bar" title="Sem consumo no período" description="Nenhum registro de custo para o período selecionado." />
        </Card>
      ) : (
        <DataTable columns={columns} rows={rows} getRowId={(r, i) => r.id || i} />
      )}
    </DashboardScreen>
  );
}

function BudgetsTab({ seg }) {
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
    <>
      <DashboardScreen
        title={PAGE_TITLE}
        subtitle={PAGE_SUBTITLE}
        {...seg}
        statsCount={0}
        loading={loading}
        actions={canManage && (
          <Button variant="primary" icon="plus" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            Novo orçamento
          </Button>
        )}
      >
        {!items.length ? (
          <Card>
            <EmptyState icon="file" title="Nenhum orçamento" description="Crie um orçamento para controlar o gasto mensal com IA." />
          </Card>
        ) : (
          <DataTable
            columns={columns}
            rows={items}
            getRowId={(b) => b.id}
            onRowClick={canManage ? (b) => { setEditing(b); setEditorOpen(true); } : undefined}
            getRowLabel={(b) => `Editar orçamento de ${formatUsd(b.limit_usd)}/mês`}
          />
        )}
      </DashboardScreen>

      <BudgetModal
        open={editorOpen}
        budget={editing}
        workspaceId={workspaceId}
        environmentId={environmentId}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); load(); }}
      />
    </>
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
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Limite mensal (US$)">
            <NumericInput value={form.limit_usd} onChange={(v) => patch({ limit_usd: v })} min={0} step={1} fullWidth />
          </Field>
          <Field label="Alerta em (%)">
            <NumericInput value={form.alert_threshold_pct} onChange={(v) => patch({ alert_threshold_pct: v })} min={1} max={100} step={5} fullWidth />
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

function SimulatorTab({ seg }) {
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
    <DashboardScreen title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} {...seg} statsCount={0}>
      <Card>
        <div style={{ padding: 20 }} className="space-y-3">
          <FormGrid columns={2}>
            <Field label="Provedor">
              <Select value={form.provider_kind} onChange={(e) => patch({ provider_kind: e.target.value })}>
                {PROVIDER_KINDS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </Field>
            <Field label="Modelo">
              <Input value={form.model} onChange={(e) => patch({ model: e.target.value })} placeholder="gpt-4o-mini" />
            </Field>
          </FormGrid>
          <FormGrid columns={3}>
            <Field label="Tokens de prompt">
              <NumericInput value={form.prompt_tokens} onChange={(v) => patch({ prompt_tokens: v })} min={0} step={100} fullWidth />
            </Field>
            <Field label="Tokens de resposta">
              <NumericInput value={form.completion_tokens} onChange={(v) => patch({ completion_tokens: v })} min={0} step={100} fullWidth />
            </Field>
            <Field label="Nº de execuções">
              <NumericInput value={form.runs} onChange={(v) => patch({ runs: v })} min={1} step={1} fullWidth />
            </Field>
          </FormGrid>
          <div className="flex justify-end">
            <Button variant="primary" onClick={handleSimulate} loading={running} icon="settings">
              {running ? 'Simulando…' : 'Simular custo'}
            </Button>
          </div>
        </div>
      </Card>

      {result && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatCard label="Custo por execução" value={formatUsd(result.cost_per_run ?? result.unit_cost_usd)} icon={<DSIcon name="chart-bar" />} hue="teal" />
          <StatCard label="Custo total estimado" value={formatUsd(result.total_cost_usd ?? result.cost_usd)} sub={`${form.runs} execuções`} icon={<DSIcon name="chart-bar" />} hue="teal" />
        </div>
      )}
    </DashboardScreen>
  );
}
