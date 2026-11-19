// Porta unica ao banco do Storage Manager (integration_storage_files).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface CreateStorageFileRow {
  driver: string;
  bucket?: string | null;
  path: string;
  originalName: string;
  mime: string;
  sizeBytes: bigint;
  createdBy?: string | null;
}

@Injectable()
export class StorageRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.storageFile.findMany({
      where: {},
      orderBy: { created_at: 'desc' },
      take: 200,
    });
  }

  findById(id: string) {
    return this.prisma.storageFile.findUnique({ where: { id } });
  }

  create(row: CreateStorageFileRow) {
    return this.prisma.storageFile.create({
      data: {
        driver: row.driver,
        bucket: row.bucket ?? null,
        path: row.path,
        original_name: row.originalName,
        mime: row.mime,
        size_bytes: row.sizeBytes,
        created_by: row.createdBy ?? null,
      } as Prisma.StorageFileUncheckedCreateInput,
    });
  }

  delete(id: string) {
    return this.prisma.storageFile.delete({ where: { id } });
  }
}
