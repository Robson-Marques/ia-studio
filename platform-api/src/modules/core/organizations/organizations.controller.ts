// Console — gestao de tenants (clientes do SaaS). Sem DELETE: organization
// sai de operacao com is_active=false (nunca apagar dados — diretriz 58).
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformAdminOnly } from '../../../shared/auth/platform-admin.guard';
import { CurrentUserId } from '../../../shared/auth/current-user.decorator';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@ApiTags('Console — Organizations')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('console/organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  findAll() {
    return this.organizations.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.organizations.findById(id);
  }

  @Post()
  create(@Body() dto: CreateOrganizationDto, @CurrentUserId() userId?: string) {
    return this.organizations.create(dto, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    return this.organizations.update(id, dto);
  }
}
