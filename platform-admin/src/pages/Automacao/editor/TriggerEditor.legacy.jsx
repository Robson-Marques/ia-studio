import React, { useEffect, useState } from 'react';
import { CalendarClock, Loader2, Webhook, Zap, Hand } from 'lucide-react';
import { FormField, TextInput, Select, NumberInput } from '../../../components/ui/FormField';
import { previewSchedule, listCalendars } from '../../../services/automation';
import { useToast } from '@studio-ux-ds/react';
import { SCHEDULE_KINDS, WEEKDAYS, formatDateTime } from '../automation.constants';

// Editor do gatilho do fluxo: manual/evento/webhook/agendado.
// Agendado = UI amigável (diretriz 12) com preview das próximas 5 execuções.
export default function TriggerEditor({ trigger, onChange, webhookToken }) {
  const toast = useToast();
  const t = trigger || { type: 'manual' };
  const schedule = t.schedule || { kind: 'daily', time: '08:00' };
  const [calendars, setCalendars] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (t.type === 'schedule') {
      listCalendars().then((r) => setCalendars(r.items)).catch(() => setCalendars([]));
    }
  }, [t.type]);

  function setType(type) {
    onChange({ ...t, type });
    setPreview(null);
  }

  function setSchedule(patch) {
    onChange({ ...t, type: 'schedule', schedule: { ...schedule, ...patch } });
    setPreview(null);
  }

  async function handlePreview() {
    setPreviewing(true);
    try {
      const result = await previewSchedule(schedule);
      setPreview(result);
    } catch (err) {
      toast.error(err.message);
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }

  const TYPES = [
    { id: 'manual', label: 'Manual', Icon: Hand, help: 'Dispara pelo botão Executar.' },
    { id: 'event', label: 'Acontecimento', Icon: Zap, help: 'Dispara quando algo acontece na plataforma (ex.: chega uma mensagem de WhatsApp).' },
    { id: 'schedule', label: 'Agendado', Icon: CalendarClock, help: 'Dispara automaticamente nos horários definidos.' },
    { id: 'webhook', label: 'Sistema externo', Icon: Webhook, help: 'Dispara quando um sistema externo chama o endereço do fluxo.' },
  ];

  // Mesmos acontecimentos do nó "Quando algo acontece" — valor real, rótulo humano.
  const EVENTOS = [
    { value: 'whatsapp.inbound.message', label: 'Nova mensagem de WhatsApp chegou' },
    { value: 'ai.agent.run.completed', label: 'Um assistente terminou um atendimento' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {TYPES.map(({ id, label, Icon, help }) => (
          <button
            key={id}
            type="button"
            onClick={() => setType(id)}
            title={help}
            className="rounded-lg p-2.5 text-left transition-colors min-h-[44px]"
            style={{
              border: `1px solid ${t.type === id ? 'var(--ap-accent, #6366f1)' : 'var(--ap-border)'}`,
              backgroundColor: t.type === id ? 'var(--ap-surface-3)' : 'transparent',
              color: t.type === id ? 'var(--ap-text-1)' : 'var(--ap-text-3)',
            }}
          >
            <Icon size={15} className={t.type === id ? 'text-brand' : ''} />
            <p className="text-xs font-medium mt-1">{label}</p>
          </button>
        ))}
      </div>

      {t.type === 'event' && (
        <FormField label="Acontecimento" required hint="O que dispara este fluxo. Use o mesmo no passo de gatilho.">
          <Select value={t.event ?? ''} onChange={(e) => onChange({ ...t, event: e.target.value })}>
            <option value="">— escolha um acontecimento —</option>
            {EVENTOS.map((ev) => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
          </Select>
        </FormField>
      )}

      {t.type === 'webhook' && (
        <div className="rounded-lg p-3 text-xs space-y-1" style={{ border: '1px solid var(--ap-border)', color: 'var(--ap-text-3)' }}>
          <p>Endereço para o sistema externo disparar (depois de publicar):</p>
          <code className="block break-all font-mono" style={{ color: 'var(--ap-text-1)' }}>
            POST /api/webhooks/flows/{webhookToken || '<endereço gerado ao publicar>'}
          </code>
          <p>Os dados enviados ficam disponíveis nos passos como {'{{input.*}}'}. Para evitar disparos duplicados, envie um identificador único.</p>
        </div>
      )}

      {t.type === 'schedule' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FormField label="Recorrência" required>
              <Select value={schedule.kind} onChange={(e) => setSchedule({ kind: e.target.value })}>
                {SCHEDULE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </Select>
            </FormField>
            {schedule.kind === 'interval' && (
              <FormField label="A cada (minutos)" required>
                <NumberInput value={schedule.every_minutes ?? 10} onChange={(v) => setSchedule({ every_minutes: v })} min={1} />
              </FormField>
            )}
            {['daily', 'weekly', 'monthly', 'business_day'].includes(schedule.kind) && (
              <FormField label="Horário (HH:MM)" required>
                <TextInput value={schedule.time ?? '08:00'} onChange={(e) => setSchedule({ time: e.target.value })} placeholder="08:00" />
              </FormField>
            )}
            {schedule.kind === 'weekly' && (
              <FormField label="Dia da semana" required>
                <Select value={schedule.weekday ?? 1} onChange={(e) => setSchedule({ weekday: Number(e.target.value) })}>
                  {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </Select>
              </FormField>
            )}
            {schedule.kind === 'monthly' && (
              <FormField label="Dia do mês" required>
                <NumberInput value={schedule.day ?? 1} onChange={(v) => setSchedule({ day: v })} min={1} max={31} />
              </FormField>
            )}
            {schedule.kind === 'business_day' && (
              <FormField label="Qual dia útil" required>
                <Select
                  value={schedule.business?.which ?? 'first'}
                  onChange={(e) => setSchedule({ business: { ...(schedule.business || {}), which: e.target.value } })}
                >
                  <option value="first">Primeiro do mês</option>
                  <option value="last">Último do mês</option>
                </Select>
              </FormField>
            )}
            {schedule.kind === 'cron' && (
              <FormField label="Expressão CRON (5 campos)" required hint="min hora dia mês dia-semana">
                <TextInput value={schedule.cron ?? ''} onChange={(e) => setSchedule({ cron: e.target.value })} placeholder="0 8 * * 1-5" className="font-mono" />
              </FormField>
            )}
            <FormField label="Calendário (feriados)" hint="Dias fora do calendário são pulados.">
              <Select value={schedule.calendar_id ?? ''} onChange={(e) => setSchedule({ calendar_id: e.target.value || undefined })}>
                <option value="">— nenhum —</option>
                {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </FormField>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" className="btn-secondary" onClick={handlePreview} disabled={previewing} title="Calcula as próximas 5 execuções desse agendamento">
              {previewing ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />} Ver próximas execuções
            </button>
            {preview && <span className="text-xs font-medium" style={{ color: 'var(--ap-text-2)' }}>{preview.description}</span>}
          </div>
          {preview && (
            <div className="rounded-lg p-3" style={{ border: '1px solid var(--ap-border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--ap-text-5)' }}>Próximas 5 execuções</p>
              <ul className="text-xs space-y-1" style={{ color: 'var(--ap-text-2)' }}>
                {(preview.next_runs || []).map((d) => <li key={d}>{formatDateTime(d)}</li>)}
                {!(preview.next_runs || []).length && <li style={{ color: 'var(--ap-text-4)' }}>Nenhuma ocorrência encontrada.</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
