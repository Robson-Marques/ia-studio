// Modulo Dashboards (Fase 8): agregacoes read-only (diretriz 34). Reaproveita
// os contadores ja existentes via Prisma. Sem escrita, sem logs crus.
import { Module } from '@nestjs/common';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';

@Module({
  controllers: [DashboardsController],
  providers: [DashboardsService],
})
export class DashboardsModule {}
