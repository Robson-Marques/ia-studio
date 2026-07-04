// Modulo global de autenticacao (infra) — JWT + strategy + guards.
// Diretriz 56 (Identity): a estrategia interna (email+senha) e a 1a
// implementacao; SSO (Google/SAML/OIDC) entra depois como novas strategies
// sem refatorar os guards.
import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { PlatformAdminGuard } from './platform-admin.guard';
import { getJwtSecret, JWT_EXPIRES_IN } from './jwt.config';

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getJwtSecret(),
        signOptions: { expiresIn: JWT_EXPIRES_IN },
      }),
    }),
  ],
  providers: [JwtStrategy, JwtAuthGuard, PermissionsGuard, PlatformAdminGuard],
  exports: [JwtModule, JwtAuthGuard, PermissionsGuard, PlatformAdminGuard],
})
export class AuthModule {}
