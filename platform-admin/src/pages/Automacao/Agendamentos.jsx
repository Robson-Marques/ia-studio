import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListScreen, Badge, Button, ConfirmDialog, useToast } from '@studio-ux-ds/react';
import { listSchedules, listCalendars, deleteCalendar } from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime, WEEKDAYS } from './automation.constants';
import { statusToTone } from '../../lib/tone';

// Automação/Agendamentos — próximos disparos dos fluxos agendados + calendários
// de feriados/dias úteis (diretriz 12). Migrada pros moldes do DS na v0.10.37:
// cada aba é uma `ListScreen` (`.su-screen`), então a preferência de largura do
// Personalizar vale aqui. As abas viram `segments` do molde — a página-mãe só
// guarda qual está ativa e cada aba mostra a mesma barra de segmentos.
//
// Decisões de composição (preservadas da migração anterior):
//
//  · O calendário é rota (`/automacao/calendarios/:id`) — o campo "Feriados" é
//    uma lista longa de datas, o caso que a regra do Modal do DS manda pra rota.
//  · A aba "Agendamentos" é só leitura de propósito: a recorrência mora no
//    gatilho do fluxo, então clicar na linha leva pro fluxo.

const SEGMENTS = [
  { id: 'agendamentos', label: 'Agendamentos' },
  { id: 'calendarios', label: 'Calendários' },
];

const SUBTITLE = 'Quando cada fluxo agendado roda de novo, e quais dias contam como úteis. A recorrência em si é configurada no gatilho do fluxo.';

export default function Agendamentos() {
  const [tab, setTab] = useState('agendamentos');
  const seg = { segments: SEGMENTS, segment: tab, onSegment: setTab };
  return tab === 'agendamentos'
    ? <SchedulesTab seg={seg} />
    : <CalendarsTab seg={seg} />;
}

function SchedulesTab({ seg }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSchedules()
      .then((r) => setItems(r.items))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'workflow', header: 'Fluxo', render: (s) => (
      <span style={{ fontWeight: 500, color: 'var(--su-text-primary)' }}>{s.workflow?.name || '—'}</span>
    ) },
    { key: 'enabled', header: 'Vai rodar', render: (s) => {
      const on = s.enabled && s.workflow?.status === 'PUBLISHED';
      return <Badge tone={statusToTone(on ? 'green' : 'gray')}>{on ? 'Sim' : 'Não'}</Badge>;
    } },
    { key: 'next', header: 'Próxima vez', render: (s) => formatDateTime(s.next_run_at) },
    { key: 'last', header: 'Última vez', render: (s) => formatDateTime(s.last_run_at) },
  ];

  return (
    <ListScreen
      title="Agendamentos"
      subtitle={SUBTITLE}
      {...seg}
      loading={loading}
      columns={columns}
      rows={items}
      getRowId={(s) => s.id}
      onRowClick={(s) => s.workflow?.id && navigate(`/automacao/fluxos/${s.workflow.id}`)}
      getRowLabel={(s) => `Abrir fluxo ${s.workflow?.name || ''}`.trim()}
      emptyNew={{
        icon: 'calendar',
        title: 'Nenhum fluxo agendado',
        description: 'Publique um fluxo com o gatilho "Agendado" e o próximo disparo dele aparece aqui.',
      }}
    />
  );
}

function CalendarsTab({ seg }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null); // { ids, clear }
  const [deletingBusy, setDeletingBusy] = useState(false);

  const canManage = can('automation.calendars.manage');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listCalendars();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmDelete() {
    setDeletingBusy(true);
    const { ids, clear } = deleting;
    let ok = 0;
    const falhas = [];
    for (const id of ids) {
      try { await deleteCalendar(id); ok += 1; }
      catch (err) { falhas.push(err.message); }
    }
    setDeletingBusy(false);
    setDeleting(null);
    clear();
    if (ok) toast.success(ok === 1 ? 'Calendário excluído.' : `${ok} calendários excluídos.`);
    if (falhas.length) toast.error(`Não deu pra excluir ${falhas.length}: ${falhas[0]}`);
    load();
  }

  const novo = canManage && (
    <Button variant="primary" icon="plus" onClick={() => navigate('/automacao/calendarios/novo')}>
      Novo calendário
    </Button>
  );

  const columns = [
    { key: 'name', header: 'Nome', render: (c) => (
      <span style={{ fontWeight: 500, color: 'var(--su-text-primary)' }}>{c.name}</span>
    ) },
    { key: 'workdays', header: 'Dias úteis', render: (c) => {
      const dias = (Array.isArray(c.workdays) ? c.workdays : [])
        .map((d) => WEEKDAYS.find((w) => w.value === d)?.label)
        .filter(Boolean);
      return dias.length ? dias.join(', ') : '—';
    } },
    { key: 'holidays', header: 'Feriados', align: 'right', render: (c) => (Array.isArray(c.holidays) ? c.holidays.length : 0) },
  ];

  // Excluir aceita lote (registros independentes); com 1 marcado cabe também
  // "Editar", que é ação de um só.
  const bulkActions = canManage
    ? (ids, clear) => (
      <>
        {ids.length === 1 && (
          <Button variant="ghost" icon="edit" onClick={() => navigate(`/automacao/calendarios/${ids[0]}`)}>
            Editar
          </Button>
        )}
        <Button
          variant="ghost"
          icon="trash"
          title="Agendamentos que usam o calendário passam a considerar só seg-sex, sem feriados"
          onClick={() => setDeleting({ ids, clear })}
        >
          Excluir
        </Button>
      </>
    )
    : undefined;

  const nomesSelecionados = (deleting?.ids || [])
    .map((id) => items.find((c) => c.id === id)?.name)
    .filter(Boolean);

  return (
    <>
      <ListScreen
        title="Agendamentos"
        subtitle={SUBTITLE}
        {...seg}
        primaryAction={novo}
        loading={loading && !items.length}
        columns={columns}
        rows={items}
        getRowId={(c) => c.id}
        onRowClick={(c) => navigate(`/automacao/calendarios/${c.id}`)}
        getRowLabel={(c) => `Abrir calendário ${c.name}`}
        bulkActions={bulkActions}
        emptyNew={{
          icon: 'calendar',
          title: 'Nenhum calendário',
          description: 'Um calendário diz quais dias da semana valem como úteis e quais datas são feriado — os agendamentos consultam isso antes de disparar.',
          action: novo,
        }}
      />

      {/* 5 patrasques: ConfirmDialog + a consequência escrita + tooltip no botão
          + loading + gate can('automation.calendars.manage'). */}
      <ConfirmDialog
        open={!!deleting}
        danger
        loading={deletingBusy}
        title={nomesSelecionados.length > 1 ? 'Excluir calendários' : 'Excluir calendário'}
        message={
          nomesSelecionados.length > 1
            ? `Excluir ${nomesSelecionados.length} calendários (${nomesSelecionados.slice(0, 3).join(', ')}${nomesSelecionados.length > 3 ? '…' : ''})? Os agendamentos que usam qualquer um deles passam a considerar apenas segunda a sexta, sem feriado nenhum.`
            : `Excluir "${nomesSelecionados[0] || ''}"? Os agendamentos que usam esse calendário passam a considerar apenas segunda a sexta, sem feriado nenhum.`
        }
        confirmLabel="Excluir"
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
