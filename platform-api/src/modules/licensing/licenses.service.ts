import { Injectable, NotFoundException } from '@nestjs/common';
import { LicenseStatus, Prisma } from '@prisma/client';
import { LicensingRepository } from './licensing.repository';
import { AuditLogService } from '../../shared/audit/audit-log.service';
import { UpdateLicenseDto } from './dto/update-license.dto';
import { generateLicenseKey } from './licensing.helpers';

@Injectable()
export class LicensesService {
  constructor(
    private readonly repository: LicensingRepository,
    private readonly audit: AuditLogService,
  ) {}

  findAll() {
    return this.repository.findLicenses();
  }

  async findById(id: string) {
    const license = await this.repository.findLicenseById(id);
    if (!license) throw new NotFoundException('Licença não encontrada.');
    return license;
  }

  /** Ativa a licenca: status ACTIVE + activated_at agora. */
  async activate(id: string) {
    const before = await this.findById(id);
    const license = await this.repository.updateLicense(id, {
      status: LicenseStatus.ACTIVE,
      activated_at: new Date(),
    });
    await this.audit.record({
      action: 'licensing.license.activate',
      entityType: 'License',
      entityId: id,
      organizationId: before.organization_id,
      oldValue: { status: before.status },
      newValue: { status: license.status, activated_at: license.activated_at },
    });
    return license;
  }

  /** Troca plano / status / validade / override de limites. */
  async update(id: string, dto: UpdateLicenseDto) {
    const before = await this.findById(id);
    const license = await this.repository.updateLicense(id, {
      ...(dto.plan_id !== undefined ? { plan: { connect: { id: dto.plan_id } } } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.expires_at !== undefined ? { expires_at: new Date(dto.expires_at) } : {}),
      ...(dto.trial_ends_at !== undefined ? { trial_ends_at: new Date(dto.trial_ends_at) } : {}),
      ...(dto.limits_override !== undefined
        ? { limits_override: dto.limits_override as Prisma.InputJsonValue }
        : {}),
    });
    await this.audit.record({
      action: 'licensing.license.update',
      entityType: 'License',
      entityId: id,
      organizationId: before.organization_id,
      oldValue: {
        plan_id: before.plan_id,
        status: before.status,
        expires_at: before.expires_at,
        trial_ends_at: before.trial_ends_at,
        limits_override: before.limits_override,
      },
      newValue: {
        plan_id: license.plan_id,
        status: license.status,
        expires_at: license.expires_at,
        trial_ends_at: license.trial_ends_at,
        limits_override: license.limits_override,
      },
    });
    return license;
  }

  /** Gera nova chave (formato XXXX-XXXX-XXXX-XXXX) — invalida a anterior. */
  async regenerateKey(id: string) {
    const before = await this.findById(id);
    const license = await this.repository.updateLicense(id, {
      license_key: generateLicenseKey(),
    });
    await this.audit.record({
      action: 'licensing.license.regenerate_key',
      entityType: 'License',
      entityId: id,
      organizationId: before.organization_id,
      // chave nao vai pro log (dado sensivel de ativacao)
    });
    return license;
  }
}
