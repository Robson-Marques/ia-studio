// Porta unica ao banco do modulo billing.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Subscriptions ──────────────────────────────────
  findSubscriptions(organizationId?: string) {
    return this.prisma.subscription.findMany({
      where: organizationId ? { organization_id: organizationId } : undefined,
      include: {
        plan: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  findSubscriptionById(id: string) {
    return this.prisma.subscription.findUnique({
      where: { id },
      include: { plan: true, organization: { select: { id: true, name: true, slug: true } } },
    });
  }

  createSubscription(data: Prisma.SubscriptionCreateInput) {
    return this.prisma.subscription.create({ data });
  }

  updateSubscription(id: string, data: Prisma.SubscriptionUpdateInput) {
    return this.prisma.subscription.update({ where: { id }, data });
  }

  // ─── Coupons ────────────────────────────────────────
  findCoupons() {
    return this.prisma.coupon.findMany({ orderBy: { created_at: 'desc' } });
  }

  findCouponById(id: string) {
    return this.prisma.coupon.findUnique({ where: { id } });
  }

  findCouponByCode(code: string) {
    return this.prisma.coupon.findUnique({ where: { code } });
  }

  createCoupon(data: Prisma.CouponCreateInput) {
    return this.prisma.coupon.create({ data });
  }

  // ─── Charges ────────────────────────────────────────
  findCharges(organizationId?: string) {
    return this.prisma.charge.findMany({
      where: organizationId ? { organization_id: organizationId } : undefined,
      orderBy: { created_at: 'desc' },
    });
  }

  findChargeById(id: string) {
    return this.prisma.charge.findUnique({ where: { id } });
  }

  createCharge(data: Prisma.ChargeCreateInput) {
    return this.prisma.charge.create({ data });
  }

  updateCharge(id: string, data: Prisma.ChargeUpdateInput) {
    return this.prisma.charge.update({ where: { id }, data });
  }
}
