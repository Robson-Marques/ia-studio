// Console — CRUD minimo de assinaturas/cupons/cobrancas (Fase 1, sem gateway).
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformAdminOnly } from '../../shared/auth/platform-admin.guard';
import { BillingService } from './billing.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { CreateChargeDto } from './dto/create-charge.dto';
import { UpdateChargeStatusDto } from './dto/update-charge-status.dto';

@ApiTags('Console — Billing')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('console/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // ─── Subscriptions ──────────────────────────────────
  @Get('subscriptions')
  findSubscriptions(@Query('organization_id') organizationId?: string) {
    return this.billing.findSubscriptions(organizationId);
  }

  @Post('subscriptions')
  createSubscription(@Body() dto: CreateSubscriptionDto) {
    return this.billing.createSubscription(dto);
  }

  @Patch('subscriptions/:id')
  updateSubscription(@Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.billing.updateSubscription(id, dto);
  }

  // ─── Coupons ────────────────────────────────────────
  @Get('coupons')
  findCoupons() {
    return this.billing.findCoupons();
  }

  @Post('coupons')
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.billing.createCoupon(dto);
  }

  // ─── Charges ────────────────────────────────────────
  @Get('charges')
  findCharges(@Query('organization_id') organizationId?: string) {
    return this.billing.findCharges(organizationId);
  }

  @Post('charges')
  createCharge(@Body() dto: CreateChargeDto) {
    return this.billing.createCharge(dto);
  }

  @Patch('charges/:id/status')
  updateChargeStatus(@Param('id') id: string, @Body() dto: UpdateChargeStatusDto) {
    return this.billing.updateChargeStatus(id, dto);
  }
}
