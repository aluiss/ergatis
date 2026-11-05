'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

export default function Forgot() {
  const [done, setDone] = useState(false);

  async function submit(form: FormData) {
    await authClient.requestPasswordReset({ email: String(form.get('email')), redirectTo: '/redefinir-senha' });
    setDone(true);
  }

  return (
    <Card>
      <CardHeader><CardTitle>Recuperar senha</CardTitle></CardHeader>
      <CardContent>
        {done ? <p className="text-sm">Se o e-mail estiver cadastrado, você receberá um link em instantes.</p> : (
          <form action={submit} className="space-y-4">
            <div className="space-y-1"><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" required /></div>
            <Button className="w-full">Enviar link</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
