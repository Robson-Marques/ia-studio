// Modulo global de auditoria: RequestContextInterceptor (APP_INTERCEPTOR) +
// AuditLogService + SecurityLogService + injecao do @Auditable.
import { Global, Module, OnModuleInit } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLogService } from './audit-log.service';
import { SecurityLogService } from './security-log.service';
import { RequestContextInterceptor } from './request-context.interceptor';
import { setAuditableAuditService } from './auditable.decorator';

@Global()
@Module({
  providers: [
    AuditLogService,
    SecurityLogService,
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
  ],
  exports: [AuditLogService, SecurityLogService],
})
export class AuditModule implements OnModuleInit {
  constructor(private readonly audit: AuditLogService) {}

  onModuleInit(): void {
    setAuditableAuditService(this.audit);
  }
}
