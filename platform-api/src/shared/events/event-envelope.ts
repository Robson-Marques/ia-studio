// Envelope padrao de evento (diretriz 7): TUDO e evento. Qualquer modulo
// publica pelo EventBusService; qualquer consumidor assina (EventEmitter2
// sincrono no processo + fila do broker pros workers).
export interface EventEnvelope<T = Record<string, unknown>> {
  /** Nome canonico: 'whatsapp.inbound.message', 'connection.token_expired'... */
  event: string;
  organization_id: string;
  workspace_id?: string | null;
  environment_id?: string | null;
  /** Correlacao ponta-a-ponta (workflow → no → provider → mensagem). */
  trace_id: string;
  /** Idempotencia: dedup no bus e jobId no broker. */
  source_event_id: string;
  occurred_at: string;
  /** Payload MINIMO — consumer faz lookup se precisar de mais. */
  payload: T;
}
