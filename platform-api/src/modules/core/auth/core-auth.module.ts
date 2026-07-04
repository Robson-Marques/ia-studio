import { Module } from '@nestjs/common';
import { CoreAuthController } from './core-auth.controller';
import { CoreAuthService } from './core-auth.service';
import { CoreAuthRepository } from './core-auth.repository';

@Module({
  controllers: [CoreAuthController],
  providers: [CoreAuthService, CoreAuthRepository],
  exports: [CoreAuthService],
})
export class CoreAuthModule {}
