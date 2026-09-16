// Seed idempotente da instalação dedicada: cria somente o administrador local
// quando o banco ainda não possui usuários.
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SeedRepository } from './seed.repository';
import { hashPassword } from '../../../shared/auth/password.util';
import { ALL_PERMISSIONS } from '../../../shared/permissions.constants';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly repository: SeedRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      if ((await this.repository.countUsers()) > 0) return;

      this.logger.log('Banco dedicado vazio — criando administrador local...');
      const adminEmail = process.env['INSTALLATION_ADMIN_EMAIL'] ?? 'admin@iastudio.local';
      const adminPassword = process.env['INSTALLATION_ADMIN_PASSWORD'] ?? 'admin123';
      const profile = await this.repository.ensureInstallationAdminProfile(ALL_PERMISSIONS);
      await this.repository.createInitialAdmin({
        name: 'Administrador da Instalação',
        email: adminEmail,
        passwordHash: await hashPassword(adminPassword),
        profileId: profile.id,
      });
      this.logger.log(`Administrador local criado: ${adminEmail}`);
      if (!process.env['INSTALLATION_ADMIN_PASSWORD']) {
        this.logger.warn('ATENÇÃO: administrador local criado com a senha padrão "admin123" — troque-a imediatamente após o primeiro login.');
      }
    } catch (e) {
      // O seed não derruba o boot; a instalação pode ser corrigida e reiniciada.
      this.logger.error(`Seed de primeira instalação falhou: ${(e as Error).message}`);
    }
  }
}
