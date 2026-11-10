import { SiteFooter, SiteHeader } from '@/components/site-header';
import { getSessionUser } from '@/lib/server-api';

// Renderiza sob demanda: o build não pode depender da API no ar. O fetch mantém cache por revalidate.
export const dynamic = 'force-dynamic';

/** Logado, o cabeçalho troca "Entrar/Cadastrar" por "Ir para o painel". */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser().catch(() => null);
  return <><SiteHeader signedIn={!!user} /><main>{children}</main><SiteFooter /></>;
}
