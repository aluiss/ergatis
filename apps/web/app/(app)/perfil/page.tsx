'use client';

import { useQuery } from '@tanstack/react-query';
import { ErrorState, Loading, useAction } from '@/components/app-ui';
import { ConfirmAction } from '@/components/confirm-action';
import { AvatarCard, PortfolioCard, VerificationCard } from '@/components/profile-files';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

interface Category { id: string; name: string; parentId: string | null }
interface Me {
  profile: { displayName: string; avatarFileId: string | null; emailNotifications: boolean; phone: string | null; bio: string | null; city: string | null; state: string | null };
  professional: { headline: string; serviceRadiusKm: number; verification: string; categoryIds: string[] } | null;
}

export default function Profile() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me') });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') });

  const save = useAction((f: FormData) => {
    const value = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    return api('/me', { method: 'PATCH', body: {
      displayName: value('displayName'), phone: value('phone'), bio: value('bio'), city: value('city'), state: value('state'),
      emailNotifications: f.get('emailNotifications') === 'on',
    } });
  }, { invalidate: ['me'], success: 'Perfil salvo.' });

  const setup = useAction((f: FormData) => api('/professionals/me', { method: 'PUT', body: {
    headline: f.get('headline'), serviceRadiusKm: Number(f.get('radius')), categoryIds: f.getAll('categoryIds'),
  } }), { invalidate: ['me'], success: 'Perfil profissional salvo.' });

  const remove = useAction(async () => {
    await api('/me', { method: 'DELETE' });
    await authClient.signOut().catch(() => undefined);
    window.location.href = '/';
  });

  const [exporting, setExporting] = useState(false);
  async function download() {
    setExporting(true);
    try {
    const blob = new Blob([JSON.stringify(await api('/me/export'), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'meus-dados-ergatis.json';
    a.click();
    URL.revokeObjectURL(a.href);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível baixar seus dados.');
    } finally {
      setExporting(false);
    }
  }

  if (me.isPending) return <Loading />;
  if (me.error) return <ErrorState error={me.error} />;
  const { profile: p, professional: pro } = me.data;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Perfil</h1>
      <AvatarCard fileId={p.avatarFileId} name={p.displayName} />
      <Card>
        <CardHeader><CardTitle>Dados pessoais</CardTitle></CardHeader>
        <CardContent>
          <form action={(f) => save.mutate(f)} className="space-y-3">
            <div className="space-y-1"><Label htmlFor="displayName">Nome de exibição</Label><Input id="displayName" name="displayName" defaultValue={p.displayName} required /></div>
            <div className="space-y-1"><Label htmlFor="phone">Telefone</Label><Input id="phone" name="phone" type="tel" defaultValue={p.phone ?? ''} placeholder="(11) 99999-9999" /></div>
            <div className="grid grid-cols-[1fr_5rem] gap-3">
              <div className="space-y-1"><Label htmlFor="city">Cidade</Label><Input id="city" name="city" defaultValue={p.city ?? ''} /></div>
              <div className="space-y-1"><Label htmlFor="state">UF</Label><Input id="state" name="state" maxLength={2} defaultValue={p.state ?? ''} /></div>
            </div>
            <div className="space-y-1"><Label htmlFor="bio">Sobre você</Label><Textarea id="bio" name="bio" maxLength={1000} defaultValue={p.bio ?? ''} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="emailNotifications" defaultChecked={p.emailNotifications} /> Receber avisos por e-mail</label>
            <Button loading={save.isPending}>Salvar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Perfil profissional</CardTitle></CardHeader>
        <CardContent>
          <form action={(f) => setup.mutate(f)} className="space-y-3">
            <div className="space-y-1"><Label htmlFor="headline">Título</Label><Input id="headline" name="headline" minLength={5} maxLength={120} defaultValue={pro?.headline} placeholder="Ex.: Eletricista residencial" required /></div>
            <div className="space-y-1"><Label htmlFor="radius">Raio de atendimento (km)</Label><Input id="radius" name="radius" type="number" min={1} max={300} defaultValue={pro?.serviceRadiusKm ?? 20} required /></div>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Categorias que você atende</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {categories.data?.filter((c) => c.parentId).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="categoryIds" value={c.id} defaultChecked={pro?.categoryIds.includes(c.id)} /> {c.name}</label>
                ))}
              </div>
            </fieldset>
            <Button loading={setup.isPending}>{pro ? 'Atualizar' : 'Quero oferecer serviços'}</Button>
          </form>
        </CardContent>
      </Card>

      {pro && <PortfolioCard />}
      {pro && <VerificationCard status={pro.verification} />}

      <Card>
        <CardHeader><CardTitle>Privacidade</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" loading={exporting} onClick={download}>Baixar meus dados</Button>
          <ConfirmAction
            title="Excluir sua conta?"
            description={<>
              <p>Seus dados pessoais, fotos e documentos serão apagados e você sairá da plataforma. Avaliações e contratações já feitas continuam, mas sem o seu nome.</p>
              <p className="mt-2">Antes, conclua ou cancele contratações em andamento e cancele sua assinatura. <b>Não dá para desfazer.</b></p>
            </>}
            confirmLabel="Excluir minha conta" destructive typeToConfirm="EXCLUIR"
            onConfirm={() => remove.mutateAsync()}
          >
            <Button variant="destructive">Excluir conta</Button>
          </ConfirmAction>
        </CardContent>
      </Card>
    </div>
  );
}
