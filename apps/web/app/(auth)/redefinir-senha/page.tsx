'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { toast } from 'sonner';
import { SubmitButton } from '@/components/submit-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

function ResetForm() {
  const token = useSearchParams().get('token');
  const router = useRouter();

  async function submit(form: FormData) {
    const { error } = await authClient.resetPassword({ newPassword: String(form.get('password')), token: token ?? '' });
    if (error) { toast.error('Link inválido ou expirado.'); return; }
    toast.success('Senha alterada.');
    router.push('/entrar');
  }

  return (
    <Card>
      <CardHeader><CardTitle>Nova senha</CardTitle></CardHeader>
      <CardContent>
        <form action={submit} className="space-y-4">
          <div className="space-y-1"><Label htmlFor="password">Nova senha</Label><Input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required /></div>
          <SubmitButton className="w-full" pendingLabel="Salvando...">Salvar</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export default function Reset() {
  return <Suspense><ResetForm /></Suspense>;
}
