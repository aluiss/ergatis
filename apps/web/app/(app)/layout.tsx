import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { authedGet, getSessionUser } from '@/lib/server-api';

interface Me { profile: { displayName: string; avatarFileId: string | null }; professional: object | null }

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/entrar');
  // Buscado aqui para o menu já chegar certo (cliente ou profissional), sem piscar.
  const me = await authedGet<Me>('/me');
  return (
    <AppShell
      user={{ name: me?.profile.displayName ?? user.name, email: user.email, avatarFileId: me?.profile.avatarFileId ?? null }}
      ctx={{ isAdmin: user.role === 'admin', isProfessional: !!me?.professional }}
    >
      {children}
    </AppShell>
  );
}
