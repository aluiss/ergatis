import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';

/** Id do usuário autenticado. Nunca aceite esse valor vindo do corpo da requisição. */
export const UserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const id = ctx.switchToHttp().getRequest().session?.user?.id;
  if (!id) throw new UnauthorizedException();
  return id;
});
