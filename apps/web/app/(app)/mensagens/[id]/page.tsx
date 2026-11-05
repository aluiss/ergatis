'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useRef } from 'react';
import { ErrorState, Loading, post, useAction } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Message { id: string; senderId: string; body: string; createdAt: string }
interface Me { profile: { userId: string } }

export default function Conversation() {
  const { id } = useParams<{ id: string }>();
  const form = useRef<HTMLFormElement>(null);
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me') });
  const q = useQuery({ queryKey: ['messages', id], queryFn: () => api<Message[]>(`/conversations/${id}/messages`), refetchInterval: 5_000 });
  const send = useAction((body: string) => post(`/conversations/${id}/messages`, { body }), {
    invalidate: ['messages'], onDone: () => form.current?.reset(),
  });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <ul className="flex flex-col gap-2" aria-live="polite">
        {q.data.map((m) => (
          <li key={m.id} className={cn('max-w-[80%] rounded-lg px-3 py-2 text-sm', m.senderId === me.data?.profile.userId ? 'bg-primary text-primary-foreground self-end' : 'bg-muted self-start')}>{m.body}</li>
        ))}
      </ul>
      <form ref={form} className="flex gap-2" onSubmit={(e) => {
        e.preventDefault();
        const body = String(new FormData(e.currentTarget).get('body')).trim();
        if (body) send.mutate(body);
      }}>
        <Input name="body" maxLength={2000} placeholder="Escreva uma mensagem" aria-label="Mensagem" autoComplete="off" />
        <Button disabled={send.isPending}>Enviar</Button>
      </form>
    </div>
  );
}
