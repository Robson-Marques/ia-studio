import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './shared/prisma/prisma.module';
import { AuthModule } from './shared/auth/auth.module';
import { AuditModule } from './shared/audit/audit.module';
import { BrokerModule } from './shared/broker/broker.module';
import { EventsModule } from './shared/events/events.module';
import { HealthModule } from './shared/health/health.module';
import { JwtAuthGuard } from './shared/auth/jwt-auth.guard';
import { PermissionsGuard } from './shared/auth/permissions.guard';

import { CoreAuthModule } from './modules/core/auth/core-auth.module';
import { UsersModule } from './modules/core/users/users.module';
import { InvitesModule } from './modules/core/invites/invites.module';
import { ProfilesModule } from './modules/core/profiles/profiles.module';
import { FlagsModule } from './modules/core/flags/flags.module';
import { SettingsModule } from './modules/core/settings/settings.module';
import { AuditQueryModule } from './modules/core/audit/audit-query.module';
import { SeedModule } from './modules/core/seed/seed.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { CommModule } from './modules/comm/comm.module';
import { AutomationModule } from './modules/automation/automation.module';
import { AiModule } from './modules/ai/ai.module';
import { IspModule } from './modules/isp/isp.module';
import { ResourceModule } from './modules/resource/resource.module';
import { DevtoolsModule } from './modules/devtools/devtools.module';
import { DeveloperModule } from './modules/developer/developer.module';
import { SystemModule } from './modules/system/system.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    // Scheduler (Fase 3): sync continuo das conexoes WhatsApp (~10 min).
    // Fase 4: SchedulerCron da automacao (gated por WORKER_INLINE/role).
    ScheduleModule.forRoot(),
    // Rate limit global generoso; login tem @Throttle proprio (5/min).
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env['THROTTLE_TTL_MS'] ?? 60_000),
        limit: Number(process.env['THROTTLE_LIMIT'] ?? 1000),
      },
    ]),
    PrismaModule,
    AuthModule,
    AuditModule,
    HealthModule,
    // Fase 4 (diretrizes 7/8): broker abstraido + Event Bus — globais.
    BrokerModule,
    EventsModule,
    CoreAuthModule,
    UsersModule,
    InvitesModule,
    ProfilesModule,
    FlagsModule,
    SettingsModule,
    AuditQueryModule,
    IntegrationModule,
    CommModule,
    AutomationModule,
    AiModule,
    IspModule,
    // Fase 7 (diretrizes 9/23/24/25/28/57): Resource Model + Mapper + Explorer,
    // Console do Desenvolvedor e Developer Center (Public API + API Keys).
    ResourceModule,
    DevtoolsModule,
    DeveloperModule,
    // Administração local: atualização/backup/restauração e resumo dedicado.
    SystemModule,
    DashboardsModule,
    SeedModule,
  ],
  providers: [
    // Ordem importa: throttling → autenticacao → ACL granular local.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
