import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrganizationsRepository } from './organizations.repository';
import { LicensingRepository } from '../../licensing/licensing.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { hashPassword } from '../../../shared/auth/password.util';
import { generateLicenseKey } from '../../licensing/licensing.helpers';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

const DEFAULT_PLAN_NAME = 'Starter';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly repository: OrganizationsRepository,
    private readonly licensingRepository: LicensingRepository,
    private readonly audit: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  findAll() {
    return this.repository.findAll();
  }

  async findById(id: string) {
    const org = await this.repository.findById(id);
    if (!org) throw new NotFoundException('Organização não encontrada.');
    return org;
  }

  /**
   * Cria a organization completa: workspace "Principal" + ambiente PRODUCTION
   * default + perfis de sistema + licenca TRIAL do plano + assinatura TRIALING
   * (+ admin inicial opcional).
   */
  async create(dto: CreateOrganizationDto, createdBy?: string) {
    const dupSlug = await this.repository.findBySlug(dto.slug);
    if (dupSlug) throw new ConflictException('Já existe uma organização com este slug.');

    if ((dto.admin_email && !dto.admin_password) || (!dto.admin_email && dto.admin_password)) {
      throw new BadRequestException('Informe admin_email e admin_password juntos.');
    }
    if (dto.admin_email) {
      const emailTaken = await this.prisma.user.findUnique({
        where: { email: dto.admin_email },
        select: { id: true },
      });
      if (emailTaken) throw new ConflictException('E-mail do administrador já está em uso.');
    }

    const plan = dto.plan_id
      ? await this.licensingRepository.findPlanById(dto.plan_id)
      : ((await this.licensingRepository.findPlanByName(DEFAULT_PLAN_NAME)) ??
        (await this.licensingRepository.findPlans(false))[0] ??
        null);
    if (!plan || !plan.is_active) {
      throw new BadRequestException('Plano inválido ou inativo para a licença inicial.');
    }

    const org = await this.repository.provision({
      name: dto.name,
      slug: dto.slug,
      branding: dto.branding,
      customDomain: dto.custom_domain ?? null,
      plan: { id: plan.id, trial_days: plan.trial_days },
      licenseKey: generateLicenseKey(),
      admin: dto.admin_email
        ? {
            name: dto.admin_name ?? dto.admin_email,
            email: dto.admin_email,
            passwordHash: await hashPassword(dto.admin_password as string),
          }
        : null,
      createdBy: createdBy ?? null,
    });

    await this.audit.record({
      action: 'core.organization.create',
      entityType: 'Organization',
      entityId: org.id,
      organizationId: org.id,
      newValue: { name: org.name, slug: org.slug, plan: plan.name },
    });
    this.logger.log(`Organização provisionada: ${org.name} (${org.slug})`);
    return this.findById(org.id);
  }

  async update(id: string, dto: UpdateOrganizationDto) {
    const before = await this.findById(id);
    if (dto.slug && dto.slug !== before.slug) {
      const dup = await this.repository.findBySlug(dto.slug);
      if (dup) throw new ConflictException('Já existe uma organização com este slug.');
    }
    const org = await this.repository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
      ...(dto.branding !== undefined ? { branding: dto.branding as Prisma.InputJsonValue } : {}),
      ...(dto.custom_domain !== undefined ? { custom_domain: dto.custom_domain || null } : {}),
      ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
    });
    await this.audit.record({
      action: 'core.organization.update',
      entityType: 'Organization',
      entityId: id,
      organizationId: id,
      oldValue: {
        name: before.name,
        slug: before.slug,
        branding: before.branding,
        custom_domain: before.custom_domain,
        is_active: before.is_active,
      },
      newValue: {
        name: org.name,
        slug: org.slug,
        branding: org.branding,
        custom_domain: org.custom_domain,
        is_active: org.is_active,
      },
    });
    return org;
  }
}
