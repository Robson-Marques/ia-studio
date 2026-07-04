// Billing (diretrizes 20/38/53/58) — controla a ASSINATURA do cliente,
// NUNCA a plataforma. Cadeia obrigatoria: Billing → Licensing → Flags →
// Sistema. NENHUM outro modulo importa/consulta este service.
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChargeStatus, SubscriptionStatus } from '@prisma/client';
import { BillingRepository } from './billing.repository';
import { AuditLogService } from '../../shared/audit/audit-log.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { CreateChargeDto } from './dto/create-charge.dto';
import { UpdateChargeStatusDto } from './dto/update-charge-status.dto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly repository: BillingRepository,
    private readonly audit: AuditLogService,
  ) {}

  // ─── Subscriptions ──────────────────────────────────
  findSubscriptions(organizationId?: string) {
    return this.repository.findSubscriptions(organizationId);
  }

  async createSubscription(dto: CreateSubscriptionDto) {
    const subscription = await this.repository.createSubscription({
      organization: { connect: { id: dto.organization_id } },
      plan: { connect: { id: dto.plan_id } },
      status: dto.status ?? SubscriptionStatus.TRIALING,
      current_period_end: dto.current_period_end ? new Date(dto.current_period_end) : null,
      grace_days: dto.grace_days ?? 5,
      coupon_id: dto.coupon_id ?? null,
    });
    await this.audit.record({
      action: 'billing.subscription.create',
      entityType: 'Subscription',
      entityId: subscription.id,
      organizationId: dto.organization_id,
      newValue: { plan_id: dto.plan_id, status: subscription.status },
    });
    return subscription;
  }

  async updateSubscription(id: string, dto: UpdateSubscriptionDto) {
    const before = await this.repository.findSubscriptionById(id);
    if (!before) throw new NotFoundException('Assinatura não encontrada.');
    const subscription = await this.repository.updateSubscription(id, {
      ...(dto.plan_id !== undefined ? { plan: { connect: { id: dto.plan_id } } } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.status === SubscriptionStatus.CANCELED ? { canceled_at: new Date() } : {}),
      ...(dto.current_period_end !== undefined
        ? { current_period_end: new Date(dto.current_period_end) }
        : {}),
      ...(dto.grace_days !== undefined ? { grace_days: dto.grace_days } : {}),
    });
    await this.audit.record({
      action: 'billing.subscription.update',
      entityType: 'Subscription',
      entityId: id,
      organizationId: before.organization_id,
      oldValue: { plan_id: before.plan_id, status: before.status, grace_days: before.grace_days },
      newValue: { plan_id: subscription.plan_id, status: subscription.status, grace_days: subscription.grace_days },
    });
    return subscription;
  }

  // ─── Coupons ────────────────────────────────────────
  findCoupons() {
    return this.repository.findCoupons();
  }

  async createCoupon(dto: CreateCouponDto) {
    if (!dto.percent_off && !dto.amount_off_cents) {
      throw new BadRequestException('Informe percent_off ou amount_off_cents.');
    }
    const dup = await this.repository.findCouponByCode(dto.code);
    if (dup) throw new BadRequestException('Já existe um cupom com este código.');
    const coupon = await this.repository.createCoupon({
      code: dto.code,
      percent_off: dto.percent_off ?? null,
      amount_off_cents: dto.amount_off_cents ?? null,
      valid_until: dto.valid_until ? new Date(dto.valid_until) : null,
      max_redemptions: dto.max_redemptions ?? null,
    });
    await this.audit.record({
      action: 'billing.coupon.create',
      entityType: 'Coupon',
      entityId: coupon.id,
      newValue: coupon,
    });
    return coupon;
  }

  // ─── Charges ────────────────────────────────────────
  findCharges(organizationId?: string) {
    return this.repository.findCharges(organizationId);
  }

  async createCharge(dto: CreateChargeDto) {
    const charge = await this.repository.createCharge({
      organization_id: dto.organization_id,
      subscription_id: dto.subscription_id ?? null,
      amount_cents: dto.amount_cents,
      status: dto.status ?? ChargeStatus.PENDING,
      method: dto.method ?? null,
      due_date: dto.due_date ? new Date(dto.due_date) : null,
      external_ref: dto.external_ref ?? null,
    });
    await this.audit.record({
      action: 'billing.charge.create',
      entityType: 'Charge',
      entityId: charge.id,
      organizationId: dto.organization_id,
      newValue: { amount_cents: charge.amount_cents, status: charge.status },
    });
    return charge;
  }

  async updateChargeStatus(id: string, dto: UpdateChargeStatusDto) {
    const before = await this.repository.findChargeById(id);
    if (!before) throw new NotFoundException('Cobrança não encontrada.');
    const charge = await this.repository.updateCharge(id, {
      status: dto.status,
      ...(dto.status === ChargeStatus.PAID
        ? { paid_at: dto.paid_at ? new Date(dto.paid_at) : new Date() }
        : {}),
    });
    await this.audit.record({
      action: 'billing.charge.update_status',
      entityType: 'Charge',
      entityId: id,
      organizationId: before.organization_id,
      oldValue: { status: before.status, paid_at: before.paid_at },
      newValue: { status: charge.status, paid_at: charge.paid_at },
    });
    return charge;
  }

  /**
   * STUB documentado (Fase 1 — diretrizes 38/58): avaliacao periodica do
   * estado da assinatura. Sera implementado quando o gateway de pagamento
   * entrar (Fase 8/pos-V1), rodando via scheduler:
   *
   *   1. current_period_end < hoje e status ACTIVE → PAST_DUE
   *   2. PAST_DUE alem de grace_days → GRACE → RESTRICTED
   *   3. RESTRICTED prolongado → SUSPENDED
   *   4. Pagamento confirmado (Charge PAID) → ACTIVE + novo current_period_end
   *
   * Em cada transicao o Billing NOTIFICA o Licensing (unico ouvinte), que
   * ajusta o License.status correspondente (TRIAL/ACTIVE/RESTRICTED/
   * SUSPENDED/EXPIRED). NUNCA apagar dados em nenhum estado.
   * NENHUM modulo chama este metodo hoje — e a ponta da cadeia
   * Billing → Licensing → Flags → Sistema (diretriz 53).
   */
  async evaluateStatus(): Promise<void> {
    this.logger.log('BillingService.evaluateStatus(): stub da Fase 1 — sem gateway, nenhuma transição automática.');
  }
}
