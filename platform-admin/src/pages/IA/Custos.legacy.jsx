// LEGADO (2026-07-24). Versão anterior de IA/Custos preservada para rollback:
// se a migração pro DS causar regressão, basta trocar o import em App.jsx
// (Custos → Custos.legacy). Este arquivo NÃO é referenciado enquanto o novo
// estiver ativo.
import React, { useEffect, useState } from 'react';
import {
  DollarSign, Loader2, Plus, Coins, Cpu, Bot, Calculator, Pencil,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Tabs from '../../components/ui/Tabs';
import EmptyState from '../../components/ui/EmptyState';
import StatCard from '../../components/ui/StatCard';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, TextInput, Select, NumberInput } from '../../components/ui/FormField';
import {
  getCostsSummary, listBudgets, createBudget, updateBudget, simulateCost,
} from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useToast } from '@studio-ux-ds/react';
import { PROVIDER_KINDS, formatUsd, formatTokens } from './ia.constants';

const PAGE_TABS = [
  { id: 'summary',   label: 'Consumo',    Icon: Coins },
  { id: 'budgets',   label: 'Orçamentos', Icon: DollarSign },
  { id: 'simulator', label: 'Simulador',  Icon: Calculator },
];

export default function CustosLegacy() {
  const [tab, setTab] = useState('summary');
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Custos de IA</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
          Consumo de IA e custo por provedor e assistente, com orçamentos e simulador.
        </p>
      </div>
      <Tabs items={PAGE_TABS} active={tab} onChange={setTab} />
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
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [period, environmentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = summary?.totals || summary || {};
  const rows = summary?.records || summary?.items || summary?.breakdown || [];
  const providerLabel = (k) => PROVIDER_KINDS.find((p) => p.value === k)?.label || k;
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <FormField label="Mês" className="w-44">
          <TextInput type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </FormField>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Custo total" value={formatUsd(totals.cost_usd ?? totals.total_cost_usd)} icon={DollarSign} color="green" />
            <StatCard label="Tokens" value={formatTokens((totals.tokens_prompt ?? 0) + (totals.tokens_completion ?? 0) || totals.total_tokens)} sub="prompt + resposta" icon={Cpu} color="blue" />
            <StatCard label="Assistentes ativos" value={formatTokens(totals.agent_count ?? rows.length)} icon={Bot} color="purple" />
          </div>
          <div className="card p-0 overflow-hidden">
            {!rows.length ? (
              <EmptyState icon={Coins} title="Sem consumo no período" description="Nenhum registro de custo para o período selecionado." />
            ) : (
              <Table>
                <Thead>
                  <Th>Provedor</Th><Th>Modelo</Th><Th>Assistente</Th><Th>Tokens (prompt)</Th><Th>Tokens (resposta)</Th><Th>Custo</Th>
                </Thead>
                <Tbody>
                  {rows.map((r, i) => (
                    <Tr key={r.id || i}>
                      <Td><Badge variant="blue">{providerLabel(r.provider_kind)}</Badge></Td>
                      <Td><span className="font-mono text-xs" style={{ color: 'var(--ap-text-3)' }}>{r.model}</span></Td>
                      <Td>{r.agent_name || r.agent_id || '—'}</Td>
                      <Td>{formatTokens(r.tokens_prompt)}</Td>
                      <Td>{formatTokens(r.tokens_completion)}</Td>
                      <Td><span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{formatUsd(r.cost_usd)}</span></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </div>
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
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [environmentId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-xs flex-1" style={{ color: 'var(--ap-text-4)' }}>
          Orçamentos mensais com alerta e bloqueio opcional. Alerta e bloqueio nascem desligados.
        </p>
        {canManage && <button className="btn-primary" onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus size={14} /> Novo orçamento</button>}
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card"><EmptyState icon={DollarSign} title="Nenhum orçamento" description="Crie um orçamento para controlar o gasto mensal com IA." /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <Table>
            <Thead>
              <Th>Limite</Th><Th>Alerta em</Th><Th>Bloqueio</Th><Th>Status</Th><Th className="text-right">Ações</Th>
            </Thead>
            <Tbody>
              {items.map((b) => (
                <Tr key={b.id}>
                  <Td><span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{formatUsd(b.limit_usd)}/mês</span></Td>
                  <Td>{b.alert_threshold_pct ?? 80}%</Td>
                  <Td>{b.block_on_exceed ? <Badge variant="red">Bloqueia</Badge> : <span className="text-xs" style={{ color: 'var(--ap-text-5)' }}>só alerta</span>}</Td>
                  <Td>{b.is_active ? <Badge variant="green">Ativo</Badge> : <Badge variant="gray">Desligado</Badge>}</Td>
                  <Td className="text-right">
                    {canManage && <button className="btn-ghost p-1.5" title="Editar" onClick={() => { setEditing(b); setEditorOpen(true); }}><Pencil size={14} className="text-brand" /></button>}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
      <BudgetModal open={editorOpen} budget={editing} workspaceId={workspaceId} environmentId={environmentId}
        onClose={() => setEditorOpen(false)} onSaved={() => { setEditorOpen(false); load(); }} />
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
      const base = { limit_usd: form.limit_usd, alert_threshold_pct: form.alert_threshold_pct, block_on_exceed: form.block_on_exceed };
      if (isEdit) await updateBudget(budget.id, { ...base, is_active: form.is_active });
      else await createBudget({ ...base, is_active: form.is_active, period_kind: 'MONTHLY', workspace_id: workspaceId, environment_id: environmentId });
      toast.success(isEdit ? 'Orçamento atualizado.' : 'Orçamento criado.');
      onSaved();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={saving ? undefined : onClose} title={isEdit ? 'Editar orçamento' : 'Novo orçamento'} size="md" dismissable={!saving}
      footer={<>
        <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 size={14} className="animate-spin" />} Salvar
        </button>
      </>}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Limite mensal (US$)" required><NumberInput value={form.limit_usd} onChange={(v) => patch({ limit_usd: v })} min={0} step={1} /></FormField>
          <FormField label="Alerta em (%)"><NumberInput value={form.alert_threshold_pct} onChange={(v) => patch({ alert_threshold_pct: v })} min={1} max={100} step={5} /></FormField>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--ap-text-2)' }}>
          <input type="checkbox" checked={form.block_on_exceed} onChange={(e) => patch({ block_on_exceed: e.target.checked })} className="w-4 h-4 accent-current" />
          Bloquear execuções ao ultrapassar o limite
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--ap-text-2)' }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => patch({ is_active: e.target.checked })} className="w-4 h-4 accent-current" />
          Ativar o orçamento (nasce desligado)
        </label>
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
      const res = await simulateCost({ model: form.model.trim(), prompt_tokens: form.prompt_tokens, completion_tokens: form.completion_tokens, runs_per_month: form.runs });
      setResult(res);
    } catch (err) { toast.error(err.message); }
    finally { setRunning(false); }
  }
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Provedor"><Select value={form.provider_kind} onChange={(e) => patch({ provider_kind: e.target.value })}>{PROVIDER_KINDS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></FormField>
          <FormField label="Modelo"><TextInput value={form.model} onChange={(e) => patch({ model: e.target.value })} placeholder="gpt-4o-mini" /></FormField>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FormField label="Tokens de prompt"><NumberInput value={form.prompt_tokens} onChange={(v) => patch({ prompt_tokens: v })} min={0} step={100} /></FormField>
          <FormField label="Tokens de resposta"><NumberInput value={form.completion_tokens} onChange={(v) => patch({ completion_tokens: v })} min={0} step={100} /></FormField>
          <FormField label="Nº de execuções"><NumberInput value={form.runs} onChange={(v) => patch({ runs: v })} min={1} step={1} /></FormField>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary disabled:opacity-60" onClick={handleSimulate} disabled={running}>
            {running ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />} Simular custo
          </button>
        </div>
      </div>
      {result && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatCard label="Custo por execução" value={formatUsd(result.cost_per_run ?? result.unit_cost_usd)} icon={DollarSign} color="blue" />
          <StatCard label="Custo total estimado" value={formatUsd(result.total_cost_usd ?? result.cost_usd)} sub={`${form.runs} execuções`} icon={Coins} color="green" />
        </div>
      )}
    </div>
  );
}
