// Convites (diretriz 37): admin convida → token com expiracao (7 dias) →
// aceite cria/vincula usuario com perfil pre-definido.
// V1: sem envio real de email — o link do convite e copiado manualmente.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { InvitesRepository } from './invites.repository';
import { UsersRepository } from '../users/users.repository';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { LimitsService } from '../../licensing/limits.service';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { SecurityLogService } from '../../../shared/audit/security-log.service';
import { hashPassword } from '../../../shared/auth/password.util';
import { assertSameOrg } from '../../../shared/auth/tenant.util';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class InvitesService {
  constructor(
    private readonly repository: InvitesRepository,
    private readonly usersRepository: UsersRepository,
    private readonly profilesRepository: ProfilesRepository,
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly limits: LimitsService,
    private readonly audit: AuditLogService,
    private readonly securityLog: SecurityLogService,
  ) {}

  findAll(orgId: string) {
    return this.repository.findAllByOrg(orgId);
  }

  async create(orgId: string, dto: CreateInviteDto, createdBy?: string) {
    const existingUser = await this.usersRepository.findByEmail(dto.email);
    if (existingUser && existingUser.organization_id === orgId && !existingUser.deleted_at) {
      throw new ConflictException('Este e-mail já pertence a um usuário da organização.');
    }
    const pending = await this.repository.findPendingByEmail(orgId, dto.email);
    if (pending) throw new ConflictException('Já existe um convite pendente para este e-mail.');

    if (dto.profile_id) {
      const profile = await this.profilesRepository.findById(dto.profile_id);
      if (!profile || profile.organization_id !== orgId || profile.deleted_at) {
        throw new BadRequestException('Perfil de acesso inválido para esta organização.');
      }
    }
    if (dto.workspace_id) {
      const workspace = await this.workspacesRepository.findById(dto.workspace_id);
      if (!workspace || workspace.organization_id !== orgId) {
        throw new BadRequestException('Workspace inválido para esta organização.');
      }
    }
    // Convite ja respeita o limite de usuarios (falha cedo, nao no aceite)
    const activeCount = await this.usersRepository.countActive(orgId);
    await this.limits.assertCountWithin(orgId, 'users', activeCount);

    const invite = await this.repository.create({
      organization: { connect: { id: orgId } },
      workspace_id: dto.workspace_id ?? null,
      email: dto.email,
      profile_id: dto.profile_id ?? null,
      token: uuidv4(),
      expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      created_by: createdBy ?? null,
    });
    await this.audit.record({
      action: 'core.invite.create',
      entityType: 'UserInvite',
      entityId: invite.id,
      organizationId: orgId,
      newValue: { email: invite.email, workspace_id: invite.workspace_id, profile_id: invite.profile_id },
    });
    return invite;
  }

  async revoke(orgId: string, id: string) {
    const invite = await this.repository.findById(id);
    if (!invite) throw new NotFoundException('Convite não encontrado.');
    assertSameOrg(invite.organization_id, orgId);
    if (invite.accepted_at) throw new BadRequestException('Convite já foi aceito.');

    const revoked = await this.repository.revoke(id);
    await this.audit.record({
      action: 'core.invite.revoke',
      entityType: 'UserInvite',
      entityId: id,
      organizationId: orgId,
      oldValue: { expires_at: invite.expires_at },
      newValue: { expires_at: revoked.expires_at },
    });
    return revoked;
  }

  /** Aceite publico: cria o usuario (ou vincula existente da org) e marca o convite. */
  async accept(token: string, dto: AcceptInviteDto) {
    const invite = await this.repository.findByToken(token);
    if (!invite) throw new NotFoundException('Convite não encontrado.');
    if (invite.accepted_at) throw new BadRequestException('Convite já foi aceito.');
    if (invite.expires_at.getTime() <= Date.now()) {
      throw new BadRequestException('Convite expirado. Solicite um novo ao administrador.');
    }
    if (!invite.organization.is_active) {
      throw new BadRequestException('Organização inativa.');
    }

    const orgId = invite.organization_id;
    let userId: string;

    const existing = await this.usersRepository.findByEmail(invite.email);
    if (existing) {
      // Usuario de OUTRA org (ou de plataforma) nao pode ser capturado pelo convite.
      if (existing.organization_id !== orgId || existing.deleted_at) {
        throw new ConflictException('E-mail já está em uso. Contate o administrador.');
      }
      userId = existing.id; // ja e da org → so vincula workspace/perfil abaixo
    } else {
      const activeCount = await this.usersRepository.countActive(orgId);
      await this.limits.assertCountWithin(orgId, 'users', activeCount);
      const user = await this.usersRepository.create({
        organization: { connect: { id: orgId } },
        name: dto.name,
        email: invite.email,
        password_hash: await hashPassword(dto.password),
        ...(invite.profile_id ? { profile: { connect: { id: invite.profile_id } } } : {}),
        created_by: invite.created_by ?? null,
      });
      userId = user.id;
    }

    if (invite.workspace_id) {
      await this.usersRepository.upsertMembership(invite.workspace_id, userId, invite.profile_id);
    }
    await this.repository.markAccepted(invite.id);
    await this.securityLog.record({
      event: 'INVITE_ACCEPTED',
      organizationId: orgId,
      userId,
      email: invite.email,
    });
    await this.audit.record({
      action: 'core.invite.accept',
      entityType: 'UserInvite',
      entityId: invite.id,
      organizationId: orgId,
      newValue: { user_id: userId, email: invite.email },
    });
    return { message: 'Convite aceito com sucesso. Faça login para continuar.' };
  }
}
