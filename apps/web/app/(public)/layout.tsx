import { SiteFooter, SiteHeader } from '@/components/site-header';

// Renderiza sob demanda: o build não pode depender da API no ar. O fetch mantém cache por revalidate.
export const dynamic = 'force-dynamic';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <><SiteHeader /><main>{children}</main><SiteFooter /></>;
}
