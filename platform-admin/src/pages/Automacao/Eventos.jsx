import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCcw, Repeat, Zap } from 'lucide-react';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import { Table, Thead, Th, Tbody, Tr, Td, Badge, Pagination } from '../../components/ui/Table';
import { TextInput } from '../../components/ui/FormField';
import { listEvents, replayEvent } from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { toast } from '../../lib/toast';
import { formatDateTime } from './automation.constants';

const PER_PAGE = 25;

// Event Bus (diretriz 7): log persistido de TODO evento publicado + replay.
export default function Eventos() {
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [replaying, setReplaying] = useState(null);
  const [replayBusy, setReplayBusy] = useState(false);

  async function load(p = page) {
    setLoading(true);
    try {
      const data = await listEvents({ event: filter.trim() || undefined, take: PER_PAGE, skip: (p - 1) * PER_PAGE });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); setPage(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmReplay() {
    setReplayBusy(true);
    try {
      await replayEvent(replaying.id);
      toast.success('Evento reprocessado — assinantes e fluxos serão disparados de novo.');
      setReplaying(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReplayBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Eventos</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Tudo que acontece na plataforma fica registrado aqui e pode ser reprocessado.
          </p>
        </div>
        <TextInput
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(1); } }}
          placeholder="Filtrar por evento…"
          className="max-w-[240px]"
        />
        <button className="btn-secondary" onClick={() => load()} title="Atualizar"><RefreshCcw size={14} /></button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card"><EmptyState icon={Zap} title="Nenhum evento" description="Os acontecimentos aparecem aqui (ex.: mensagens de WhatsApp recebidas)." /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="hidden md:block">
            <Table>
              <Thead>
                <Th>Evento</Th>
                <Th>Ocorreu em</Th>
                <Th>Replays</Th>
                <Th className="text-right">Ações</Th>
              </Thead>
              <Tbody>
                {items.map((e) => (
                  <Tr key={e.id} onClick={() => setDetail(e)}>
                    <Td><span className="font-mono text-xs" style={{ color: 'var(--ap-text-1)' }}>{e.event}</span></Td>
                    <Td>{formatDateTime(e.occurred_at)}</Td>
                    <Td>{e.replay_count > 0 ? <Badge variant="yellow">{e.replay_count}x</Badge> : '—'}</Td>
                    <Td className="text-right">
                      {can('automation.events.retry') && (
                        <button
                          className="btn-ghost p-1.5"
                          title="Replay: re-emite o evento pros assinantes e fluxos"
                          onClick={(ev) => { ev.stopPropagation(); setReplaying(e); }}
                        >
                          <Repeat size={14} className="text-brand" />
                        </button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--ap-border)' }}>
            {items.map((e) => (
              <button key={e.id} className="w-full text-left px-4 py-3" onClick={() => setDetail(e)}>
                <p className="font-mono text-xs truncate" style={{ color: 'var(--ap-text-1)' }}>{e.event}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--ap-text-4)' }}>{formatDateTime(e.occurred_at)}</p>
              </button>
            ))}
          </div>
          <Pagination page={page} total={total} perPage={PER_PAGE} onPage={(p) => { setPage(p); load(p); }} />
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.event || 'Evento'} size="lg">
        {detail && (
          <div className="space-y-2 text-xs" style={{ color: 'var(--ap-text-3)' }}>
            <p className="font-mono break-all">trace: {detail.trace_id}</p>
            <p className="font-mono break-all">source_event_id: {detail.source_event_id}</p>
            <p>Ocorrido em {formatDateTime(detail.occurred_at)} · registrado em {formatDateTime(detail.created_at)}</p>
            <pre
              className="rounded-lg p-3 font-mono overflow-x-auto max-h-80 overflow-y-auto"
              style={{ border: '1px solid var(--ap-border)', backgroundColor: 'var(--ap-surface-2)' }}
            >
              {JSON.stringify(detail.payload, null, 2)}
            </pre>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!replaying}
        danger
        loading={replayBusy}
        title="Reprocessar evento"
        message={`Reprocessar "${replaying?.event}"? Assinantes síncronos e fluxos publicados com esse gatilho serão disparados NOVAMENTE — use pra recuperar falhas, não no fluxo normal (que é automático).`}
        confirmLabel="Reprocessar"
        onClose={() => setReplaying(null)}
        onConfirm={confirmReplay}
      />
    </div>
  );
}
