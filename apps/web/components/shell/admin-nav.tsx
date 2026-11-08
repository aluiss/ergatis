'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { activeItem, ADMIN_NAV, trail } from '@/lib/navigation';
import { cn } from '@/lib/utils';

const items = ADMIN_NAV.flatMap((g) => g.items);

/** Menu lateral agrupado a partir de `lg`. */
export function AdminSidebar() {
  const current = activeItem(usePathname(), items);
  return (
    <nav aria-label="Administração" className="sticky top-20 hidden w-52 shrink-0 space-y-4 self-start lg:block">
      {ADMIN_NAV.map((g) => (
        <div key={g.id}>
          <h2 className="text-muted-foreground mb-1 px-2 text-xs font-medium tracking-wide uppercase">{g.label}</h2>
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href} aria-current={current?.id === item.id ? 'page' : undefined}
                  className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                    current?.id === item.id ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
                >
                  <item.icon className="size-4" aria-hidden /> {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Abaixo de `lg`: abas que rolam de lado, já posicionadas na página atual. */
export function AdminTabs() {
  const current = activeItem(usePathname(), items);
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [current?.id]);
  return (
    <nav aria-label="Administração" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden">
      <ul className="flex w-max gap-2 pb-1">
        {items.map((item) => {
          const active = current?.id === item.id;
          return (
            <li key={item.id}>
              <Link
                ref={active ? activeRef : undefined} href={item.href} aria-current={active ? 'page' : undefined}
                className={cn('flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm whitespace-nowrap',
                  active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background')}
              >
                <item.icon className="size-4" aria-hidden /> {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AdminBreadcrumbs() {
  const { group, item } = trail(usePathname(), ADMIN_NAV);
  if (!item) return null;
  return (
    <nav aria-label="Você está em" className="text-muted-foreground hidden items-center gap-1 text-sm lg:flex">
      <Link href="/admin" className="hover:text-foreground">Administração</Link>
      {group && group.id !== 'geral' && <><ChevronRight className="size-3.5" aria-hidden /><span>{group.label}</span></>}
      {item.href !== '/admin' && <><ChevronRight className="size-3.5" aria-hidden /><Link href={item.href} className="text-foreground hover:underline">{item.label}</Link></>}
    </nav>
  );
}
