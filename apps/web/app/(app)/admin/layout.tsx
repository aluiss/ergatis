import { notFound } from 'next/navigation';
import { AdminBreadcrumbs, AdminSidebar, AdminTabs } from '@/components/shell/admin-nav';
import { getSessionUser } from '@/lib/server-api';

/** Menu lateral a partir de `lg`; abas roláveis abaixo disso. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') notFound();
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
