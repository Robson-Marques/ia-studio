// Secrets Manager (diretriz 5) — modulo proprio, usado por qualquer modulo.
import { Module } from '@nestjs/common';
import { SecretsRepository } from './secrets.repository';
import { SecretsService } from './secrets.service';
import { SecretsController } from './secrets.controller';

@Module({
  controllers: [SecretsController],
  providers: [SecretsRepository, SecretsService],
  exports: [SecretsService],
})
export class SecretsModule {}
