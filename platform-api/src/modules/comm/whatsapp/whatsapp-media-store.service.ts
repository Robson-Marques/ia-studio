import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, WhatsappMessage } from '@prisma/client';
import { StorageService } from '../../integration/storage/storage.service';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { WhatsappChatsRepository } from './whatsapp-chats.repository';

/**
 * Guarda a mídia no StorageService da própria instalação, sem depender da
 * retenção temporária no provedor. A cópia é associada à mensagem no JSON
 * já existente (não há migração de banco).
 */
@Injectable()
export class WhatsappMediaStoreService {
  private readonly logger = new Logger(WhatsappMediaStoreService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly connections: ConnectionsService,
    private readonly chats: WhatsappChatsRepository,
  ) {}

  async stored(message: WhatsappMessage): Promise<{ bytes: Buffer; mime: string } | null> {
    const media = this.mediaOf(message);
    const fileId = typeof media['storage_file_id'] === 'string' ? media['storage_file_id'] : '';
    if (!fileId) return null;
    const { file, content } = await this.storage.getContent(fileId);
    return { bytes: content, mime: file.mime };
  }

  async save(message: WhatsappMessage, bytes: Buffer, mime: string): Promise<void> {
    if (!bytes.length) throw new Error('Mídia vazia não pode ser persistida.');
    const media = this.mediaOf(message);
    if (media['storage_file_id']) return;
    const filename = typeof media['filename'] === 'string' && media['filename']
      ? media['filename'] : `${message.id}.${mime.split('/')[1]?.split(';')[0] || 'bin'}`;
    const file = await this.storage.save(bytes, {
      originalName: filename,
      mime,
      folder: 'whatsapp-media',
    });
    await this.chats.updateMessageMedia(message.id, {
      ...media,
      storage_file_id: file.id,
    } as Prisma.InputJsonValue);
  }

  /** Webhook WAHA: tenta salvar imediatamente; falhas podem ser recuperadas
   * pela rota de mídia quando o arquivo for acessado posteriormente. */
  async persistWahaBestEffort(message: WhatsappMessage): Promise<void> {
    const media = this.mediaOf(message);
    const mediaId = typeof media['media_id'] === 'string' ? media['media_id'] : '';
    if (!mediaId || media['storage_file_id']) return;
    try {
      const result = await this.connections.execute(message.connection_id, 'downloadMedia', {
        media_id: mediaId,
      }) as { base64?: string; mime?: string };
      if (!result?.base64) throw new NotFoundException('WAHA não retornou a mídia.');
      await this.save(message, Buffer.from(result.base64, 'base64'), result.mime || String(media['mime_type'] || 'application/octet-stream'));
    } catch (err) {
      this.logger.warn(`Mídia WAHA ${message.id} pendente: ${(err as Error).message}`);
    }
  }

  private mediaOf(message: WhatsappMessage): Record<string, unknown> {
    return message.media && typeof message.media === 'object' && !Array.isArray(message.media)
      ? message.media as Record<string, unknown> : {};
  }
}
