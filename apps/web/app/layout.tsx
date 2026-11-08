import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import { BRAND } from '@/lib/brand';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${BRAND}: encontre quem resolve`, template: `%s | ${BRAND}` },
  description: 'Conectamos quem precisa de um serviço a profissionais da sua região, da troca de uma lâmpada ao conserto do carro.',
};

/** `viewport-fit=cover` libera o uso de env(safe-area-inset-*) em aparelhos com entalhe. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#ffffff' }, { media: '(prefers-color-scheme: dark)', color: '#09090b' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
