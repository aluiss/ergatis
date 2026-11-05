import * as React from 'react';
import { cn } from '@/lib/utils';

export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn('border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]', className)}
      {...props}
    />
  );
}
