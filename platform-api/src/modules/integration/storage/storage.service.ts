// Storage Manager (diretriz 21): TODO arquivo da plataforma passa por aqui
// (midia WhatsApp, docs RAG, PDFs, backups). Driver por env STORAGE_DRIVER
// ('local' default | 's3'). Metering via UsageService ('storage_bytes').
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageFile } from '@prisma/client';
import { StorageRepository } from './storage.repository';
import { IStorageDriver } from './storage-driver.interface';
import { LocalStorageDriver } from './local.driver';
import { S3StorageDriver } from './s3.driver';
import { UsageService } from '../../licensing/usage.service';
import { assertSameOrg } from '../../../shared/auth/tenant.util';

export interface SaveFileMeta {
  organizationId: string;
  workspaceId?: string | null;
  environmentId?: string | null;
  originalName: string;
  mime: string;
  createdBy?: string | null;
  /** Subpasta logica (ex.: 'whatsapp-media', 'rag-docs'). Default 'files'. */
  folder?: string;
}

export interface StorageFileView {
  id: string;
  driver: string;
  bucket: string | null;
  path: string;
  original_name: string;
  mime: string;
  size_bytes: number;
  workspace_id: string | null;
  environment_id: string | null;
  created_at: Date;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly repository: StorageRepository,
    private readonly localDriver: LocalStorageDriver,
    private readonly s3Driver: S3StorageDriver,
    private readonly usage: UsageService,
  ) {}

  private get driver(): IStorageDriver {
    return (process.env['STORAGE_DRIVER'] ?? 'local') === 's3' ? this.s3Driver : this.localDriver;
  }

  /** Grava buffer + registro StorageFile + metering storage_bytes. */
  async save(buffer: Buffer, meta: SaveFileMeta): Promise<StorageFileView> {
    const safeName = meta.originalName.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'arquivo';
    const folder = (meta.folder ?? 'files').replace(/[^\w\-/]+/g, '_');
    const path = `${meta.organizationId}/${folder}/${randomUUID()}-${safeName}`;

    const putResult = await this.driver.put(path, buffer, meta.mime);
    const row = await this.repository.create({
      organizationId: meta.organizationId,
      workspaceId: meta.workspaceId,
      environmentId: meta.environmentId,
      driver: this.driver.name,
      bucket: putResult.bucket,
      path: putResult.path,
      originalName: meta.originalName,
      mime: meta.mime,
      sizeBytes: BigInt(buffer.length),
      createdBy: meta.createdBy,
    });

    // Metering (diretriz 40) — nunca derruba o fluxo.
    await this.usage.increment(meta.organizationId, meta.workspaceId ?? null, 'storage_bytes', buffer.length);

    this.logger.log(`Arquivo salvo (${this.driver.name}): ${putResult.path} (${buffer.length} bytes)`);
    return this.toView(row);
  }

  async list(organizationId: string, workspaceId?: string): Promise<StorageFileView[]> {
    const rows = await this.repository.findAllByOrg(organizationId, workspaceId);
    return rows.map((r) => this.toView(r));
  }

  /** Conteudo do arquivo (rota autenticada de download). */
  async getContent(
    organizationId: string,
    id: string,
  ): Promise<{ file: StorageFileView; content: Buffer }> {
    const row = await this.getOwned(organizationId, id);
    const driver = row.driver === 's3' ? this.s3Driver : this.localDriver;
    const content = await driver.get(row.path);
    return { file: this.toView(row), content };
  }

  /** Remove conteudo + registro (arquivos SAO removiveis; conexoes nao). */
  async remove(organizationId: string, id: string): Promise<void> {
    const row = await this.getOwned(organizationId, id);
    const driver = row.driver === 's3' ? this.s3Driver : this.localDriver;
    await driver.delete(row.path);
    await this.repository.delete(id);
  }

  private async getOwned(organizationId: string, id: string): Promise<StorageFile> {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException('Arquivo não encontrado.');
    assertSameOrg(row.organization_id, organizationId);
    return row;
  }

  /** BigInt serializado pra number (tamanhos reais << 2^53). */
  private toView(row: StorageFile): StorageFileView {
    return {
      id: row.id,
      driver: row.driver,
      bucket: row.bucket,
      path: row.path,
      original_name: row.original_name,
      mime: row.mime,
      size_bytes: Number(row.size_bytes),
      workspace_id: row.workspace_id,
      environment_id: row.environment_id,
      created_at: row.created_at,
    };
  }
}
