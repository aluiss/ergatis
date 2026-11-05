import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/server-api';

const LINKS = [
  ['/admin', 'Visão geral'], ['/admin/usuarios', 'Usuários'], ['/admin/planos', 'Planos'],
  ['/admin/assinaturas', 'Assinaturas'], ['/admin/denuncias', 'Denúncias'],
  ['/admin/verificacoes', 'Verificações'], ['/admin/auditoria', 'Auditoria'],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') notFound();
  return (
    <div className="space-y-6">
      <nav className="flex gap-3 overflow-x-auto border-b pb-2 text-sm" aria-label="Administração">
        {LINKS.map(([href, label]) => <Link key={href} href={href} className="hover:text-primary whitespace-nowrap">{label}</Link>)}
      </nav>
      {children}
    </div>
  );
}
