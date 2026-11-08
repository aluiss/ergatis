import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/lib/brand';

/** Logado, troca "Entrar/Cadastrar" por um atalho para o painel. */
export function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" aria-label={`${BRAND}, página inicial`}><Logo /></Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" className="hidden sm:inline-flex"><Link href="/profissionais">Profissionais</Link></Button>
          <Button asChild variant="ghost" className="hidden sm:inline-flex"><Link href="/planos">Planos</Link></Button>
          {signedIn ? <Button asChild><Link href="/painel">Ir para o painel</Link></Button> : (
            <>
              <Button asChild variant="outline"><Link href="/entrar">Entrar</Link></Button>
              <Button asChild><Link href="/cadastrar">Cadastrar</Link></Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="text-muted-foreground mt-16 border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} {BRAND}</p>
        <nav className="flex gap-4">
          <Link href="/profissionais">Profissionais</Link>
          <Link href="/planos">Planos</Link>
          <Link href="/termos">Termos</Link>
          <Link href="/privacidade">Privacidade</Link>
        </nav>
      </div>
    </footer>
  );
}
