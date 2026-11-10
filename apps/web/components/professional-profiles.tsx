'use client';

import { MAX_PROFESSIONAL_PROFILES } from '@ergatis/shared';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { pendingFor, useAction } from '@/components/app-ui';
import { ConfirmAction } from '@/components/confirm-action';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DESKTOP, useMediaQuery } from '@/hooks/use-media-query';
import { api } from '@/lib/api';

interface Category { id: string; name: string; parentId: string | null }
export interface ProfessionalProfile { id: string; title: string; serviceRadiusKm: number; categoryIds: string[] }

const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') });

/**
 * Título, raio e categorias de um perfil. Categorias de outros perfis da pessoa ficam
 * desabilitadas com o nome do perfil: a regra "uma categoria, um perfil" aparece antes do erro.
 */
function ProfileForm({ initial, others, submitLabel, pending, onSubmit }: {
  initial?: ProfessionalProfile; others: ProfessionalProfile[]; submitLabel: string; pending: boolean;
  onSubmit: (body: { title: string; serviceRadiusKm: number; categoryIds: string[] }) => void;
}) {
  const categories = useCategories();
  const groups = categories.data?.filter((c) => !c.parentId) ?? [];
  const usedBy = new Map(others.flatMap((p) => p.categoryIds.map((id) => [id, p.title] as const)));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit({ title: String(f.get('title')), serviceRadiusKm: Number(f.get('radius')), categoryIds: f.getAll('categoryIds').map(String) });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={`title-${initial?.id ?? 'new'}`}>Título</Label>
        <Input id={`title-${initial?.id ?? 'new'}`} name="title" minLength={5} maxLength={120} defaultValue={initial?.title}
          placeholder="Ex.: Eletricista residencial" required className="h-11 sm:h-9" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`radius-${initial?.id ?? 'new'}`}>Raio de atendimento (km)</Label>
        <Input id={`radius-${initial?.id ?? 'new'}`} name="radius" type="number" inputMode="numeric" min={1} max={300}
          defaultValue={initial?.serviceRadiusKm ?? 20} required className="h-11 sm:h-9" />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Categorias que este perfil atende</legend>
        {groups.map((g) => (
          <div key={g.id} className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{g.name}</p>
            <div className="grid gap-x-3 sm:grid-cols-2">
              {categories.data?.filter((c) => c.parentId === g.id).map((c) => {
                const taken = usedBy.get(c.id);
                return (
                  <label key={c.id} className={`flex min-h-10 items-center gap-2 text-sm ${taken ? 'text-muted-foreground' : ''}`}>
                    <input type="checkbox" name="categoryIds" value={c.id} className="size-5" disabled={!!taken}
                      defaultChecked={initial?.categoryIds.includes(c.id)} />
                    {c.name}{taken && <span className="text-xs">(em “{taken}”)</span>}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>
      <Button className="h-11 w-full sm:w-auto" loading={pending}>{submitLabel}</Button>
    </form>
  );
}

/** Perfis profissionais da pessoa (especialidades). Sem nenhum, mostra a entrada "Quero oferecer serviços". */
export function ProfessionalProfiles({ profiles }: { profiles: ProfessionalProfile[] | null }) {
  const desktop = useMediaQuery(DESKTOP);
  const categories = useCategories();
  const [editing, setEditing] = useState<ProfessionalProfile | 'new' | null>(null);
  const keys = { invalidate: ['me', 'professional-profiles'] };
  const become = useAction((body: object) => api('/professionals/me', { method: 'PUT', body }), { ...keys, success: 'Perfil profissional criado.' });
  const create = useAction((body: object) => api('/professionals/me/profiles', { body }), { ...keys, success: 'Perfil adicionado.', onDone: () => setEditing(null) });
  const update = useAction(({ id, body }: { id: string; body: object }) => api(`/professionals/me/profiles/${id}`, { method: 'PUT', body }),
    { ...keys, success: 'Perfil salvo.', onDone: () => setEditing(null) });
  const remove = useAction((id: string) => api(`/professionals/me/profiles/${id}`, { method: 'DELETE' }), { ...keys, success: 'Perfil removido.' });
  const names = new Map(categories.data?.map((c) => [c.id, c.name]));

  if (!profiles || profiles.length === 0) {
    return (
      <Card id="perfil-profissional" className="scroll-mt-20">
        <CardHeader><CardTitle>Oferecer serviços</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 text-sm">Crie seu primeiro perfil profissional. Depois, você pode ter até {MAX_PROFESSIONAL_PROFILES} perfis, um para cada especialidade.</p>
          <ProfileForm others={[]} submitLabel="Quero oferecer serviços" pending={become.isPending} onSubmit={(body) => become.mutate(body)} />
        </CardContent>
      </Card>
    );
  }

  const current = editing === 'new' ? undefined : editing ?? undefined;
  return (
    <Card id="perfil-profissional" className="scroll-mt-20">
      <CardHeader><CardTitle>Perfis profissionais</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">Cada perfil é uma especialidade, com título, categorias e raio próprios. O cliente vê o título do perfil que combina com o pedido dele.</p>
        <ul className="divide-y rounded-lg border">
          {profiles.map((p) => (
            <li key={p.id} className="flex items-start gap-3 p-3">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{p.title}</p>
                <p className="text-muted-foreground">{p.categoryIds.map((id) => names.get(id)).filter(Boolean).join(', ')}</p>
                <p className="text-muted-foreground flex items-center gap-1 text-xs"><MapPin className="size-3.5" aria-hidden /> até {p.serviceRadiusKm} km</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" className="size-10" aria-label={`Editar ${p.title}`} onClick={() => setEditing(p)}><Pencil /></Button>
                {profiles.length > 1 && (
                  <ConfirmAction
                    title={`Remover o perfil “${p.title}”?`}
                    description="Você deixa de receber oportunidades das categorias dele. Propostas já enviadas continuam valendo."
                    confirmLabel="Remover perfil" destructive onConfirm={() => remove.mutateAsync(p.id)}
                  >
                    <Button size="icon" variant="ghost" className="size-10" aria-label={`Remover ${p.title}`} loading={pendingFor(remove, (v) => v === p.id)}><Trash2 /></Button>
                  </ConfirmAction>
                )}
              </div>
            </li>
          ))}
        </ul>
        {profiles.length < MAX_PROFESSIONAL_PROFILES ? (
          <Button variant="outline" className="h-11 w-full sm:h-9 sm:w-auto" onClick={() => setEditing('new')}><Plus /> Adicionar perfil</Button>
        ) : <p className="text-muted-foreground text-xs">Você está no limite de {MAX_PROFESSIONAL_PROFILES} perfis.</p>}

        <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <SheetContent side={desktop ? 'right' : 'bottom'} className="sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>{editing === 'new' ? 'Novo perfil profissional' : 'Editar perfil'}</SheetTitle>
              <SheetDescription>Uma categoria fica em um só perfil.</SheetDescription>
            </SheetHeader>
            {editing && (
              <ProfileForm
                key={editing === 'new' ? 'new' : editing.id}
                initial={current} others={profiles.filter((p) => p.id !== current?.id)}
                submitLabel={editing === 'new' ? 'Adicionar perfil' : 'Salvar'}
                pending={create.isPending || update.isPending}
                onSubmit={(body) => (editing === 'new' ? create.mutate(body) : update.mutate({ id: editing.id, body }))}
              />
            )}
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
}
