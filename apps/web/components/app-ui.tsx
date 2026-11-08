'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { STATUS_LABEL } from '@/lib/format';

export function StatusBadge({ status }: { status: string }) {
  const good = ['open', 'active', 'accepted', 'completed', 'resolved'].includes(status);
  return <Badge variant={good ? 'default' : 'secondary'}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">{children}</p>;
}

export function Loading() {
  return <div className="space-y-3" aria-label="Carregando"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>;
}

export function ErrorState({ error }: { error: Error }) {
  return <p role="alert" className="text-destructive rounded-lg border p-4 text-sm">{error.message}</p>;
}

/** Ação na API com aviso de sucesso e erro, atualizando as listas informadas. */
export function useAction<V = void>(
  run: (vars: V) => Promise<unknown>,
  options: { invalidate?: string[]; success?: string; onDone?: () => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      if (options.success) toast.success(options.success);
      await Promise.all((options.invalidate ?? []).map((key) => client.invalidateQueries({ queryKey: [key] })));
      options.onDone?.();
    },
    onError: (error) => { toast.error(error.message); },
  });
}

export const post = (path: string, body?: unknown) => api(path, { method: 'POST', body });

/**
 * A mesma ação costuma atender várias linhas ("Retirar" em cada proposta). Isto diz
 * se é a linha em questão que está em andamento, para só ela mostrar o indicador.
 */
export const pendingFor = <V,>(m: { isPending: boolean; variables?: V }, matches: (v: V) => boolean) =>
  m.isPending && m.variables !== undefined && matches(m.variables);
