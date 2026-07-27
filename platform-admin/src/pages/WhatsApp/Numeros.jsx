import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Card, DataTable, EmptyState, Badge, Button, useToast,
} from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../lib/format';
import { listNumbers, syncNumber } from '../../services/whatsapp';
import { MESSAGING_LIMIT_LABEL, QUALITY, formatPhone } from './whatsapp.constants';
import { statusToTone } from '../../lib/tone';

// WhatsApp/Números — as conexões com a Meta: situação, qualidade, limite de
// conversas e sincronização. Migrada pro DS na v0.10.9.
//
// Decisões de composição:
//
//  · **Grade de cards → tabela.** Eram 9 campos empilhados num card por número;
//    numa tabela os mesmos números ficam comparáveis lado a lado, que é o que se
//    quer num painel de conexões ("qual está com qualidade baixa?").
//  · **Sincronizar saiu do card e foi pra barra de lote** — e aceita vários de
//    uma vez, o que antes exigia um clique por número. Só aparece quando toda a
//    seleção está ativa: sincronizar conexão desativada devolve erro da Meta.
//  · **A linha abre a conexão DAQUELE número** em Integrações — que é onde ela se
//    gerencia; esta tela é o painel de saúde, não o cadastro. O `id` do número é o
//    id da própria conexão (o backend deriva a lista das conexões `whatsapp-meta`),
//    então o deep-link `?open=<id>` é direto. Na v0.10.9 a linha caía na LISTA de
//    conexões, obrigando a procurar de novo o que já tinha sido escolhido.
//  · O erro de sincronização fica **na célula da situação**, visível: informação
//    essencial não vive em tooltip (regra do DS).

const STATUS_LABEL = {
  ACTIVE: { label: 'Ativa', variant: 'green' },
  DISABLED: { label: 'Desativada', variant: 'gray' },
  MAINTENANCE: { label: 'Manutenção', variant: 'yellow' },
  TOKEN_EXPIRED: { label: 'Token expirado', variant: 'red' },
  ERROR: { label: 'Erro', variant: 'red' },
  RECONNECTING: { label: 'Reconectando', variant: 'yellow' },
  SYNCING: { label: 'Sincronizando', variant: 'blue' },
  PENDING_AUTH: { label: 'Aguardando autenticação', variant: 'yellow' },
};

export default function Numeros() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setItems(await listNumbers());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync(ids, clear) {
    setSyncing(true);
    let ok = 0;
    const falhas = [];
    for (const id of ids) {
      try { await syncNumber(id); ok += 1; }
      catch (err) { falhas.push(err.message); }
    }
    setSyncing(false);
    clear();
    if (ok) toast.success(ok === 1 ? 'Número sincronizado com a Meta.' : `${ok} números sincronizados com a Meta.`);
    if (falhas.length) toast.error(`Não deu pra sincronizar ${falhas.length}: ${falhas[0]}`);
    load();
  }

  const conectar = can('integrations.connections.write') && (
    <Button
      variant="primary"
      icon="plus"
      title="O cadastro de um número novo é feito pela conexão, em Integrações"
      onClick={() => navigate('/integracoes/conexoes')}
    >
      Conectar número
    </Button>
  );

  const columns = [
    { key: 'name', header: 'Número', render: (n) => (
      <div className="min-w-0">
        <p style={{ fontWeight: 500, margin: 0, color: 'var(--su-text-primary)' }} className="truncate">{n.name}</p>
        <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }} className="truncate">
          {n.phone ? formatPhone(n.phone) : 'número ainda não sincronizado'}
          {n.display_name ? ` · ${n.display_name}` : ''}
        </p>
      </div>
    ) },
    { key: 'status', header: 'Situação', render: (n) => {
      const st = STATUS_LABEL[n.status] || STATUS_LABEL.PENDING_AUTH;
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            <Badge tone={statusToTone(st.variant)}>{st.label}</Badge>
            {n.is_default && <Badge tone="info">padrão</Badge>}
          </div>
          {n.last_sync_error && (
            <p style={{ fontSize: 11, margin: 0, color: 'var(--su-danger-fg)' }}>{n.last_sync_error}</p>
          )}
          {!n.last_sync_error && n.status_detail && (
            <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)' }}>{n.status_detail}</p>
          )}
        </div>
      );
    } },
    { key: 'quality', header: 'Qualidade', render: (n) => {
      const q = QUALITY[n.quality_rating] || QUALITY.UNKNOWN;
      return <Badge tone={statusToTone(q.variant)}>{q.label}</Badge>;
    } },
    { key: 'limit', header: 'Pode enviar', render: (n) => MESSAGING_LIMIT_LABEL[n.messaging_limit] || 'não informado pela Meta' },
    { key: 'templates', header: 'Templates', align: 'right', render: (n) => n.templates_count ?? 0 },
    { key: 'health', header: 'Última checagem', render: (n) => {
      if (n.last_health_ok === null || n.last_health_ok === undefined) return '—';
      return n.last_health_ok
        ? <Badge tone="success">respondeu</Badge>
        : <Badge tone="danger">não respondeu</Badge>;
    } },
    { key: 'sync', header: 'Sincronizado', render: (n) => (n.last_sync_at ? formatDateTime(n.last_sync_at) : 'nunca') },
  ];

  // Só oferece sincronizar quando TODA a seleção está ativa — a Meta recusa
  // conexão desativada, e a interface deixa de propor o que não se pode fazer.
  const bulkActions = (ids, clear) => {
    const selecionados = items.filter((n) => ids.includes(n.id));
    if (!selecionados.every((n) => n.status === 'ACTIVE')) return null;
    return (
      <Button
        variant="ghost"
        icon="refresh"
        loading={syncing}
        title="Pergunta à Meta agora: situação, qualidade, limite e templates"
        onClick={() => handleSync(ids, clear)}
      >
        Sincronizar agora
      </Button>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Números"
        subtitle="Os números de WhatsApp conectados à Meta. A sincronização automática roda a cada 10 minutos."
        actions={conectar}
      />

      {loading && !items.length ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="phone"
            title="Nenhum número conectado"
            description="Conecte um número pela conexão “WhatsApp (Meta Cloud API)”, em Integrações → Conexões. Enquanto a Meta não aprovar o cadastro rápido, a conexão é feita informando as credenciais."
            action={conectar}
          />
        </Card>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>
            Clique num número para abrir a conexão dele — é lá que se troca a credencial e se desliga.
          </p>
          <DataTable
            columns={columns}
            rows={items}
            getRowId={(n) => n.id}
            onRowClick={(n) => navigate(`/integracoes/conexoes?open=${n.id}`)}
            getRowLabel={(n) => `Abrir a conexão de ${n.name}`}
            bulkActions={bulkActions}
          />
        </>
      )}
    </div>
  );
}
