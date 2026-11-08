import { BadgeCheck, Crown, Star } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { date } from '@/lib/format';
import { publicGet } from '@/lib/server-api';

interface Profile {
  displayName: string; avatarFileId: string | null; portfolio: { id: string; caption: string | null }[] | null;
  headline: string; bio: string | null; city: string | null; state: string | null;
  verified: boolean; badge: boolean;
  rating: { average: number | null; total: number };
  latestReviews: { rating: number; comment: string | null; createdAt: string }[];
  completedServices: { title: string; city: string; state: string; completedAt: string }[] | null;
}

const load = (id: string) =>
  /^[0-9a-f-]{36}$/i.test(id) ? publicGet<Profile>(`/professionals/${id}`) : Promise.resolve(null);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = await load((await params).id);
  return p ? { title: p.displayName, description: p.headline } : {};
}

export default async function ProfessionalPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await load((await params).id);
  if (!p) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-start gap-4">
        <Avatar fileId={p.avatarFileId} name={p.displayName} className="size-20" />
        <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          {p.displayName}
          {p.badge && <Crown className="size-6 text-amber-500" aria-label="Selo Premium" />}
          {p.verified && <BadgeCheck className="text-primary size-6" aria-label="Verificado" />}
        </h1>
        <p className="text-muted-foreground mt-1">{p.headline}</p>
        <p className="mt-2 text-sm">
          {[p.city, p.state].filter(Boolean).join(' - ')}
          {p.rating.total > 0 && ` · nota ${p.rating.average?.toFixed(1)} em ${p.rating.total} avaliação(ões)`}
        </p>
        </div>
      </div>
      {p.bio && <p>{p.bio}</p>}

      {p.portfolio && p.portfolio.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Portfólio</CardTitle></CardHeader>
          <CardContent>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {p.portfolio.map((f) => (
                <li key={f.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${f.id}`} alt={f.caption ?? 'Imagem do portfólio'} loading="lazy" className="aspect-square w-full rounded-md object-cover" />
                  {f.caption && <p className="text-muted-foreground mt-1 text-xs">{f.caption}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {p.completedServices && (
        <Card>
          <CardHeader><CardTitle>Serviços realizados</CardTitle></CardHeader>
          <CardContent>
            {p.completedServices.length === 0 ? <p className="text-muted-foreground text-sm">Nenhum serviço concluído ainda.</p> : (
              <ul className="space-y-2 text-sm">
                {p.completedServices.map((s, i) => (
                  <li key={i} className="flex justify-between gap-4"><span>{s.title} ({s.city} - {s.state})</span><span className="text-muted-foreground shrink-0">{date(s.completedAt)}</span></li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Avaliações</CardTitle></CardHeader>
        <CardContent>
          {p.latestReviews.length === 0 ? <p className="text-muted-foreground text-sm">Ainda sem avaliações.</p> : (
            <ul className="space-y-3 text-sm">
              {p.latestReviews.map((r, i) => (
                <li key={i}>
                  <span className="flex items-center gap-1"><Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />{r.rating} · {date(r.createdAt)}</span>
                  {r.comment && <p className="text-muted-foreground mt-1">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
