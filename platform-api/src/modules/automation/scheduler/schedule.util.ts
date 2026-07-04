// Funcoes PURAS do Scheduler (diretriz 12): agendamento amigavel sem CRON
// obrigatorio ("Todo dia às 08:00", "A cada 10 min", "Primeiro dia útil"...)
// + modo avancado CRON de 5 campos. computeNextRuns alimenta o preview das
// proximas execucoes e o next_run_at persistido. Horarios no fuso do servidor.
import { ScheduleDef } from '../engine/workflow-graph';

export interface CalendarDef {
  /** ['2026-12-25', ...] */
  holidays: string[];
  /** Dias uteis 0=dom..6=sab (default seg-sex). */
  workdays: number[];
}

export const DEFAULT_CALENDAR: CalendarDef = { holidays: [], workdays: [1, 2, 3, 4, 5] };

const MAX_SCAN_DAYS = 400;

function ymd(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function isWorkday(d: Date, cal: CalendarDef): boolean {
  if (!cal.workdays.includes(d.getDay())) return false;
  return !cal.holidays.includes(ymd(d));
}

function parseTime(time?: string): { h: number; m: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec((time ?? '08:00').trim());
  if (!match) return { h: 8, m: 0 };
  return { h: Math.min(23, Number(match[1])), m: Math.min(59, Number(match[2])) };
}

function atTime(base: Date, h: number, m: number): Date {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Proximo dia (>= base) que e util no calendario. */
function nextWorkday(base: Date, cal: CalendarDef): Date {
  const d = new Date(base);
  for (let i = 0; i < MAX_SCAN_DAYS; i++) {
    if (isWorkday(d, cal)) return d;
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function businessDayOfMonth(year: number, month: number, def: NonNullable<ScheduleDef['business']>, cal: CalendarDef): Date | null {
  const days: Date[] = [];
  const cursor = new Date(year, month, 1);
  while (cursor.getMonth() === month) {
    const valid = def.weekday !== undefined ? cursor.getDay() === def.weekday && isWorkday(cursor, cal) : isWorkday(cursor, cal);
    if (valid) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  if (days.length === 0) return null;
  return def.which === 'last' ? days[days.length - 1] : days[0];
}

// ─── CRON de 5 campos (min hora dia mes dia-semana) ─────────────────────

function parseCronField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const stepMatch = /^(\*|\d+-\d+|\d+)(?:\/(\d+))?$/.exec(part.trim());
    if (!stepMatch) continue;
    const [, rangePart, stepStr] = stepMatch;
    const step = stepStr ? Math.max(1, Number(stepStr)) : 1;
    let lo = min;
    let hi = max;
    if (rangePart !== '*') {
      if (rangePart.includes('-')) {
        const [a, b] = rangePart.split('-').map(Number);
        lo = a;
        hi = b;
      } else {
        lo = Number(rangePart);
        hi = step > 1 ? max : Number(rangePart);
      }
    }
    for (let v = lo; v <= hi; v += step) {
      if (v >= min && v <= max) out.add(v);
    }
  }
  return out;
}

export function cronMatches(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [minF, hourF, domF, monF, dowF] = fields;
  const minutes = parseCronField(minF, 0, 59);
  const hours = parseCronField(hourF, 0, 23);
  const doms = parseCronField(domF, 1, 31);
  const months = parseCronField(monF, 1, 12);
  const dows = parseCronField(dowF, 0, 6);
  return (
    minutes.has(date.getMinutes()) &&
    hours.has(date.getHours()) &&
    doms.has(date.getDate()) &&
    months.has(date.getMonth() + 1) &&
    dows.has(date.getDay() === 7 ? 0 : date.getDay())
  );
}

export function validateScheduleDef(def: ScheduleDef): string[] {
  const errors: string[] = [];
  switch (def.kind) {
    case 'interval':
      if (!def.every_minutes || def.every_minutes < 1) errors.push('informe o intervalo em minutos (mínimo 1).');
      break;
    case 'weekly':
      if (def.weekday === undefined || def.weekday < 0 || def.weekday > 6) errors.push('informe o dia da semana (0=domingo..6=sábado).');
      break;
    case 'monthly':
      if (!def.day || def.day < 1 || def.day > 31) errors.push('informe o dia do mês (1-31).');
      break;
    case 'business_day':
      if (!def.business?.which) errors.push('informe primeiro/último dia útil.');
      break;
    case 'cron': {
      if (!def.cron || def.cron.trim().split(/\s+/).length !== 5) errors.push('expressão CRON deve ter 5 campos (min hora dia mês dia-semana).');
      break;
    }
    case 'daily':
      break;
    default:
      errors.push('tipo de agendamento desconhecido.');
  }
  return errors;
}

/** Proximas `n` execucoes a partir de `from` (exclusivo). */
export function computeNextRuns(def: ScheduleDef, calendar: CalendarDef | null, n = 5, from = new Date()): Date[] {
  const cal = calendar ?? DEFAULT_CALENDAR;
  const out: Date[] = [];
  const { h, m } = parseTime(def.time);

  if (def.kind === 'interval') {
    const step = Math.max(1, def.every_minutes ?? 5) * 60_000;
    let t = from.getTime() + step - (from.getTime() % 60_000);
    for (let i = 0; i < n; i++) {
      out.push(new Date(t));
      t += step;
    }
    return out;
  }

  if (def.kind === 'cron') {
    const cursor = new Date(from);
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + 1);
    const limit = MAX_SCAN_DAYS * 24 * 60;
    for (let i = 0; i < limit && out.length < n; i++) {
      if (cronMatches(def.cron ?? '', cursor)) out.push(new Date(cursor));
      cursor.setMinutes(cursor.getMinutes() + 1);
    }
    return out;
  }

  if (def.kind === 'business_day') {
    const which = def.business ?? { which: 'first' as const };
    let year = from.getFullYear();
    let month = from.getMonth();
    for (let i = 0; i < 24 && out.length < n; i++) {
      const day = businessDayOfMonth(year, month, which, cal);
      if (day) {
        const runAt = atTime(day, h, m);
        if (runAt > from) out.push(runAt);
      }
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
    return out;
  }

  // daily / weekly / monthly — varre dia a dia respeitando o calendario
  // (com calendar_id, dias nao uteis sao pulados).
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const useCalendar = Boolean(def.calendar_id);
  for (let i = 0; i < MAX_SCAN_DAYS && out.length < n; i++) {
    let matches = false;
    if (def.kind === 'daily') matches = true;
    if (def.kind === 'weekly') matches = cursor.getDay() === (def.weekday ?? 1);
    if (def.kind === 'monthly') {
      const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      matches = cursor.getDate() === Math.min(def.day ?? 1, lastDay);
    }
    if (matches && (!useCalendar || isWorkday(cursor, cal))) {
      const runAt = atTime(cursor, h, m);
      if (runAt > from) out.push(runAt);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Descricao humana do agendamento (listas do painel). */
export function describeSchedule(def: ScheduleDef): string {
  const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  switch (def.kind) {
    case 'interval':
      return `A cada ${def.every_minutes ?? '?'} min`;
    case 'daily':
      return `Todo dia às ${def.time ?? '08:00'}`;
    case 'weekly':
      return `Toda ${WEEKDAYS[def.weekday ?? 1]} às ${def.time ?? '08:00'}`;
    case 'monthly':
      return `Todo dia ${def.day ?? 1} às ${def.time ?? '08:00'}`;
    case 'business_day':
      return `${def.business?.which === 'last' ? 'Último' : 'Primeiro'} dia útil às ${def.time ?? '08:00'}`;
    case 'cron':
      return `CRON: ${def.cron ?? ''}`;
    default:
      return 'Agendamento';
  }
}
