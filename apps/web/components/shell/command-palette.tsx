'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Dialog as Primitive } from 'radix-ui';
import { ADMIN_NAV, APP_NAV, visibleGroups, type NavContext } from '@/lib/navigation';
import { cn } from '@/lib/utils';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca de páginas por Ctrl/⌘+K. Acentos e maiúsculas não importam. */
export function CommandPalette({ ctx, open, onOpenChange }: { ctx: NavContext; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onOpenChange(!open); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const entries = useMemo(() => {
    const groups = [...visibleGroups(APP_NAV, ctx), ...(ctx.isStaff ? visibleGroups(ADMIN_NAV, ctx).map((g) => ({ ...g, label: `Admin · ${g.label}` })) : [])];
    const q = normalize(query.trim());
    return groups.flatMap((g) => g.items.map((item) => ({ item, group: g.label })))
      .filter(({ item, group }) => !q || normalize(`${item.label} ${group} ${item.keywords ?? ''}`).includes(q))
      // O registro repete o item "Administração" no grupo do app e no do admin.
      .filter((e, i, all) => all.findIndex((o) => o.item.href === e.item.href) === i);
  }, [ctx, query]);

  const go = (href: string) => { onOpenChange(false); setQuery(''); router.push(href); };

  return (
    <Primitive.Root open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQuery(''); }}>
      <Primitive.Portal>
        <Primitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
        <Primitive.Content
          className="bg-popover data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 fixed top-[15vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border shadow-lg"
          aria-describedby={undefined}
        >
          <Primitive.Title className="sr-only">Ir para uma página</Primitive.Title>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <input
              autoFocus value={query} placeholder="Ir para..." aria-label="Buscar página"
              role="combobox" aria-expanded aria-controls="palette-list"
              aria-activedescendant={entries[index] ? `palette-${entries[index].item.id}` : undefined}
              className="h-12 w-full bg-transparent text-base outline-none"
              onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, entries.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
                if (e.key === 'Enter' && entries[index]) { e.preventDefault(); go(entries[index].item.href); }
              }}
            />
            <kbd className="text-muted-foreground bg-muted rounded px-1.5 text-xs">Esc</kbd>
          </div>
          <ul id="palette-list" role="listbox" className="max-h-80 overflow-y-auto p-1">
            {entries.length === 0 && <li className="text-muted-foreground p-6 text-center text-sm">Nenhuma página encontrada.</li>}
            {entries.map(({ item, group }, i) => (
              <li key={item.id} id={`palette-${item.id}`} role="option" aria-selected={i === index}>
                <button
                  type="button" onClick={() => go(item.href)} onMouseMove={() => setIndex(i)}
                  className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm', i === index && 'bg-accent text-accent-foreground')}
                >
                  <item.icon className="text-muted-foreground size-4" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-muted-foreground text-xs">{group}</span>
                </button>
              </li>
            ))}
          </ul>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
