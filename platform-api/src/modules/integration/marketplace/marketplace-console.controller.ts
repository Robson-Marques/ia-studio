// Curadoria do marketplace pelo Console (diretriz 43): CRUD de
// ProviderDefinition + ativar/desativar conector globalmente.
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProviderCategory } from '@prisma/client';
import { PlatformAdminOnly } from '../../../shared/auth/platform-admin.guard';
import { MarketplaceService } from './marketplace.service';
import { CreateProviderDefinitionDto } from './dto/create-provider-definition.dto';
import { UpdateProviderDefinitionDto } from './dto/update-provider-definition.dto';

@ApiTags('Console — Marketplace')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('console/marketplace')
export class MarketplaceConsoleController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get()
  findAll(@Query('category') category?: ProviderCategory, @Query('search') search?: string) {
    return this.marketplace.findAllDefinitions({ category, search });
  }

  @Post()
  create(@Body() dto: CreateProviderDefinitionDto) {
    return this.marketplace.createDefinition(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProviderDefinitionDto) {
    return this.marketplace.updateDefinition(id, dto);
  }
}
