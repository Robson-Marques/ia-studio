// Billing NAO exporta nada de proposito (diretriz 53): nenhum modulo pode
// consultar Billing — quem habilita/restringe o sistema e o Licensing.
import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingRepository } from './billing.repository';

@Module({
  controllers: [BillingController],
  providers: [BillingService, BillingRepository],
})
export class BillingModule {}
