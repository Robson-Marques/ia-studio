import React, { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, Compass, Eye } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, TextInput, Select } from '../../components/ui/FormField';
import { useToast } from '@studio-ux-ds/react';
import { getResourceCatalog, exploreResource } from '../../services/resource';
import { listConnections } from '../../services/integrations';

// Recursos → Explorer (read-only): seleciona conexão + tipo canônico + busca →
// tabela de registros canônicos + detalhe em Modal. Não persiste nada.
export default function Explorer() {
  const toast = useToast();
  const [catalog, setCatalog] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [connectionId, setConnectionId] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [query, setQuery] = useState('');

  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState(null); // { records, count, source_operation, ... }
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    (async () => {
      setLoadingMeta(true);
      try {
        const [{ items: cat }, { items: conns }] = await Promise.all([
          getResourceCatalog(),
          listConnections(),
        ]);
        setCatalog(cat);
        setConnections(conns);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, []);

  const typeLabel = useMemo(() => {
    const map = new Map(catalog.map((t) => [t.type, t.label]));
    return (type) => map.get(type) || type;
  }, [catalog]);

  // Colunas exibidas: os campos canônicos do tipo (limitados para caber).
  const columns = useMemo(() => {
    const def = catalog.find((t) => t.type === resourceType);
    if (!def) return [];
    const base = (def.fields || []).map((f) => ({ key: f.key, label: f.label }));
    const ext = (def.extensions || []).flatMap((e) => (e.fields || []).map((f) => ({ key: f.key, label: f.label })));
    return [...base, ...ext];
  }, [catalog, resourceType]);

  async function handleSearch() {
    if (!connectionId) { toast.error('Selecione a conexão.'); return; }
    if (!resourceType) { toast.error('Selecione o tipo de recurso.'); return; }
    setSearching(true);
    setResult(null);
    try {
      const res = await exploreResource({
        connection_id: connectionId,
        resource_type: resourceType,
        query: query.trim() || undefined,
      });
      setResult(res);
      if (res?.empty) toast.info('Nenhum registro encontrado para a busca.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSearching(false);
    }
  }

  const records = result?.records || [];
  // Colunas visíveis na tabela: no máximo 6 para não estourar.
  const tableCols = columns.slice(0, 6);

  function cell(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Explorer de Recursos</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
          Consulta somente leitura: escolha a conexão e o tipo canônico, busque e inspecione os registros. Nada é gravado.
        </p>
      </div>

      <div className="card p-4">
        {loadingMeta ? (
          <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.5fr_auto] gap-3 items-end">
            <FormField label="Conexão" required>
              <Select value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
                <option value="">Selecione…</option>
                {connections.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.provider_key}</option>)}
              </Select>
            </FormField>
            <FormField label="Tipo de recurso" required>
              <Select value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
                <option value="">Selecione…</option>
                {catalog.map((t) => <option key={t.type} value={t.type}>{t.label} ({t.type})</option>)}
              </Select>
            </FormField>
            <FormField label="Busca">
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="Termo livre (opcional)"
              />
            </FormField>
            <button className="btn-primary disabled:opacity-60" disabled={searching} onClick={handleSearch}>
              {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Buscar
            </button>
          </div>
        )}
      </div>

      {searching ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !result ? (
        <div className="card">
          <EmptyState icon={Compass} title="Comece uma busca" description="Selecione uma conexão e um tipo de recurso para explorar os dados em formato canônico." />
        </div>
      ) : !records.length ? (
        <div className="card">
          <EmptyState icon={Search} title="Nenhum registro" description={`Nenhum resultado para ${typeLabel(result.resource_type)} (operação ${result.source_operation}).`} />
        </div>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            {result.count} registro(s) · operação <span className="font-mono">{result.source_operation}</span>
          </p>

          {/* Desktop */}
          <div className="card p-0 overflow-hidden hidden md:block">
            <Table>
              <Thead>
                {tableCols.map((c) => <Th key={c.key}>{c.label}</Th>)}
                <Th className="text-right">Ações</Th>
              </Thead>
              <Tbody>
                {records.map((rec, i) => (
                  <Tr key={rec.id || i} onClick={() => setDetail(rec)}>
                    {tableCols.map((c) => (
                      <Td key={c.key}><span className="text-xs" style={{ color: 'var(--ap-text-2)' }}>{cell(rec[c.key])}</span></Td>
                    ))}
                    <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <button className="btn-ghost p-1.5" title="Ver detalhe" onClick={() => setDetail(rec)}>
                        <Eye size={14} className="text-brand" />
                      </button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {records.map((rec, i) => (
              <button key={rec.id || i} className="card p-3 w-full text-left" onClick={() => setDetail(rec)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>
                    {cell(rec[tableCols[0]?.key]) || `#${i + 1}`}
                  </span>
                  <Eye size={15} className="text-brand shrink-0" />
                </div>
                {tableCols.slice(1, 4).map((c) => (
                  <p key={c.key} className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--ap-text-4)' }}>
                    <span style={{ color: 'var(--ap-text-5)' }}>{c.label}:</span> {cell(rec[c.key])}
                  </p>
                ))}
              </button>
            ))}
          </div>
        </>
      )}

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Detalhe do recurso" size="lg">
        {detail && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {(columns.length ? columns : Object.keys(detail).map((k) => ({ key: k, label: k }))).map((c) => (
              <div key={c.key}>
                <p className="text-[11px] font-medium" style={{ color: 'var(--ap-text-4)' }}>{c.label} <span className="font-mono">({c.key})</span></p>
                <p className="mt-0.5 break-words" style={{ color: 'var(--ap-text-2)' }}>{cell(detail[c.key])}</p>
              </div>
            ))}
            <div className="md:col-span-2">
              <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--ap-text-4)' }}>Registro canônico (JSON)</p>
              <pre
                className="text-xs rounded-lg px-3 py-2 overflow-x-auto"
                style={{ backgroundColor: 'var(--ap-surface-2)', border: '1px solid var(--ap-border-sub)', color: 'var(--ap-text-3)' }}
              >
                {JSON.stringify(detail, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
