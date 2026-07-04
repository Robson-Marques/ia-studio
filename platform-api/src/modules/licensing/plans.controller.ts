// Console (operacao do SaaS) — CRUD de planos. Exclusao nao existe:
// plano sai de circulacao com is_active=false (nunca apagar dados).
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformAdminOnly } from '../../shared/auth/platform-admin.guard';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@ApiTags('Console — Licensing')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('console/plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  findAll() {
    return this.plans.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.plans.findById(id);
  }

  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }
}
