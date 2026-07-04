// Resolve o escopo de atendimento do ator por request (cache 30s por usuario):
// abas Minhas / Não atribuídas / Minha Equipe / Todas derivadas das perms
// comm.whatsapp.view.* + equipes do usuario (membro/supervisor).
import { Injectable } from '@nestjs/common';
import { AttendanceTeamMember, Prisma } from '@prisma/client';
import { AttendanceRepository } from './attendance.repository';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { PERMISSIONS } from '../../../shared/permissions.constants';

export interface AttendanceScope {
  userId: string;
  isSuper: boolean;
  myTeamIds: string[];
  supervisedTeamIds: string[];
  view: { assigned: boolean; unassigned: boolean; team: boolean; all: boolean };
  reply: { assigned: boolean; team: boolean; all: boolean };
  can: { claim: boolean; transfer: boolean; close: boolean };
}

interface CachedScope {
  scope: AttendanceScope;
  expiresAt: number;
}

@Injectable()
export class ChatScopeResolver {
  private readonly cache = new Map<string, CachedScope>();
  private readonly TTL_MS = 30_000;

  constructor(private readonly repository: AttendanceRepository) {}

  async resolve(user: AuthenticatedUser): Promise<AttendanceScope> {
    const now = Date.now();
    const cached = this.cache.get(user.sub);
    if (cached && cached.expiresAt > now) return cached.scope;

    const perms = user.permissions ?? [];
    const isSuper = user.is_platform_admin || perms.includes('*');
    const has = (p: string) => isSuper || perms.includes(p);

    const memberships = await this.repository
      .listMemberships(user.sub)
      .catch(() => [] as AttendanceTeamMember[]);
    const myTeamIds = memberships.map((m) => m.team_id);
    const supervisedTeamIds = memberships.filter((m) => m.role === 'SUPERVISOR').map((m) => m.team_id);

    const scope: AttendanceScope = {
      userId: user.sub,
      isSuper,
      myTeamIds,
      supervisedTeamIds,
      view: {
        assigned: has(PERMISSIONS.COMM_WHATSAPP_VIEW_ASSIGNED),
        unassigned: has(PERMISSIONS.COMM_WHATSAPP_VIEW_UNASSIGNED),
        team: has(PERMISSIONS.COMM_WHATSAPP_VIEW_TEAM),
        all: has(PERMISSIONS.COMM_WHATSAPP_VIEW_ALL),
      },
      reply: {
        assigned: has(PERMISSIONS.COMM_WHATSAPP_REPLY_ASSIGNED),
        team: has(PERMISSIONS.COMM_WHATSAPP_REPLY_TEAM),
        all: has(PERMISSIONS.COMM_WHATSAPP_REPLY_ALL),
      },
      can: {
        claim: has(PERMISSIONS.COMM_WHATSAPP_CLAIM),
        transfer: has(PERMISSIONS.COMM_WHATSAPP_TRANSFER),
        close: has(PERMISSIONS.COMM_WHATSAPP_CLOSE),
      },
    };

    this.cache.set(user.sub, { scope, expiresAt: now + this.TTL_MS });
    return scope;
  }

  /**
   * WHERE de visibilidade da listagem a partir do escopo.
   * undefined = ve tudo (super ou view.all).
   */
  buildVisibilityWhere(scope: AttendanceScope): Prisma.WhatsappChatWhereInput | undefined {
    if (scope.isSuper || scope.view.all) return undefined;

    const ors: Prisma.WhatsappChatWhereInput[] = [];
    if (scope.view.assigned) {
      ors.push({ current_handler_type: 'USER', current_handler_id: scope.userId });
    }
    if (scope.view.unassigned) {
      ors.push({
        current_handler_id: null,
        OR: [
          { team_id: null },
          ...(scope.myTeamIds.length ? [{ team_id: { in: scope.myTeamIds } }] : []),
        ],
      });
    }
    if (scope.view.team && scope.supervisedTeamIds.length) {
      ors.push({ team_id: { in: scope.supervisedTeamIds } });
    }

    if (ors.length === 0) return { id: '__none__' }; // sem eixo → nao ve nada
    return { OR: ors };
  }
}
