'use client';

import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Busca que só dispara ao enviar (Enter ou botão), para não consultar a cada letra. */
export function SearchBar({ value, onSearch, placeholder }: { value: string; onSearch: (q: string) => void; placeholder: string }) {
  return (
    <form
      role="search" className="flex gap-2"
      onSubmit={(e) => { e.preventDefault(); onSearch(String(new FormData(e.currentTarget).get('q') ?? '').trim()); }}
    >
      <div className="relative min-w-0 flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
        <Input key={value} name="q" type="search" defaultValue={value} placeholder={placeholder} aria-label={placeholder} className="h-11 pl-9 sm:h-9" />
      </div>
      <Button className="h-11 sm:h-9">Buscar</Button>
      {value && <Button type="button" variant="ghost" size="icon" className="size-11 sm:size-9" aria-label="Limpar busca" onClick={() => onSearch('')}><X /></Button>}
    </form>
  );
}

/** Filtro de escolha única em chips: rolam de lado no celular, sem quebrar a tela. */
export function FilterChips<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly (readonly [T | '', string])[]; value: string; onChange: (v: T | '') => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <div className="flex w-max gap-2">
        {options.map(([v, text]) => (
          <button
            key={v || 'all'} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={cn('h-9 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors',
              value === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted')}
          >{text}</button>
        ))}
      </div>
    </div>
  );
}

/** Paginação com total. Botões grandes no celular. */
export function Pager({ page, total, pageSize, onPage, noun = ['registro', 'registros'] }: {
  page: number; total: number; pageSize: number; onPage: (p: number) => void; noun?: [string, string];
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3 text-sm">
      <Button variant="outline" className="h-11 sm:h-9" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
      <span className="text-muted-foreground text-center">
        {pages > 1 && <>Página {page} de {pages} · </>}{total} {total === 1 ? noun[0] : noun[1]}
      </span>
      <Button variant="outline" className="h-11 sm:h-9" disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima</Button>
    </nav>
  );
}
