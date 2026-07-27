import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Card, DataTable, EmptyState, Badge, Button, Select, useToast,
} from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../lib/format';
import { listNumbers, listTemplates, syncTemplates } from '../../services/whatsapp';
import { TEMPLATE_STATUS } from './whatsapp.constants';
import { statusToTone } from '../../lib/tone';

// WhatsApp/Templates — o catálogo de templates aprovados na Meta. Migrada pro DS
// na v0.10.9.
//
// Decisões de composição:
//
//  · **Criar template virou rota** (`/whatsapp/templates/novo`): o corpo é um
//    TextArea, e a regra do Modal do DS não abre exceção. Ganhou espaço para o
//    que o formulário realmente exige — exemplos das variáveis e até 3 botões.
//  · **Lista sem linha clicável e sem seleção**, de propósito: template publicado
//    na Meta **não se edita** (nem por aqui nem por lá — cria-se outro), e não há
//    exclusão na API. Oferecer clique prometeria uma tela que não existe.
//  · **Sincronizar é ação de tela** (do número escolhido), não de linha — fica no
//    cabeçalho, ao lado do filtro de conexão que define o alvo.
//  · O motivo da recusa da Meta aparece **na tabela**, embaixo do nome: é a
//    informação mais útil da tela quando um template é rejeitado.

export default function Templates() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [numbers, setNumbers] = useState([]);
  const [connectionId, setConnectionId] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const canManage = can('comm.whatsapp.templates.manage');

  useEffect(() => {
    listNumbers()
      .then((n) => {
        setNumbers(n);
        if (n.length) setConnectionId((atual) => atual || n[0].id);
      })
      .catch((err) => toast.error(err.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load(conn = connectionId) {
    setLoading(true);
    try {
      setItems(await listTemplates(conn || undefined));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [connectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    if (!connectionId) { toast.error('Escolha um número para sincronizar.'); return; }
    setSyncing(true);
    try {
      const r = await syncTemplates(connectionId);
      toast.success(`${r.pulled} template(s) vindos da Meta e ${r.pushed} rascunho(s) enviados para análise.`);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  }

  const columns = [
    { key: 'name', header: 'Nome', render: (t) => (
      <div className="min-w-0">
        <p style={{ fontWeight: 500, margin: 0, color: 'var(--su-text-primary)', fontFamily: 'var(--su-font-mono, monospace)', fontSize: 13 }} className="truncate">
          {t.name}
        </p>
        {t.rejection_reason && (
          <p style={{ fontSize: 11, margin: 0, color: 'var(--su-danger-fg)' }}>{t.rejection_reason}</p>
        )}
      </div>
    ) },
    { key: 'status', header: 'Situação', render: (t) => {
      const st = TEMPLATE_STATUS[t.status] || TEMPLATE_STATUS.PENDING;
      return <Badge tone={statusToTone(st.variant)}>{st.label}</Badge>;
    } },
    { key: 'category', header: 'Tipo', render: (t) => CATEGORY_LABEL[t.category] || t.category },
    { key: 'language', header: 'Idioma', render: (t) => LANGUAGE_LABEL[t.language] || t.language },
    { key: 'synced_at', header: 'Sincronizado', render: (t) => (t.synced_at ? formatDateTime(t.synced_at) : '—') },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2" style={{ padding: 'var(--su-space-2) var(--su-space-4)' }}>
      <div style={{ width: 260 }}>
        <Select value={connectionId} onChange={(e) => setConnectionId(e.target.value)} aria-label="Filtrar por número">
          <option value="">Todos os números</option>
          {numbers.map((n) => (
            <option key={n.id} value={n.id}>{n.name}{n.phone ? ` — ${n.phone}` : ''}</option>
          ))}
        </Select>
      </div>
      <Button variant="ghost" icon="refresh" loading={loading} aria-label="Atualizar" onClick={() => load()} />
    </div>
  );

  const acoes = canManage && (
    <>
      <Button
        variant="secondary"
        icon="refresh"
        loading={syncing}
        disabled={!connectionId}
        title="Traz os templates aprovados na Meta e envia os rascunhos daqui para análise"
        onClick={handleSync}
      >
        Sincronizar
      </Button>
      <Button variant="primary" icon="plus" onClick={() => navigate('/whatsapp/templates/novo')}>
        Novo template
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        subtitle="Mensagens aprovadas pela Meta — as únicas que podem ser enviadas depois de 24h sem resposta do cliente."
        actions={acoes}
      />

      {loading && !items.length ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="file"
            title={connectionId ? 'Nenhum template neste número' : 'Nenhum template'}
            description="Crie um template para enviar à análise da Meta, ou use Sincronizar para trazer os que já existem por lá."
            action={acoes}
          />
        </Card>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>
            Template já publicado não se edita — nem aqui, nem na Meta. Para mudar o texto, crie outro com nome novo.
          </p>
          <DataTable columns={columns} rows={items} getRowId={(t) => t.id} toolbar={toolbar} />
        </>
      )}
    </div>
  );
}

// Rótulos na língua do usuário — a UI não mostra o enum da Meta.
const CATEGORY_LABEL = {
  UTILITY: 'Utilidade',
  MARKETING: 'Divulgação',
  AUTHENTICATION: 'Código de acesso',
};

const LANGUAGE_LABEL = {
  pt_BR: 'Português (BR)',
  en_US: 'Inglês (EUA)',
  es: 'Espanhol',
};

export { CATEGORY_LABEL, LANGUAGE_LABEL };
