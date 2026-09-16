// Console — Atualizacao, Backup e Restauracao (Fase 8). Rotas exclusivas do
// Console do administrador local. Infra global da instancia: sem tenant.
// Auditoria de upgrade/backup/restore fica nos services (@Auditable/audit.record).
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InstallationAdminOnly } from '../../shared/auth/permissions.decorator';
import { CurrentUserId } from '../../shared/auth/current-user.decorator';
import { VersionService } from './version.service';
import { UpgradeService } from './upgrade.service';
import { BackupService } from './backup.service';
import { StartUpgradeDto, RestoreDto } from './dto/system.dtos';

@ApiTags('Console — System (Atualização/Backup)')
@ApiBearerAuth()
@InstallationAdminOnly()
@Controller('console/system')
export class SystemController {
  constructor(
    private readonly versions: VersionService,
    private readonly upgrades: UpgradeService,
    private readonly backups: BackupService,
  ) {}

  // ─── Atualizacao ────────────────────────────────────────────────────

  @Get('version')
  @ApiOperation({ summary: 'Versão atual + tags disponíveis + backups retidos (git fetch + cache 5min; ?force=1 ignora o cache)' })
  async version(@Query('force') force?: string) {
    // `backups_retained` alimenta o StatCard da tela de Atualização. Sem ele o
    // card exibia 0 fixo (o front fazia `?? 0` sobre um campo inexistente).
    const [info, backupsRetained] = await Promise.all([
      this.versions.getVersionInfo(force === '1' || force === 'true'),
      this.backups.count().catch(() => 0),
    ]);
    return { ...info, backups_retained: backupsRetained };
  }

  @Post('upgrade')
  @HttpCode(202)
  @ApiOperation({ summary: 'Inicia a atualização para uma tag (202 + row RUNNING)' })
  startUpgrade(@Body() dto: StartUpgradeDto, @CurrentUserId() userId?: string) {
    return this.upgrades.start(dto.version, userId ?? null);
  }

  @Get('upgrade/current')
  @ApiOperation({ summary: 'Status ao vivo do upgrade + log_lines (polling 2s)' })
  currentUpgrade(@Query('id') id?: string) {
    return this.upgrades.current(id);
  }

  @Get('upgrade/history')
  @ApiOperation({ summary: 'Histórico das últimas atualizações' })
  upgradeHistory() {
    return this.upgrades.listHistory();
  }

  @Post('upgrade/release-lock')
  @HttpCode(200)
  @ApiOperation({ summary: 'Libera lock órfão (>10min) marcando FAILED sem reverter' })
  releaseLock(@CurrentUserId() userId?: string) {
    return this.upgrades.releaseLock(userId ?? null);
  }

  // ─── Backup e Restauracao ───────────────────────────────────────────

  @Get('backups')
  @ApiOperation({ summary: 'Lista os pacotes de backup disponíveis' })
  listBackups() {
    return this.backups.list();
  }

  @Get('backups/current')
  @ApiOperation({ summary: 'Operação de backup/restore em andamento (se houver)' })
  currentOperation() {
    return this.backups.currentOperation();
  }

  @Post('backups')
  @HttpCode(202)
  @ApiOperation({ summary: 'Gera um backup completo (spawn backup-full.sh)' })
  generateBackup(@CurrentUserId() userId?: string) {
    return this.backups.generate(userId ?? null);
  }

  @Get('backups/:file/download')
  @ApiOperation({ summary: 'Baixa um backup (stream; guard anti path-traversal)' })
  async download(@Param('file') file: string, @Res() reply: FastifyReply): Promise<void> {
    const { stream, size, name } = await this.backups.openDownload(file);
    reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Length', String(size))
      .header('Content-Disposition', `attachment; filename="${name}"`);
    return reply.send(stream);
  }

  @Post('backups/upload')
  @HttpCode(201)
  @ApiOperation({ summary: 'Sobe um pacote de backup (multipart/form-data)' })
  async upload(@Req() req: FastifyRequest, @CurrentUserId() userId?: string) {
    // @fastify/multipart registrado no bootstrap. req.file() lê o primeiro
    // arquivo do multipart. O destino passa pela guarda anti path-traversal.
    const reqAny = req as FastifyRequest & {
      file?: () => Promise<{ filename: string; file: NodeJS.ReadableStream } | undefined>;
      isMultipart?: () => boolean;
    };
    if (typeof reqAny.isMultipart === 'function' && !reqAny.isMultipart()) {
      throw new BadRequestException('Envie o arquivo como multipart/form-data.');
    }
    if (typeof reqAny.file !== 'function') {
      throw new BadRequestException('Upload multipart indisponível (plugin não registrado).');
    }
    const data = await reqAny.file();
    if (!data) throw new BadRequestException('Nenhum arquivo recebido.');

    await this.backups.ensureBackupDir();
    const target = this.backups.resolveUploadTarget(data.filename); // valida nome
    const { createWriteStream } = await import('node:fs');
    const { pipeline } = await import('node:stream/promises');
    await pipeline(data.file, createWriteStream(target));
    await this.backups.recordUpload(data.filename, userId ?? null);
    return { uploaded: data.filename };
  }

  @Delete('backups/:file')
  @ApiOperation({ summary: 'Exclui um pacote de backup (guard anti path-traversal)' })
  removeBackup(@Param('file') file: string, @CurrentUserId() userId?: string) {
    return this.backups.remove(file, userId ?? null);
  }

  @Post('restore')
  @HttpCode(202)
  @ApiOperation({ summary: 'Restaura um backup completo (spawn restore-full.sh via systemd-run)' })
  restore(@Body() dto: RestoreDto, @CurrentUserId() userId?: string) {
    return this.backups.restore(dto.file, userId ?? null);
  }
}
