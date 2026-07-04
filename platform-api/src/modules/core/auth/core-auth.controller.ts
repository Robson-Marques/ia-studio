import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CoreAuthService } from './core-auth.service';
import { Public } from '../../../shared/auth/public.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class CoreAuthController {
  constructor(private readonly authService: CoreAuthService) {}

  // Rate limit cirurgico: 5 tentativas por minuto por IP.
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.sub);
  }

  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto.current_password, dto.new_password);
  }
}
