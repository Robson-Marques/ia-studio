import { Module } from '@nestjs/common';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { InvitesRepository } from './invites.repository';
import { UsersModule } from '../users/users.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [UsersModule, ProfilesModule, WorkspacesModule],
  controllers: [InvitesController],
  providers: [InvitesService, InvitesRepository],
})
export class InvitesModule {}
