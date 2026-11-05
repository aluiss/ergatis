import { eq } from 'drizzle-orm';
import { BASIC_ENTITLEMENTS, type Entitlements, type PlanCode } from '@ergatis/shared';
import { db, pool } from './client';
import { categories, plans } from './schema';

const PRO: Entitlements = { ...BASIC_ENTITLEMENTS, monthlyProposalLimit: null, showCompletedServices: true };
const PREMIUM: Entitlements = { ...PRO, searchHighlight: true, badge: true, viewClientRating: true };

// Preços provisórios: ajuste no painel admin.
const PLANS: { code: PlanCode; name: string; priceCents: number; entitlements: Entitlements }[] = [
  { code: 'basic', name: 'Basic', priceCents: 0, entitlements: BASIC_ENTITLEMENTS },
  { code: 'pro', name: 'Profissional', priceCents: 2990, entitlements: PRO },
  { code: 'premium', name: 'Premium', priceCents: 5990, entitlements: PREMIUM },
];

const CATEGORIES: Record<string, string[]> = {
  'Reparos domésticos': ['Elétrica', 'Hidráulica', 'Pintura', 'Marcenaria', 'Montagem de móveis', 'Pequenos reparos'],
  'Automotivo': ['Mecânica', 'Elétrica automotiva', 'Funilaria', 'Lavagem'],
  'Limpeza': ['Faxina', 'Pós-obra', 'Jardinagem'],
  'Tecnologia': ['Informática', 'Celulares', 'Instalação de câmeras'],
  'Mudanças e transporte': ['Fretes', 'Carregadores'],
};

const slug = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Idempotente e não destrutivo: pode rodar em qualquer ambiente. */
async function main() {
  for (const plan of PLANS) await db.insert(plans).values(plan).onConflictDoNothing();
  for (const [parent, children] of Object.entries(CATEGORIES)) {
    await db.insert(categories).values({ name: parent, slug: slug(parent) }).onConflictDoNothing();
    const [row] = await db.select().from(categories).where(eq(categories.slug, slug(parent)));
    for (const child of children) {
      await db.insert(categories).values({ name: child, slug: slug(child), parentId: row.id }).onConflictDoNothing();
    }
  }
  await pool.end();
  console.log('Seed concluído.');
}

void main();
