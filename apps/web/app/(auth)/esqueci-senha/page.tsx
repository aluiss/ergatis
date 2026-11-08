'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { SubmitButton } from '@/components/submit-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

export default function Forgot() {
  const [done, setDone] = useState(false);

  async function submit(form: FormData) {
    const { error } = await authClient.requestPasswordReset({ email: String(form.get('email')), redirectTo: '/redefinir-senha' });
    if (error) { toast.error(error.message ?? 'Não foi possível enviar o link. Tente de novo.'); return; }
    setDone(true);
  }

  return (
    <Card>
      <CardHeader><CardTitle>Recuperar senha</CardTitle></CardHeader>
      <CardContent>
        {done ? <p className="text-sm">Se o e-mail estiver cadastrado, você receberá um link em instantes.</p> : (
          <form action={submit} className="space-y-4">
            <div className="space-y-1"><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required /></div>
            <SubmitButton className="w-full" pendingLabel="Enviando...">Enviar link</SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
