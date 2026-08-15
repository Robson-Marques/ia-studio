import React, { useEffect, useState } from 'react';
import { ListScreen, Badge, useToast } from '@studio-ux-ds/react';
import { getNotificationsLog } from '../../services/automation';
import { NOTIFICATION_STATUS, NOTIFICATION_CHANNEL, formatDateTime } from './automation.constants';
import { statusToTone } from '../../lib/tone';

// Automação/Notificações — LOG no molde `ListScreen` do DS (v0.10.37): a tela
// passa a ser `.su-screen`, então a preferência de largura do Personalizar vale
// aqui. É só leitura (sem ação por registro, sem clique na linha — caso 3 da
// taxonomia do DS); o "Atualizar" fica na toolbar do molde (age sobre a TELA).

const PER_PAGE = 50;

export default function Notificacoes() {
  const toast = useToast();
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

  const columns = [
    { key: 'channel', header: 'Por onde', render: (n) => NOTIFICATION_CHANNEL[n.channel] || n.channel },
    { key: 'recipient', header: 'Para quem', render: (n) => (
      <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12, color: 'var(--su-text-secondary)' }}>
        {n.recipient || '—'}
      </span>
    ) },
    { key: 'status', header: 'Situação', render: (n) => {
      const info = NOTIFICATION_STATUS[n.status] || { label: n.status, variant: 'gray' };
      return <Badge tone={statusToTone(info.variant)}>{info.label}</Badge>;
    } },
    { key: 'detail', header: 'Detalhe', render: (n) => (
      <span style={{ fontSize: 12, color: 'var(--su-text-muted)' }}>{n.detail || '—'}</span>
    ) },
    { key: 'created_at', header: 'Quando', render: (n) => formatDateTime(n.created_at) },
  ];

  return (
    <ListScreen
      title="Notificações"
      subtitle="Tudo que os fluxos enviaram — tenta WhatsApp, cai para e-mail e, em último caso, para o sino do sistema."
      toolbarActions={[{ icon: 'refresh', label: loading ? 'Atualizando…' : 'Atualizar', onClick: () => load() }]}
      loading={loading && !items.length}
      columns={columns}
      rows={items}
      getRowId={(n) => n.id}
      page={page}
      pageCount={Math.ceil(total / PER_PAGE)}
      onPage={(p) => { setPage(p); load(p); }}
      summary={total ? `${total} notificação(ões)` : undefined}
      emptyNew={{
        icon: 'bell',
        title: 'Nenhuma notificação enviada',
        description: 'O que os fluxos disparam pelo nó de Notificação aparece aqui, com o resultado de cada tentativa.',
      }}
    />
  );
}
