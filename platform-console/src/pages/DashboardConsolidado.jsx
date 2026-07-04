import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard, Building2, Activity, AlertTriangle, DollarSign, Cpu,
  MessageCircle, Mail, Plug, ListChecks, Loader2, RefreshCw,
} from 'lucide-react';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../components/ui/Table';
import { getOverview } from '../services/dashboards';
import { formatNumber } from '../lib/format';
import { toast } from '../lib/toast';

// Dashboard consolidado (global) — agregações read-only do Console.
export default function DashboardConsolidado() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(initial = false) {
    if (initial) setLoading(true); else setRefreshing(true);
    try {
      const overview = await getOverview();
      setData(overview);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(true); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Dashboard consolidado</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Visão agregada da operação — organizações, execuções, IA, comunicação e infraestrutura.
          </p>
        </div>
        <button className="btn-secondary disabled:opacity-60" onClick={() => load(false)} disabled={loading || refreshing}>
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !data ? (
        <div className="card overflow-hidden">
          <EmptyState icon={LayoutDashboard} title="Sem dados" description="Não foi possível carregar as agregações." />
        </div>
      ) : (
        <>
          {/* StatCards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Organizações" value={formatNumber(data.organizations)} icon={Building2} color="brand" />
            <StatCard label="Execuções" value={formatNumber(data.executions)} sub={`${formatNumber(data.execution_errors)} com erro`} icon={Activity} color="blue" />
            <StatCard label="Erros de execução" value={formatNumber(data.execution_errors)} icon={AlertTriangle} color={data.execution_errors > 0 ? 'red' : 'green'} />
            <StatCard label="Custo IA (USD)" value={formatUsd(data.ai_cost_usd)} sub={`${formatNumber(data.ai_tokens)} tokens`} icon={DollarSign} color="green" />
            <StatCard label="Tokens IA" value={formatNumber(data.ai_tokens)} icon={Cpu} color="purple" />
            <StatCard label="Mensagens WhatsApp" value={formatNumber(data.whatsapp_messages)} icon={MessageCircle} color="green" />
            <StatCard label="E-mails" value={formatNumber(data.emails)} icon={Mail} color="blue" />
          </div>

          {/* Mini-tabelas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MiniTable
              title="Saúde das conexões"
              icon={Plug}
              rows={data.connections_health}
              empty="Nenhuma conexão registrada."
              columns={[
                { key: 'name', label: 'Conexão', render: (r) => connName(r) },
                { key: 'health', label: 'Estado', align: 'right', render: (r) => <HealthBadge status={connHealth(r)} /> },
              ]}
            />
            <MiniTable
              title="Filas"
              icon={ListChecks}
              rows={data.queues}
              empty="Nenhuma fila reportada (n/d)."
              columns={[
                { key: 'name', label: 'Fila', render: (r) => queueName(r) },
                { key: 'waiting', label: 'Pendentes', align: 'right', render: (r) => reportNum(queueWaiting(r)) },
                { key: 'active', label: 'Ativos', align: 'right', render: (r) => reportNum(queueActive(r)) },
                { key: 'failed', label: 'Falhas', align: 'right', render: (r) => reportNum(queueFailed(r)) },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Mini-tabela reutilizável ───────────────────────── */

function MiniTable({ title, icon: Icon, rows, columns, empty }) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--ap-border)' }}>
        {Icon && <Icon size={15} className="text-brand" />}
        <p className="text-sm font-semibold" style={{ color: 'var(--ap-text-1)' }}>{title}</p>
      </div>
      {!list.length ? (
        <EmptyState icon={Icon} title="Sem dados" description={empty} />
      ) : (
        <Table>
          <Thead>
            {columns.map((c) => (
              <Th key={c.key} className={c.align === 'right' ? 'text-right' : undefined}>{c.label}</Th>
            ))}
          </Thead>
          <Tbody>
            {list.map((r, i) => (
              <Tr key={i}>
                {columns.map((c) => (
                  <Td key={c.key} className={c.align === 'right' ? 'text-right' : undefined}>
                    {c.render ? c.render(r) : (r?.[c.key] ?? '—')}
                  </Td>
                ))}
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}

function HealthBadge({ status }) {
  const s = String(status || '').toLowerCase();
  if (['healthy', 'ok', 'up', 'connected', 'online'].includes(s)) return <Badge variant="green">Saudável</Badge>;
  if (['degraded', 'warning', 'warn'].includes(s)) return <Badge variant="yellow">Degradado</Badge>;
  if (['down', 'error', 'unhealthy', 'disconnected', 'offline'].includes(s)) return <Badge variant="red">Fora do ar</Badge>;
  return <Badge variant="gray">{status || 'n/d'}</Badge>;
}

/* ───── helpers defensivos de shape ───── */
function connName(r) { return r?.name || r?.instance || r?.connection || r?.provider || r?.label || '—'; }
function connHealth(r) { return r?.health || r?.status || r?.state || 'n/d'; }
function queueName(r) { return r?.name || r?.queue || r?.label || '—'; }
function queueWaiting(r) { return r?.waiting ?? r?.pending ?? r?.count ?? null; }
function queueActive(r) { return r?.active ?? r?.running ?? null; }
function queueFailed(r) { return r?.failed ?? r?.errors ?? null; }

function reportNum(v) { return v == null ? 'n/d' : formatNumber(v); }

function formatUsd(value) {
  if (value == null) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
