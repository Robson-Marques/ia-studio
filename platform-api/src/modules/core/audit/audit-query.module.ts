import { Module } from '@nestjs/common';
import { AuditQueryController } from './audit-query.controller';
import { AuditQueryRepository } from './audit-query.repository';

@Module({
  controllers: [AuditQueryController],
  providers: [AuditQueryRepository],
})
export class AuditQueryModule {}
