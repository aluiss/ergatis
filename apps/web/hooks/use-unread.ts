'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface UnreadCounts { notifications: number; messages: number }

/** Contadores do sino e das mensagens. Atualiza sozinho e ao voltar para a aba. */
export function useUnread() {
  return useQuery({
    queryKey: ['unread'],
    queryFn: () => api<UnreadCounts>('/notifications/unread-count'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

/** "9+" a partir de 10: o número exato não cabe num selo e não muda a decisão. */
export const countLabel = (n: number) => (n > 9 ? '9+' : String(n));
