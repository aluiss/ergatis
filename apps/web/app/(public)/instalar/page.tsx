import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { InstallGuide } from '@/components/install-guide';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Instalar no celular',
  description: `Instale o ${BRAND} na tela inicial do celular e use como um aplicativo.`,
};

/** Destino do link e do QR code das configurações: funciona sem login, no aparelho que abrir. */
export default function InstallPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <div className="flex items-center gap-4">
        <Image src="/icons/icon-192.png" alt="" width={64} height={64} className="rounded-2xl" priority />
        <div>
          <h1 className="text-2xl font-bold">Instale o {BRAND}</h1>
          <p className="text-muted-foreground text-sm">Abra pela tela inicial, como um aplicativo.</p>
        </div>
      </div>
      <InstallGuide />
      <Button asChild variant="ghost" className="w-full"><Link href="/painel">Continuar no navegador</Link></Button>
    </div>
  );
}
