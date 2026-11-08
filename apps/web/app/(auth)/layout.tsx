import Link from 'next/link';
import { Logo } from '@/components/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/50 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Link href="/" aria-label="Página inicial"><Logo size={36} /></Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
