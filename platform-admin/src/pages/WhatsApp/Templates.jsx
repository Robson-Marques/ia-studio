import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListScreen, Badge, Button, Select, Field, Checkbox, Modal, ConfirmDialog, useToast } from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../lib/format';
import {
  listNumbers, listTemplates, syncTemplates,
  duplicateTemplate, replicateTemplate, deleteTemplate, deleteTemplateOfficial,
} from '../../services/whatsapp';
import { TEMPLATE_STATUS } from './whatsapp.constants';
import { statusToTone } from '../../lib/tone';

// Nota de qualidade da Meta (v0.10.75): boa/atenção/ruim.
const QUALITY = {
  GREEN: { label: 'Boa', tone: 'success' },
  YELLOW: { label: 'Atenção', tone: 'warning' },
  RED: { label: 'Ruim', tone: 'danger' },
  UNKNOWN: { label: '—', tone: 'neutral' },
};

// Template "vive na Meta" quando tem id de lá e não é rascunho/rejeitado.
function isOnMeta(t) {
  return !!t.meta_template_id && ['APPROVED', 'PENDING', 'PAUSED', 'DISABLED'].includes(t.status);
}

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
  const [acting, setActing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // template alvo da exclusão
  const [replicar, setReplicar] = useState(null); // template alvo da replicação
  const [alvos, setAlvos] = useState([]); // connection_ids escolhidos no modal

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

  async function handleDuplicate(t) {
    if (acting) return;
    setActing(true);
    try {
      await duplicateTemplate(t.id);
      toast.success('Template duplicado como rascunho.');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  function abrirReplicar(t) {
    setReplicar(t);
    setAlvos([]);
  }

  function toggleAlvo(id) {
    setAlvos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function confirmarReplicar() {
    const t = replicar;
    if (!t || !alvos.length) return;
    setActing(true);
    try {
      const results = await replicateTemplate(t.id, alvos);
      const criados = results.filter((r) => r.success && !r.shared).length;
      const jaTinham = results.filter((r) => r.success && r.shared).length;
      const falhas = results.filter((r) => !r.success).length;
      const partes = [];
      if (criados) partes.push(`${criados} rascunho(s) criado(s)`);
      if (jaTinham) partes.push(`${jaTinham} número(s) já tinham`);
      if (falhas) partes.push(`${falhas} falhou(aram)`);
      toast.success(`Replicação: ${partes.join(', ') || 'nada a fazer'}. Sincronize o número de destino para enviar à Meta.`);
      setReplicar(null);
      setAlvos([]);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  async function confirmarExclusao() {
    const t = confirmDel;
    if (!t) return;
    setActing(true);
    try {
      await (isOnMeta(t) ? deleteTemplateOfficial(t.id) : deleteTemplate(t.id));
      toast.success(isOnMeta(t) ? 'Template removido da Meta e daqui.' : 'Template excluído.');
      setConfirmDel(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
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
    { key: 'quality', header: 'Qualidade', render: (t) => {
      const q = QUALITY[t.quality] || QUALITY.UNKNOWN;
      return t.quality ? <Badge tone={q.tone}>{q.label}</Badge> : <span style={{ color: 'var(--su-text-muted)' }}>—</span>;
    } },
    { key: 'category', header: 'Tipo', render: (t) => CATEGORY_LABEL[t.category] || t.category },
    { key: 'language', header: 'Idioma', render: (t) => LANGUAGE_LABEL[t.language] || t.language },
    { key: 'synced_at', header: 'Sincronizado', render: (t) => (t.synced_at ? formatDateTime(t.synced_at) : '—') },
    ...(canManage ? [{ key: 'acoes', header: 'Ações', render: (t) => (
      <div className="flex items-center gap-1 justify-end">
        <Button
          variant="ghost" size="sm" icon="edit" disabled={acting}
          title={isOnMeta(t) ? 'Editar e reenviar à Meta' : 'Editar rascunho'}
          onClick={() => navigate(`/whatsapp/templates/${t.id}/editar`)}
        >
          Editar
        </Button>
        <Button variant="ghost" size="sm" icon="copy" disabled={acting} title="Duplicar como rascunho" onClick={() => handleDuplicate(t)}>
          Duplicar
        </Button>
        <Button
          variant="ghost" size="sm" icon="copy" disabled={acting || numbers.length < 2}
          title={numbers.length < 2 ? 'Conecte outro número para replicar' : 'Replicar como rascunho para outros números'}
          onClick={() => abrirReplicar(t)}
        >
          Replicar
        </Button>
        <Button
          variant="ghost" size="sm" icon="trash" disabled={acting}
          title={isOnMeta(t) ? 'Remover da Meta e daqui' : 'Excluir'}
          onClick={() => setConfirmDel(t)}
        >
          Excluir
        </Button>
      </div>
    ) }] : []),
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
    <>
    <ListScreen
      title="Templates"
      subtitle="Mensagens aprovadas pela Meta — as únicas que podem ser enviadas depois de 24h sem resposta do cliente. Dá para duplicar, replicar entre números e excluir; um template já publicado, quando editado, volta para análise da Meta."
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
    <ConfirmDialog
      open={!!confirmDel}
      danger
      loading={acting}
      title={confirmDel && isOnMeta(confirmDel) ? 'Remover template da Meta' : 'Excluir template'}
      message={confirmDel && isOnMeta(confirmDel)
        ? `Remover "${confirmDel.name}" da Meta e também daqui? Depois de removido, ele não pode mais ser enviado. A operação é definitiva.`
        : `Excluir o template "${confirmDel?.name ?? ''}"? Ele sai do catálogo local (não estava publicado na Meta).`}
      confirmLabel={confirmDel && isOnMeta(confirmDel) ? 'Remover da Meta' : 'Excluir'}
      onClose={() => (acting ? null : setConfirmDel(null))}
      onConfirm={confirmarExclusao}
    />
    <Modal
      open={!!replicar}
      onClose={() => (acting ? null : setReplicar(null))}
      title={replicar ? `Replicar "${replicar.name}"` : 'Replicar template'}
      maxWidth={520}
      footer={
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" disabled={acting} onClick={() => setReplicar(null)}>Cancelar</Button>
          <Button variant="primary" loading={acting} disabled={!alvos.length} onClick={confirmarReplicar}>
            Replicar para {alvos.length || 'nenhum'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p style={{ fontSize: 13, color: 'var(--su-text-muted)', margin: 0 }}>
          Cria uma cópia como rascunho nos números escolhidos. Depois, sincronize cada número para enviar à análise da Meta. Números que já tiverem um template com este nome são ignorados.
        </p>
        <div className="space-y-1">
          {numbers.filter((n) => !replicar || n.id !== replicar.connection_id).map((n) => (
            <Checkbox
              key={n.id}
              id={`alvo-${n.id}`}
              label={`${n.name}${n.phone ? ` — ${n.phone}` : ''}`}
              checked={alvos.includes(n.id)}
              onChange={() => toggleAlvo(n.id)}
            />
          ))}
          {numbers.filter((n) => !replicar || n.id !== replicar.connection_id).length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--su-text-muted)', margin: 0 }}>Não há outro número conectado para replicar.</p>
          )}
        </div>
      </div>
    </Modal>
    </>
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
