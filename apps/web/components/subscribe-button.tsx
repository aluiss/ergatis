'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';

export function SubscribeButton({ planCode, planName }: { planCode: 'pro' | 'premium'; planName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cpfCnpj, setCpfCnpj] = useState('');

  const subscribe = useMutation({
    mutationFn: () => api<{ paymentUrl: string | null }>('/billing/subscribe', {
      body: { planCode, cpfCnpj: cpfCnpj.replace(/\D/g, '') },
    }),
    onSuccess: ({ paymentUrl }) => {
      if (paymentUrl) { window.location.href = paymentUrl; return; }
      toast.success(`Plano ${planName} ativado.`);
      router.push('/painel');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) { router.push('/entrar?next=/planos'); return; }
      toast.error(error.message);
    },
  });

  if (!open) return <Button className="w-full" onClick={() => setOpen(true)}>Assinar {planName}</Button>;

  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); subscribe.mutate(); }}>
      <Label htmlFor={`doc-${planCode}`}>CPF ou CNPJ para a cobrança</Label>
      <Input id={`doc-${planCode}`} inputMode="numeric" value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} required />
      <Button className="w-full" loading={subscribe.isPending}>{subscribe.isPending ? 'Processando...' : 'Continuar para o pagamento'}</Button>
    </form>
  );
}
