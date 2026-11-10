import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { categories } from '../src/db/schema';
import { api, createApp, markVerified, propose, signUp } from './helpers';

let app: INestApplication;
beforeAll(async () => { app = await createApp(); });
afterAll(async () => { await app.close(); });

async function newCategory() {
  const [parent] = await db.select().from(categories).where(eq(categories.slug, 'reparos-domesticos'));
  const tag = randomUUID().slice(0, 8);
  const [row] = await db.insert(categories).values({ name: `Cat ${tag}`, slug: `cat-${tag}`, parentId: parent.id }).returning();
  return row.id;
}

describe('vários perfis profissionais', () => {
  it('cria, limita a 3, não repete categoria e mantém ao menos um', async () => {
    const [a, b, c, d] = [await newCategory(), await newCategory(), await newCategory(), await newCategory()];
    const pro = await signUp(app, 'Multi Perfil');
    expect((await api(app, pro).put('/professionals/me', { title: 'Eletricista residencial', serviceRadiusKm: 30, categoryIds: [a] })).status).toBe(200);
    const second = await api(app, pro).post('/professionals/me/profiles', { title: 'Pintor de paredes', serviceRadiusKm: 10, categoryIds: [b] });
    expect(second.status).toBe(201);
    // Categoria já usada no primeiro perfil.
    const dup = await api(app, pro).post('/professionals/me/profiles', { title: 'Outro eletricista', categoryIds: [a] });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toContain('Eletricista residencial');
    expect((await api(app, pro).post('/professionals/me/profiles', { title: 'Jardineiro de casa', categoryIds: [c] })).status).toBe(201);
    expect((await api(app, pro).post('/professionals/me/profiles', { title: 'Quarto perfil aqui', categoryIds: [d] })).status).toBe(409);

    const list = (await api(app, pro).get('/professionals/me/profiles')).body;
    expect(list.map((p: { title: string }) => p.title)).toEqual(['Eletricista residencial', 'Pintor de paredes', 'Jardineiro de casa']);

    const edited = await api(app, pro).put(`/professionals/me/profiles/${second.body.id}`, { title: 'Pintor residencial', serviceRadiusKm: 15, categoryIds: [b, d] });
    expect(edited.body).toMatchObject({ title: 'Pintor residencial', serviceRadiusKm: 15 });
    for (const p of list.slice(1)) expect((await api(app, pro).delete(`/professionals/me/profiles/${p.id}`)).status).toBe(200);
    expect((await api(app, pro).delete(`/professionals/me/profiles/${list[0].id}`)).status).toBe(409);
  });

  it('oportunidades filtram por perfil, e a proposta leva o título do perfil certo', async () => {
    const [elec, paint] = [await newCategory(), await newCategory()];
    const pro = await signUp(app, 'Dois Ofícios');
    await api(app, pro).put('/professionals/me', { title: 'Eletricista predial', serviceRadiusKm: 30, categoryIds: [elec] });
    const painter = (await api(app, pro).post('/professionals/me/profiles', { title: 'Pintor de fachadas', categoryIds: [paint] })).body;
    await markVerified(pro);

    const client = await signUp(app);
    const publish = async (categoryId: string, title: string) => (await api(app, client).post('/requests', {
      categoryId, title, description: 'Pedido de teste com descrição.', city: 'Campinas', state: 'SP',
    })).body as { id: string };
    const lamp = await publish(elec, 'Trocar tomada da sala');
    const wall = await publish(paint, 'Pintar muro do quintal');

    const all = (await api(app, pro).get('/requests/feed')).body as { id: string; profileTitle: string }[];
    expect(all.find((r) => r.id === wall.id)?.profileTitle).toBe('Pintor de fachadas');
    const onlyPaint = (await api(app, pro).get(`/requests/feed?profileId=${painter.id}`)).body as { id: string }[];
    expect(onlyPaint.map((r) => r.id)).toEqual([wall.id]);
    expect((await api(app, pro).get('/requests/feed?profileId=nao-e-id')).status).toBe(400);

    await propose(app, pro, wall.id);
    await propose(app, pro, lamp.id);
    const seen = (await api(app, client).get(`/requests/${wall.id}`)).body.proposals[0];
    expect(seen.headline).toBe('Pintor de fachadas');
    expect((await api(app, client).get(`/requests/${lamp.id}`)).body.proposals[0].headline).toBe('Eletricista predial');
  });

  it('a busca pública lista por perfil e o cliente filtra pelo nome do profissional', async () => {
    const [x, y] = [await newCategory(), await newCategory()];
    const tag = randomUUID().slice(0, 6);
    const pro = await signUp(app, `Fulana ${tag}`);
    await api(app, pro).put('/professionals/me', { title: 'Encanadora experiente', categoryIds: [x] });
    await api(app, pro).post('/professionals/me/profiles', { title: 'Azulejista caprichosa', categoryIds: [y] });
    await markVerified(pro);

    const byName = (await api(app).get(`/professionals?q=${tag}`)).body;
    expect(byName.items.map((i: { headline: string }) => i.headline).sort()).toEqual(['Azulejista caprichosa', 'Encanadora experiente']);
    const byCategory = (await api(app).get(`/professionals?categoryId=${y}`)).body;
    expect(byCategory.items).toHaveLength(1);
    expect(byCategory.items[0]).toMatchObject({ userId: pro.id, headline: 'Azulejista caprichosa' });

    const page = (await api(app).get(`/professionals/${pro.id}`)).body;
    expect(page.profiles.map((p: { title: string }) => p.title)).toEqual(['Encanadora experiente', 'Azulejista caprichosa']);
  });
});
