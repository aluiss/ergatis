import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { BRAND } from '@/lib/brand';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${BRAND}: encontre quem resolve`, template: `%s | ${BRAND}` },
  description: 'Conectamos quem precisa de um serviço a profissionais da sua região, da troca de uma lâmpada ao conserto do carro.',
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
