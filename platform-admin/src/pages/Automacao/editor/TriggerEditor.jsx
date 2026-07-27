import React, { useEffect, useId, useState } from 'react';
import {
  FormGrid, Field, Input, Select, NumericInput, Radio, CheckGroup, Button, useToast,
} from '@studio-ux-ds/react';
import { previewSchedule, listCalendars } from '../../../services/automation';
import { SCHEDULE_KINDS, WEEKDAYS, formatDateTime } from '../automation.constants';

// Automação/editor/TriggerEditor — o que dispara o fluxo (v0.10.2).
//
// Os 4 tipos eram `<button>` com borda e fundo cravados no estilo inline
// (`var(--ap-accent, #6366f1)`), imitando um controle de escolha única. Agora são
// `Radio variant="card"` do DS: círculo (cabe UM), a explicação de cada tipo saiu
// do `title` — que só aparece no hover — e foi pro `meta`, na tela. Ganhou também
// foco visível e navegação por seta, que o `<button>` não dava.

export default function TriggerEditor({ trigger, onChange, webhookToken }) {
  const toast = useToast();
  const t = trigger || { type: 'manual' };
  const schedule = t.schedule || { kind: 'daily', time: '08:00' };
  const [calendars, setCalendars] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const groupName = `trigger-${useId()}`;

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
      setPreview(await previewSchedule(schedule));
    } catch (err) {
      toast.error(err.message);
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }

  const TYPES = [
    { id: 'manual', label: 'Só quando eu mandar', meta: 'Você dispara pelo botão "Rodar agora".' },
    { id: 'event', label: 'Quando algo acontecer', meta: 'Ex.: chega uma mensagem no WhatsApp.' },
    { id: 'schedule', label: 'Em horários certos', meta: 'Todo dia, toda semana, de N em N minutos…' },
    { id: 'webhook', label: 'Quando outro sistema chamar', meta: 'Um sistema externo chama o endereço do fluxo.' },
  ];

  // Mesmos acontecimentos do passo "Quando algo acontece" — valor real, rótulo humano.
  const EVENTOS = [
    { value: 'whatsapp.inbound.message', label: 'Chegou uma mensagem de WhatsApp' },
    { value: 'ai.agent.run.completed', label: 'Um assistente terminou um atendimento' },
  ];

  return (
    <div className="space-y-4">
      {/* columns={1}: cada opção tem uma frase de explicação embaixo — em duas
          colunas o texto parte em três linhas e a leitura piora (regra do
          CheckGroup: número é TETO, e rótulo-frase pede menos colunas). */}
      <CheckGroup columns={1} role="radiogroup" aria-label="O que dispara este fluxo">
        {TYPES.map((tp) => (
          <Radio
            key={tp.id}
            name={groupName}
            variant="card"
            label={tp.label}
            meta={tp.meta}
            checked={t.type === tp.id}
            onChange={() => setType(tp.id)}
          />
        ))}
      </CheckGroup>

      {t.type === 'event' && (
        <Field label="Qual acontecimento" required hint="Use o mesmo no passo de gatilho do fluxo.">
          <Select value={t.event ?? ''} onChange={(e) => onChange({ ...t, event: e.target.value })}>
            <option value="">— escolha —</option>
            {EVENTOS.map((ev) => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
          </Select>
        </Field>
      )}

      {t.type === 'webhook' && (
        <div
          style={{
            fontSize: 12, borderRadius: 8, padding: 12,
            border: '1px solid var(--su-border-default)', color: 'var(--su-text-secondary)',
          }}
          className="space-y-1"
        >
          <p style={{ margin: 0 }}>Endereço para o outro sistema chamar (vale depois de publicar):</p>
          <code
            style={{
              display: 'block', wordBreak: 'break-all',
              fontFamily: 'var(--su-font-mono, monospace)', color: 'var(--su-text-primary)',
            }}
          >
            POST /api/webhooks/flows/{webhookToken || '<gerado ao publicar>'}
          </code>
          <p style={{ margin: 0 }}>
            O que ele enviar fica disponível nos passos como {'{{input.…}}'}. Para não disparar duas vezes o mesmo caso, peça que ele envie um identificador único.
          </p>
        </div>
      )}

      {t.type === 'schedule' && (
        <div className="space-y-3">
          <FormGrid columns={2}>
            <Field label="Com que frequência" required>
              <Select value={schedule.kind} onChange={(e) => setSchedule({ kind: e.target.value })}>
                {SCHEDULE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </Select>
            </Field>

            {schedule.kind === 'interval' && (
              <Field label="A cada quantos minutos" required>
                {/* Sem `|| fallback` no onChange — apagar tudo tem que ser
                    possível; quem recusa vazio é o backend ao salvar/prever. */}
                <NumericInput fullWidth value={schedule.every_minutes ?? 10} onChange={(v) => setSchedule({ every_minutes: v })} min={1} />
              </Field>
            )}

            {['daily', 'weekly', 'monthly', 'business_day'].includes(schedule.kind) && (
              <Field label="Horário" required hint="No formato HH:MM.">
                <Input value={schedule.time ?? '08:00'} onChange={(e) => setSchedule({ time: e.target.value })} placeholder="08:00" />
              </Field>
            )}

            {schedule.kind === 'weekly' && (
              <Field label="Em que dia da semana" required>
                <Select value={schedule.weekday ?? 1} onChange={(e) => setSchedule({ weekday: Number(e.target.value) })}>
                  {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </Select>
              </Field>
            )}

            {schedule.kind === 'monthly' && (
              <Field label="Em que dia do mês" required>
                <NumericInput fullWidth value={schedule.day ?? 1} onChange={(v) => setSchedule({ day: v })} min={1} max={31} />
              </Field>
            )}

            {schedule.kind === 'business_day' && (
              <Field label="Qual dia útil" required>
                <Select
                  value={schedule.business?.which ?? 'first'}
                  onChange={(e) => setSchedule({ business: { ...(schedule.business || {}), which: e.target.value } })}
                >
                  <option value="first">O primeiro do mês</option>
                  <option value="last">O último do mês</option>
                </Select>
              </Field>
            )}

            {schedule.kind === 'cron' && (
              <Field label="Expressão CRON" required hint="Cinco campos: minuto hora dia mês dia-da-semana.">
                <Input
                  value={schedule.cron ?? ''}
                  onChange={(e) => setSchedule({ cron: e.target.value })}
                  placeholder="0 8 * * 1-5"
                  style={{ fontFamily: 'var(--su-font-mono, monospace)' }}
                />
              </Field>
            )}

            <Field label="Calendário de feriados" hint="Dia que não é útil no calendário escolhido é pulado.">
              <Select value={schedule.calendar_id ?? ''} onChange={(e) => setSchedule({ calendar_id: e.target.value || undefined })}>
                <option value="">— nenhum —</option>
                {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </FormGrid>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              icon="calendar"
              loading={previewing}
              title="Calcula as 5 próximas vezes em que este agendamento dispararia"
              onClick={handlePreview}
            >
              Ver as próximas vezes
            </Button>
            {preview && (
              <span className="text-xs" style={{ fontWeight: 500, color: 'var(--su-text-secondary)' }}>
                {preview.description}
              </span>
            )}
          </div>

          {preview && (
            <div style={{ borderRadius: 8, padding: 12, border: '1px solid var(--su-border-default)' }}>
              <p
                style={{
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em',
                  margin: '0 0 6px', color: 'var(--su-text-muted)',
                }}
              >
                Próximas 5 vezes
              </p>
              <ul className="text-xs space-y-1" style={{ margin: 0, paddingLeft: 16, color: 'var(--su-text-secondary)' }}>
                {(preview.next_runs || []).map((d) => <li key={d}>{formatDateTime(d)}</li>)}
                {!(preview.next_runs || []).length && (
                  <li style={{ color: 'var(--su-text-muted)' }}>Nenhuma data encontrada — confira a configuração.</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
