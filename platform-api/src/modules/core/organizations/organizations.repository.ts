// Porta unica ao banco do modulo organizations — inclui a transacao de
// provisionamento (org + workspace + ambiente + perfis + licenca + assinatura
// + admin inicial), atomica por natureza.
import { Injectable } from '@nestjs/common';
import { EnvironmentKind, LicenseStatus, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SYSTEM_PROFILES } from '../../../shared/permissions.constants';

export interface ProvisionOrgInput {
  name: string;
  slug: string;
  branding?: Record<string, unknown>;
  customDomain?: string | null;
  plan: { id: string; trial_days: number };
  licenseKey: string;
  admin?: { name: string; email: string; passwordHash: string } | null;
  createdBy?: string | null;
}

@Injectable()
export class OrganizationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.organization.findMany({
      include: {
        license: { select: { status: true, plan: { select: { name: true } } } },
        _count: { select: { users: true, workspaces: true } },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.organization.findUnique({
      where: { id },
      include: {
        workspaces: { include: { environments: true } },
        license: { include: { plan: true } },
        subscriptions: { orderBy: { created_at: 'desc' }, take: 1 },
      },
    });
  }

  findBySlug(slug: string) {
    return this.prisma.organization.findUnique({ where: { slug } });
  }

  update(id: string, data: Prisma.OrganizationUpdateInput) {
    return this.prisma.organization.update({ where: { id }, data });
  }

  /** Provisionamento completo de uma organization nova (transacao unica). */
  async provision(input: ProvisionOrgInput) {
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: input.name,
          slug: input.slug,
          branding: (input.branding ?? {}) as Prisma.InputJsonValue,
          custom_domain: input.customDomain ?? null,
        },
      });

      // Workspace "Principal" + ambiente PRODUCTION default (diretriz 4)
      const workspace = await tx.workspace.create({
        data: { organization_id: org.id, name: 'Principal', slug: 'principal' },
      });
      await tx.environment.create({
        data: {
          workspace_id: workspace.id,
          name: 'Produção',
          kind: EnvironmentKind.PRODUCTION,
          is_default: true,
        },
      });

      // Perfis de sistema (Administrador / Operador)
      const profiles = new Map<string, string>();
      for (const sp of SYSTEM_PROFILES) {
        const profile = await tx.permissionProfile.create({
          data: {
            organization_id: org.id,
            name: sp.name,
            description: sp.description,
            permissions: sp.permissions,
            is_system: true,
          },
        });
        profiles.set(sp.name, profile.id);
      }

      // Licenca TRIAL do plano escolhido
      const trialEnds =
        input.plan.trial_days > 0
          ? new Date(Date.now() + input.plan.trial_days * 24 * 60 * 60 * 1000)
          : null;
      await tx.license.create({
        data: {
          organization_id: org.id,
          plan_id: input.plan.id,
          status: LicenseStatus.TRIAL,
          license_key: input.licenseKey,
          trial_ends_at: trialEnds,
        },
      });

      // Assinatura TRIALING (Billing controla a assinatura, nao a plataforma)
      await tx.subscription.create({
        data: {
          organization_id: org.id,
          plan_id: input.plan.id,
          status: SubscriptionStatus.TRIALING,
          current_period_end: trialEnds,
        },
      });

      // Admin inicial da org (opcional) — perfil Administrador + membro do workspace
      if (input.admin) {
        const adminUser = await tx.user.create({
          data: {
            organization_id: org.id,
            name: input.admin.name,
            email: input.admin.email,
            password_hash: input.admin.passwordHash,
            profile_id: profiles.get('Administrador') ?? null,
            created_by: input.createdBy ?? null,
          },
        });
        await tx.workspaceMember.create({
          data: {
            workspace_id: workspace.id,
            user_id: adminUser.id,
            profile_id: profiles.get('Administrador') ?? null,
          },
        });
      }

      return org;
    });
  }
}
