import { redirect } from 'next/navigation';
import { AppNav } from '@/components/app-nav';
import { getSessionUser } from '@/lib/server-api';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/entrar');
  return (
    <>
      <AppNav isAdmin={user.role === 'admin'} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
