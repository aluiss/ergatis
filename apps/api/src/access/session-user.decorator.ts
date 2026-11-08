import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';

/** Usuário da sessão (id e papel). Como o @UserId, nunca vem do corpo da requisição. */
export const SessionUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const u = ctx.switchToHttp().getRequest().session?.user as { id: string; role?: string | null; twoFactorEnabled?: boolean | null } | undefined;
  if (!u?.id) throw new UnauthorizedException();
  return { id: u.id, role: u.role ?? null, twoFactorEnabled: !!u.twoFactorEnabled };
});
