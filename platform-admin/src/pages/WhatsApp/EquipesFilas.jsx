import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListScreen, Badge, Button, ConfirmDialog, useToast } from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import { listQueues, listTeams, updateQueue, updateTeam } from '../../services/whatsapp';

// WhatsApp/EquipesFilas — quem atende (equipes) e onde a conversa espera (filas).
// Migrada pro DS na v0.10.9.
//
// Decisões de composição:
//
//  · **As três ações por linha da equipe** (lápis, pessoas, lixeira) saíram. A
//    linha abre o **editor em rota**, que reúne dados e membros na mesma tela — os
//    membros eram um terceiro Modal, aberto por um ícone, para gerir uma coleção
//    dentro de um overlay apertado.
//  · **Desativar/reativar foi para a barra de lote** e aceita vários. Continua
//    sendo soft-delete: nada é excluído, e o backend recusa se houver conversa
//    aberta vinculada.
//  · A ação **muda de rótulo conforme a seleção** — "Desativar" quando tudo está
//    ativo, "Reativar" quando tudo está inativo, e **nenhuma das duas** quando a
//    seleção mistura os dois estados (aí não existe ação única correta).

const TABS = [
  { id: 'teams', label: 'Equipes' },
  { id: 'queues', label: 'Filas' },
];

export default function EquipesFilas() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [tab, setTab] = useState('teams');
  const [teams, setTeams] = useState([]);
  const [queues, setQueues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // { kind, ids, ativar, clear }
  const [saving, setSaving] = useState(false);

  const manageTeams = can('comm.whatsapp.teams.manage');
  const manageQueues = can('comm.whatsapp.queues.manage');

  async function load() {
    setLoading(true);
    try {
      const [t, q] = await Promise.all([listTeams(true), listQueues(true)]);
      setTeams(t);
      setQueues(q);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmToggle() {
    const { kind, ids, ativar, clear } = confirm;
    setSaving(true);
    const acao = kind === 'team' ? updateTeam : updateQueue;
    let ok = 0;
    const falhas = [];
    for (const id of ids) {
      try { await acao(id, { is_active: ativar }); ok += 1; }
      catch (err) { falhas.push(err.message); }
    }
    setSaving(false);
    setConfirm(null);
    clear();
    if (ok) toast.success(ativar ? (ok === 1 ? 'Reativado.' : `${ok} reativados.`) : (ok === 1 ? 'Desativado.' : `${ok} desativados.`));
    if (falhas.length) toast.error(`Não deu pra concluir em ${falhas.length}: ${falhas[0]}`);
    load();
  }

  const queueName = (id) => queues.find((q) => q.id === id)?.name || '—';
  const teamName = (id) => teams.find((t) => t.id === id)?.name || '—';

  // A ação de lote depende do estado da seleção: sem estado único, sem ação.
  function bulkFor(kind, lista, podeGerir) {
    if (!podeGerir) return undefined;
    return (ids, clear) => {
      const sel = lista.filter((x) => ids.includes(x.id));
      const todosAtivos = sel.every((x) => x.is_active);
      const todosInativos = sel.every((x) => !x.is_active);
      if (!todosAtivos && !todosInativos) return null;
      const ativar = todosInativos;
      return (
        <Button
          variant="ghost"
          icon={ativar ? 'refresh' : 'archive'}
          title={ativar
            ? 'Volta a aparecer nas transferências e no atendimento'
            : 'Sai das listas de atendimento. Nada é excluído — e não dá para desativar com conversa aberta vinculada.'}
          onClick={() => setConfirm({ kind, ids, ativar, clear })}
        >
          {ativar ? 'Reativar' : 'Desativar'}
        </Button>
      );
    };
  }

  const teamColumns = [
    { key: 'name', header: 'Equipe', render: (t) => (
      <div className="min-w-0">
        <p style={{ fontWeight: 500, margin: 0, color: 'var(--su-text-primary)' }} className="truncate">{t.name}</p>
        {t.description && <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)' }} className="truncate">{t.description}</p>}
      </div>
    ) },
    { key: 'queue', header: 'Fila padrão', render: (t) => queueName(t.default_queue_id) },
    { key: 'members', header: 'Pessoas', align: 'right', render: (t) => t.members?.length ?? 0 },
    { key: 'status', header: 'Situação', render: (t) => (
      <Badge tone={t.is_active ? 'success' : 'neutral'}>{t.is_active ? 'ativa' : 'inativa'}</Badge>
    ) },
  ];

  const queueColumns = [
    { key: 'name', header: 'Fila', render: (q) => (
      <div className="min-w-0">
        <p style={{ fontWeight: 500, margin: 0, color: 'var(--su-text-primary)' }} className="truncate">{q.name}</p>
        {q.description && <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)' }} className="truncate">{q.description}</p>}
      </div>
    ) },
    { key: 'team', header: 'Equipe', render: (q) => teamName(q.team_id) },
    { key: 'status', header: 'Situação', render: (q) => (
      <Badge tone={q.is_active ? 'success' : 'neutral'}>{q.is_active ? 'ativa' : 'inativa'}</Badge>
    ) },
  ];

  const acao = tab === 'teams'
    ? (manageTeams && (
      <Button variant="primary" icon="plus" onClick={() => navigate('/whatsapp/equipes/nova')}>Nova equipe</Button>
    ))
    : (manageQueues && (
      <Button variant="primary" icon="plus" onClick={() => navigate('/whatsapp/filas/nova')}>Nova fila</Button>
    ));

  const nomes = (confirm?.ids || [])
    .map((id) => (confirm.kind === 'team' ? teams : queues).find((x) => x.id === id)?.name)
    .filter(Boolean);

  const isTeams = tab === 'teams';

  return (
    <>
      <ListScreen
        title="Equipes e Filas"
        subtitle="Equipe é quem atende; fila é onde a conversa espera. A distribuição é manual — alguém assume ou transfere."
        primaryAction={acao}
        segments={TABS}
        segment={tab}
        onSegment={setTab}
        loading={loading}
        columns={isTeams ? teamColumns : queueColumns}
        rows={isTeams ? teams : queues}
        getRowId={(x) => x.id}
        onRowClick={(x) => navigate(isTeams ? `/whatsapp/equipes/${x.id}` : `/whatsapp/filas/${x.id}`)}
        getRowLabel={(x) => (isTeams ? `Abrir a equipe ${x.name}` : `Abrir a fila ${x.name}`)}
        bulkActions={isTeams ? bulkFor('team', teams, manageTeams) : bulkFor('queue', queues, manageQueues)}
        emptyNew={isTeams
          ? {
            icon: 'users',
            title: 'Nenhuma equipe',
            description: 'Equipes organizam quem atende o quê. Criar uma equipe não liga distribuição automática: quem assume a conversa é uma pessoa, ou alguém transfere para a fila dela.',
            action: acao,
          }
          : {
            icon: 'menu',
            title: 'Nenhuma fila',
            description: 'Fila é o destino de uma transferência e a casa da conversa enquanto ninguém a assume.',
            action: acao,
          }}
      />

      {/* 5 patrasques: ConfirmDialog + consequência escrita + tooltip + loading +
          gate de permissão (a barra só existe com `manage`). */}
      <ConfirmDialog
        open={!!confirm}
        danger={!confirm?.ativar}
        loading={saving}
        title={confirm?.ativar ? 'Reativar' : 'Desativar'}
        message={
          confirm?.ativar
            ? `Reativar ${nomes.length > 1 ? `${nomes.length} itens` : `"${nomes[0] || ''}"`}? Volta a aparecer nas transferências e no atendimento.`
            : `Desativar ${nomes.length > 1 ? `${nomes.length} itens` : `"${nomes[0] || ''}"`}? Sai das listas de atendimento, mas nada é excluído — o histórico fica e dá para reativar. Se houver conversa aberta vinculada, o sistema recusa.`
        }
        confirmLabel={confirm?.ativar ? 'Reativar' : 'Desativar'}
        onClose={() => setConfirm(null)}
        onConfirm={confirmToggle}
      />
    </>
  );
}
