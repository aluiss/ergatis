import 'server-only';
import { cookies } from 'next/headers';

const base = process.env.API_INTERNAL_URL ?? 'http://localhost:3333';

/**
 * Busca dados públicos no servidor. Devolve null em 404.
 * Use `revalidate` só para dados que podem ficar defasados, como categorias.
 * Perfis e busca ficam sem cache: benefícios e exclusões de conta valem na hora.
 */
export async function publicGet<T>(path: string, revalidate?: number): Promise<T | null> {
  const res = await fetch(`${base}/api${path}`, revalidate ? { next: { revalidate } } : { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export interface SessionUser { id: string; name: string; email: string; role?: string | null }

/** Validação real da sessão: o proxy.ts faz apenas uma checagem otimista do cookie. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;
  const res = await fetch(`${base}/api/auth/get-session`, { headers: { cookie }, cache: 'no-store' });
  if (!res.ok) return null;
  const data = (await res.json()) as { user?: SessionUser } | null;
  return data?.user ?? null;
}
