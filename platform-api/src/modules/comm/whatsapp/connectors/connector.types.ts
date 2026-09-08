// modules/comm/whatsapp/connectors/connector.types.ts
//
// Contrato unificado dos conectores WhatsApp do IA Studio (Checkpoint 1 do
// porte dos conectores do Aquapark — especialidade ia-studio.whatsapp-connectors@1.0.0).
//
// FRONTEIRA CENTRAL (o que diferencia do Aquapark): no IA Studio um provider
// e' registrado no Provider Registry e falado por `IProvider.execute` (porta
// unica, stateless/HTTP). Isso serve Meta e YCloud. O Baileys NAO cabe nesse
// modelo: e' um socket persistente com QR de pareamento e eventos de entrada
// em tempo real (stateful). Por isso o contrato tem DOIS eixos:
//   - transporte HTTP  -> provider stateless via IProvider.execute (Meta/YCloud)
//   - transporte SOCKET -> runtime stateful (Baileys), fora do execute()
// Ambos satisfazem a MESMA porta de envio (WhatsappOutboundPort) para que o
// orquestrador roteie sem `switch` por tipo espalhado.
//
// REGRA (herdada do Aquapark): SEM fallback automatico silencioso. Se o tipo
// nao e' suportado, lanca UnsupportedMessageError; se a conexao nao esta
// pronta, ConnectionNotReadyError; se o envio falha, SendFailedError.
//
// Este arquivo e' SO CONTRATO (tipos + erros + presets). Nao registra provider,
// nao mexe em schema, nao instancia socket. As implementacoes entram nas
// fases seguintes (YCloud, Baileys internal, Baileys manual + coexistencia).

import type { NormalizedMessage, RichMessage } from '../../../../shared/integration/whatsapp.types';

// ─── Identidade do conector ──────────────────────────────────────────────

/**
 * `provider_key` da Connection (Integration Manager). Nao existe tabela propria
 * de conexao WhatsApp (diretriz 52): cada canal e' uma Connection com um destes.
 */
export type WhatsappProviderKey =
  | 'whatsapp-meta'
  | 'whatsapp-ycloud'
  | 'whatsapp-baileys-internal'
  | 'whatsapp-baileys-manual';

/** Como o conector conversa com o provedor. */
export type ConnectorTransport = 'http' | 'socket';

/** Papel do canal na coexistencia. */
export type CoexistenceRole = 'official' | 'manual' | 'internal';

/** Conectores oficiais (recebem conversas, capazes de template HSM). */
export const OFFICIAL_PROVIDER_KEYS: readonly WhatsappProviderKey[] = ['whatsapp-meta', 'whatsapp-ycloud'];

/** Conectores Baileys (socket, pareamento por QR). */
export const BAILEYS_PROVIDER_KEYS: readonly WhatsappProviderKey[] = ['whatsapp-baileys-internal', 'whatsapp-baileys-manual'];

export function transportOf(key: WhatsappProviderKey): ConnectorTransport {
  return BAILEYS_PROVIDER_KEYS.includes(key) ? 'socket' : 'http';
}

export function roleOf(key: WhatsappProviderKey): CoexistenceRole {
  if (key === 'whatsapp-baileys-manual') return 'manual';
  if (key === 'whatsapp-baileys-internal') return 'internal';
  return 'official';
}

// ─── Estado do runtime (socket) ───────────────────────────────────────────

/**
 * Estado vivo do socket de um conector stateful. NAO confundir com o
 * `ConnectionStatus` (enum Prisma) da Connection — este e' o estado do link
 * em memoria (o do Prisma e' o estado persistido da conexao/health).
 */
export type WhatsappRuntimeStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_pending'
  | 'connected'
  | 'error';

/** Resultado do QR de pareamento (Baileys). qr_image = data URL PNG, ou null. */
export interface PairingResult {
  status: WhatsappRuntimeStatus;
  qr_image: string | null;
}

// ─── Capacidades declaradas ────────────────────────────────────────────────

/**
 * O que cada conector consegue/nao consegue. Permite ao orquestrador decidir
 * ANTES de tentar enviar, em vez de descobrir por erro.
 */
export interface ConnectorCapabilities {
  // Tipos ricos
  ctaUrl: boolean;
  replyButtons: boolean;
  list: boolean;
  location: boolean;
  locationRequest: boolean;
  // Recursos
  quotedReply: boolean;
  readReceipts: boolean;
  typing: boolean;
  // Template HSM (so oficiais)
  templateHsm: boolean;
  // Limites
  maxButtons: number;
  maxListRows: number;
  maxMessageLength: number;
}

/**
 * Presets por conector. Valores conservadores da Cloud API / YCloud / Baileys;
 * cada implementacao pode refina-los no seu `capabilities()`.
 */
export const CONNECTOR_CAPABILITIES: Record<WhatsappProviderKey, ConnectorCapabilities> = {
  'whatsapp-meta': {
    ctaUrl: true, replyButtons: true, list: true, location: true, locationRequest: true,
    quotedReply: true, readReceipts: true, typing: true, templateHsm: true,
    maxButtons: 3, maxListRows: 10, maxMessageLength: 4096,
  },
  'whatsapp-ycloud': {
    ctaUrl: true, replyButtons: true, list: true, location: true, locationRequest: true,
    quotedReply: true, readReceipts: true, typing: true, templateHsm: true,
    maxButtons: 3, maxListRows: 10, maxMessageLength: 4096,
  },
  'whatsapp-baileys-internal': {
    ctaUrl: false, replyButtons: false, list: false, location: true, locationRequest: false,
    quotedReply: true, readReceipts: true, typing: true, templateHsm: false,
    maxButtons: 0, maxListRows: 0, maxMessageLength: 65536,
  },
  'whatsapp-baileys-manual': {
    ctaUrl: false, replyButtons: false, list: false, location: true, locationRequest: false,
    quotedReply: true, readReceipts: true, typing: true, templateHsm: false,
    maxButtons: 0, maxListRows: 0, maxMessageLength: 65536,
  },
};

// ─── Mensagem de entrada + coexistencia ─────────────────────────────────────

/**
 * Envelope de entrada do conector: a NormalizedMessage ja existente
 * (shared/integration/whatsapp.types) mais os marcadores de coexistencia.
 * Aditivo — nao altera a NormalizedMessage; a persistencia desses campos
 * (ex.: isHistory) entra numa fase posterior (schema/`db push`).
 */
export interface ConnectorInboundMessage {
  message: NormalizedMessage;
  /** Enviada pelo proprio numero conectado (eco do operador). */
  fromMe?: boolean;
  /** Conversa consigo mesmo (self-chat). */
  isSelf?: boolean;
  /**
   * Mensagem importada do historico compartilhado na coexistencia (YCloud/
   * Baileys). Aparece na conversa mas NAO dispara resposta automatica da IA.
   */
  isHistory?: boolean;
}

/** Config nao-sensivel do canal manual Baileys (na Connection.config). */
export interface BaileysManualConfig {
  /** Connection.id do canal OFICIAL (meta/ycloud) que este manual acompanha. */
  officialConnectionId: string;
}

// ─── Envio ──────────────────────────────────────────────────────────────────

export interface SendResult {
  /** Id retornado pelo provedor (sem prefixo), ou null quando nao aplicavel. */
  providerMessageId: string | null;
  sentAt: Date;
}

export type MessageDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

/** ACK de entrega/leitura de uma mensagem ja enviada. */
export interface MessageStatusUpdate {
  connectionId: string;
  providerMessageId: string;
  externalId?: string;
  phone?: string;
  status: MessageDeliveryStatus;
  error?: string;
  timestamp: Date;
}

// ─── Porta unica de envio (os dois transportes satisfazem) ──────────────────

/**
 * Contrato minimo que TODO conector (HTTP ou SOCKET) oferece ao orquestrador
 * para enviar. O orquestrador nunca escolhe o numero; recebe a Connection ja
 * resolvida e delega. `to` = E.164 so-digitos, sem `+`.
 */
export interface WhatsappOutboundPort {
  readonly providerKey: WhatsappProviderKey;
  capabilities(): ConnectorCapabilities;
  sendRich(connectionId: string, to: string, message: RichMessage): Promise<SendResult>;
}

// ─── Runtime stateful (Baileys) ─────────────────────────────────────────────

/** Eventos emitidos por um conector stateful. */
export interface ConnectorRuntimeEvents {
  message: (msg: ConnectorInboundMessage) => void;
  status: (status: WhatsappRuntimeStatus) => void;
  messageStatus: (update: MessageStatusUpdate) => void;
  error: (err: Error) => void;
}

/**
 * Conector com sessao persistente (Baileys): mantem socket vivo, expoe QR de
 * pareamento e emite eventos. Meta/YCloud NAO implementam isto — vao por
 * IProvider.execute (HTTP). Vive em memoria, indexado por Connection.id, e o
 * estado persistido (status/health) e' espelhado na Connection pelo orquestrador.
 */
export interface WhatsappConnectionRuntime extends WhatsappOutboundPort {
  readonly connectionId: string;
  readonly transport: 'socket';
  readonly status: WhatsappRuntimeStatus;
  /** Numero conectado quando status='connected' (E.164 sem `+`). */
  readonly phoneNumber: string | null;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;

  /** QR temporario para parear a sessao (Baileys). */
  getPairingQr(): PairingResult;

  markRead?(externalIds: string[]): Promise<void>;
  setTyping?(to: string, typing: boolean): Promise<void>;

  on<E extends keyof ConnectorRuntimeEvents>(event: E, handler: ConnectorRuntimeEvents[E]): this;
  off<E extends keyof ConnectorRuntimeEvents>(event: E, handler: ConnectorRuntimeEvents[E]): this;
}

// ─── Erros tipados (sem fallback silencioso) ────────────────────────────────

/** Codigo da Meta para "fora da janela de 24h" (texto livre recusado, exige HSM). */
export const META_REENGAGEMENT_CODE = 131047;

export class UnsupportedMessageError extends Error {
  constructor(public providerKey: WhatsappProviderKey, public kind: string) {
    super(`Conector ${providerKey} nao suporta mensagem do tipo ${kind}.`);
    this.name = 'UnsupportedMessageError';
  }
}

export class ConnectionNotReadyError extends Error {
  constructor(public connectionId: string, public status: WhatsappRuntimeStatus) {
    const friendly: Record<WhatsappRuntimeStatus, string> = {
      disconnected: 'WhatsApp desconectado. Verifique a conexao em Integracoes.',
      connecting: 'WhatsApp ainda conectando. Tente novamente em alguns segundos.',
      qr_pending: 'WhatsApp aguardando leitura do QR Code.',
      connected: 'WhatsApp conectado.',
      error: 'WhatsApp com erro de conexao. Tente reconectar em Integracoes.',
    };
    super(friendly[status]);
    this.name = 'ConnectionNotReadyError';
  }
}

export class SendFailedError extends Error {
  constructor(
    public providerKey: WhatsappProviderKey,
    public reason: string,
    public cause?: unknown,
    /** Codigo numerico da Graph API quando for erro tipado da Meta; senao null. */
    public metaCode: number | null = null,
  ) {
    super(`Envio falhou via ${providerKey}: ${reason}`);
    this.name = 'SendFailedError';
  }
}

/** Conversa reservada ao canal manual nunca recebe acao automatica (IA/modelo/automacao). */
export class ManualChannelOnlyError extends Error {
  constructor() {
    super('Esta conversa esta no modo manual. IA, automacoes e modelos nao podem enviar por ela.');
    this.name = 'ManualChannelOnlyError';
  }
}
