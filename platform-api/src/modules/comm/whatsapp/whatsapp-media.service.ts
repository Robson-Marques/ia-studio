// Persistência de mídias WhatsApp: usa o Storage Manager existente.
// Mantém a referência do provedor para recuperação de mensagens legadas.
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, WhatsappMessage } from '@prisma/client';
import { WhatsappChatsRepository } from './whatsapp-chats.repository';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { StorageService } from '../../integration/storage/storage.service';

type MediaRecord = {
  media_id?: string | null;
  storage_file_id?: string | null;
  mime_type?: string | null;
  filename?: string | null;
  url?: string | null;
  [key: string]: unknown;
};

@Injectable()
export class WhatsappMediaService {
  private readonly logger = new Logger(WhatsappMediaService.name);
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly chats: WhatsappChatsRepository,
    private readonly connections: ConnectionsService,
    private readonly storage: StorageService,
  ) {}

  private metadata(message: WhatsappMessage): MediaRecord {
    const media = message.media;
    return media && typeof media === 'object' && !Array.isArray(media)
      ? media as MediaRecord : {};
  }

  /** Armazena mídia a partir do provider, uma vez por mensagem; falhas não invalidam a mensagem. */
  async persistFromProvider(message: WhatsappMessage): Promise<void> {
    const media = this.metadata(message);
    if (!media.media_id || media.storage_file_id) return;
    const active = this.pending.get(message.id);
    if (active) return active;
    const work = this.downloadAndSave(message, media);
    this.pending.set(message.id, work);
    try { await work; } finally { this.pending.delete(message.id); }
  }

  private async downloadAndSave(message: WhatsappMessage, media: MediaRecord): Promise<void> {
    const result = await this.connections.execute(
      message.organization_id, message.connection_id, 'downloadMedia', { media_id: media.media_id },
    ) as { base64?: string; mime?: string } | null;
    if (!result?.base64) throw new NotFoundException('Mídia indisponível na origem.');
    const buffer = Buffer.from(result.base64, 'base64');
    if (!buffer.length || buffer.length > 100 * 1024 * 1024) {
      throw new Error('Mídia vazia ou acima do limite de armazenamento.');
    }
    await this.saveBuffer(message, buffer, result.mime || media.mime_type || 'application/octet-stream', media.filename || undefined);
  }

  /** Preserva também o binário original do upload enviado pelo atendente. */
  async saveBuffer(message: WhatsappMessage, data: Buffer, mime: string, filename?: string): Promise<void> {
    const media = this.metadata(message);
    if (media.storage_file_id) return;
    const stored = await this.storage.save(data, {
      organizationId: message.organization_id,
      originalName: filename || `whatsapp-${message.id}`,
      mime,
      folder: 'whatsapp-media',
    });
    await this.chats.updateMessageMedia(message.id, {
      ...media, storage_file_id: stored.id, mime_type: mime,
    } as Prisma.InputJsonValue);
  }

  /** A mídia solicitada deve estar vinculada exatamente ao chat e à organização. */
  async load(organizationId: string, chatId: string, mediaId: string): Promise<{ base64: string; mime: string }> {
    const message = await this.chats.findMessageByChatAndMediaId(organizationId, chatId, mediaId);
    if (!message) throw new NotFoundException('Mídia não pertence a esta conversa.');
    let media = this.metadata(message);
    if (!media.storage_file_id) {
      await this.persistFromProvider(message);
      const refreshed = await this.chats.findMessageById(message.id);
      if (!refreshed) throw new NotFoundException('Mensagem não encontrada.');
      media = this.metadata(refreshed);
    }
    if (!media.storage_file_id) throw new NotFoundException('Mídia não disponível no armazenamento.');
    const { file, content } = await this.storage.getContent(organizationId, media.storage_file_id);
    return { base64: content.toString('base64'), mime: file.mime };
  }

  /** Webhook: tentativa imediata, sem impedir a entrega das mensagens quando o provedor falha. */
  async persistBestEffort(message: WhatsappMessage): Promise<void> {
    try { await this.persistFromProvider(message); }
    catch (error) {
      this.logger.warn(`Mídia ${message.id} ainda não persistida: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
