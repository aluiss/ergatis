import { NextResponse, type NextRequest } from 'next/server';

/** Checagem otimista. A validação real acontece no layout privado e em cada rota da API. */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.getAll().some((c) => c.name.endsWith('better-auth.session_token'));
  if (!hasSession) {
    const url = new URL('/entrar', request.url);
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/painel/:path*', '/pedidos/:path*', '/oportunidades/:path*', '/propostas/:path*',
    '/contratacoes/:path*', '/mensagens/:path*', '/perfil/:path*', '/admin/:path*',
  ],
};
