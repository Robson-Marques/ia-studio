import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListScreen, Badge, Button, Select, Field, useToast } from '@studio-ux-ds/react';
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

  const filterContent = (
    <div style={{ minWidth: 260 }}>
      <Field label="Número">
        <Select value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
          <option value="">Todos os números</option>
          {numbers.map((n) => (
            <option key={n.id} value={n.id}>{n.name}{n.phone ? ` — ${n.phone}` : ''}</option>
          ))}
        </Select>
      </Field>
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
    <ListScreen
      title="Templates"
      subtitle="Mensagens aprovadas pela Meta — as únicas que podem ser enviadas depois de 24h sem resposta do cliente. Template já publicado não se edita: para mudar o texto, crie outro com nome novo."
      primaryAction={acoes}
      filterContent={filterContent}
      filtersActive={!!connectionId}
      onClearFilters={() => setConnectionId('')}
      toolbarActions={[{ icon: 'refresh', label: 'Atualizar', onClick: () => load() }]}
      loading={loading && !items.length}
      columns={columns}
      rows={items}
      getRowId={(t) => t.id}
      filterActive={!!connectionId}
      emptyNew={{
        icon: 'file',
        title: 'Nenhum template',
        description: 'Crie um template para enviar à análise da Meta, ou use Sincronizar para trazer os que já existem por lá.',
        action: acoes,
      }}
      emptyFiltered={{ title: 'Nenhum template neste número', description: 'Troque o número no filtro, ou use Sincronizar para trazer os que já existem na Meta.', onClear: () => setConnectionId('') }}
    />
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
