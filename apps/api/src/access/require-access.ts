import {
  applyDecorators, BadRequestException, type CanActivate, type ExecutionContext, ForbiddenException, Injectable, SetMetadata,
  UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ACCESS_RESOURCES, type AccessLevel, type AccessResource } from '@ergatis/shared';
import { recordAudit } from '../audit/audit';
import { AccessService } from './access.service';

export const REQUIRE_ACCESS_KEY = 'ergatis:require-access';
export interface RequiredAccess { resource: AccessResource; level: AccessLevel }
/** Permissão que depende da requisição (ex.: o tipo de registro na URL). `null` = recurso inválido (400). */
export type AccessResolver = (req: Request) => RequiredAccess | null;

/**
 * Exige permissão sobre um recurso do catálogo. Roda como guard da rota, depois
 * da autenticação global, então a sessão já está na requisição.
 */
export const RequireAccess = (resource: AccessResource, level: AccessLevel = 'view') =>
  applyDecorators(SetMetadata(REQUIRE_ACCESS_KEY, { resource, level } satisfies RequiredAccess), UseGuards(RequireAccessGuard));

/** Como RequireAccess, mas a permissão é escolhida pela requisição. */
export const RequireAccessBy = (resolver: AccessResolver) =>
  applyDecorators(SetMetadata(REQUIRE_ACCESS_KEY, resolver), UseGuards(RequireAccessGuard));

type AuthedRequest = Request & { session?: { user?: { id: string; role?: string | null } } };

@Injectable()
export class RequireAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly access: AccessService) {}

  async canActivate(context: ExecutionContext) {
    const declared = this.reflector.getAllAndOverride<RequiredAccess | AccessResolver>(REQUIRE_ACCESS_KEY, [context.getHandler(), context.getClass()]);
    if (!declared) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const required = typeof declared === 'function' ? declared(req) : declared;
    if (!required) throw new BadRequestException('Tipo de registro desconhecido');
    const actor = req.session?.user;
    if (!actor) throw new UnauthorizedException();
    if (await this.access.can(actor, required.resource, required.level)) return true;

    // Tentativa negada é sinal de segurança: alguém procurando o que não pode.
    await recordAudit({
      actorId: actor.id, action: 'access.denied', targetType: 'route', targetId: null,
      summary: `${ACCESS_RESOURCES[required.resource].label} (${required.level})`,
      metadata: { resource: required.resource, level: required.level },
    });
    throw new ForbiddenException(required.level === 'edit'
      ? 'Você pode consultar, mas não alterar isto.'
      : 'Você não tem acesso a isto.');
  }
}
