'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { post, useAction } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { DESKTOP, useMediaQuery } from '@/hooks/use-media-query';
import { countLabel, useUnread } from '@/hooks/use-unread';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Notification { id: string; title: string; link: string | null; readAt: string | null; createdAt: string }

const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d < 7 ? `há ${d} ${d === 1 ? 'dia' : 'dias'}` : new Date(iso).toLocaleDateString('pt-BR');
};

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const desktop = useMediaQuery(DESKTOP);
  const unread = useUnread();
  const count = unread.data?.notifications ?? 0;
  const list = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Notification[]>('/notifications'),
    enabled: open,
  });
  const keys = { invalidate: ['notifications', 'unread'] };
  const read = useAction((id: string) => post(`/notifications/${id}/read`), keys);
  const readAll = useAction(() => post('/notifications/read-all'), keys);

  function openItem(n: Notification) {
    if (!n.readAt) read.mutate(n.id);
    if (n.link) { setOpen(false); router.push(n.link); }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost" size="icon" className="relative size-11" onClick={() => setOpen(true)}
        aria-label={count ? `Notificações, ${count} não lidas` : 'Notificações'}
      >
        <Bell className="size-5" />
        {count > 0 && (
          <span className="bg-destructive absolute top-1.5 right-1.5 flex min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] leading-4.5 font-semibold text-white">
            {countLabel(count)}
          </span>
        )}
      </Button>
      <SheetContent side={desktop ? 'right' : 'bottom'} className="gap-3 p-0 sm:max-w-md">
        <SheetHeader className="px-5 pt-5">
          <SheetTitle>Notificações</SheetTitle>
          <SheetDescription>{count ? `${count} não ${count === 1 ? 'lida' : 'lidas'}` : 'Tudo em dia.'}</SheetDescription>
        </SheetHeader>
        {count > 0 && (
          <div className="px-5">
            <Button size="sm" variant="outline" loading={readAll.isPending} onClick={() => readAll.mutate()}>Marcar todas como lidas</Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto border-t">
          {list.isPending ? (
            <div className="space-y-2 p-5"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
          ) : list.error ? (
            <p role="alert" className="text-destructive p-5 text-sm">{list.error.message}</p>
          ) : list.data.length === 0 ? (
            <p className="text-muted-foreground p-8 text-center text-sm">Nenhuma notificação por enquanto.</p>
          ) : (
            <ul className="divide-y">
              {list.data.map((n) => (
                <li key={n.id}>
                  <button
                    type="button" onClick={() => openItem(n)}
                    className="hover:bg-muted/60 flex min-h-14 w-full items-start gap-3 px-5 py-3 text-left"
                  >
                    <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm', !n.readAt && 'font-medium')}>{n.title}</span>
                      <span className="text-muted-foreground text-xs">{ago(n.createdAt)}{n.readAt ? '' : ' · não lida'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
