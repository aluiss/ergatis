import { isStaffRole, type ResolvedAccess } from '@ergatis/shared';
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminBreadcrumbs, AdminSidebar, AdminTabs } from '@/components/shell/admin-nav';
import { Button } from '@/components/ui/button';
import { authedGet, getSessionUser } from '@/lib/server-api';

/** Menu lateral a partir de `lg`; abas roláveis abaixo disso. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // Qualquer papel de equipe entra; cada página e cada rota da API checam a permissão específica.
  if (!isStaffRole(user?.role)) notFound();

  // A API já barra cada rota; aqui só explicamos o porquê, em vez de mostrar erros soltos.
  const access = await authedGet<ResolvedAccess>('/me/access');
  if (access?.mustEnableTwoFactor) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-6 text-center">
        <ShieldAlert className="mx-auto size-12 text-amber-600" aria-hidden />
        <h1 className="text-2xl font-bold">Ative o login em duas etapas</h1>
        <p className="text-muted-foreground">
          Contas da equipe veem documentos e dados de outras pessoas. Por isso, a administração só abre com o login em duas etapas ativo.
          Leva dois minutos, com o app autenticador do celular.
        </p>
        <Button asChild className="h-12 w-full text-base"><Link href="/perfil#seguranca">Ativar agora</Link></Button>
        <p className="text-muted-foreground text-xs">O resto da sua conta continua funcionando normalmente.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-8">
      <AdminSidebar />
      <div className="min-w-0 flex-1 space-y-4">
        <AdminTabs />
        <AdminBreadcrumbs />
        {children}
      </div>
    </div>
  );
}
