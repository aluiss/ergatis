'use client';

import { CheckCircle2, Copy, Download, ExternalLink, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { QrCode } from '@/components/qr-code';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DESKTOP, useMediaQuery } from '@/hooks/use-media-query';
import { authClient } from '@/lib/auth-client';
import { BRAND } from '@/lib/brand';

type Step = 'password' | 'app' | 'confirm' | 'codes';
type Flow = { kind: 'enable' | 'codes' | 'disable'; step: Step };

/** "JBSWY3DPEHPK3PXP" -> "JBSW Y3DP EHPK 3PXP": mais fácil de digitar à mão no app. */
const groupKey = (uri: string) => (new URL(uri).searchParams.get('secret') ?? '').replace(/(.{4})/g, '$1 ').trim();

function BackupCodes({ codes }: { codes: string[] }) {
  const text = codes.join('\n');
  async function copy() {
    try { await navigator.clipboard.writeText(text); toast.success('Códigos copiados.'); } catch { toast.error('Não deu para copiar.'); }
  }
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`Códigos de recuperação do ${BRAND}\nCada código vale uma vez.\n\n${text}\n`], { type: 'text/plain' }));
    a.download = `codigos-recuperacao-${BRAND.toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <div className="space-y-3">
      <ul className="bg-muted grid grid-cols-2 gap-2 rounded-lg p-3 font-mono text-sm">
        {codes.map((c) => <li key={c} className="text-center select-all">{c}</li>)}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" onClick={() => void copy()}><Copy /> Copiar</Button>
        <Button variant="outline" className="h-11" onClick={download}><Download /> Baixar</Button>
      </div>
    </div>
  );
}

/** Login em duas etapas: ativar, gerar novos códigos de recuperação e desativar. */
export function TwoFactorCard({ recommended = false, required = false }: { recommended?: boolean; required?: boolean }) {
  const session = authClient.useSession();
  const desktop = useMediaQuery(DESKTOP);
  const enabled = !!(session.data?.user as { twoFactorEnabled?: boolean | null } | undefined)?.twoFactorEnabled;

  const [flow, setFlow] = useState<Flow | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [uri, setUri] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const close = () => { if (pending) return; setFlow(null); setPassword(''); setCode(''); setUri(''); setCodes([]); setSaved(false); };
  const fail = (message?: string) => { setPending(false); toast.error(message ?? 'Não foi possível concluir.'); };

  async function submitPassword() {
    if (!flow || !password) return;
    setPending(true);
    if (flow.kind === 'enable') {
      const { data, error } = await authClient.twoFactor.enable({ password, issuer: BRAND });
      if (error) return fail(error.status === 400 || error.status === 401 ? 'Senha incorreta.' : error.message);
      if (!('totpURI' in data)) return fail('Não foi possível gerar a chave do app autenticador.');
      setUri(data.totpURI); setCodes(data.backupCodes); setFlow({ kind: 'enable', step: 'app' });
    } else if (flow.kind === 'codes') {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
      if (error) return fail(error.status === 400 || error.status === 401 ? 'Senha incorreta.' : error.message);
      setCodes(data.backupCodes); setFlow({ kind: 'codes', step: 'codes' });
    } else {
      const { error } = await authClient.twoFactor.disable({ password });
      if (error) return fail(error.status === 400 || error.status === 401 ? 'Senha incorreta.' : error.message);
      toast.success('Login em duas etapas desativado.');
      await session.refetch();
      setPending(false); close(); return;
    }
    setPending(false); setPassword('');
  }

  async function confirmCode(value = code) {
    if (value.length !== 6 || pending) return;
    setPending(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: value });
    if (error) { setCode(''); return fail('Código incorreto. Confira se o relógio do celular está certo e tente de novo.'); }
    setPending(false);
    setFlow({ kind: 'enable', step: 'codes' });
  }

  async function finish() {
    await session.refetch();
    toast.success(flow?.kind === 'enable' ? 'Login em duas etapas ativado.' : 'Novos códigos salvos.');
    close();
  }

  const titles: Record<Flow['kind'], string> = { enable: 'Ativar login em duas etapas', codes: 'Novos códigos de recuperação', disable: 'Desativar login em duas etapas' };

  return (
    <Card id="seguranca" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {enabled ? <ShieldCheck className="size-5 text-emerald-600" aria-hidden /> : <ShieldOff className="text-muted-foreground size-5" aria-hidden />}
          Login em duas etapas
          <Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? 'Ativo' : 'Desativado'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Além da senha, pedimos um código do app autenticador do seu celular. Se alguém descobrir sua senha, ainda assim não entra.
        </p>
        {(required || recommended) && !enabled && (
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {required
              ? 'Obrigatório para a equipe: a administração só abre depois de ativar.'
              : 'Recomendado para a equipe: sua conta acessa dados de outras pessoas.'}
          </p>
        )}
        {session.isPending ? null : enabled ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="h-11 sm:h-9" onClick={() => setFlow({ kind: 'codes', step: 'password' })}><KeyRound /> Gerar novos códigos de recuperação</Button>
            <Button variant="ghost" className="text-destructive h-11 sm:h-9" onClick={() => setFlow({ kind: 'disable', step: 'password' })}>Desativar</Button>
          </div>
        ) : (
          <Button className="h-11 w-full sm:h-9 sm:w-auto" onClick={() => setFlow({ kind: 'enable', step: 'password' })}><ShieldCheck /> Ativar</Button>
        )}
      </CardContent>

      <Sheet open={!!flow} onOpenChange={(o) => !o && close()}>
        <SheetContent side={desktop ? 'right' : 'bottom'} className="sm:max-w-md">
          {flow && (
            <>
              <SheetHeader>
                <SheetTitle>{titles[flow.kind]}</SheetTitle>
                {flow.kind === 'enable' && <SheetDescription>Passo {['password', 'app', 'confirm', 'codes'].indexOf(flow.step) + 1} de 4</SheetDescription>}
              </SheetHeader>

              {flow.step === 'password' && (
                <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submitPassword(); }}>
                  <p className="text-sm">
                    {flow.kind === 'disable'
                      ? `Sem o segundo fator, quem souber sua senha consegue entrar.${recommended ? ' Se a regra da equipe estiver ligada, você também perde o acesso à administração.' : ''} Confirme com sua senha.`
                      : 'Por segurança, confirme sua senha.'}
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="tf-password">Senha</Label>
                    <Input id="tf-password" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
                  </div>
                  <Button className="h-12 w-full text-base" variant={flow.kind === 'disable' ? 'destructive' : 'default'} loading={pending} disabled={!password}>
                    {flow.kind === 'disable' ? 'Desativar' : 'Continuar'}
                  </Button>
                </form>
              )}

              {flow.step === 'app' && uri && (
                <div className="space-y-4 text-sm">
                  <p>Adicione o {BRAND} ao seu app autenticador. Se ainda não tem um, instale o Google Authenticator ou o Microsoft Authenticator.</p>
                  {/* No celular, o QR na própria tela não serve: o link abre o app direto. */}
                  <Button asChild className="h-12 w-full text-base lg:hidden"><a href={uri}><ExternalLink /> Abrir no app autenticador</a></Button>
                  <div className="flex justify-center"><QrCode value={uri} size={desktop ? 200 : 160} label="Código QR para o app autenticador" /></div>
                  <p className="text-muted-foreground text-center text-xs">{desktop ? 'Escaneie com o app autenticador do celular.' : 'Ou escaneie de outro aparelho.'}</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="tf-key">Ou digite a chave no app</Label>
                    <div className="flex gap-2">
                      <Input id="tf-key" readOnly value={groupKey(uri)} className="h-11 font-mono" onFocus={(e) => e.currentTarget.select()} />
                      <Button variant="outline" size="icon" className="size-11" aria-label="Copiar chave"
                        onClick={() => void navigator.clipboard.writeText(groupKey(uri).replace(/\s/g, '')).then(() => toast.success('Chave copiada.'))}><Copy /></Button>
                    </div>
                  </div>
                  <Button className="h-12 w-full text-base" onClick={() => setFlow({ kind: 'enable', step: 'confirm' })}>Já adicionei</Button>
                </div>
              )}

              {flow.step === 'confirm' && (
                <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void confirmCode(); }}>
                  <p className="text-sm">Digite o código de 6 números que aparece no app para o {BRAND}.</p>
                  <Input
                    aria-label="Código do app" value={code} autoFocus disabled={pending}
                    inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"
                    className="h-14 text-center text-2xl font-semibold tracking-[0.5em]"
                    onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) void confirmCode(v); }}
                  />
                  <Button className="h-12 w-full text-base" loading={pending} disabled={code.length !== 6}>Confirmar</Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => setFlow({ kind: 'enable', step: 'app' })}>Voltar</Button>
                </form>
              )}

              {flow.step === 'codes' && (
                <div className="space-y-4 text-sm">
                  {flow.kind === 'enable' && (
                    <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-5" aria-hidden /> App conectado</p>
                  )}
                  <p>
                    Guarde estes <b>códigos de recuperação</b> num lugar seguro, fora do celular. Se perder o celular, cada um permite entrar uma vez.
                    {flow.kind === 'codes' && ' Os códigos antigos deixaram de valer.'}
                  </p>
                  <BackupCodes codes={codes} />
                  <label className="flex min-h-11 items-center gap-3">
                    <input type="checkbox" className="size-5" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
                    Guardei meus códigos
                  </label>
                  <Button className="h-12 w-full text-base" disabled={!saved} onClick={() => void finish()}>Concluir</Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}
