import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationsRepository } from './organizations.repository';
import { OrgUsersController } from './org-users/org-users.controller';
import { OrgUsersService } from './org-users/org-users.service';
import { OrgUsersRepository } from './org-users/org-users.repository';

@Module({
  controllers: [OrganizationsController, OrgUsersController],
  providers: [OrganizationsService, OrganizationsRepository, OrgUsersService, OrgUsersRepository],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
