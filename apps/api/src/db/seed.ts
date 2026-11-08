import { eq } from 'drizzle-orm';
import { BASIC_ENTITLEMENTS, isStaffRole, LEGAL_VERSION, type Entitlements, type PlanCode } from '@ergatis/shared';
import { auth } from '../auth/auth';
import { env } from '../config/env';
import { db, pool } from './client';
import { recordAudit } from '../audit/audit';
import { categories, plans, user } from './schema';

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

/**
 * Cria o usuário de SEED_USER/SEED_PASSWORD, já verificado e com o papel de SEED_ROLE.
 * Se ele já existir, só ajusta o papel e a verificação; a senha não é alterada.
 */
async function seedUser() {
  // Em teste o .env local também é carregado; o usuário pessoal não deve ir para o banco de teste.
  if (env.NODE_ENV === 'test' || !env.SEED_USER || !env.SEED_PASSWORD) return;
  const email = env.SEED_USER.toLowerCase();
  const [existing] = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.email, email));
  let id = existing?.id;
  if (!id) {
    // Pelo Better Auth: mesmo hash de senha do login e hooks de criação (perfil e aceite dos termos).
    const created = await auth.api.createUser({
      body: {
        email,
        password: env.SEED_PASSWORD,
        name: env.SEED_NAME ?? email.split('@')[0],
        role: 'user', // o papel definitivo vem no update abaixo (o tipo do plugin só conhece user/admin)
        data: { termsVersion: LEGAL_VERSION },
      },
    });
    id = created.user.id;
  }
  // Em conta existente, só promove quem ainda é usuário comum: papéis de equipe ajustados
  // pela tela (ou o proprietário definido na migração) nunca são rebaixados pelo seed.
  const keepRole = existing && existing.role && existing.role !== 'user';
  const role = keepRole ? existing.role! : env.SEED_ROLE;
  await db.update(user).set({ role, emailVerified: true }).where(eq(user.id, id));
  if (isStaffRole(env.SEED_ROLE) && !keepRole) {
    await recordAudit({ action: 'user.made_admin_seed', targetType: 'user', targetId: id, changes: [{ field: 'role', from: existing?.role ?? null, to: env.SEED_ROLE }] });
  }
  console.log(`Usuário ${existing ? 'atualizado' : 'criado'}: ${email} (${role}${keepRole && role !== env.SEED_ROLE ? `; papel atual mantido, SEED_ROLE=${env.SEED_ROLE} ignorado` : ''}).`);
}

/** Idempotente e não destrutivo: pode rodar em qualquer ambiente. */
async function main() {
  await seedUser();
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
