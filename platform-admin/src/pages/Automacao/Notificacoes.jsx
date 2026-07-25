import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Card, DataTable, EmptyState, Badge, Pagination, Button, useToast,
} from '@studio-ux-ds/react';
import { getNotificationsLog } from '../../services/automation';
import { NOTIFICATION_STATUS, NOTIFICATION_CHANNEL, formatDateTime } from './automation.constants';
import { statusToTone } from '../../lib/tone';

// Automação/Notificações — 1ª tela da família Automação migrada pro DS (v0.9.99).
//
// É um LOG: só leitura, sem ação por registro. Portanto:
//  · nenhum botão na linha e nenhuma coluna de seleção — não existe ação que
//    aja sobre uma notificação enviada (taxonomia do STUDIO_UX_TABLES.md §3);
//  · a linha NÃO é clicável, porque não há detalhe para abrir (caso 3 da árvore
//    de decisão — não inventar rota que não existe só pra cumprir a regra);
//  · "Atualizar" fica no cabeçalho: age sobre a TELA, não sobre um registro.
//
// O legado montava Table desktop + cards mobile à mão. O `DataTable` do DS já
// resolve a densidade; o recorte mobile desta família entra na frente de Mobile,
// não aqui (P4 — Cards no lugar de tabela é reprojeto, não encolhimento).

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
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        subtitle="Tudo que os fluxos enviaram — tenta WhatsApp, cai para e-mail e, em último caso, para o sino do sistema."
        actions={
          <Button variant="secondary" icon="refresh" loading={loading} onClick={() => load()}>
            {loading ? 'Atualizando…' : 'Atualizar'}
          </Button>
        }
      />

      {loading && !items.length ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="bell"
            title="Nenhuma notificação enviada"
            description="O que os fluxos disparam pelo nó de Notificação aparece aqui, com o resultado de cada tentativa."
          />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          getRowId={(n) => n.id}
          // O `Pagination` do DS (v1.2.21) escreve a contagem quando recebe
          // `total` — a barra "N registros … navegação" é do componente, não da
          // tela. A tela só converte total de registros em número de páginas.
          footer={
            <Pagination
              page={page}
              pageCount={Math.ceil(total / PER_PAGE)}
              total={total}
              itemLabel={['notificação', 'notificações']}
              onChange={(p) => { setPage(p); load(p); }}
            />
          }
        />
      )}
    </div>
  );
}
