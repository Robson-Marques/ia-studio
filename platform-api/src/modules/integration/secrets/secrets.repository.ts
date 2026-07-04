// Porta unica ao banco do Secrets Manager (integration_secrets).
import { Injectable } from '@nestjs/common';
import { Prisma, SecretKind } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface CreateSecretRow {
  organizationId: string;
  workspaceId?: string | null;
  environmentId?: string | null;
  name: string;
  kind: SecretKind;
  encryptedValue: string;
  oauthMeta?: Prisma.InputJsonValue | null;
  createdBy?: string | null;
}

@Injectable()
export class SecretsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllByOrg(organizationId: string) {
    return this.prisma.secret.findMany({
      where: { organization_id: organizationId },
      orderBy: { created_at: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.secret.findUnique({ where: { id } });
  }

  create(row: CreateSecretRow) {
    return this.prisma.secret.create({
      data: {
        organization_id: row.organizationId,
        workspace_id: row.workspaceId ?? null,
        environment_id: row.environmentId ?? null,
        name: row.name,
        kind: row.kind,
        encrypted_value: row.encryptedValue,
        oauth_meta: row.oauthMeta ?? Prisma.JsonNull,
        created_by: row.createdBy ?? null,
      },
    });
  }

  rotate(id: string, encryptedValue: string) {
    return this.prisma.secret.update({
      where: { id },
      data: { encrypted_value: encryptedValue, rotated_at: new Date() },
    });
  }

  /** Atualiza valor cifrado + oauth_meta (refresh automatico de token OAuth). */
  updateOauth(id: string, encryptedValue: string, oauthMeta: Prisma.InputJsonValue) {
    return this.prisma.secret.update({
      where: { id },
      data: { encrypted_value: encryptedValue, oauth_meta: oauthMeta },
    });
  }

  countConnectionsUsingSecret(secretId: string) {
    return this.prisma.connection.count({ where: { secret_id: secretId } });
  }
}
