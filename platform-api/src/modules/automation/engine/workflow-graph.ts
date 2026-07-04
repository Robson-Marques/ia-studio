// Tipos do grafo persistido (fonte da verdade — o editor e so representacao
// visual). Fase 4: editor em lista vertical; o canvas React Flow (Fase 5)
// consome o MESMO formato.
export interface WorkflowNode {
  id: string;
  type: string;
  name?: string;
  config?: Record<string, unknown>;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  /** 'success' | 'error' | 'true' | 'false' | expressao simples ({{a}} == b). */
  when?: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ─── Trigger amigavel (mora na versao publicada) ────────────────────────

export type TriggerType = 'manual' | 'event' | 'webhook' | 'schedule';

export interface ScheduleDef {
  kind: 'interval' | 'daily' | 'weekly' | 'monthly' | 'cron' | 'business_day';
  /** 'HH:MM' (daily/weekly/monthly/business_day). */
  time?: string;
  /** 0=domingo..6=sabado (weekly). */
  weekday?: number;
  /** Dia do mes 1-31 (monthly). */
  day?: number;
  /** Intervalo em minutos (interval). */
  every_minutes?: number;
  /** Primeiro/ultimo dia util (ou weekday especifico) do mes. */
  business?: { which: 'first' | 'last'; weekday?: number };
  /** Expressao CRON de 5 campos (cron). */
  cron?: string;
  /** Calendario de feriados/dias uteis (AutomationCalendar). */
  calendar_id?: string;
}

export interface TriggerDef {
  type: TriggerType;
  /** Nome do evento assinado no bus (type=event). */
  event?: string;
  /** Definicao amigavel do agendamento (type=schedule). */
  schedule?: ScheduleDef;
}

export function parseGraph(raw: unknown): WorkflowGraph {
  const g = (raw ?? {}) as Partial<WorkflowGraph>;
  return {
    nodes: Array.isArray(g.nodes) ? g.nodes : [],
    edges: Array.isArray(g.edges) ? g.edges : [],
  };
}

export function parseTrigger(raw: unknown): TriggerDef {
  const t = (raw ?? {}) as Partial<TriggerDef>;
  const type: TriggerType = ['manual', 'event', 'webhook', 'schedule'].includes(t.type as string)
    ? (t.type as TriggerType)
    : 'manual';
  return { type, event: t.event, schedule: t.schedule };
}
