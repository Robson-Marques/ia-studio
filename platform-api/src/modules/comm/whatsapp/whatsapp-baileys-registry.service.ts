// modules/comm/whatsapp/whatsapp-baileys-registry.service.ts
//
// Registry em memória dos runtimes Baileys (Checkpoint 3b). Guarda um
// WhatsappBaileysRuntime por conexão (socket vivo), religa os pareados no boot,
// expõe QR/reconectar/reparear e o envio de notificação interna. Vive na
// CommModule (junto do runtime e do session repo) para NÃO criar ciclo com a
// RegistryModule — o provider whatsapp-baileys-internal é fino de propósito.
import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Connection } from '@prisma/client';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { WhatsappBaileysSessionRepository } from './whatsapp-baileys-session.repository';
import { WhatsappBaileysRuntime } from './connectors/whatsapp-baileys.runtime';
import { BAILEYS_PROVIDER_KEYS, WhatsappProviderKey } from './connectors/connector.types';
import { RichMessage } from '../../../shared/integration/whatsapp.types';

@Injectable()
export class WhatsappBaileysRegistryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappBaileysRegistryService.name);
  private readonly runtimes = new Map<string, WhatsappBaileysRuntime>();

  constructor(
    private readonly connections: ConnectionsRepository,
    private readonly sessions: WhatsappBaileysSessionRepository,
  ) {}

  // ─── Ciclo do processo ──────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    // Religa apenas conexões JÁ pareadas (com sessão salva) e ativas — nunca
    // sobe socket/QR de uma conexão que nunca foi pareada.
    try {
      for (const key of BAILEYS_PROVIDER_KEYS) {
        const conns = await this.connections.findAllByProvider(key);
        for (const connection of conns) {
          if (!connection.is_active) continue;
          const session = await this.sessions.load(connection.id).catch(() => null);
          if (!session) continue;
          await this.ensureStarted(connection).catch((e) =>
            this.logger.error(`Boot Baileys ${connection.id}: ${(e as Error).message}`),
          );
        }
      }
    } catch (e) {
      // Boot nunca derruba o processo.
      this.logger.error(`Boot dos runtimes Baileys falhou: ${(e as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const runtime of this.runtimes.values()) {
      await runtime.disconnect().catch(() => undefined);
    }
    this.runtimes.clear();
  }

  // ─── Runtime por conexão ────────────────────────────

  private build(connection: Connection): WhatsappBaileysRuntime {
    const runtime = new WhatsappBaileysRuntime(
      connection.id,
      connection.provider_key as WhatsappProviderKey,
      {
        loadAuthState: () => this.sessions.load(connection.id),
        saveAuthState: (serialized: string) =>
          this.sessions.save({
            connectionId: connection.id,
            serialized,
          }),
        clearAuthState: () => this.sessions.clear(connection.id),
      },
    );
    runtime.on('status', (status) => {
      void this.sessions
        .setMeta(connection.id, { status, phoneNumber: runtime.phoneNumber })
        .catch(() => undefined);
    });
    runtime.on('error', (err) => this.logger.error(`Baileys ${connection.id}: ${err.message}`));
    this.runtimes.set(connection.id, runtime);
    return runtime;
  }

  private async ensureStarted(connection: Connection): Promise<WhatsappBaileysRuntime> {
    const runtime = this.runtimes.get(connection.id) ?? this.build(connection);
    if (runtime.status === 'disconnected') await runtime.connect();
    return runtime;
  }

  private async resolveBaileys(connectionId: string): Promise<Connection> {
    const connection = await this.connections.findById(connectionId);
    if (
      !connection ||
      !BAILEYS_PROVIDER_KEYS.includes(connection.provider_key as WhatsappProviderKey)
    ) {
      throw new NotFoundException('Conexão Baileys não encontrada.');
    }
    return connection;
  }

  // ─── API usada pelo controller ──────────────────────

  async getPairingQr(connectionId: string): Promise<{ status: string; qr_image: string | null }> {
    const connection = await this.resolveBaileys(connectionId);
    const runtime = await this.ensureStarted(connection);
    return runtime.getPairingQr();
  }

  async reconnect(connectionId: string): Promise<{ ok: boolean }> {
    const connection = await this.resolveBaileys(connectionId);
    const runtime = await this.ensureStarted(connection);
    await runtime.reconnect();
    return { ok: true };
  }

  async restartPairing(connectionId: string): Promise<{ ok: boolean }> {
    const connection = await this.resolveBaileys(connectionId);
    const runtime = this.runtimes.get(connection.id) ?? this.build(connection);
    await runtime.restartPairing();
    return { ok: true };
  }

  // ─── Envio de notificação interna (usado por outros módulos) ──

  /**
   * Envia um aviso interno pelo número Baileys interno ATIVO da instalação.
   * Texto apenas. Lança se não houver número interno ativo.
   */
  async sendInternalNotification(to: string, text: string): Promise<{ providerMessageId: string | null }> {
    const all = await this.connections.findAll({
      providerKey: 'whatsapp-baileys-internal',
    });
    const active = all.find((c) => c.is_active);
    if (!active) throw new BadRequestException('Nenhum número interno (Baileys) ativo configurado.');
    const runtime = await this.ensureStarted(active);
    const result = await runtime.sendRich(active.id, to, { kind: 'text', body: text });
    return { providerMessageId: result.providerMessageId };
  }

  /**
   * Envia por um canal Baileys específico (usado pela inbox no modo manual).
   * `connectionId` deve ser uma conexão Baileys (interno ou manual) local.
   */
  async sendViaBaileysConnection(
    connectionId: string,
    to: string,
    message: RichMessage,
  ): Promise<{ providerMessageId: string | null }> {
    const connection = await this.connections.findById(connectionId);
    if (
      !connection ||
      !BAILEYS_PROVIDER_KEYS.includes(connection.provider_key as WhatsappProviderKey)
    ) {
      throw new NotFoundException('Canal Baileys não encontrado.');
    }
    if (!connection.is_active) throw new BadRequestException('Canal Baileys inativo.');
    const runtime = await this.ensureStarted(connection);
    const result = await runtime.sendRich(connection.id, to, message);
    return { providerMessageId: result.providerMessageId };
  }
}
