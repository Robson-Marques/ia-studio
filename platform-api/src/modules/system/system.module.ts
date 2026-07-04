// Modulo System (Fase 8): Atualizacao (upgrade.sh), Backup/Restauracao
// (backup-full.sh / restore-full.sh) e leitura de versao (CHANGELOG + git tags).
// Infra global da instancia — rotas exclusivas do Console (@PlatformAdminOnly).
import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemRepository } from './system.repository';
import { VersionService } from './version.service';
import { UpgradeService } from './upgrade.service';
import { BackupService } from './backup.service';

@Module({
  controllers: [SystemController],
  providers: [SystemRepository, VersionService, UpgradeService, BackupService],
  exports: [VersionService],
})
export class SystemModule {}
