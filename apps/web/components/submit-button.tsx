'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

/**
 * Botão de envio para formulários com `action` assíncrona: fica carregando enquanto
 * a ação roda, sem estado manual. (Com `action={(f) => m.mutate(f)}` a ação termina
 * na hora; aí use `<Button loading={m.isPending}>`.)
 */
export function SubmitButton({ pendingLabel, children, ...props }: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" loading={pending} {...props}>{pending && pendingLabel ? pendingLabel : children}</Button>;
}
