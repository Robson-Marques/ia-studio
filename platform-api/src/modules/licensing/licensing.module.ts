// Licensing (diretriz 19) — planos, licencas, limites e metering.
// Exporta LimitsService/UsageService pra TODO modulo que cria recurso
// ou consome cota. Ninguem consulta Billing — so Licensing (diretriz 53).
import { Global, Module } from '@nestjs/common';
import { LicensingRepository } from './licensing.repository';
import { PlansService } from './plans.service';
import { LicensesService } from './licenses.service';
import { LimitsService } from './limits.service';
import { UsageService } from './usage.service';
import { PlansController } from './plans.controller';
import { LicensesController } from './licenses.controller';
import { AccountController } from './account.controller';

@Global()
@Module({
  controllers: [PlansController, LicensesController, AccountController],
  providers: [LicensingRepository, PlansService, LicensesService, LimitsService, UsageService],
  exports: [LicensingRepository, PlansService, LicensesService, LimitsService, UsageService],
})
export class LicensingModule {}
