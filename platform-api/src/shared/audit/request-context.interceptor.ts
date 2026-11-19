// Popula o requestStorage por requisicao. Interceptors rodam DEPOIS dos
// guards — req.user ja esta preenchido pelo JwtAuthGuard.
// Rotas @Public (login, aceite de convite): actor vazio, mas ip/user_agent
// preservados — logs de seguranca precisam da origem mesmo sem ator.
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import { requestStorage, RequestStore } from './request-context';
import { RequestWithUser } from '../auth/auth.types';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();

    const store: RequestStore = {
      actor: {
        id: req.user?.sub,
        email: req.user?.email,
        profileId: req.user?.profile_id ?? null,
      },
      ip: req.ip,
      userAgent: this.header(req, 'user-agent'),
      traceId: this.header(req, 'x-trace-id') ?? randomUUID(),
    };

    return new Observable((subscriber) => {
      requestStorage.run(store, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }

  private header(req: RequestWithUser, name: string): string | undefined {
    const value = req.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }
}
