// Modulo raiz do processo WORKER (diretriz 33): mesmo monolito modular, SEM
// servidor HTTP — so os modulos necessarios pros processors (execucao de
// workflows, agendamentos, notificacoes). Estado em Redis/Postgres, nunca em
// memoria do processo. Escalar = subir mais workers (modo cluster pos-V1).
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './shared/prisma/prisma.module';
import { AuthModule } from './shared/auth/auth.module';
import { AuditModule } from './shared/audit/audit.module';
import { BrokerModule } from './shared/broker/broker.module';
import { EventsModule } from './shared/events/events.module';
import { LicensingModule } from './modules/licensing/licensing.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { CommModule } from './modules/comm/comm.module';
import { AutomationModule } from './modules/automation/automation.module';
// O worker roda a ENGINE — precisa dos mesmos nós/tools registrados que a API,
// senão em produção (WORKER_INLINE=off) o nó "Assistente" (AGENT) e as tools
// não existem no processo do worker → o fluxo pula calado e não responde.
import { AiModule } from './modules/ai/ai.module';
import { IspModule } from './modules/isp/isp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    AuditModule,
    BrokerModule,
    EventsModule,
    LicensingModule,
    IntegrationModule,
    CommModule,
    AutomationModule,
    AiModule,
    IspModule,
  ],
})
export class WorkerModule {}
