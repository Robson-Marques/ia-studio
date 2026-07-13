// Porta ao banco do link público de pagamento (frente 5). Uma responsabilidade:
// CRUD mínimo do IspPaymentLink (criar, achar por token, registrar abertura).
import { Injectable } from '@nestjs/common';
import { IspPaymentLink, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

export interface CreatePaymentLinkInput {
  organizationId: string;
  workspaceId?: string | null;
  environmentId?: string | null;
  connectionId: string;
  token: string;
  customerRef?: string | null;
  customerName?: string | null;
  snapshot: Prisma.InputJsonValue;
  expiresAt: Date;
  createdBy?: string | null;
}

@Injectable()
export class IspPaymentLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreatePaymentLinkInput): Promise<IspPaymentLink> {
    return this.prisma.ispPaymentLink.create({
      data: {
        organization_id: input.organizationId,
        workspace_id: input.workspaceId ?? null,
        environment_id: input.environmentId ?? null,
        connection_id: input.connectionId,
        token: input.token,
        customer_ref: input.customerRef ?? null,
        customer_name: input.customerName ?? null,
        snapshot: input.snapshot,
        expires_at: input.expiresAt,
        created_by: input.createdBy ?? null,
      },
    });
  }

  findByToken(token: string): Promise<IspPaymentLink | null> {
    return this.prisma.ispPaymentLink.findUnique({ where: { token } });
  }

  /** Registra uma abertura da página. `firstOpen` grava `opened_at` só na 1ª vez. */
  registerOpen(id: string, firstOpen: boolean): Promise<IspPaymentLink> {
    return this.prisma.ispPaymentLink.update({
      where: { id },
      data: {
        open_count: { increment: 1 },
        ...(firstOpen ? { opened_at: new Date() } : {}),
      },
    });
  }
}
