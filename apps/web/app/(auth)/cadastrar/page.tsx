'use client';

import { LEGAL_VERSION } from '@ergatis/shared';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

export default function Register() {
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(form: FormData) {
    setPending(true);
    const email = String(form.get('email'));
    const { error } = await authClient.signUp.email({
      name: String(form.get('name')), email, password: String(form.get('password')), callbackURL: '/painel',
      termsVersion: LEGAL_VERSION,
    });
    setPending(false);
    if (error) { toast.error(error.message ?? 'Não foi possível criar a conta.'); return; }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <Card>
        <CardHeader><CardTitle>Confirme seu e-mail</CardTitle></CardHeader>
        <CardContent><p className="text-sm">Enviamos um link de confirmação para <b>{sentTo}</b>. Abra-o para ativar sua conta.</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Criar conta</CardTitle></CardHeader>
      <CardContent>
        <form action={submit} className="space-y-4">
          <div className="space-y-1"><Label htmlFor="name">Nome completo</Label><Input id="name" name="name" autoComplete="name" minLength={2} required /></div>
          <div className="space-y-1"><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
          <div className="space-y-1"><Label htmlFor="password">Senha (mínimo de 8 caracteres)</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="accept" className="mt-0.5" required />
            <span>Tenho 18 anos ou mais e aceito os <Link className="text-primary" href="/termos" target="_blank">Termos de Uso</Link> e a <Link className="text-primary" href="/privacidade" target="_blank">Política de Privacidade</Link>.</span>
          </label>
          <Button className="w-full" loading={pending}>{pending ? 'Criando...' : 'Criar conta'}</Button>
        </form>
        <p className="mt-4 text-sm">Já tem conta? <Link className="text-primary" href="/entrar">Entrar</Link></p>
      </CardContent>
    </Card>
  );
}
