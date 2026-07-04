// Security Logs (diretriz 55 — logs separados por natureza).
// Eventos: LOGIN_SUCCESS | LOGIN_FAILED | PASSWORD_CHANGED | TOKEN_REVOKED | INVITE_ACCEPTED.
// Porta unica de escrita na tabela core_security_logs.
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getRequestStore } from './request-context';

export type SecurityEvent =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'PASSWORD_CHANGED'
  | 'TOKEN_REVOKED'
  | 'INVITE_ACCEPTED';

export interface SecurityLogInput {
  event: SecurityEvent;
  organizationId?: string | null;
  userId?: string | null;
  email?: string | null;
}

@Injectable()
export class SecurityLogService {
  private readonly logger = new Logger(SecurityLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: SecurityLogInput): Promise<void> {
    try {
      const store = getRequestStore();
      await this.prisma.securityLog.create({
        data: {
          organization_id: input.organizationId ?? null,
          user_id: input.userId ?? null,
          email: input.email ?? null,
          event: input.event,
          ip: store?.ip ?? null,
          user_agent: store?.userAgent ?? null,
        },
      });
    } catch (e) {
      this.logger.warn(`Falha ao gravar security log: ${(e as Error).message}`);
    }
  }
}
