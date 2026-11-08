'use client';

import * as React from 'react';
import { XIcon } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/** Painel lateral para detalhes: mantém a lista à vista por trás. */
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

const SIDES = {
  right: 'inset-y-0 right-0 h-full w-full border-l sm:max-w-xl data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
  /** No celular: sobe da base, ao alcance do polegar, acima da barra do sistema. */
  bottom: 'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
} as const;

export function SheetContent({ className, children, side = 'right', ...props }: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: keyof typeof SIDES }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
      <SheetPrimitive.Content
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 overflow-y-auto p-6 shadow-lg',
          SIDES[side],
          'outline-none',
          className,
        )}
        tabIndex={-1}
        // Foco no próprio painel, e não no primeiro botão: senão ele abre parecendo selecionado.
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="ring-offset-background focus-visible:ring-ring absolute top-3 right-3 flex size-10 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none">
          <XIcon className="size-5" />
          <span className="sr-only">Fechar</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 pr-8', className)} {...props} />;
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />;
}

export function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn('text-muted-foreground text-sm', className)} {...props} />;
}
