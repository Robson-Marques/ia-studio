import React, { useEffect, useMemo, useState } from 'react';
import { Gauge, Loader2 } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td } from '../components/ui/Table';
import { getGlobalUsage } from '../services/usage';
import { formatNumber, formatLimit } from '../lib/format';
import { toast } from '../lib/toast';

const METRIC_LABELS = {
  users: 'Usuários', workspaces: 'Workspaces', agents: 'Assistentes', flows: 'Fluxos',
  executions: 'Execuções', tokens: 'Consumo de IA', whatsapp_numbers: 'Números WhatsApp',
  google_accounts: 'Contas Google', connections: 'Conexões',
};

// Consumo global: organização × métrica do mês corrente.
export default function Consumo() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { items } = await getGlobalUsage();
        if (alive) setRows(normalizeUsage(items));
      } catch (err) {
        toast.error(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Agrupa por organização pra visual mais legivel.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = r.orgId || r.orgName;
      if (!map.has(key)) map.set(key, { name: r.orgName, metrics: [] });
      map.get(key).metrics.push(r);
    }
    return Array.from(map.values());
  }, [rows]);

  const monthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Consumo</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
          Consumo por organização e métrica — {monthLabel}.
        </p>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
        ) : !grouped.length ? (
          <EmptyState icon={Gauge} title="Sem consumo registrado" description="Nenhuma métrica registrada no mês corrente." />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block">
              <Table>
                <Thead>
                  <Th>Organização</Th><Th>Métrica</Th><Th className="text-right">Consumo</Th><Th className="text-right">Limite</Th><Th className="w-48">Utilização</Th>
                </Thead>
                <Tbody>
                  {grouped.flatMap((g) =>
                    g.metrics.map((m, i) => (
                      <Tr key={`${g.name}-${m.metric}`}>
                        <Td className="font-medium">{i === 0 ? g.name : ''}</Td>
                        <Td>{METRIC_LABELS[m.metric] || m.metric}</Td>
                        <Td className="text-right">{formatNumber(m.value)}</Td>
                        <Td className="text-right">{formatLimit(m.limit)}</Td>
                        <Td><UsageBar value={m.value} limit={m.limit} /></Td>
                      </Tr>
                    )),
                  )}
                </Tbody>
              </Table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y px-4" style={{ borderColor: 'var(--ap-border)' }}>
              {grouped.map((g) => (
                <div key={g.name} className="py-3">
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ap-text-1)' }}>{g.name}</p>
                  <div className="space-y-2">
                    {g.metrics.map((m) => (
                      <div key={m.metric}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs" style={{ color: 'var(--ap-text-3)' }}>{METRIC_LABELS[m.metric] || m.metric}</span>
                          <span className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
                            {formatNumber(m.value)} / {formatLimit(m.limit)}
                          </span>
                        </div>
                        <UsageBar value={m.value} limit={m.limit} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function UsageBar({ value, limit }) {
  const unlimited = limit == null;
  const pct = unlimited ? 0 : Math.min(100, ((value || 0) / (limit || 1)) * 100);
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : 'var(--ap-accent)';
  return (
    <div className="h-2 rounded-full overflow-hidden w-full" style={{ backgroundColor: 'var(--ap-surface-3)' }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: unlimited ? '4%' : `${pct}%`, backgroundColor: unlimited ? 'var(--ap-text-5)' : color }}
      />
    </div>
  );
}

// Normaliza formatos possiveis do /console/usage:
//   [{ organization_id, organization_name, metric, value, limit }]
//   [{ organization: {id,name}, usage: {metric: value}, limits: {...} }]
function normalizeUsage(items) {
  const rows = [];
  for (const it of items || []) {
    if (it.metric !== undefined) {
      rows.push({
        orgId: it.organization_id || it.org_id,
        orgName: it.organization_name || it.organization?.name || it.org_name || '—',
        metric: it.metric,
        value: it.value ?? it.total ?? 0,
        limit: it.limit ?? null,
      });
    } else if (it.usage && typeof it.usage === 'object') {
      const limits = it.limits || {};
      for (const [metric, value] of Object.entries(it.usage)) {
        rows.push({
          orgId: it.organization_id || it.organization?.id || it.id,
          orgName: it.organization_name || it.organization?.name || it.name || '—',
          metric,
          value,
          limit: limits[metric] ?? null,
        });
      }
    }
  }
  return rows;
}
