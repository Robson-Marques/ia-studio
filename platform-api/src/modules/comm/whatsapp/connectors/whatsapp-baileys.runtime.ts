// modules/comm/whatsapp/connectors/whatsapp-baileys.runtime.ts
//
// Runtime STATEFUL do Baileys (Checkpoint 3a — portado do baileys-internal-adapter
// de produção do Aquapark, contra @whiskeysockets/baileys ^7.0.0-rc14). Implementa
// o contrato WhatsappConnectionRuntime (socket persistente + QR de pareamento +
// eventos) que o IProvider.execute (stateless/HTTP) não cobre.
//
// Exclusivamente OUTBOUND. `whatsapp-baileys-internal` só envia avisos internos
// (texto); `whatsapp-baileys-manual` (fase futura) responde uma conversa
// escolhida (texto + mídia). NENHUM recebe inbound nem alimenta IA — o histórico
// vem sempre do provedor oficial da conversa (coexistência).
//
// SEGURANÇA: sem reconexão automática após queda (só logout limpa a sessão) —
// repetir tentativas amplia o risco de a conta parecer automação abusiva. A
// recuperação é ação consciente (reconnect/restartPairing) pela UI.
//
// INERTE nesta fase: nada instancia esta classe ainda. O registry + provider +
// endpoint de QR entram no Checkpoint 3b.
import { Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import {
  ConnectionNotReadyError,
  ConnectorCapabilities,
  ConnectorRuntimeEvents,
  CONNECTOR_CAPABILITIES,
  PairingResult,
  SendFailedError,
  SendResult,
  UnsupportedMessageError,
  WhatsappConnectionRuntime,
  WhatsappProviderKey,
  WhatsappRuntimeStatus,
} from './connector.types';
import { RichMessage } from '../../../../shared/integration/whatsapp.types';
import { normalizePhone } from '../whatsapp.helpers';

type JsonRecord = Record<string, unknown>;

interface PersistedAuthState {
  creds: JsonRecord;
  keys: Record<string, JsonRecord>;
}

interface BaileysAuthState {
  creds: JsonRecord;
  keys: {
    get(type: string, ids: string[]): Promise<Record<string, unknown>>;
    set(data: Record<string, JsonRecord>): Promise<void>;
  };
}

interface BaileysSocket {
  user?: { id?: string };
  ev: { on(event: string, listener: (payload: unknown) => void): void };
  sendMessage(jid: string, content: Record<string, unknown>): Promise<{ key?: { id?: string } }>;
  end(error?: Error): void;
}

interface BaileysFactoryConfig {
  auth: BaileysAuthState;
  printQRInTerminal: boolean;
  markOnlineOnConnect: boolean;
  syncFullHistory: boolean;
  browser: [string, string, string];
}

interface BaileysLibrary {
  default?: (config: BaileysFactoryConfig) => BaileysSocket;
  makeWASocket?: (config: BaileysFactoryConfig) => BaileysSocket;
  Browsers: { ubuntu(browser: string): [string, string, string] };
  initAuthCreds(): unknown;
  makeCacheableSignalKeyStore(store: BaileysAuthState['keys']): BaileysAuthState['keys'];
  proto: { Message: { AppStateSyncKeyData: { fromObject(value: unknown): unknown } } };
  BufferJSON: { replacer(key: string, value: unknown): unknown; reviver(key: string, value: unknown): unknown };
  DisconnectReason: { loggedOut: number };
}

interface ConnectionUpdate {
  connection?: 'open' | 'close' | 'connecting';
  qr?: string;
  lastDisconnect?: { error?: { output?: { statusCode?: number } } };
}

export interface BaileysRuntimeOptions {
  loadAuthState(): Promise<string | null>;
  saveAuthState(serialized: string): Promise<void>;
  clearAuthState(): Promise<void>;
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseUpdate(value: unknown): ConnectionUpdate {
  return isRecord(value) ? (value as ConnectionUpdate) : {};
}

async function fetchToBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`falha ao baixar mídia (HTTP ${res.status})`);
  const mimeType = res.headers.get('content-type') ?? 'application/octet-stream';
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType };
}

export class WhatsappBaileysRuntime implements WhatsappConnectionRuntime {
  readonly transport = 'socket' as const;
  readonly providerKey: WhatsappProviderKey;

  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger(WhatsappBaileysRuntime.name);
  private readonly persisted: PersistedAuthState = { creds: {}, keys: {} };
  private socket: BaileysSocket | null = null;
  private library: BaileysLibrary | null = null;
  private pairingQrImage: string | null = null;
  private _status: WhatsappRuntimeStatus = 'disconnected';
  private _phoneNumber: string | null = null;
  private stopped = false;

  constructor(
    readonly connectionId: string,
    providerKey: WhatsappProviderKey,
    private readonly options: BaileysRuntimeOptions,
  ) {
    this.providerKey = providerKey;
  }

  get status(): WhatsappRuntimeStatus { return this._status; }
  get phoneNumber(): string | null { return this._phoneNumber; }

  capabilities(): ConnectorCapabilities {
    return CONNECTOR_CAPABILITIES[this.providerKey];
  }

  getPairingQr(): PairingResult {
    return { status: this._status, qr_image: this.pairingQrImage };
  }

  // ─── Eventos ────────────────────────────────────────
  on<E extends keyof ConnectorRuntimeEvents>(event: E, handler: ConnectorRuntimeEvents[E]): this {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
    return this;
  }
  off<E extends keyof ConnectorRuntimeEvents>(event: E, handler: ConnectorRuntimeEvents[E]): this {
    this.emitter.off(event, handler as (...args: unknown[]) => void);
    return this;
  }
  private setStatus(status: WhatsappRuntimeStatus): void {
    this._status = status;
    this.emitter.emit('status', status);
  }

  // ─── Ciclo de vida ──────────────────────────────────
  async connect(): Promise<void> {
    if (this.socket || this._status === 'connected') return;
    this.stopped = false;
    this.setStatus('connecting');

    const library = await this.loadLibrary();
    this.library = library;
    await this.restoreAuthState(library);
    if (!Object.keys(this.persisted.creds).length) {
      const creds = library.initAuthCreds();
      this.persisted.creds = isRecord(creds) ? creds : {};
    }

    const factory = library.default ?? library.makeWASocket;
    if (!factory) throw new ConnectionNotReadyError(this.connectionId, 'error');

    const auth = this.authState();
    const socket = factory({
      // O cache serializa as leituras/escritas das chaves Signal (o Baileys
      // atualiza várias no primeiro envio) para não mandar sessão parcial.
      auth: { creds: auth.creds, keys: library.makeCacheableSignalKeyStore(auth.keys) },
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      browser: library.Browsers.ubuntu('Chrome'),
    });
    this.socket = socket;

    socket.ev.on('creds.update', () => {
      if (this.socket !== socket) return; // socket já reiniciado — não regrava
      void this.saveAuthState().catch((error: Error) => {
        this.logger.error(`Falha ao salvar a sessão Baileys ${this.connectionId}: ${error.message}`);
        this.emitter.emit('error', error);
      });
    });
    socket.ev.on('connection.update', (u) => this.handleConnectionUpdate(socket, parseUpdate(u)));
  }

  async disconnect(): Promise<void> {
    this.stopped = true;
    this.pairingQrImage = null;
    const socket = this.socket;
    this.socket = null;
    try { socket?.end(); } catch { /* já encerrado */ }
    this.setStatus('disconnected');
  }

  async reconnect(): Promise<void> {
    await this.disconnect().catch(() => undefined);
    await this.connect();
  }

  /** Descarta uma tentativa incompleta e inicia um pareamento limpo. */
  async restartPairing(): Promise<void> {
    await this.disconnect();
    this.persisted.creds = {};
    this.persisted.keys = {};
    await this.options.clearAuthState();
    await this.connect();
  }

  // ─── Envio ──────────────────────────────────────────
  async sendRich(_connectionId: string, to: string, message: RichMessage): Promise<SendResult> {
    if (!this.socket || this._status !== 'connected') {
      throw new ConnectionNotReadyError(this.connectionId, this._status);
    }
    const phone = normalizePhone(to);
    if (!phone) throw new SendFailedError(this.providerKey, 'Telefone do destinatário inválido.');
    try {
      const content = await this.toBaileysMessage(message);
      const sent = await this.socket.sendMessage(`${phone}@s.whatsapp.net`, content);
      return { providerMessageId: sent.key?.id ?? null, sentAt: new Date() };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'erro desconhecido';
      throw new SendFailedError(this.providerKey, reason, error);
    }
  }

  private async toBaileysMessage(message: RichMessage): Promise<Record<string, unknown>> {
    if (message.kind === 'text') return { text: message.body };
    // Canal interno: só texto. O manual (fase futura) envia mídia.
    if (this.providerKey !== 'whatsapp-baileys-manual') {
      throw new UnsupportedMessageError(this.providerKey, message.kind);
    }
    if (message.kind === 'image' || message.kind === 'audio' || message.kind === 'video' || message.kind === 'document') {
      if (!message.url) throw new UnsupportedMessageError(this.providerKey, `${message.kind} sem url`);
      const file = await fetchToBuffer(message.url);
      if (message.kind === 'image') return { image: file.buffer, mimetype: file.mimeType, caption: message.caption };
      if (message.kind === 'audio') return { audio: file.buffer, mimetype: file.mimeType, ptt: true };
      if (message.kind === 'video') return { video: file.buffer, mimetype: file.mimeType, caption: message.caption };
      return { document: file.buffer, mimetype: file.mimeType, fileName: message.filename, caption: message.caption };
    }
    throw new UnsupportedMessageError(this.providerKey, message.kind);
  }

  // ─── Biblioteca / auth (portado do Aquapark) ────────
  private async loadLibrary(): Promise<BaileysLibrary> {
    try {
      return (await import('@whiskeysockets/baileys')) as unknown as BaileysLibrary;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'dependência indisponível';
      throw new SendFailedError(this.providerKey, `Biblioteca Baileys indisponível: ${reason}`, error);
    }
  }

  private async restoreAuthState(library: BaileysLibrary): Promise<void> {
    const authState = await this.options.loadAuthState();
    if (!authState) return;
    try {
      const parsed: unknown = JSON.parse(authState, library.BufferJSON.reviver);
      if (!isRecord(parsed)) throw new Error('formato inválido');
      this.persisted.creds = isRecord(parsed.creds) ? parsed.creds : {};
      const keys = isRecord(parsed.keys) ? parsed.keys : {};
      this.persisted.keys = Object.fromEntries(
        Object.entries(keys).filter(([, value]) => isRecord(value)),
      ) as Record<string, JsonRecord>;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.warn(`Sessão Baileys ${this.connectionId} descartada por não poder ser lida: ${reason}`);
      this.persisted.creds = {};
      this.persisted.keys = {};
    }
  }

  private authState(): BaileysAuthState {
    return {
      creds: this.persisted.creds,
      keys: {
        get: async (type, ids) => {
          const bucket = this.persisted.keys[type] ?? {};
          return Object.fromEntries(
            ids.map((id) => [id, this.restoreKey(type, bucket[id])] as const).filter(([, v]) => v != null),
          );
        },
        set: async (data) => {
          for (const [type, updates] of Object.entries(data)) {
            const bucket = { ...(this.persisted.keys[type] ?? {}) };
            for (const [id, value] of Object.entries(updates)) {
              if (value == null) delete bucket[id];
              else bucket[id] = value as JsonRecord;
            }
            this.persisted.keys[type] = bucket;
          }
          await this.saveAuthState();
        },
      },
    };
  }

  private async saveAuthState(): Promise<void> {
    if (!this.library) return;
    const serialized = JSON.stringify(this.persisted, this.library.BufferJSON.replacer);
    await this.options.saveAuthState(serialized);
  }

  private restoreKey(type: string, value: unknown): unknown {
    // app-state-sync-key precisa ser reconstruído (não é JSON comum), senão a
    // primeira mensagem pode invalidar a sessão recém-pareada.
    if (type === 'app-state-sync-key' && value && this.library) {
      return this.library.proto.Message.AppStateSyncKeyData.fromObject(value);
    }
    return value;
  }

  private handleConnectionUpdate(socket: BaileysSocket, update: ConnectionUpdate): void {
    if (this.socket !== socket) return; // socket antigo não derruba o atual
    if (update.qr) {
      void this.renderQr(update.qr);
      this.setStatus('qr_pending');
    }
    if (update.connection === 'open') {
      const rawId = this.socket?.user?.id ?? '';
      this._phoneNumber = normalizePhone(rawId.split(':')[0].split('@')[0]);
      this.pairingQrImage = null;
      this.setStatus('connected');
      return;
    }
    if (update.connection !== 'close') return;
    this.socket = null;
    const code = update.lastDisconnect?.error?.output?.statusCode;
    const loggedOut = code === this.library?.DisconnectReason.loggedOut;
    this.pairingQrImage = null;
    this.setStatus('disconnected');
    if (loggedOut) {
      void this.options.clearAuthState().catch((e: Error) => this.logger.error(`Falha ao limpar sessão expirada: ${e.message}`));
      this.logger.warn(`Sessão Baileys ${this.connectionId} deslogada. Gere um novo QR para parear.`);
      return;
    }
    const reason = update.lastDisconnect?.error instanceof Error ? update.lastDisconnect.error.message : 'motivo não informado';
    this.logger.warn(`Canal Baileys ${this.connectionId} encerrado (código ${code ?? 'n/i'}: ${reason}). Reconexão automática interrompida por segurança.`);
  }

  /** Converte a string de QR do Baileys em data URL PNG para a UI. */
  private async renderQr(raw: string): Promise<void> {
    try {
      const qrcode = (await import('qrcode')) as unknown as { toDataURL(text: string): Promise<string> };
      this.pairingQrImage = await qrcode.toDataURL(raw);
    } catch (error) {
      this.logger.error(`Falha ao renderizar QR Baileys: ${(error as Error).message}`);
    }
  }
}
