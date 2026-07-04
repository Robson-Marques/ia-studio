import React, { useEffect, useState } from 'react';
import { Bell, Loader2, RefreshCcw } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge, Pagination } from '../../components/ui/Table';
import { getNotificationsLog } from '../../services/automation';
import { toast } from '../../lib/toast';
import { NOTIFICATION_STATUS, formatDateTime } from './automation.constants';

const PER_PAGE = 50;
const CHANNEL = { whatsapp: 'WhatsApp', email: 'E-mail', in_app: 'Sino', none: '—' };

// Log de entrega do Notification Center (diretriz 22). O sino fica no Header.
export default function Notificacoes() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  async function load(p = page) {
    setLoading(true);
    try {
      const data = await getNotificationsLog({ take: PER_PAGE, skip: (p - 1) * PER_PAGE });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Notificações</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Log de entrega do hub de notificações (WhatsApp → e-mail → sino, com fallback).
          </p>
        </div>
        <button className="btn-secondary" onClick={() => load()} title="Atualizar"><RefreshCcw size={14} /> Atualizar</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card"><EmptyState icon={Bell} title="Nenhuma notificação enviada" description="Notificações disparadas por fluxos (nó Notificação) aparecem aqui." /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="hidden md:block">
            <Table>
              <Thead>
                <Th>Canal</Th>
                <Th>Destinatário</Th>
                <Th>Status</Th>
                <Th>Detalhe</Th>
                <Th>Quando</Th>
              </Thead>
              <Tbody>
                {items.map((n) => {
                  const info = NOTIFICATION_STATUS[n.status] || { label: n.status, variant: 'gray' };
                  return (
                    <Tr key={n.id}>
                      <Td>{CHANNEL[n.channel] || n.channel}</Td>
                      <Td><span className="font-mono text-xs">{n.recipient || '—'}</span></Td>
                      <Td><Badge variant={info.variant}>{info.label}</Badge></Td>
                      <Td><span className="text-xs" style={{ color: 'var(--ap-text-4)' }}>{n.detail || '—'}</span></Td>
                      <Td>{formatDateTime(n.created_at)}</Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </div>
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--ap-border)' }}>
            {items.map((n) => {
              const info = NOTIFICATION_STATUS[n.status] || { label: n.status, variant: 'gray' };
              return (
                <div key={n.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm truncate" style={{ color: 'var(--ap-text-1)' }}>
                      {CHANNEL[n.channel] || n.channel} · {n.recipient || '—'}
                    </span>
                    <Badge variant={info.variant}>{info.label}</Badge>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--ap-text-4)' }}>{formatDateTime(n.created_at)}</p>
                </div>
              );
            })}
          </div>
          <Pagination page={page} total={total} perPage={PER_PAGE} onPage={(p) => { setPage(p); load(p); }} />
        </div>
      )}
    </div>
  );
}
