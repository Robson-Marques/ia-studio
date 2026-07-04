import { SetMetadata } from '@nestjs/common';

// Marca uma rota como publica, isenta do JwtAuthGuard global.
// Usar em: login, aceite de convite, health.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
