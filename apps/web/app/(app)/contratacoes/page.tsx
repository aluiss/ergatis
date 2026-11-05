'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Empty, ErrorState, Loading, post, StatusBadge, useAction } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { money } from '@/lib/format';

interface Item { id: string; title: string; status: string; agreedCents: number; clientId: string; professionalId: string; reviewedByMe: boolean }
interface Me { profile: { userId: string } }

function Row({ e, userId }: { e: Item; userId: string }) {
  const [mode, setMode] = useState<'none' | 'review' | 'report'>('none');
  const keys = { invalidate: ['engagements'] };
  const complete = useAction(() => post(`/engagements/${e.id}/complete`), { ...keys, success: 'Serviço concluído.' });
  const cancel = useAction(() => post(`/engagements/${e.id}/cancel`), { ...keys, success: 'Contratação cancelada.' });
  const review = useAction((f: FormData) => post(`/engagements/${e.id}/review`, {
    rating: Number(f.get('rating')), comment: String(f.get('comment') ?? '') || undefined,
  }), { ...keys, success: 'Avaliação enviada.', onDone: () => setMode('none') });
  const report = useAction((f: FormData) => post('/reports', {
    targetUserId: userId === e.clientId ? e.professionalId : e.clientId, reason: f.get('reason'),
  }), { success: 'Denúncia registrada.', onDone: () => setMode('none') });
  const isClient = userId === e.clientId;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span><span className="font-medium">{e.title}</span><span className="text-muted-foreground block text-sm">{money(e.agreedCents)} · você é {isClient ? 'o cliente' : 'o profissional'}</span></span>
          <StatusBadge status={e.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {e.status === 'active' && isClient && <Button size="sm" onClick={() => complete.mutate()}>Confirmar conclusão</Button>}
          {e.status === 'active' && <Button size="sm" variant="outline" onClick={() => cancel.mutate()}>Cancelar</Button>}
          {e.status === 'completed' && !e.reviewedByMe && <Button size="sm" variant="outline" onClick={() => setMode('review')}>Avaliar</Button>}
          <Button size="sm" variant="ghost" onClick={() => setMode('report')}>Denunciar</Button>
        </div>
        {mode === 'review' && (
          <form action={(f) => review.mutate(f)} className="grid gap-2 sm:grid-cols-[6rem_1fr_auto] sm:items-end">
            <div className="space-y-1"><Label htmlFor={`r-${e.id}`}>Nota</Label><Select id={`r-${e.id}`} name="rating" defaultValue="5">{[5, 4, 3, 2, 1].map((n) => <option key={n}>{n}</option>)}</Select></div>
            <div className="space-y-1"><Label htmlFor={`c-${e.id}`}>Comentário</Label><Input id={`c-${e.id}`} name="comment" maxLength={1000} /></div>
            <Button>Enviar</Button>
          </form>
        )}
        {mode === 'report' && (
          <form action={(f) => report.mutate(f)} className="flex items-end gap-2">
            <div className="flex-1 space-y-1"><Label htmlFor={`d-${e.id}`}>O que aconteceu?</Label><Input id={`d-${e.id}`} name="reason" minLength={10} maxLength={1000} required /></div>
            <Button>Enviar</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function Engagements() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me') });
  const q = useQuery({ queryKey: ['engagements'], queryFn: () => api<Item[]>('/engagements/mine') });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Contratações</h1>
      {q.isPending || me.isPending ? <Loading /> : q.error ? <ErrorState error={q.error} /> : me.error ? <ErrorState error={me.error} />
        : q.data.length === 0 ? <Empty>Nenhuma contratação ainda.</Empty>
        : q.data.map((e) => <Row key={e.id} e={e} userId={me.data.profile.userId} />)}
    </div>
  );
}
