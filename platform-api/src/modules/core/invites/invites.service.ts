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
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { SecurityLogService } from '../../../shared/audit/security-log.service';
import { hashPassword } from '../../../shared/auth/password.util';
import { Prisma } from '@prisma/client';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class InvitesService {
  constructor(
    private readonly repository: InvitesRepository,
    private readonly usersRepository: UsersRepository,
    private readonly profilesRepository: ProfilesRepository,
    private readonly audit: AuditLogService,
    private readonly securityLog: SecurityLogService,
  ) {}

  findAll() {
    return this.repository.findAll();
  }

  async create(dto: CreateInviteDto, createdBy?: string) {
    const existingUser = await this.usersRepository.findByEmail(dto.email);
    if (existingUser && !existingUser.deleted_at) {
      throw new ConflictException('Este e-mail já pertence a um usuário desta instalação.');
    }
    const pending = await this.repository.findPendingByEmail(dto.email);
    if (pending) throw new ConflictException('Já existe um convite pendente para este e-mail.');

    if (dto.profile_id) {
      const profile = await this.profilesRepository.findById(dto.profile_id);
      if (!profile || profile.deleted_at) {
        throw new BadRequestException('Perfil de acesso inválido para esta instalação.');
      }
    }

    const invite = await this.repository.create({
      email: dto.email,
      profile_id: dto.profile_id ?? null,
      token: uuidv4(),
      expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      created_by: createdBy ?? null,
    } as Prisma.UserInviteUncheckedCreateInput);
    await this.audit.record({
      action: 'core.invite.create',
      entityType: 'UserInvite',
      entityId: invite.id,
      newValue: { email: invite.email, profile_id: invite.profile_id },
    });
    return invite;
  }

  async revoke(id: string) {
    const invite = await this.repository.findById(id);
    if (!invite) throw new NotFoundException('Convite não encontrado.');
    if (invite.accepted_at) throw new BadRequestException('Convite já foi aceito.');

    const revoked = await this.repository.revoke(id);
    await this.audit.record({
      action: 'core.invite.revoke',
      entityType: 'UserInvite',
      entityId: id,
      oldValue: { expires_at: invite.expires_at },
      newValue: { expires_at: revoked.expires_at },
    });
    return revoked;
  }

  /** Aceite público: cria o usuário local e marca o convite. */
  async accept(token: string, dto: AcceptInviteDto) {
    const invite = await this.repository.findByToken(token);
    if (!invite) throw new NotFoundException('Convite não encontrado.');
    if (invite.accepted_at) throw new BadRequestException('Convite já foi aceito.');
    if (invite.expires_at.getTime() <= Date.now()) {
      throw new BadRequestException('Convite expirado. Solicite um novo ao administrador.');
    }
    let userId: string;

    const existing = await this.usersRepository.findByEmail(invite.email);
    if (existing) {
      if (existing.deleted_at) {
        throw new ConflictException('E-mail já está em uso. Contate o administrador.');
      }
      userId = existing.id;
    } else {
      const user = await this.usersRepository.create({
        name: dto.name,
        email: invite.email,
        password_hash: await hashPassword(dto.password),
        ...(invite.profile_id ? { profile: { connect: { id: invite.profile_id } } } : {}),
        created_by: invite.created_by ?? null,
      } as Prisma.UserUncheckedCreateInput);
      userId = user.id;
    }

    await this.repository.markAccepted(invite.id);
    await this.securityLog.record({
      event: 'INVITE_ACCEPTED',
      userId,
      email: invite.email,
    });
    await this.audit.record({
      action: 'core.invite.accept',
      entityType: 'UserInvite',
      entityId: invite.id,
      newValue: { user_id: userId, email: invite.email },
    });
    return { message: 'Convite aceito com sucesso. Faça login para continuar.' };
  }
}
