import { BadgeCheck, ClipboardList, MessagesSquare, Star } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { publicGet } from '@/lib/server-api';

interface Category { id: string; name: string; parentId: string | null }

const STEPS = [
  { icon: ClipboardList, title: 'Descreva o que precisa', text: 'Publique seu pedido de graça, do menor reparo ao maior.' },
  { icon: MessagesSquare, title: 'Receba propostas', text: 'Profissionais da região enviam preço e conversam com você.' },
  { icon: BadgeCheck, title: 'Escolha com segurança', text: 'Compare avaliações e contrate quem fizer mais sentido.' },
  { icon: Star, title: 'Avalie o serviço', text: 'Sua nota ajuda outras pessoas a decidir.' },
];

export default async function Home() {
  const categories = (await publicGet<Category[]>('/categories', 300)) ?? [];
  const groups = categories.filter((c) => !c.parentId);

  return (
    <>
      <section className="bg-blue-50">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
          <h1 className="text-4xl font-bold sm:text-6xl">
            Conectamos você aos <span className="text-primary">melhores profissionais</span>
          </h1>
          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg">
            Da troca de uma lâmpada ao conserto do carro: encontre quem resolve perto de você. Para quem contrata, é sempre gratuito.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg"><Link href="/pedidos/novo">Publicar um pedido</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/profissionais">Buscar profissionais</Link></Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-semibold">Como funciona</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.title}>
              <s.icon className="text-primary size-7" aria-hidden />
              <h3 className="mt-3 font-medium">{s.title}</h3>
              <p className="text-muted-foreground mt-1 text-sm">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-6">
        <h2 className="text-2xl font-semibold">Categorias</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.id}>
              <h3 className="font-medium">{g.name}</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {categories.filter((c) => c.parentId === g.id).map((c) => (
                  <li key={c.id}><Link className="text-muted-foreground hover:text-primary" href={`/profissionais?categoryId=${c.id}`}>{c.name}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
