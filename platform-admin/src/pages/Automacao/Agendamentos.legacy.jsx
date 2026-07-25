import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, CalendarDays, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import Tabs from '../../components/ui/Tabs';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, TextInput, Textarea } from '../../components/ui/FormField';
import { listSchedules, listCalendars, createCalendar, updateCalendar, deleteCalendar } from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { useToast } from '@studio-ux-ds/react';
import { formatDateTime, WEEKDAYS } from './automation.constants';

const TABS = [
  { id: 'agendamentos', label: 'Agendamentos', Icon: CalendarClock },
  { id: 'calendarios', label: 'Calendários', Icon: CalendarDays },
];

// Agendamentos ativos (fluxos publicados com gatilho agendado) + calendários
// de feriados/dias úteis (diretriz 12). A recorrência edita-se no fluxo.
export default function Agendamentos() {
  const [tab, setTab] = useState('agendamentos');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Agendamentos</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
          Próximos disparos dos fluxos agendados e calendários de feriados. A recorrência é configurada no gatilho do fluxo.
        </p>
      </div>
      <Tabs items={TABS} active={tab} onChange={setTab} bleed={false} />
      {tab === 'agendamentos' ? <SchedulesTab /> : <CalendarsTab />}
    </div>
  );
}

function SchedulesTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSchedules()
      .then((r) => setItems(r.items))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>;
  if (!items.length) {
    return (
      <div className="card">
        <EmptyState icon={CalendarClock} title="Nenhum agendamento" description='Publique um fluxo com gatilho "Agendado" pra ele aparecer aqui.' />
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <Table>
        <Thead>
          <Th>Fluxo</Th>
          <Th>Ativo</Th>
          <Th>Próximo disparo</Th>
          <Th>Último disparo</Th>
        </Thead>
        <Tbody>
          {items.map((s) => (
            <Tr key={s.id} onClick={() => navigate(`/automacao/fluxos/${s.workflow?.id}`)}>
              <Td><span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{s.workflow?.name || '—'}</span></Td>
              <Td><Badge variant={s.enabled && s.workflow?.status === 'PUBLISHED' ? 'green' : 'gray'}>{s.enabled && s.workflow?.status === 'PUBLISHED' ? 'Sim' : 'Não'}</Badge></Td>
              <Td>{formatDateTime(s.next_run_at)}</Td>
              <Td>{formatDateTime(s.last_run_at)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}

function CalendarsTab() {
  const toast = useToast();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} novo | calendario
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

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

  useEffect(() => { load(); }, []);

  async function confirmDelete() {
    setDeletingBusy(true);
    try {
      await deleteCalendar(deleting.id);
      toast.success('Calendário excluído.');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingBusy(false);
    }
  }

  const canManage = can('automation.calendars.manage');

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => setEditing({})}><Plus size={14} /> Novo calendário</button>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card">
          <EmptyState
            icon={CalendarDays}
            title="Nenhum calendário"
            description="Calendários definem feriados e dias úteis usados pelos agendamentos."
            action={canManage && <button className="btn-primary" onClick={() => setEditing({})}><Plus size={14} /> Novo calendário</button>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((c) => (
            <div key={c.id} className="card space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex-1 font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{c.name}</span>
                {canManage && (
                  <>
                    <button className="btn-ghost p-1.5" onClick={() => setEditing(c)} title="Editar calendário">
                      <Pencil size={14} className="text-brand" />
                    </button>
                    <button className="btn-ghost p-1.5" onClick={() => setDeleting(c)} title="Excluir calendário">
                      <Trash2 size={14} className="text-red-500" />
                    </button>
                  </>
                )}
              </div>
              <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
                Dias úteis: {(Array.isArray(c.workdays) ? c.workdays : []).map((d) => WEEKDAYS.find((w) => w.value === d)?.label).filter(Boolean).join(', ') || '—'}
              </p>
              <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
                {Array.isArray(c.holidays) ? c.holidays.length : 0} feriado(s)
              </p>
            </div>
          ))}
        </div>
      )}

      <CalendarModal calendar={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      <ConfirmDialog
        open={!!deleting}
        danger
        loading={deletingBusy}
        title="Excluir calendário"
        message={`Excluir "${deleting?.name}"? Agendamentos que o referenciam passam a considerar apenas seg-sex sem feriados.`}
        confirmLabel="Excluir"
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function CalendarModal({ calendar, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(calendar?.id);
  const [name, setName] = useState('');
  const [holidays, setHolidays] = useState('');
  const [workdays, setWorkdays] = useState([1, 2, 3, 4, 5]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!calendar) return;
    setName(calendar.name || '');
    setHolidays(Array.isArray(calendar.holidays) ? calendar.holidays.join('\n') : '');
    setWorkdays(Array.isArray(calendar.workdays) && calendar.workdays.length ? calendar.workdays : [1, 2, 3, 4, 5]);
  }, [calendar]);

  if (!calendar) return null;

  function toggleWorkday(d) {
    setWorkdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Informe o nome do calendário.'); return; }
    const dates = holidays.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    const invalid = dates.filter((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));
    if (invalid.length) { toast.error(`Datas inválidas (use AAAA-MM-DD): ${invalid.slice(0, 3).join(', ')}…`); return; }
    if (!workdays.length) { toast.error('Selecione pelo menos um dia útil.'); return; }
    setSaving(true);
    try {
      if (isEdit) await updateCalendar(calendar.id, { name: name.trim(), holidays: dates, workdays });
      else await createCalendar({ name: name.trim(), holidays: dates, workdays });
      toast.success(isEdit ? 'Calendário atualizado.' : 'Calendário criado.');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      title={isEdit ? 'Editar calendário' : 'Novo calendário'}
      size="md"
      dismissable={!saving}
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Nome" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Feriados nacionais" />
        </FormField>
        <FormField label="Dias úteis" required>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleWorkday(d.value)}
                className="px-2.5 py-1.5 rounded-lg text-xs min-h-[36px] transition-colors"
                style={{
                  border: `1px solid ${workdays.includes(d.value) ? 'var(--ap-accent, #6366f1)' : 'var(--ap-border)'}`,
                  backgroundColor: workdays.includes(d.value) ? 'var(--ap-surface-3)' : 'transparent',
                  color: workdays.includes(d.value) ? 'var(--ap-text-1)' : 'var(--ap-text-4)',
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="Feriados" hint="Uma data por linha, formato AAAA-MM-DD.">
          <Textarea rows={6} value={holidays} onChange={(e) => setHolidays(e.target.value)} placeholder={'2026-12-25\n2027-01-01'} className="font-mono text-xs" />
        </FormField>
      </div>
    </Modal>
  );
}
