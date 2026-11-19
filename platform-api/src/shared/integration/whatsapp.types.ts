// Tipos internos do canal WhatsApp: Meta oficial via Central Nivoo + WAHA.
// Portados/adaptados do orquestrador do Aquapark.
//
// RichMessage: formato interno de envio compartilhado pelos providers.
// Sem fallback automatico: quem chama decide o que fazer quando um tipo
// nao e suportado.

// ─── RichMessage (envio) ────────────────────────────────────────────────

/** Tipos normalizados persistidos/emitidos por mensagens recebidas. */
export type WhatsappMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location';

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
  /**
   * URL HTTPS de mídia OU media_id/referência devolvida pelo provider. Ao menos
   * um dos dois é obrigatório; mediaId tem precedência sobre url.
   */
  url?: string;
  /** media_id da Central ou data URI efêmera produzida pelo upload WAHA. */
  mediaId?: string;
  /** Base64 efêmero usado no envio direto pela WAHA; nunca é persistido. */
  data?: string;
  mimeType?: string;
  caption?: string;
  filename?: string;
  /** Nota de voz gravada no painel; o codec/MIME ainda deve ser aceito pela Meta. */
  voice?: boolean;
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
