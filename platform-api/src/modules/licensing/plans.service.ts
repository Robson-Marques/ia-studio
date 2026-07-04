import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LicensingRepository } from './licensing.repository';
import { AuditLogService } from '../../shared/audit/audit-log.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(
    private readonly repository: LicensingRepository,
    private readonly audit: AuditLogService,
  ) {}

  findAll() {
    return this.repository.findPlans();
  }

  async findById(id: string) {
    const plan = await this.repository.findPlanById(id);
    if (!plan) throw new NotFoundException('Plano não encontrado.');
    return plan;
  }

  async create(dto: CreatePlanDto) {
    const existing = await this.repository.findPlanByName(dto.name);
    if (existing) throw new ConflictException('Já existe um plano com este nome.');
    const plan = await this.repository.createPlan({
      name: dto.name,
      description: dto.description ?? null,
      is_active: dto.is_active ?? true,
      trial_days: dto.trial_days ?? 0,
      price_cents: dto.price_cents ?? null,
      limits: (dto.limits ?? {}) as Prisma.InputJsonValue,
      features: dto.features ?? [],
    });
    await this.audit.record({
      action: 'licensing.plan.create',
      entityType: 'Plan',
      entityId: plan.id,
      newValue: plan,
    });
    return plan;
  }

  async update(id: string, dto: UpdatePlanDto) {
    const before = await this.findById(id);
    if (dto.name && dto.name !== before.name) {
      const dup = await this.repository.findPlanByName(dto.name);
      if (dup) throw new ConflictException('Já existe um plano com este nome.');
    }
    const plan = await this.repository.updatePlan(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
      ...(dto.trial_days !== undefined ? { trial_days: dto.trial_days } : {}),
      ...(dto.price_cents !== undefined ? { price_cents: dto.price_cents } : {}),
      ...(dto.limits !== undefined ? { limits: dto.limits as Prisma.InputJsonValue } : {}),
      ...(dto.features !== undefined ? { features: dto.features } : {}),
    });
    await this.audit.record({
      action: 'licensing.plan.update',
      entityType: 'Plan',
      entityId: id,
      oldValue: before,
      newValue: plan,
    });
    return plan;
  }
}
