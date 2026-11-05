'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

const LINKS = [
  ['/painel', 'Painel'], ['/pedidos', 'Meus pedidos'], ['/oportunidades', 'Oportunidades'],
  ['/propostas', 'Minhas propostas'], ['/contratacoes', 'Contratações'], ['/mensagens', 'Mensagens'],
  ['/planos', 'Planos'], ['/perfil', 'Perfil'],
] as const;

export function AppNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...LINKS, ['/admin', 'Admin'] as const] : LINKS;

  async function signOut() {
    await authClient.signOut();
    window.location.href = '/';
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/painel" aria-label="Painel"><Logo size={28} /></Link>
        <Button variant="ghost" size="sm" onClick={signOut}>Sair</Button>
      </div>
      <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2" aria-label="Principal">
        {links.map(([href, label]) => (
          <Link
            key={href} href={href}
            aria-current={pathname.startsWith(href) ? 'page' : undefined}
            className={cn('rounded-md px-3 py-1.5 text-sm whitespace-nowrap', pathname.startsWith(href) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
          >{label}</Link>
        ))}
      </nav>
    </header>
  );
}
