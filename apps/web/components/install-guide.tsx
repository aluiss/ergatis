'use client';

import { CheckCircle2, Copy, Download, EllipsisVertical, Share, Share2, SquarePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { QrCode } from '@/components/qr-code';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { BRAND } from '@/lib/brand';
import { useInstall } from '@/lib/install';

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

const Key = ({ children }: { children: React.ReactNode }) => (
  <span className="bg-muted inline-flex items-center gap-1 rounded px-1.5 py-0.5 align-middle text-sm font-medium">{children}</span>
);

/**
 * Como instalar o Ergatis no aparelho que está aberto agora. Instalado, ele abre
 * pelo ícone da tela inicial, sem a barra do navegador, como um aplicativo.
 */
export function InstallGuide() {
  const { platform, installed, canPrompt, install } = useInstall();
  const [link, setLink] = useState('');
  const [installing, setInstalling] = useState(false);
  useEffect(() => { setLink(`${window.location.origin}/instalar`); }, []);

  async function onInstall() {
    setInstalling(true);
    try {
      const outcome = await install();
      if (outcome === 'accepted') toast.success(`Pronto! O ${BRAND} está na sua tela inicial.`);
    } finally {
      setInstalling(false);
    }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); toast.success('Link copiado.'); }
    catch { toast.error('Não deu para copiar. Selecione o link e copie manualmente.'); }
  }

  async function share() {
    try { await navigator.share({ title: BRAND, text: `Instale o ${BRAND} no celular:`, url: link }); }
    catch { /* a pessoa fechou o menu de compartilhar */ }
  }

  if (platform === 'unknown') return <Skeleton className="h-40" />;

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <div className="space-y-5">
      {installed ? (
        <p className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
          Você já está usando o {BRAND} instalado. Para abrir de novo, toque no ícone dele na tela inicial.
        </p>
      ) : (
        <>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            <li>Abre direto pelo ícone, em tela cheia, sem a barra do navegador.</li>
            <li>Segure o ícone para ir direto a Novo pedido, Mensagens ou Oportunidades.</li>
            <li>Não ocupa espaço como um app de loja: atualiza sozinho.</li>
          </ul>

          {canPrompt && (
            <Button size="lg" className="h-12 w-full text-base sm:w-auto" loading={installing} onClick={() => void onInstall()}>
              <Download /> Instalar o {BRAND}
            </Button>
          )}

          {platform === 'ios' && (
            <div className="space-y-3">
              <p className="font-medium">No iPhone ou iPad, pelo Safari:</p>
              <ol className="space-y-3 text-sm">
                <Step n={1}>Toque em <Key><Share className="size-4" aria-hidden /> Compartilhar</Key>, na barra de baixo (ou de cima, no iPad).</Step>
                <Step n={2}>Role as opções e toque em <Key><SquarePlus className="size-4" aria-hidden /> Adicionar à Tela de Início</Key>.</Step>
                <Step n={3}>Confirme em <Key>Adicionar</Key>. O ícone do {BRAND} aparece junto dos seus apps.</Step>
              </ol>
              <p className="text-muted-foreground text-xs">Abriu este link pelo WhatsApp ou Instagram? Toque nos três pontos e escolha “Abrir no Safari” antes.</p>
            </div>
          )}

          {platform === 'android' && !canPrompt && (
            <div className="space-y-3">
              <p className="font-medium">No Android, pelo Chrome:</p>
              <ol className="space-y-3 text-sm">
                <Step n={1}>Toque no menu <Key><EllipsisVertical className="size-4" aria-hidden /></Key>, no canto de cima.</Step>
                <Step n={2}>Escolha <Key>Instalar app</Key> ou <Key>Adicionar à tela inicial</Key>.</Step>
                <Step n={3}>Confirme. O ícone do {BRAND} aparece na tela inicial.</Step>
              </ol>
            </div>
          )}
        </>
      )}

      {platform === 'desktop' && !installed && (
        <div className="flex flex-col items-center gap-4 rounded-xl border p-4 sm:flex-row">
          {link && <QrCode value={link} label={`Código QR com o link de instalação do ${BRAND}`} />}
          <div className="space-y-2 text-sm">
            <p className="font-medium">Instale no celular</p>
            <p className="text-muted-foreground">Aponte a câmera do celular para o código. O link abre as instruções certas para o aparelho.</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Link de instalação</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            readOnly value={link} aria-label="Link de instalação" onFocus={(e) => e.currentTarget.select()}
            className="bg-muted/50 h-11 min-w-0 sm:h-9 sm:flex-1"
          />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" className="h-11 sm:h-9" onClick={() => void copy()}><Copy /> Copiar</Button>
            {canShare && <Button variant="outline" className="h-11 sm:h-9" onClick={() => void share()}><Share2 /> Enviar</Button>}
          </div>
        </div>
        <p className="text-muted-foreground text-xs">Mande para você mesmo pelo WhatsApp ou e-mail e abra no celular.</p>
      </div>
    </div>
  );
}
