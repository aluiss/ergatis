import { BadgeCheck, Crown, Star } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Avatar } from '@/components/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { publicGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Profissionais' };

interface Item {
  userId: string; profileId: string; displayName: string; avatarFileId: string | null; headline: string; city: string | null; state: string | null;
  verified: boolean; highlighted: boolean; badge: boolean; ratingAverage: number | null; ratingTotal: number;
}
interface Result { items: Item[]; total: number; page: number; pageSize: number }
interface Category { id: string; name: string; parentId: string | null }

type Search = { q?: string; categoryId?: string; city?: string; state?: string; page?: string };

export default async function Professionals({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const [result, categories] = await Promise.all([
    publicGet<Result>(`/professionals?${query}`),
    publicGet<Category[]>('/categories', 300),
  ]);
  const page = result?.page ?? 1;
  const pages = result ? Math.ceil(result.total / result.pageSize) : 1;
  const pageLink = (n: number) => { const q = new URLSearchParams(query); q.set('page', String(n)); return `/profissionais?${q}`; };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold">Profissionais</h1>
      <form className="mt-6 grid grid-cols-[1fr_5rem] gap-3 sm:grid-cols-[1.2fr_1fr_1fr_5rem_auto]">
        {/* Nome do profissional: para achar alguém já indicado ou com quem já trabalhou. */}
        <Input name="q" type="search" placeholder="Nome do profissional" defaultValue={params.q} aria-label="Nome do profissional" className="col-span-2 h-11 sm:col-span-1 sm:h-9" />
        <Select name="categoryId" defaultValue={params.categoryId ?? ''} aria-label="Categoria" className="col-span-2 h-11 sm:col-span-1 sm:h-9">
          <option value="">Todas as categorias</option>
          {categories?.filter((c) => c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input name="city" placeholder="Cidade" defaultValue={params.city} aria-label="Cidade" className="h-11 sm:h-9" />
        <Input name="state" placeholder="UF" maxLength={2} defaultValue={params.state} aria-label="UF" className="h-11 sm:h-9" />
        <Button type="submit" className="col-span-2 h-11 sm:col-span-1 sm:h-9">Buscar</Button>
      </form>

      <p className="text-muted-foreground mt-6 text-sm">{result?.total ?? 0} encontrado(s)</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result?.items.map((p) => (
          // Um cartão por perfil: a mesma pessoa pode aparecer como "Eletricista" e como "Pintor".
          <Link key={p.profileId} href={`/profissionais/${p.userId}`}>
            <Card className={p.highlighted ? 'border-primary h-full' : 'h-full'}>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Avatar fileId={p.avatarFileId} name={p.displayName} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-medium">{p.displayName}</h2>
                      {p.badge && <Crown className="size-4 shrink-0 text-amber-500" aria-label="Selo Premium" />}
                      {p.verified && <BadgeCheck className="text-primary size-4 shrink-0" aria-label="Verificado" />}
                    </div>
                    <p className="text-muted-foreground text-sm">{p.headline}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span>{[p.city, p.state].filter(Boolean).join(' - ') || 'Local não informado'}</span>
                  {p.ratingTotal > 0 ? (
                    <span className="flex items-center gap-1"><Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />{p.ratingAverage?.toFixed(1)} ({p.ratingTotal})</span>
                  ) : <Badge variant="secondary">Novo</Badge>}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Paginação">
          {page > 1 && <Button asChild variant="outline"><Link href={pageLink(page - 1)}>Anterior</Link></Button>}
          <span className="text-sm">Página {page} de {pages}</span>
          {page < pages && <Button asChild variant="outline"><Link href={pageLink(page + 1)}>Próxima</Link></Button>}
        </nav>
      )}
    </div>
  );
}
