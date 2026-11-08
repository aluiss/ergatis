'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, LogOut, Menu, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { countLabel, useUnread } from '@/hooks/use-unread';
import { authClient } from '@/lib/auth-client';
import {
  activeItem, APP_NAV, bottomTabs, ITEMS, topLinks, visibleGroups, type NavContext, type NavItem,
} from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { CommandPalette } from './command-palette';
import { NotificationsBell } from './notifications-bell';

export interface ShellUser { name: string; email: string; avatarFileId: string | null }

async function signOut() {
  await authClient.signOut().catch(() => undefined);
  window.location.href = '/';
}

function Counter({ value, className }: { value: number; className?: string }) {
  if (!value) return null;
  return (
    <span className={cn('bg-destructive flex min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] leading-4.5 font-semibold text-white', className)}>
      {countLabel(value)}
    </span>
  );
}

/**
 * Casca das páginas logadas. Abaixo de `lg` (celular e tablet): barra no topo com
 * logo e sino, e abas fixas na base, ao alcance do polegar. A partir de `lg`: links
 * no topo, busca por Ctrl+K e menu da conta.
 */
export function AppShell({ user, ctx, children }: { user: ShellUser; ctx: NavContext; children: React.ReactNode }) {
  const pathname = usePathname();
  const client = useQueryClient();
  const unread = useUnread();
  const messages = unread.data?.messages ?? 0;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Ler uma conversa ou uma notificação muda os contadores: confere a cada troca de página.
  useEffect(() => { void client.invalidateQueries({ queryKey: ['unread'] }); setMoreOpen(false); }, [pathname, client]);

  const links = topLinks(ctx);
  const tabs = bottomTabs(ctx);
  const groups = visibleGroups(APP_NAV, ctx);
  const allItems = groups.flatMap((g) => g.items);
  const current = activeItem(pathname, allItems);
  // "Mais" fica ativo quando a página atual não tem aba própria.
  const moreActive = !!current && !tabs.some((t) => t.id === current.id);
  const counterOf = (item: NavItem) => (item.counter === 'messages' ? messages : 0);

  return (
    <div className="min-h-dvh">
      <a href="#conteudo" className="focus:bg-background sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:p-2">
        Pular para o conteúdo
      </a>

      <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <Link href="/painel" aria-label="Início" className="mr-2 shrink-0"><Logo size={28} /></Link>

          <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="Principal">
            {links.map((item) => {
              const active = current?.id === item.id;
              return (
                <Link
                  key={item.id} href={item.href} aria-current={active ? 'page' : undefined}
                  className={cn('flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
                >
                  {item.label}
                  <Counter value={counterOf(item)} />
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button" onClick={() => setPaletteOpen(true)}
              className="text-muted-foreground hover:text-foreground hover:border-foreground/30 hidden h-9 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors lg:flex"
            >
              <Search className="size-4" aria-hidden /> Ir para...
              <kbd className="bg-muted rounded px-1.5 font-sans text-xs">Ctrl K</kbd>
            </button>
            <NotificationsBell />
            <div className="hidden lg:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none" aria-label="Menu da conta">
                    <Avatar fileId={user.avatarFileId} name={user.name} className="size-9" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <span className="block font-medium">{user.name}</span>
                    <span className="text-muted-foreground block truncate text-xs font-normal">{user.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {[ITEMS.perfil, ITEMS.planos, ITEMS.configuracoes, ...(ctx.isProfessional ? [] : [ITEMS.oferecer]), ...(ctx.isAdmin ? [ITEMS.admin] : [])].map((item) => (
                    <DropdownMenuItem key={item.id} asChild>
                      <Link href={item.href}><item.icon /> {item.label}</Link>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void signOut()}><LogOut /> Sair</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Espaço da barra inferior e da área do sistema, para nada ficar escondido atrás dela. */}
      <main id="conteudo" className="mx-auto max-w-6xl px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pt-6 lg:pb-10">
        {children}
      </main>

      <nav
        aria-label="Principal"
        className="bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {tabs.map((item) => {
            const active = current?.id === item.id;
            return (
              <li key={item.id}>
                <Link
                  href={item.href} aria-current={active ? 'page' : undefined}
                  className={cn('relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                    active ? 'text-primary' : 'text-muted-foreground')}
                >
                  <span className="relative">
                    <item.icon className={cn('size-6', active && 'stroke-[2.5]')} aria-hidden />
                    <Counter value={counterOf(item)} className="absolute -top-1.5 -right-2.5" />
                  </span>
                  {item.short ?? item.label}
                  {counterOf(item) > 0 && <span className="sr-only">, {counterOf(item)} não lidas</span>}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog"
              className={cn('flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                moreActive ? 'text-primary' : 'text-muted-foreground')}
            >
              <Menu className={cn('size-6', moreActive && 'stroke-[2.5]')} aria-hidden />
              Mais
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="gap-2 px-4 pt-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Link href="/perfil" className="hover:bg-muted mr-12 flex items-center gap-3 rounded-lg p-2">
            <Avatar fileId={user.avatarFileId} name={user.name} className="size-11" />
            <span className="min-w-0">
              <span className="block font-medium">{user.name}</span>
              <span className="text-muted-foreground block truncate text-sm">{user.email}</span>
            </span>
          </Link>
          {groups.map((g) => (
            <section key={g.id} className="border-t pt-2">
              {/* Grupo de um item só com o mesmo nome ("Início") dispensa o título. */}
              {!(g.items.length === 1 && g.items[0].label === g.label) && (
                <h2 className="text-muted-foreground px-2 py-1 text-xs font-medium tracking-wide uppercase">{g.label}</h2>
              )}
              <ul>
                {g.items.map((item) => {
                  const active = current?.id === item.id;
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href} aria-current={active ? 'page' : undefined}
                        className={cn('flex min-h-12 items-center gap-3 rounded-lg px-2 text-base', active ? 'bg-muted font-medium' : 'hover:bg-muted')}
                      >
                        <item.icon className="text-muted-foreground size-5" aria-hidden />
                        <span className="flex-1">{item.label}</span>
                        <Counter value={counterOf(item)} />
                        <ChevronRight className="text-muted-foreground size-4" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div className="border-t pt-3">
            <Button variant="outline" className="h-12 w-full text-base" onClick={() => void signOut()}><LogOut /> Sair</Button>
          </div>
        </SheetContent>
      </Sheet>

      <CommandPalette ctx={ctx} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
