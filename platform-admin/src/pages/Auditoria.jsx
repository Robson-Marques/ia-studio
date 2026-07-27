import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, FormGrid, Field, Input, Button, DataTable, Badge, Modal, DescriptionList, CopyButton, Pagination, EmptyState, useToast, Spinner } from '@studio-ux-ds/react';
import { listAudit } from '../services/audit';
import { formatDateTime } from '../lib/format';

const POR_PAGINA = 20;

// Auditoria — a trilha de quem fez o quê na organização. Migrada pro DS na v0.10.16.
//
// Decisões de composição:
//
//  · **A linha expansível virou Modal de leitura.** O legado abria a linha e
//    mostrava os dois JSONs (antes/depois) dentro da tabela, o que exigia um
//    `<tr>` extra montado à mão — e o `DataTable` do DS não tem (nem deveria ter)
//    linha que abre para dentro: numa tabela paginada, a linha aberta empurra as
//    de baixo e o olho perde o lugar. Como Modal, é leitura de um registro
//    imutável, com os dois JSONs lado a lado e botão de copiar.
//  · **Modal e não rota**, apesar de o registro ter id: ninguém manda link de
//    linha de auditoria, e a lista já tem o objeto inteiro em mão — abrir rota
//    obrigaria a buscar de novo um dado que já está aqui.
//  · **Filtro com o botão junto**: o "Filtrar" fica ao lado do último campo, pela
//    mesma razão do Explorador (botão como item do grid precisaria de coluna
//    própria e desalinharia a linha).
//
// A tela aceita `fetcher`/`title`/`subtitle` porque nasceu para ser reaproveitada
// com outra fonte de log — o contrato foi preservado.
export default function Auditoria({
  fetcher = listAudit,
  title = 'Auditoria',
  subtitle = 'Quem fez o quê na organização, com o antes e o depois de cada mudança.',
}) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [detalhe, setDetalhe] = useState(null);
  const [filtros, setFiltros] = useState({ action: '', entity: '', from: '', to: '' });

  const load = useCallback(async (p = 1, f = filtros) => {
    setLoading(true);
    try {
      const { items: list, total: t } = await fetcher({
        action: f.action, entity: f.entity, from: f.from, to: f.to,
        page: p, per_page: POR_PAGINA,
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
  }, [fetcher, filtros]);

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (campo, valor) => setFiltros((f) => ({ ...f, [campo]: valor }));

  function comoJson(v) {
    if (v == null) return '—';
    try {
      return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v, null, 2);
    } catch {
      return String(v);
    }
  }

  // O backend já mudou o nome desses campos mais de uma vez; a lista de
  // alternativas é proposital, para a tela não parar de mostrar o ator quando
  // isso acontecer de novo.
  const ator = (log) => log.actor_name || log.actor?.name || log.actor_email || log.actor?.email || log.user_name || '—';
  const antes = (log) => log.old_value ?? log.old ?? log.before ?? null;
  const depois = (log) => log.new_value ?? log.new ?? log.after ?? null;

  const columns = [
    { key: 'when', header: 'Quando', render: (log) => formatDateTime(log.created_at) },
    { key: 'who', header: 'Quem', render: (log) => ator(log) },
    { key: 'what', header: 'O que fez', render: (log) => (
      <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}>{log.action}</span>
    ) },
    { key: 'entity', header: 'Onde', render: (log) => log.entity_type || log.entity || '—' },
    { key: 'status', header: 'Resultado', render: (log) => (
      log.status === 'FAILURE'
        ? <Badge tone="danger">não passou</Badge>
        : <Badge tone="success">ok</Badge>
    ) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} />

      <Card>
        <div style={{ padding: 20 }}>
          <FormGrid columns="auto">
            <Field label="Ação">
              <Input placeholder="ex.: sale.cancel" value={filtros.action} onChange={(e) => set('action', e.target.value)} />
            </Field>
            <Field label="Item afetado">
              <Input placeholder="ex.: Connection" value={filtros.entity} onChange={(e) => set('entity', e.target.value)} />
            </Field>
            <Field label="De">
              <Input type="date" value={filtros.from} onChange={(e) => set('from', e.target.value)} />
            </Field>
            <Field label="Até">
              <div className="flex items-center gap-2">
                <Input type="date" value={filtros.to} onChange={(e) => set('to', e.target.value)} style={{ flex: 1 }} />
                <Button variant="primary" icon="search" loading={loading} onClick={() => load(1)}>
                  Filtrar
                </Button>
              </div>
            </Field>
          </FormGrid>
        </div>
      </Card>

      {loading && !items.length ? (
        <Spinner size="lg" center />
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="file"
            title="Nenhum registro"
            description="Ou os filtros não casaram com nada, ou ainda não houve ação administrativa no período."
          />
        </Card>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>
            Clique numa linha para ver o antes e o depois da mudança.
          </p>
          <DataTable
            columns={columns}
            rows={items}
            getRowId={(log) => log.id}
            onRowClick={(log) => setDetalhe(log)}
            getRowLabel={(log) => `Ver o detalhe de ${log.action}`}
          />
          <Pagination
            page={page}
            perPage={POR_PAGINA}
            total={total}
            itemLabel={['registro', 'registros']}
            onPage={(p) => load(p)}
          />
        </>
      )}

      <Modal
        open={Boolean(detalhe)}
        onClose={() => setDetalhe(null)}
        title={detalhe ? detalhe.action : ''}
        size="lg"
      >
        {detalhe && (
          <div className="space-y-4">
            <DescriptionList
              items={[
                { key: 'Quando', value: formatDateTime(detalhe.created_at) },
                { key: 'Quem', value: ator(detalhe) },
                { key: 'Onde', value: detalhe.entity_type || detalhe.entity || '—' },
                ...(detalhe.entity_id ? [{ key: 'Identificador do item', value: (
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <code style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, wordBreak: 'break-all' }}>
                      {detalhe.entity_id}
                    </code>
                    <CopyButton value={detalhe.entity_id} title="Copiar o identificador" />
                  </span>
                ) }] : []),
                ...(detalhe.ip ? [{ key: 'De onde', value: detalhe.ip }] : []),
                { key: 'Resultado', value: detalhe.status === 'FAILURE' ? 'não passou' : 'ok' },
              ]}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ValorJson titulo="Como estava" valor={comoJson(antes(detalhe))} />
              <ValorJson titulo="Como ficou" valor={comoJson(depois(detalhe))} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ValorJson({ titulo, valor }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>{titulo}</p>
        {valor !== '—' && <CopyButton value={valor} />}
      </div>
      <pre
        style={{
          fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, margin: 0,
          border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12,
          maxHeight: 260, overflow: 'auto', color: 'var(--su-text-secondary)',
        }}
      >
        {valor}
      </pre>
    </div>
  );
}
