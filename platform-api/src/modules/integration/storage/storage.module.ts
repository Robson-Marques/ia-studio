// Storage Manager (diretriz 21) — exporta StorageService pra qualquer modulo.
import { Module } from '@nestjs/common';
import { StorageRepository } from './storage.repository';
import { LocalStorageDriver } from './local.driver';
import { S3StorageDriver } from './s3.driver';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

@Module({
  controllers: [StorageController],
  providers: [StorageRepository, LocalStorageDriver, S3StorageDriver, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
