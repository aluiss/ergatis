import type { ResolvedAccess } from '@ergatis/shared';
import { redirect } from 'next/navigation';
import { AccessProvider } from '@/components/access-provider';
import { AppShell } from '@/components/shell/app-shell';
import { authedGet, getSessionUser } from '@/lib/server-api';

interface Me { profile: { displayName: string; avatarFileId: string | null }; professional: object | null }

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/entrar');
  // Buscados aqui para o menu já chegar certo (cliente/profissional, o que a equipe pode ver), sem piscar.
  const [me, access] = await Promise.all([authedGet<Me>('/me'), authedGet<ResolvedAccess>('/me/access')]);
  return (
    <AccessProvider access={access}>
      <AppShell
        user={{ name: me?.profile.displayName ?? user.name, email: user.email, avatarFileId: me?.profile.avatarFileId ?? null }}
        ctx={{ isStaff: !!access?.isStaff, isProfessional: !!me?.professional, access }}
      >
        {children}
      </AppShell>
    </AccessProvider>
  );
}
