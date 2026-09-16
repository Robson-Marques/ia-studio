// modules/comm/whatsapp/whatsapp-baileys-session.repository.ts
//
// Persistência da sessão de auth do Baileys (Checkpoint 3a). NÃO é um segredo
// gerenciado pelo usuário — é o estado do socket (creds + chaves Signal),
// atualizado a cada rotação de chave. Por isso mora em tabela própria
// (comm_whatsapp_baileys_sessions), 1 por conexão, com o blob cifrado em repouso
// (AES-256-GCM via shared/crypto, o mesmo do Secrets Manager). Local à instalação.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { decrypt, encrypt } from '../../../shared/crypto/crypto.util';

export interface SaveBaileysSessionInput {
  connectionId: string;
  serialized: string;
}

@Injectable()
export class WhatsappBaileysSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Blob de auth decifrado, ou null se não houver sessão. Propaga erro de
   *  decifra (chave divergente) — sem fallback silencioso (regra do projeto). */
  async load(connectionId: string): Promise<string | null> {
    const row = await this.prisma.whatsappBaileysSession.findUnique({
      where: { connection_id: connectionId },
    });
    if (!row?.auth_state) return null;
    return decrypt(row.auth_state);
  }

  /** Cria/atualiza a sessão cifrada da conexão. */
  async save(input: SaveBaileysSessionInput): Promise<void> {
    const encrypted = encrypt(input.serialized);
    await this.prisma.whatsappBaileysSession.upsert({
      where: { connection_id: input.connectionId },
      create: {
        connection_id: input.connectionId,
        auth_state: encrypted,
      },
      update: { auth_state: encrypted },
    });
  }

  /** Remove a sessão (logout / novo pareamento limpo). */
  async clear(connectionId: string): Promise<void> {
    await this.prisma.whatsappBaileysSession.deleteMany({ where: { connection_id: connectionId } });
  }

  /** Espelha status/número da sessão (informativo para a UI). */
  async setMeta(connectionId: string, meta: { status?: string; phoneNumber?: string | null }): Promise<void> {
    await this.prisma.whatsappBaileysSession.updateMany({
      where: { connection_id: connectionId },
      data: {
        ...(meta.status ? { status: meta.status } : {}),
        ...(meta.phoneNumber !== undefined ? { phone_number: meta.phoneNumber } : {}),
      },
    });
  }
}
