import React, { useEffect, useState } from 'react';
import { DashboardScreen, Card, DataTable, EmptyState, Badge, DSIcon, Field, Input, Spinner, useToast } from '@studio-ux-ds/react';
import { getCostsSummary } from '../../services/ai';
import { useWorkspace } from '../../context/WorkspaceContext';
import { PROVIDER_KINDS, formatUsd, formatTokens } from './ia.constants';

// IA/Custos — MOLDE `DashboardScreen`. É um PAINEL DE LEITURA (observabilidade):
// consumo e custo por provedor/assistente no período. Nada de configuração aqui.
//
// Decisão de produto (porte da ideia do "Painel da IA" do Aquapark): custo é
// ACOMPANHAMENTO, não gestão. As abas **Orçamentos** (definir limite/alerta —
// uma segunda fonte de configuração) e **Simulador** (planejamento) foram
// removidas da superfície para manter a tela como leitura. Se o limite mensal
// voltar a ser exposto, ele mora em Ajustes gerais, não num produto de custo à
// parte. Os KPIs são o assunto da tela (matiz por assunto, estável entre telas).

const PAGE_TITLE = 'Custos de IA';
const PAGE_SUBTITLE = 'Acompanhe o consumo e o custo estimado dos assistentes por provedor no período. É só leitura.';

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Custos() {
  const toast = useToast();
  const { environmentId } = useWorkspace();
  const [period, setPeriod] = useState(currentPeriod());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadSummary() {
    setLoading(true);
    try {
      setSummary(await getCostsSummary({ period, environment_id: environmentId || undefined }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSummary(); }, [period, environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = summary?.totals || summary || {};
  const rows = summary?.records || summary?.items || summary?.breakdown || [];

  // KPIs FIXOS (o assunto da tela — matiz por assunto).
  const stats = [
    { label: 'Custo total', value: formatUsd(totals.cost_usd ?? totals.total_cost_usd ?? 0), icon: <DSIcon name="chart-bar" />, hue: 'teal' },
    { label: 'Tokens', value: formatTokens((totals.tokens_prompt ?? 0) + (totals.tokens_completion ?? 0) || totals.total_tokens || 0), sub: 'prompt + resposta', icon: <DSIcon name="message" />, hue: 'indigo' },
    { label: 'Assistentes ativos', value: formatTokens(totals.agent_count ?? rows.length ?? 0), icon: <DSIcon name="users" />, hue: 'blue' },
  ];

  return (
    <DashboardScreen title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} stats={stats} statsCount={3}>
      <SummaryContent period={period} setPeriod={setPeriod} loading={loading} rows={rows} />
    </DashboardScreen>
  );
}

function SummaryContent({ period, setPeriod, loading, rows }) {
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
    <>
      <div style={{ maxWidth: 180 }}>
        <Field label="Mês">
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
      </div>
      {loading ? (
        <Spinner size="lg" center />
      ) : !rows.length ? (
        <Card>
          <EmptyState icon="chart-bar" title="Sem consumo no período" description="Nenhum registro de custo para o período selecionado." />
        </Card>
      ) : (
        <DataTable columns={columns} rows={rows} getRowId={(r, i) => r.id || i} />
      )}
    </>
  );
}
