'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAction } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

interface Category { id: string; name: string; parentId: string | null }

export default function NewRequest() {
  const router = useRouter();
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') });
  const groups = categories.data?.filter((c) => !c.parentId) ?? [];

  const create = useAction(async (form: FormData) => {
    const budget = Number(String(form.get('budget')).replace(',', '.'));
    const created = await api<{ id: string }>('/requests', {
      body: {
        categoryId: form.get('categoryId'), title: form.get('title'), description: form.get('description'),
        city: form.get('city'), state: form.get('state'), urgent: form.get('urgent') === 'on',
        budgetCents: budget > 0 ? Math.round(budget * 100) : undefined,
      },
    });
    router.push(`/pedidos/${created.id}`);
  }, { invalidate: ['requests'], success: 'Pedido publicado.' });

  return (
    <form action={(f) => create.mutate(f)} className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Novo pedido</h1>
      <div className="space-y-1">
        <Label htmlFor="categoryId">Categoria</Label>
        <Select id="categoryId" name="categoryId" required defaultValue="">
          <option value="" disabled>Selecione</option>
          {groups.map((g) => (
            <optgroup key={g.id} label={g.name}>
              {categories.data?.filter((c) => c.parentId === g.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </Select>
      </div>
      <div className="space-y-1"><Label htmlFor="title">O que você precisa?</Label><Input id="title" name="title" minLength={5} maxLength={140} placeholder="Ex.: trocar lâmpada da sala" required /></div>
      <div className="space-y-1"><Label htmlFor="description">Detalhes</Label><Textarea id="description" name="description" minLength={10} maxLength={4000} required /></div>
      <div className="grid grid-cols-[1fr_5rem] gap-3">
        <div className="space-y-1"><Label htmlFor="city">Cidade</Label><Input id="city" name="city" required /></div>
        <div className="space-y-1"><Label htmlFor="state">UF</Label><Input id="state" name="state" minLength={2} maxLength={2} required /></div>
      </div>
      <div className="space-y-1"><Label htmlFor="budget">Orçamento estimado em R$ (opcional)</Label><Input id="budget" name="budget" inputMode="decimal" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="urgent" /> É urgente</label>
      <Button loading={create.isPending} className="w-full sm:w-auto">{create.isPending ? 'Publicando...' : 'Publicar pedido'}</Button>
    </form>
  );
}
