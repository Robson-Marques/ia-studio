import React, { useEffect, useState } from 'react';
import { PageHeader, Card, DataTable, EmptyState, Badge, Pagination, Modal, ConfirmDialog, Input, Button, DescriptionList, useToast, Spinner } from '@studio-ux-ds/react';
import { listEvents, replayEvent } from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from './automation.constants';

// Automação/Eventos — o log do Event Bus (diretriz 7): tudo que a plataforma
// publicou, com replay. Migrada pro DS na v0.9.99.
//
// Decisões de composição:
//
//  · **O "Replay" saiu da linha e foi pro detalhe.** Reprocessar re-emite o
//    evento para assinantes e fluxos publicados — dispara efeito de verdade. É a
//    mesma categoria do disparo em massa do incidente: não se faz sem LER o
//    payload primeiro. Então a linha abre o detalhe, e o botão vive lá, ao lado
//    do JSON que ele vai re-emitir. Sem barra de lote, de propósito.
//  · **O detalhe segue Modal**, corretamente: não tem campo nenhum — é leitura
//    de metadados + payload. `ConfirmDialog` sobre Modal é tolerado (confirmação
//    de ação, não segundo nível de formulário — mesmo arranjo das versões do
//    assistente).
//  · O filtro e o "Atualizar" foram para a `toolbar` do `DataTable`, que é o
//    slot do DS para isso — no legado eram uma linha montada à mão no cabeçalho,
//    competindo com o título da tela.

const PER_PAGE = 25;

export default function Eventos() {
  const toast = useToast();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [replaying, setReplaying] = useState(null);
  const [replayBusy, setReplayBusy] = useState(false);

  const canRetry = can('automation.events.retry');

  async function load(p = page) {
    setLoading(true);
    try {
      const data = await listEvents({
        event: filter.trim() || undefined,
        take: PER_PAGE,
        skip: (p - 1) * PER_PAGE,
      });
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
      toast.success('Evento reprocessado — assinantes e fluxos foram disparados de novo.');
      setReplaying(null);
      setDetail(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReplayBusy(false);
    }
  }

  function search() { setPage(1); load(1); }

  const columns = [
    { key: 'event', header: 'O que aconteceu', render: (e) => (
      <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12, color: 'var(--su-text-primary)' }}>
        {e.event}
      </span>
    ) },
    { key: 'occurred_at', header: 'Quando', render: (e) => formatDateTime(e.occurred_at) },
    { key: 'replay_count', header: 'Reprocessado', render: (e) => e.replay_count > 0
      ? <Badge tone="warning">{e.replay_count}x</Badge>
      : <span style={{ fontSize: 12, color: 'var(--su-text-muted)' }}>não</span>
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2" style={{ padding: 'var(--su-space-2) var(--su-space-4)' }}>
      <div style={{ maxWidth: 260, flex: 1, minWidth: 180 }}>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          placeholder="Filtrar pelo nome do evento…"
          aria-label="Filtrar pelo nome do evento"
        />
      </div>
      <Button variant="secondary" icon="search" onClick={search}>Filtrar</Button>
      <Button variant="ghost" icon="refresh" loading={loading} aria-label="Atualizar" onClick={() => load()} />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Eventos"
        subtitle="Tudo que acontece na plataforma fica registrado aqui — e pode ser reprocessado se algo falhou no caminho."
      />

      {loading && !items.length ? (
        <Spinner size="lg" center />
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="alert-circle"
            title={filter ? `Nenhum evento com "${filter}"` : 'Nenhum evento ainda'}
            description={filter
              ? 'Limpe o filtro para ver todos os eventos registrados.'
              : 'Acontecimentos da plataforma aparecem aqui — mensagem recebida no WhatsApp, execução concluída, aprovação decidida.'}
          />
        </Card>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>
            Clique num evento para ver o conteúdo dele e, se precisar, reprocessar.
          </p>
          <DataTable
            columns={columns}
            rows={items}
            getRowId={(e) => e.id}
            onRowClick={(e) => setDetail(e)}
            getRowLabel={(e) => `Ver ${e.event}`}
            toolbar={toolbar}
            footer={
              <Pagination
                page={page}
                pageCount={Math.ceil(total / PER_PAGE)}
                total={total}
                itemLabel={['evento', 'eventos']}
                onChange={(p) => { setPage(p); load(p); }}
              />
            }
          />
        </>
      )}

      {/* Leitura, sem campo nenhum → Modal é o lugar certo. O Replay vive aqui,
          ao lado do payload que ele vai re-emitir. */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.event || 'Evento'}
        maxWidth={720}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>Fechar</Button>
            {canRetry && detail && (
              <Button
                variant="danger"
                icon="refresh"
                title="Re-emite este evento para os assinantes e fluxos — dispara de verdade"
                onClick={() => setReplaying(detail)}
              >
                Reprocessar
              </Button>
            )}
          </>
        }
      >
        {detail && (
          <div className="space-y-3">
            <DescriptionList
              items={[
                { key: 'Ocorreu em', value: formatDateTime(detail.occurred_at) },
                { key: 'Registrado em', value: formatDateTime(detail.created_at) },
                { key: 'Reprocessado', value: detail.replay_count > 0 ? `${detail.replay_count}x` : 'não' },
                { key: 'Rastro (trace)', value: <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, wordBreak: 'break-all' }}>{detail.trace_id || '—'}</span> },
                { key: 'Id de origem', value: <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, wordBreak: 'break-all' }}>{detail.source_event_id || '—'}</span> },
              ]}
            />
            <div>
              <p style={{ fontSize: 12, fontWeight: 500, margin: '0 0 6px', color: 'var(--su-text-secondary)' }}>
                Conteúdo do evento
              </p>
              <pre
                style={{
                  fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, margin: 0,
                  border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12,
                  maxHeight: 320, overflow: 'auto', color: 'var(--su-text-secondary)',
                }}
              >
                {JSON.stringify(detail.payload, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>

      {/* 5 patrasques: ConfirmDialog + a consequência escrita + tooltip no botão
          + loading + gate can('automation.events.retry'). */}
      <ConfirmDialog
        open={!!replaying}
        danger
        loading={replayBusy}
        title="Reprocessar evento"
        message={`Reprocessar "${replaying?.event}"? Os assinantes e os fluxos publicados com esse gatilho serão disparados NOVAMENTE — e o que eles fizerem acontece de verdade (mensagem enviada, registro criado). Use para recuperar uma falha, não no fluxo normal, que já é automático.`}
        confirmLabel="Reprocessar"
        onClose={() => setReplaying(null)}
        onConfirm={confirmReplay}
      />
    </div>
  );
}
