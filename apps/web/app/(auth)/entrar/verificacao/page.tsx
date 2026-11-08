'use client';

import { KeyRound, Mail, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient, safeNext } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

type Method = 'app' | 'email' | 'backup';

const COPY: Record<Method, { title: string; hint: string }> = {
  app: { title: 'Código do app autenticador', hint: 'Abra o app autenticador (Google Authenticator, Microsoft Authenticator...) e digite os 6 números do Ergatis.' },
  email: { title: 'Código por e-mail', hint: 'Enviamos um código de 6 números para o seu e-mail. Ele vale por poucos minutos.' },
  backup: { title: 'Código de recuperação', hint: 'Use um dos códigos que você guardou ao ativar. Cada um vale uma vez só.' },
};

/** Traduz os erros do plugin para o que a pessoa pode fazer. */
function explain(error: { code?: string; status?: number; message?: string }) {
  const code = error.code ?? '';
  if (code.includes('TOO_MANY_ATTEMPTS')) return { message: 'Muitas tentativas. Entre de novo com sua senha.', restart: true };
  if (code.includes('INVALID_TWO_FACTOR_COOKIE') || error.status === 401) return { message: 'O tempo para digitar o código acabou. Entre de novo com sua senha.', restart: true };
  return { message: 'Código incorreto. Confira e tente de novo.', restart: false };
}

function Verify() {
  const next = safeNext(useSearchParams().get('next'));
  const [method, setMethod] = useState<Method>('app');
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(false);
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);
  const [restart, setRestart] = useState(false);

  async function verify(value = code) {
    const clean = method === 'backup' ? value.trim() : value.replace(/\D/g, '');
    if (!clean || pending) return;
    setPending(true);
    const call = method === 'app' ? authClient.twoFactor.verifyTotp({ code: clean, trustDevice: trust })
      : method === 'email' ? authClient.twoFactor.verifyOtp({ code: clean, trustDevice: trust })
        : authClient.twoFactor.verifyBackupCode({ code: clean, trustDevice: trust });
    const { error } = await call;
    if (!error) { window.location.href = next; return; }
    setPending(false);
    setCode('');
    const e = explain(error);
    toast.error(e.message);
    if (e.restart) setRestart(true);
  }

  async function sendEmail() {
    setSending(true);
    const { error } = await authClient.twoFactor.sendOtp();
    setSending(false);
    if (error) { const e = explain(error); toast.error(e.message); if (e.restart) setRestart(true); return; }
    toast.success('Código enviado para o seu e-mail.');
  }

  function choose(m: Method) {
    setMethod(m); setCode('');
    if (m === 'email') void sendEmail();
  }

  if (restart) {
    return (
      <Card>
        <CardHeader><CardTitle>Entre de novo</CardTitle><CardDescription>Por segurança, a verificação foi encerrada.</CardDescription></CardHeader>
        <CardContent><Button asChild className="h-11 w-full"><Link href={`/entrar?${new URLSearchParams({ next })}`}>Voltar para o login</Link></Button></CardContent>
      </Card>
    );
  }

  const numeric = method !== 'backup';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirme que é você</CardTitle>
        <CardDescription>Sua conta usa login em duas etapas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="code">{COPY[method].title}</Label>
            <p className="text-muted-foreground text-sm">{COPY[method].hint}</p>
            <Input
              id="code" value={code} autoFocus disabled={pending}
              inputMode={numeric ? 'numeric' : 'text'} autoComplete="one-time-code" autoCapitalize="none" spellCheck={false}
              maxLength={numeric ? 6 : 24} placeholder={numeric ? '000000' : 'xxxxx-xxxxx'}
              className={cn('h-14 text-center text-2xl font-semibold', numeric && 'tracking-[0.5em]')}
              onChange={(e) => {
                const v = numeric ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value;
                setCode(v);
                // Seis dígitos: envia sozinho, sem precisar procurar o botão.
                if (numeric && v.length === 6) void verify(v);
              }}
            />
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="size-5" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
            Confiar neste aparelho por 30 dias
          </label>
          <Button className="h-12 w-full text-base" loading={pending}>Confirmar</Button>
        </form>

        <div className="space-y-2 border-t pt-4">
          <p className="text-muted-foreground text-sm">Sem acesso ao app?</p>
          <div className="grid gap-2">
            {method !== 'app' && <Button variant="outline" className="h-11 justify-start" onClick={() => choose('app')}><Smartphone /> Usar o app autenticador</Button>}
            {method !== 'email' && <Button variant="outline" className="h-11 justify-start" loading={sending} onClick={() => choose('email')}><Mail /> Receber código por e-mail</Button>}
            {method === 'email' && <Button variant="ghost" className="h-11 justify-start" loading={sending} onClick={() => void sendEmail()}><Mail /> Enviar outro código</Button>}
            {method !== 'backup' && <Button variant="outline" className="h-11 justify-start" onClick={() => choose('backup')}><KeyRound /> Usar um código de recuperação</Button>}
          </div>
          <p className="text-muted-foreground text-xs">Perdeu o celular e os códigos? Fale com o suporte: depois de confirmar sua identidade, a equipe desativa o login em duas etapas.</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function VerifyPage() { return <Suspense><Verify /></Suspense>; }
