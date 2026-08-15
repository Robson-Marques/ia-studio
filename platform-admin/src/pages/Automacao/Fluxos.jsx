import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListScreen, Badge, Button, ConfirmDialog, useToast } from '@studio-ux-ds/react';
import { listWorkflows, archiveWorkflow, deleteWorkflow } from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { EXECUTION_STATUS, formatDateTime } from './automation.constants';
import { statusToTone } from '../../lib/tone';
import WorkflowStatusBadge from './WorkflowStatusBadge';

// Automação/Fluxos — a lista das automações. Migrada pro DS na v0.10.2.
//
// Decisões de composição:
//
//  · **Arquivar e excluir saíram da linha** (eram uma pastinha âmbar e uma lixeira
//    vermelha em cada linha) e foram pra barra de lote. As duas aceitam vários —
//    são registros independentes.
//  · **"Novo fluxo" e "Importar" viraram rotas.** Os dois modais tinham TextArea
//    (descrição num, JSON de 12 linhas no outro) e caem na regra do Modal do DS.
//    Importar, além do mais, cria um registro: rota é o container certo pra isso.
//  · A `WorkflowStatusBadge` saiu daqui pra arquivo próprio — o editor e o canvas
//    importavam de dentro desta página.

export default function Fluxos() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // { kind: 'archive'|'delete', ids, clear }
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const canWrite = can('automation.workflows.write');

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((w) => (w.name || '').toLowerCase().includes(term));
  }, [items, q]);

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listWorkflows({ environment_id: environmentId || undefined });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConfirm() {
    setBusy(true);
    const { kind, ids, clear } = confirm;
    const acao = kind === 'archive' ? archiveWorkflow : deleteWorkflow;
    let ok = 0;
    const falhas = [];
    for (const id of ids) {
      try { await acao(id); ok += 1; }
      catch (err) { falhas.push(err.message); }
    }
    setBusy(false);
    setConfirm(null);
    clear();
    if (ok) {
      const verbo = kind === 'archive' ? 'arquivado' : 'excluído';
      toast.success(ok === 1 ? `Fluxo ${verbo}.` : `${ok} fluxos ${verbo}s.`);
    }
    if (falhas.length) toast.error(`Não deu pra concluir em ${falhas.length}: ${falhas[0]}`);
    load();
  }

  const acoesCabecalho = canWrite && (
    <>
      <Button
        variant="secondary"
        icon="upload"
        title="Recriar um fluxo a partir de um arquivo exportado"
        onClick={() => navigate('/automacao/fluxos/importar')}
      >
        Importar
      </Button>
      <Button variant="primary" icon="plus" onClick={() => navigate('/automacao/fluxos/novo')}>
        Novo fluxo
      </Button>
    </>
  );

  const columns = [
    { key: 'name', header: 'Nome', render: (w) => (
      <span style={{ fontWeight: 500, color: 'var(--su-text-primary)' }}>{w.name}</span>
    ) },
    { key: 'status', header: 'Situação', render: (w) => <WorkflowStatusBadge status={w.status} /> },
    { key: 'version', header: 'Versão no ar', render: (w) => (w.current_version > 0 ? `v${w.current_version}` : '—') },
    { key: 'tags', header: 'Tags', render: (w) => {
      const tags = w.tags || [];
      if (!tags.length) return <span style={{ fontSize: 12, color: 'var(--su-text-muted)' }}>—</span>;
      return (
        <div className="flex gap-1 flex-wrap">
          {tags.slice(0, 3).map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}
          {tags.length > 3 && <Badge tone="neutral">+{tags.length - 3}</Badge>}
        </div>
      );
    } },
    { key: 'recent', header: 'Últimas vezes que rodou', render: (w) => {
      const execs = w.recent_executions || [];
      if (!execs.length) return <span style={{ fontSize: 12, color: 'var(--su-text-muted)' }}>nunca rodou</span>;
      return (
        <div className="flex gap-1 flex-wrap">
          {execs.map((e) => {
            const info = EXECUTION_STATUS[e.status] || { label: e.status, variant: 'gray' };
            return <Badge key={e.id} tone={statusToTone(info.variant)}>{info.label}</Badge>;
          })}
        </div>
      );
    } },
    { key: 'updated_at', header: 'Atualizado', render: (w) => formatDateTime(w.updated_at) },
  ];

  // Arquivar só faz sentido no que não está arquivado — com uma seleção que mistura
  // os dois, a ação some em vez de falhar depois (P13).
  const bulkActions = canWrite
    ? (ids, clear) => {
      const selecionados = items.filter((w) => ids.includes(w.id));
      const arquivaveis = selecionados.filter((w) => w.status !== 'ARCHIVED');
      return (
        <>
          {arquivaveis.length === selecionados.length && (
            <Button
              variant="ghost"
              icon="archive"
              title="Guarda o fluxo e para os gatilhos — o histórico fica"
              onClick={() => setConfirm({ kind: 'archive', ids, clear })}
            >
              Arquivar
            </Button>
          )}
          <Button
            variant="ghost"
            icon="trash"
            title="Apaga o fluxo e todo o histórico dele, sem volta"
            onClick={() => setConfirm({ kind: 'delete', ids, clear })}
          >
            Excluir
          </Button>
        </>
      );
    }
    : undefined;

  const nomes = (confirm?.ids || [])
    .map((id) => items.find((w) => w.id === id)?.name)
    .filter(Boolean);
  const varios = nomes.length > 1;
  const lista = `${nomes.slice(0, 3).join(', ')}${nomes.length > 3 ? '…' : ''}`;

  return (
    <>
      <ListScreen
        title="Fluxos"
        subtitle="Cada fluxo é uma automação. Salvar cria uma versão nova; publicar escolhe qual versão está no ar — as anteriores ficam guardadas."
        primaryAction={acoesCabecalho}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Buscar fluxo…"
        loading={loading && !items.length}
        columns={columns}
        rows={rows}
        getRowId={(w) => w.id}
        onRowClick={(w) => navigate(`/automacao/fluxos/${w.id}`)}
        getRowLabel={(w) => `Abrir fluxo ${w.name}`}
        bulkActions={bulkActions}
        filterActive={!!q.trim()}
        emptyNew={{
          icon: 'settings',
          title: 'Nenhum fluxo neste ambiente',
          description: 'Um fluxo tem um gatilho (o que o dispara) e uma sequência de passos. Crie um e monte os passos no editor.',
          action: acoesCabecalho,
        }}
        emptyFiltered={{ title: 'Nenhum fluxo encontrado', description: 'Nenhum fluxo com esse nome.', onClear: () => setQ('') }}
      />

      {/* 5 patrasques: ConfirmDialog + a consequência escrita + tooltip no botão
          + loading + gate can('automation.workflows.write'). */}
      <ConfirmDialog
        open={!!confirm}
        danger
        loading={busy}
        title={
          confirm?.kind === 'archive'
            ? (varios ? 'Arquivar fluxos' : 'Arquivar fluxo')
            : (varios ? 'Excluir fluxos' : 'Excluir fluxo')
        }
        message={
          confirm?.kind === 'archive'
            ? (varios
              ? `Arquivar ${nomes.length} fluxos (${lista})? Os gatilhos param de disparar e eles saem das listas ativas. Nada é apagado — dá pra consultar depois.`
              : `Arquivar "${nomes[0] || ''}"? Os gatilhos param de disparar e o fluxo sai das listas ativas. Nada é apagado — dá pra consultar depois.`)
            : (varios
              ? `Excluir ${nomes.length} fluxos (${lista}) de vez? Cada um vai embora com TODO o histórico: versões salvas e execuções. Não tem como desfazer.`
              : `Excluir "${nomes[0] || ''}" de vez? O fluxo vai embora com TODO o histórico: versões salvas e execuções. Não tem como desfazer.`)
        }
        confirmLabel={confirm?.kind === 'archive' ? 'Arquivar' : 'Excluir'}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
