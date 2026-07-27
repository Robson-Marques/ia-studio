import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, Card, Field, Input, TextArea, CheckGroup, Checkbox, Button, useToast, Spinner } from '@studio-ux-ds/react';
import { listCalendars, createCalendar, updateCalendar } from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { WEEKDAYS } from './automation.constants';

// Automação/CalendarioEditor — um calendário de dias úteis e feriados (v0.9.99).
//
// Rotas: `/automacao/calendarios/novo` e `/automacao/calendarios/:id`. Era um
// Modal `size="md"`; foi promovido a rota pela regra do Modal do DS — o campo de
// feriados é um TextArea de verdade (uma data por linha, cresce sem limite).
//
// Os dias úteis eram 7 `<button>` com borda e `background` cravados no estilo
// inline, imitando um checkbox. Agora são `Checkbox` do DS num `CheckGroup`: o
// quadrado já diz "cabem vários", o estado é do `<input>` (teclado e leitor de
// tela funcionam de graça) e a cor vem do tema, não de `#6366f1`.
//
// Não existe endpoint de "buscar um calendário" — a lista é curta e vem inteira
// (`GET /automation/schedule/calendars`), então o editor filtra pelo id em vez de
// inventar uma rota no backend só pra isso.

export default function CalendarioEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();

  const isEdit = !!id;
  const canManage = can('automation.calendars.manage');

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [holidays, setHolidays] = useState('');
  const [workdays, setWorkdays] = useState([1, 2, 3, 4, 5]);

  useEffect(() => {
    if (!isEdit) return;
    listCalendars()
      .then(({ items }) => {
        const found = items.find((c) => c.id === id);
        if (!found) {
          toast.error('Calendário não encontrado.');
          navigate('/automacao/agendamentos', { replace: true });
          return;
        }
        setName(found.name || '');
        setHolidays(Array.isArray(found.holidays) ? found.holidays.join('\n') : '');
        setWorkdays(Array.isArray(found.workdays) && found.workdays.length ? found.workdays : [1, 2, 3, 4, 5]);
      })
      .catch((err) => {
        toast.error(err.message);
        navigate('/automacao/agendamentos', { replace: true });
      })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleWorkday(d) {
    setWorkdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Dê um nome ao calendário.'); return; }
    const dates = holidays.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    const invalid = dates.filter((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));
    if (invalid.length) {
      toast.error(`Estas datas não estão no formato AAAA-MM-DD: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`);
      return;
    }
    if (!workdays.length) { toast.error('Marque pelo menos um dia útil.'); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), holidays: dates, workdays };
      if (isEdit) await updateCalendar(id, body);
      else await createCalendar(body);
      toast.success(isEdit ? 'Calendário atualizado.' : 'Calendário criado.');
      navigate('/automacao/agendamentos');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Carregando…" />
        <Spinner size="lg" center />
      </div>
    );
  }

  const feriadosCount = holidays.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? (name || 'Calendário') : 'Novo calendário'}
        subtitle="Os agendamentos consultam este calendário antes de disparar: se o dia não é útil ou é feriado, o disparo espera o próximo dia válido."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/automacao/agendamentos')} disabled={saving}>
              Cancelar
            </Button>
            {canManage && (
              <Button variant="primary" loading={saving} onClick={handleSave}>
                Salvar
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          <Field label="Nome" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Feriados nacionais"
              disabled={!canManage}
            />
          </Field>

          <Field label="Dias úteis" required hint="Os dias em que um agendamento pode disparar.">
            <CheckGroup columns="auto">
              {WEEKDAYS.map((d) => (
                <Checkbox
                  key={d.value}
                  label={d.label}
                  checked={workdays.includes(d.value)}
                  onChange={() => toggleWorkday(d.value)}
                  disabled={!canManage}
                />
              ))}
            </CheckGroup>
          </Field>

          <Field
            label="Feriados"
            hint="Uma data por linha, no formato AAAA-MM-DD. Nesses dias nenhum agendamento dispara."
          >
            <TextArea
              rows={10}
              value={holidays}
              onChange={(e) => setHolidays(e.target.value)}
              placeholder={'2026-12-25\n2027-01-01'}
              disabled={!canManage}
              style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
            />
          </Field>

          <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>
            {feriadosCount === 0 ? 'Nenhum feriado informado.' : feriadosCount === 1 ? '1 feriado informado.' : `${feriadosCount} feriados informados.`}
          </p>
        </div>
      </Card>
    </div>
  );
}
