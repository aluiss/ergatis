/* eslint-disable @next/next/no-img-element */
import { cn } from '@/lib/utils';

export function Avatar({ fileId, name, className }: { fileId: string | null | undefined; name: string; className?: string }) {
  const classes = cn('size-12 shrink-0 rounded-full object-cover', className);
  if (fileId) return <img src={`/api/files/${fileId}`} alt="" className={classes} />;
  const initials = name.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return <span aria-hidden className={cn(classes, 'bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium')}>{initials}</span>;
}
