import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Providers } from '@/components/providers';
import { BRAND } from '@/lib/brand';
import { installScript } from '@/lib/install-script';
import { themeScript } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${BRAND}: encontre quem resolve`, template: `%s | ${BRAND}` },
  description: 'Conectamos quem precisa de um serviço a profissionais da sua região, da troca de uma lâmpada ao conserto do carro.',
  applicationName: BRAND,
  // iPhone: abre sem a barra do Safari quando adicionado à Tela de Início.
  appleWebApp: { capable: true, title: BRAND, statusBarStyle: 'default' },
  formatDetection: { telephone: false },
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
    // O script do tema muda a classe do <html> antes da hidratação, de propósito.
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {/* beforeInteractive: vão no HTML inicial e rodam antes da hidratação (tema sem piscar,
            evento de instalação guardado). Um <script> cru aqui faria o React 19 reclamar. */}
        <Script id="ergatis-theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Script id="ergatis-install" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: installScript }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
