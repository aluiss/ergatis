'use client';

import * as React from 'react';
import { AlertDialog as Primitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const AlertDialog = Primitive.Root;
export const AlertDialogTrigger = Primitive.Trigger;
export const AlertDialogCancel = Primitive.Cancel;

/**
 * No celular, sobe da base da tela (ao alcance do polegar e acima da barra do
 * sistema); a partir de `sm`, centralizado como um diálogo comum.
 */
export function AlertDialogContent({ className, children, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
      <Primitive.Content
        className={cn(
          'bg-background fixed inset-x-0 bottom-0 z-50 grid max-h-[90dvh] gap-4 overflow-y-auto rounded-t-2xl border-t p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lg',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
          'sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border sm:p-6',
          'sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />;
}

/** Empilhados e com largura total no celular; lado a lado à direita a partir de `sm`. */
export function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-2 sm:flex-row-reverse sm:justify-start', className)} {...props} />;
}

export function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof Primitive.Title>) {
  return <Primitive.Title className={cn('text-lg font-semibold', className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof Primitive.Description>) {
  return <Primitive.Description className={cn('text-muted-foreground text-sm', className)} {...props} />;
}
