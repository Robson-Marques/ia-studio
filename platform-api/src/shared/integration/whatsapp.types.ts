// Tipos unificados do canal WhatsApp (Meta Cloud API oficial-only — spec
// "Connection Wizard Meta"). Portados/adaptados do orquestrador do Aquapark.
//
// RichMessage: formato padrao de ENVIO (texto, midia, botoes, lista, CTA).
// NormalizedMessage: formato padrao das mensagens RECEBIDAS via webhook.
// Sem fallback automatico: quem chama decide o que fazer quando um tipo
// nao e suportado.

export type WhatsappMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'interactive'
  | 'template';

export interface NormalizedInboundMedia {
  media_id: string;
  mime_type: string;
  filename?: string;
  caption?: string;
}

/** Mensagem inbound normalizada (webhook Meta → inbox). */
export interface NormalizedMessage {
  /** wamid da Meta */
  externalId: string;
  /** Telefone de origem (E.164 sem +) */
  from: string;
  /** phone_number_id que recebeu */
  phoneNumberId: string;
  type: WhatsappMessageType;
  content: string;
  media?: NormalizedInboundMedia;
  contactName?: string;
  timestamp: Date;
  raw?: unknown;
}

// ─── RichMessage (envio) ────────────────────────────────────────────────

export type RichMessage =
  | RichText
  | RichMedia
  | RichTemplate
  | RichCtaUrl
  | RichReplyButtons
  | RichList;

export interface RichText {
  kind: 'text';
  body: string;
}

export interface RichMedia {
  kind: 'image' | 'audio' | 'video' | 'document';
  /** URL publica da midia (Meta baixa por link nesta fase). */
  url: string;
  caption?: string;
  filename?: string;
}

/** Variaveis do template: posicionais flat ({'1': valor}) ou por componente. */
export type TemplateVariables =
  | Record<string, string>
  | { header?: Record<string, string>; body?: Record<string, string> };

export interface RichTemplate {
  kind: 'template';
  name: string;
  language?: string;
  variables?: TemplateVariables;
}

export interface RichCtaUrl {
  kind: 'cta_url';
  body: string;
  footer?: string;
  cta: { text: string; url: string };
}

export interface RichReplyButtons {
  kind: 'reply_buttons';
  body: string;
  footer?: string;
  /** Maximo 3 botoes */
  buttons: Array<{ id: string; label: string }>;
}

export interface RichList {
  kind: 'list';
  body: string;
  footer?: string;
  buttonText: string;
  sections: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}

// ─── Janela de 24h (Meta) ───────────────────────────────────────────────

/**
 * within  = ultimo inbound < 24h → texto livre liberado
 * expired = ultimo inbound > 24h → exige template HSM aprovado
 * none    = nunca houve inbound → template de 1o contato
 */
export type WindowState = 'within' | 'expired' | 'none';

export const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

export function computeWindowState(lastInboundAt: Date | null | undefined): WindowState {
  if (!lastInboundAt) return 'none';
  return Date.now() - lastInboundAt.getTime() < WINDOW_24H_MS ? 'within' : 'expired';
}

// ─── Criterios do Meta Orchestrator (spec: fluxo nunca conhece o numero) ─

export interface SendCriteria {
  /** Tag/departamento cadastrado na conexao (Connection.tags / config.department). */
  tag?: string;
  department?: string;
  /** Conexao explicita (uso administrativo). */
  connectionId?: string;
}
