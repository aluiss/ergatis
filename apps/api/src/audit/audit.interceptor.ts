import {
  type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { concatMap, type Observable } from 'rxjs';
import { recordAudit } from './audit';

export const AUDIT_KEY = 'ergatis:audit';
export const SKIP_AUDIT_KEY = 'ergatis:skip-audit';

export interface AuditOptions {
  action: string;
  targetType: string;
  /** Parâmetro da rota que identifica o alvo. Padrão: `id` do resultado, depois o parâmetro `id`. */
  targetParam?: string;
  /** O alvo é o próprio usuário autenticado. */
  targetSelf?: boolean;
}

/** Registra a ação na auditoria quando a requisição termina com sucesso. */
export const Audit = (action: string, targetType: string, options: Omit<AuditOptions, 'action' | 'targetType'> = {}) =>
  SetMetadata(AUDIT_KEY, { action, targetType, ...options } satisfies AuditOptions);

/** Rota de escrita sem registro automático. Diga por quê: ou o serviço já registra, ou é irrelevante. */
export const SkipAudit = (reason: string) => SetMetadata(SKIP_AUDIT_KEY, reason);

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type AuthedRequest = Request & { session?: { user?: { id?: string } } };

/**
 * Toda rota de escrita entra na auditoria. Rotas sem @Audit ganham um nome genérico
 * (Controller.metodo) para nada passar em branco; o teste de cobertura cobra o @Audit.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<string>(SKIP_AUDIT_KEY, targets)) return next.handle();

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const declared = this.reflector.getAllAndOverride<AuditOptions>(AUDIT_KEY, targets);
    if (!declared && !WRITE_METHODS.has(req.method)) return next.handle();

    const options: AuditOptions = declared ?? {
      action: `${context.getClass().name.replace(/Controller$/, '')}.${context.getHandler().name}`,
      targetType: 'route',
    };

    return next.handle().pipe(concatMap(async (result: unknown) => {
      const actorId = req.session?.user?.id ?? null;
      const resultId = typeof result === 'object' && result !== null && typeof (result as { id?: unknown }).id === 'string'
        ? (result as { id: string }).id : undefined;
      const targetId = options.targetSelf ? actorId
        : options.targetParam ? req.params[options.targetParam]
          : resultId ?? req.params.id ?? null;
      await recordAudit({
        actorId,
        action: options.action,
        targetType: options.targetType,
        targetId: typeof targetId === 'string' ? targetId : null,
        metadata: { ip: req.ip, ...(declared ? {} : { route: `${req.method} ${req.route?.path ?? req.path}` }) },
      });
      return result;
    }));
  }
}
