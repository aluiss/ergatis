'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

function LoginForm() {
  const params = useSearchParams();
  const [pending, setPending] = useState(false);

  async function submit(form: FormData) {
    setPending(true);
    const { error } = await authClient.signIn.email({
      email: String(form.get('email')), password: String(form.get('password')),
    });
    setPending(false);
    if (error) {
      toast.error(error.status === 403 ? 'Confirme seu e-mail antes de entrar.' : 'E-mail ou senha incorretos.');
      return;
    }
    const next = params.get('next');
    window.location.href = next?.startsWith('/') && !next.startsWith('//') ? next : '/painel';
  }

  return (
    <Card>
      <CardHeader><CardTitle>Entrar</CardTitle></CardHeader>
      <CardContent>
        <form action={submit} className="space-y-4">
          <div className="space-y-1"><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
          <div className="space-y-1"><Label htmlFor="password">Senha</Label><Input id="password" name="password" type="password" autoComplete="current-password" required /></div>
          <Button className="w-full" disabled={pending}>{pending ? 'Entrando...' : 'Entrar'}</Button>
        </form>
        <div className="mt-4 flex justify-between text-sm">
          <Link className="text-primary" href="/esqueci-senha">Esqueci a senha</Link>
          <Link className="text-primary" href="/cadastrar">Criar conta</Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Login() {
  return <Suspense><LoginForm /></Suspense>;
}
