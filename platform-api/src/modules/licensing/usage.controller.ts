// Console — consumo global (diretriz 40). Consumo por organizacao/metrica no
// periodo (default: mes corrente). Platform admin only.
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformAdminOnly } from '../../shared/auth/platform-admin.guard';
import { UsageService } from './usage.service';

@ApiTags('Console — Usage')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('console/usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  global(
    @Query('period') period?: string,
    @Query('organization_id') organizationId?: string,
  ) {
    return this.usage.getGlobalUsage(period || undefined, organizationId || undefined);
  }
}
