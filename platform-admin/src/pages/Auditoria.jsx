import React, { useEffect, useState, useCallback } from 'react';
import { ScrollText, Loader2, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useToast } from '@studio-ux-ds/react';
import EmptyState from '../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Td, Badge, Pagination } from '../components/ui/Table';
import { TextInput } from '../components/ui/FormField';
import { listAudit } from '../services/audit';
import { formatDateTime } from '../lib/format';

const PER_PAGE = 20;

// Tela de auditoria da organização. Filtros: ação, entidade, período.
// Expandir a linha mostra old/new value em JSON formatado.
export default function Auditoria({ fetcher = listAudit, title = 'Auditoria', subtitle = 'Trilha de ações administrativas da organização.' }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [filters, setFilters] = useState({ action: '', entity: '', from: '', to: '' });

  const load = useCallback(async (p = 1, f = filters) => {
    setLoading(true);
    setExpanded(null);
    try {
      const { items: list, total: t } = await fetcher({
        action: f.action, entity: f.entity, from: f.from, to: f.to,
        page: p, per_page: PER_PAGE,
      });
      setItems(list);
      setTotal(t);
      setPage(p);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher, filters]);

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function set(field, value) { setFilters((f) => ({ ...f, [field]: value })); }

  function fmtJson(v) {
    if (v == null) return '—';
    try {
      return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v, null, 2);
    } catch {
      return String(v);
    }
  }

  const actorName = (log) => log.actor_name || log.actor?.name || log.actor_email || log.actor?.email || log.user_name || '—';
  const oldVal = (log) => log.old_value ?? log.old ?? log.before ?? null;
  const newVal = (log) => log.new_value ?? log.new ?? log.after ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>{title}</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>{subtitle}</p>
      </div>

      {/* Filtros */}
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <TextInput placeholder="Filtrar por ação" value={filters.action} onChange={(e) => set('action', e.target.value)} />
          <TextInput placeholder="Filtrar por item afetado" value={filters.entity} onChange={(e) => set('entity', e.target.value)} />
          <TextInput type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} title="Data inicial" />
          <TextInput type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} title="Data final" />
          <button className="btn-primary justify-center" onClick={() => load(1)} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Filtrar
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
        ) : !items.length ? (
          <EmptyState icon={ScrollText} title="Nenhum registro" description="Ajuste os filtros ou aguarde novas ações." />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block">
              <Table>
                <Thead>
                  <Th className="w-8" />
                  <Th>Data</Th><Th>Ator</Th><Th>Ação</Th><Th>Entidade</Th><Th>Status</Th>
                </Thead>
                <Tbody>
                  {items.map((log) => {
                    const open = expanded === log.id;
                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          className="table-row cursor-pointer"
                          onClick={() => setExpanded(open ? null : log.id)}
                        >
                          <Td>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</Td>
                          <Td className="whitespace-nowrap">{formatDateTime(log.created_at)}</Td>
                          <Td>{actorName(log)}</Td>
                          <Td><code className="text-xs">{log.action}</code></Td>
                          <Td>{log.entity_type || log.entity || '—'}</Td>
                          <Td>
                            {log.status === 'FAILURE'
                              ? <Badge variant="red">Falha</Badge>
                              : <Badge variant="green">Sucesso</Badge>}
                          </Td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={6} className="px-4 py-3" style={{ backgroundColor: 'var(--ap-surface-2)' }}>
                              <ExpandedDetail log={log} oldVal={oldVal(log)} newVal={newVal(log)} fmtJson={fmtJson} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </Tbody>
              </Table>
              <Pagination page={page} total={total} perPage={PER_PAGE} onPage={(p) => load(p)} />
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y px-4" style={{ borderColor: 'var(--ap-border)' }}>
              {items.map((log) => {
                const open = expanded === log.id;
                return (
                  <div key={log.id} className="py-3">
                    <button className="w-full text-left flex items-start gap-2" onClick={() => setExpanded(open ? null : log.id)}>
                      {open ? <ChevronDown size={14} className="mt-0.5 shrink-0" /> : <ChevronRight size={14} className="mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>
                          <code className="text-xs">{log.action}</code>
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
                          {actorName(log)} · {formatDateTime(log.created_at)}
                        </p>
                      </div>
                    </button>
                    {open && (
                      <div className="mt-2 pl-6">
                        <ExpandedDetail log={log} oldVal={oldVal(log)} newVal={newVal(log)} fmtJson={fmtJson} />
                      </div>
                    )}
                  </div>
                );
              })}
              <Pagination page={page} total={total} perPage={PER_PAGE} onPage={(p) => load(p)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ExpandedDetail({ log, oldVal, newVal, fmtJson }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs" style={{ color: 'var(--ap-text-4)' }}>
        {log.entity_id && <span>Entidade: <code>{log.entity_id}</code></span>}
        {log.ip && <span>IP: {log.ip}</span>}
        {log.organization_name && <span>Organização: {log.organization_name}</span>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--ap-text-5)' }}>Valor anterior</p>
          <pre
            className="text-xs rounded-lg p-3 overflow-x-auto max-h-64"
            style={{ backgroundColor: 'var(--ap-surface-3)', color: 'var(--ap-text-2)', border: '1px solid var(--ap-border)' }}
          >{fmtJson(oldVal)}</pre>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--ap-text-5)' }}>Valor novo</p>
          <pre
            className="text-xs rounded-lg p-3 overflow-x-auto max-h-64"
            style={{ backgroundColor: 'var(--ap-surface-3)', color: 'var(--ap-text-2)', border: '1px solid var(--ap-border)' }}
          >{fmtJson(newVal)}</pre>
        </div>
      </div>
    </div>
  );
}
