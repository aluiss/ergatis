import { sql } from 'drizzle-orm';
import {
  boolean, check, doublePrecision, index, integer, jsonb, pgEnum, pgTable,
  primaryKey, text, timestamp, uniqueIndex, uuid, varchar,
} from 'drizzle-orm/pg-core';
import {
  ENGAGEMENT_STATUSES, FILE_KINDS, PLAN_CODES, PROPOSAL_STATUSES, REPORT_STATUSES,
  REQUEST_STATUSES, SUBSCRIPTION_STATUSES, VERIFICATION_STATUSES,
  type Entitlements,
} from '@ergatis/shared';

const tz = { withTimezone: true } as const;
const createdAt = () => timestamp(tz).notNull().defaultNow();
const updatedAt = () => timestamp(tz).notNull().defaultNow().$onUpdate(() => new Date());
const id = () => uuid().primaryKey().defaultRandom();

export const requestStatus = pgEnum('request_status', REQUEST_STATUSES);
export const proposalStatus = pgEnum('proposal_status', PROPOSAL_STATUSES);
export const engagementStatus = pgEnum('engagement_status', ENGAGEMENT_STATUSES);
export const subscriptionStatus = pgEnum('subscription_status', SUBSCRIPTION_STATUSES);
export const reportStatus = pgEnum('report_status', REPORT_STATUSES);
export const verificationStatus = pgEnum('verification_status', VERIFICATION_STATUSES);
export const planCode = pgEnum('plan_code', PLAN_CODES);
export const fileKind = pgEnum('file_kind', FILE_KINDS);

/* Better Auth */
export const user = pgTable('user', {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  role: text().default('user'),
  banned: boolean().default(false),
  banReason: text(),
  banExpires: timestamp(tz),
  termsVersion: text(),
  /** Login em duas etapas ativo (plugin twoFactor do Better Auth). */
  twoFactorEnabled: boolean().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  // Papéis válidos também no banco: o plugin do Better Auth ou um UPDATE manual não criam um papel inventado.
  check('user_role_check', sql`${t.role} is null or ${t.role} in ('user', 'owner', 'admin', 'moderacao', 'suporte', 'financeiro', 'juridico')`),
]);

/**
 * Segredo do app autenticador e códigos de recuperação, ambos cifrados pelo Better Auth
 * (nunca devolvidos pela API). `verified` fica falso até o primeiro código confirmar a ativação.
 */
export const twoFactor = pgTable('two_factor', {
  id: id(),
  secret: text().notNull(),
  backupCodes: text().notNull(),
  userId: uuid().notNull().references(() => user.id, { onDelete: 'cascade' }),
  verified: boolean().default(true),
  failedVerificationCount: integer().default(0),
  lockedUntil: timestamp(tz),
}, (t) => [index('two_factor_user_idx').on(t.userId), index('two_factor_secret_idx').on(t.secret)]);

export const session = pgTable('session', {
  id: id(),
  expiresAt: timestamp(tz).notNull(),
  token: text().notNull().unique(),
  ipAddress: text(),
  userAgent: text(),
  impersonatedBy: text(),
  userId: uuid().notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('session_user_idx').on(t.userId)]);

export const account = pgTable('account', {
  id: id(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: uuid().notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp(tz),
  refreshTokenExpiresAt: timestamp(tz),
  scope: text(),
  password: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('account_user_idx').on(t.userId)]);

export const verification = pgTable('verification', {
  id: id(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp(tz).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('verification_identifier_idx').on(t.identifier)]);

/** Prova do aceite: registro imutável por versão dos documentos legais. */
export const legalAcceptances = pgTable('legal_acceptances', {
  id: id(),
  userId: uuid().notNull().references(() => user.id, { onDelete: 'cascade' }),
  version: varchar({ length: 20 }).notNull(),
  ipAddress: varchar({ length: 64 }),
  acceptedAt: timestamp(tz).notNull().defaultNow(),
}, (t) => [uniqueIndex('legal_acceptances_unique').on(t.userId, t.version)]);

export const files = pgTable('files', {
  id: id(),
  ownerId: uuid().notNull().references(() => user.id, { onDelete: 'cascade' }),
  kind: fileKind().notNull(),
  storageKey: varchar({ length: 120 }).notNull().unique(),
  mimeType: varchar({ length: 50 }).notNull(),
  sizeBytes: integer().notNull(),
  caption: varchar({ length: 140 }),
  createdAt: createdAt(),
}, (t) => [index('files_owner_idx').on(t.ownerId, t.kind)]);

/* Perfis: a mesma pessoa pode contratar e prestar serviços. */
export const profiles = pgTable('profiles', {
  userId: uuid().primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  displayName: varchar({ length: 120 }).notNull(),
  phone: varchar({ length: 20 }),
  avatarFileId: uuid().references(() => files.id, { onDelete: 'set null' }),
  emailNotifications: boolean().notNull().default(true),
  bio: varchar({ length: 1000 }),
  city: varchar({ length: 100 }),
  state: varchar({ length: 2 }),
  latitude: doublePrecision(),
  longitude: doublePrecision(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('profiles_location_idx').on(t.state, t.city)]);

export const professionals = pgTable('professionals', {
  userId: uuid().primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  headline: varchar({ length: 120 }).notNull(),
  serviceRadiusKm: integer().notNull().default(20),
  verification: verificationStatus().notNull().default('none'),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [check('professionals_radius_check', sql`${t.serviceRadiusKm} between 1 and 300`)]);

export const categories = pgTable('categories', {
  id: id(),
  parentId: uuid().references((): any => categories.id, { onDelete: 'restrict' }),
  name: varchar({ length: 80 }).notNull(),
  slug: varchar({ length: 100 }).notNull().unique(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index('categories_parent_idx').on(t.parentId)]);

export const professionalCategories = pgTable('professional_categories', {
  professionalId: uuid().notNull().references(() => professionals.userId, { onDelete: 'cascade' }),
  categoryId: uuid().notNull().references(() => categories.id, { onDelete: 'restrict' }),
}, (t) => [
  primaryKey({ columns: [t.professionalId, t.categoryId] }),
  index('professional_categories_category_idx').on(t.categoryId),
]);

/* Fluxo principal: pedido -> proposta -> contratação -> avaliação */
export const serviceRequests = pgTable('service_requests', {
  id: id(),
  clientId: uuid().notNull().references(() => user.id, { onDelete: 'restrict' }),
  categoryId: uuid().notNull().references(() => categories.id, { onDelete: 'restrict' }),
  title: varchar({ length: 140 }).notNull(),
  description: text().notNull(),
  city: varchar({ length: 100 }).notNull(),
  state: varchar({ length: 2 }).notNull(),
  latitude: doublePrecision(),
  longitude: doublePrecision(),
  budgetCents: integer(),
  urgent: boolean().notNull().default(false),
  scheduledFor: timestamp(tz),
  status: requestStatus().notNull().default('open'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('requests_client_idx').on(t.clientId),
  index('requests_feed_idx').on(t.status, t.categoryId, t.createdAt),
  check('requests_budget_check', sql`${t.budgetCents} is null or ${t.budgetCents} > 0`),
]);

export const proposals = pgTable('proposals', {
  id: id(),
  requestId: uuid().notNull().references(() => serviceRequests.id, { onDelete: 'cascade' }),
  professionalId: uuid().notNull().references(() => professionals.userId, { onDelete: 'restrict' }),
  amountCents: integer().notNull(),
  message: varchar({ length: 1000 }).notNull(),
  status: proposalStatus().notNull().default('sent'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('proposals_one_per_professional').on(t.requestId, t.professionalId),
  index('proposals_professional_idx').on(t.professionalId),
  check('proposals_amount_check', sql`${t.amountCents} > 0`),
]);

/** Contador atômico usado para aplicar o limite mensal do plano. */
export const proposalUsage = pgTable('proposal_usage', {
  professionalId: uuid().notNull().references(() => professionals.userId, { onDelete: 'cascade' }),
  period: varchar({ length: 7 }).notNull(),
  used: integer().notNull().default(0),
}, (t) => [primaryKey({ columns: [t.professionalId, t.period] })]);

export const engagements = pgTable('engagements', {
  id: id(),
  requestId: uuid().notNull().references(() => serviceRequests.id, { onDelete: 'restrict' }),
  proposalId: uuid().notNull().references(() => proposals.id, { onDelete: 'restrict' }),
  clientId: uuid().notNull().references(() => user.id, { onDelete: 'restrict' }),
  professionalId: uuid().notNull().references(() => professionals.userId, { onDelete: 'restrict' }),
  agreedCents: integer().notNull(),
  status: engagementStatus().notNull().default('active'),
  completedAt: timestamp(tz),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('engagements_one_per_request').on(t.requestId),
  index('engagements_professional_idx').on(t.professionalId, t.status),
  index('engagements_client_idx').on(t.clientId, t.status),
]);

export const reviews = pgTable('reviews', {
  id: id(),
  engagementId: uuid().notNull().references(() => engagements.id, { onDelete: 'cascade' }),
  reviewerId: uuid().notNull().references(() => user.id, { onDelete: 'restrict' }),
  revieweeId: uuid().notNull().references(() => user.id, { onDelete: 'restrict' }),
  rating: integer().notNull(),
  comment: varchar({ length: 1000 }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('reviews_one_per_side').on(t.engagementId, t.reviewerId),
  index('reviews_reviewee_idx').on(t.revieweeId),
  check('reviews_rating_check', sql`${t.rating} between 1 and 5`),
  check('reviews_not_self_check', sql`${t.reviewerId} <> ${t.revieweeId}`),
]);

/* Conversa vinculada a uma proposta, entre cliente e profissional. */
export const conversations = pgTable('conversations', {
  id: id(),
  proposalId: uuid().notNull().unique().references(() => proposals.id, { onDelete: 'cascade' }),
  clientId: uuid().notNull().references(() => user.id, { onDelete: 'restrict' }),
  professionalId: uuid().notNull().references(() => user.id, { onDelete: 'restrict' }),
  createdAt: createdAt(),
}, (t) => [
  index('conversations_client_idx').on(t.clientId),
  index('conversations_professional_idx').on(t.professionalId),
]);

export const messages = pgTable('messages', {
  id: id(),
  conversationId: uuid().notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: uuid().notNull().references(() => user.id, { onDelete: 'restrict' }),
  body: varchar({ length: 2000 }).notNull(),
  readAt: timestamp(tz),
  createdAt: createdAt(),
}, (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)]);

export const notifications = pgTable('notifications', {
  id: id(),
  userId: uuid().notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: varchar({ length: 50 }).notNull(),
  title: varchar({ length: 160 }).notNull(),
  link: varchar({ length: 255 }),
  readAt: timestamp(tz),
  emailClaimedAt: timestamp(tz),
  emailSentAt: timestamp(tz),
  emailAttempts: integer().notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  index('notifications_user_idx').on(t.userId, t.readAt),
  index('notifications_email_queue_idx').on(t.createdAt).where(sql`${t.emailClaimedAt} is null`),
]);

/* Planos, assinaturas e cortesias */
export const plans = pgTable('plans', {
  code: planCode().primaryKey(),
  name: varchar({ length: 60 }).notNull(),
  priceCents: integer().notNull(),
  entitlements: jsonb().$type<Entitlements>().notNull(),
  active: boolean().notNull().default(true),
  updatedAt: updatedAt(),
}, (t) => [check('plans_price_check', sql`${t.priceCents} >= 0`)]);

export const subscriptions = pgTable('subscriptions', {
  id: id(),
  userId: uuid().notNull().references(() => user.id, { onDelete: 'restrict' }),
  planCode: planCode().notNull().references(() => plans.code),
  status: subscriptionStatus().notNull().default('pending'),
  provider: varchar({ length: 20 }).notNull(),
  providerCustomerId: varchar({ length: 100 }),
  providerSubscriptionId: varchar({ length: 100 }).unique(),
  currentPeriodEnd: timestamp(tz),
  cancelledAt: timestamp(tz),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('subscriptions_user_idx').on(t.userId, t.status),
  uniqueIndex('subscriptions_one_live_per_user').on(t.userId)
    .where(sql`${t.status} in ('pending', 'active', 'past_due')`),
]);

export const entitlementGrants = pgTable('entitlement_grants', {
  id: id(),
  userId: uuid().notNull().references(() => user.id, { onDelete: 'cascade' }),
  planCode: planCode().references(() => plans.code),
  entitlements: jsonb().$type<Partial<Entitlements>>(),
  reason: varchar({ length: 500 }).notNull(),
  grantedBy: uuid().notNull().references(() => user.id, { onDelete: 'restrict' }),
  startsAt: timestamp(tz).notNull().defaultNow(),
  endsAt: timestamp(tz),
  revokedAt: timestamp(tz),
  revokedBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
  createdAt: createdAt(),
}, (t) => [
  index('grants_user_idx').on(t.userId),
  check('grants_has_benefit_check', sql`${t.planCode} is not null or ${t.entitlements} is not null`),
]);

/** Webhooks chegam ao menos uma vez: a chave única impede processamento duplicado. */
export const billingEvents = pgTable('billing_events', {
  id: id(),
  provider: varchar({ length: 20 }).notNull(),
  eventId: varchar({ length: 150 }).notNull(),
  type: varchar({ length: 80 }).notNull(),
  payload: jsonb().notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('billing_events_unique').on(t.provider, t.eventId)]);

/* Confiança e controle */
export const reports = pgTable('reports', {
  id: id(),
  reporterId: uuid().notNull().references(() => user.id, { onDelete: 'cascade' }),
  targetUserId: uuid().notNull().references(() => user.id, { onDelete: 'cascade' }),
  reason: varchar({ length: 1000 }).notNull(),
  status: reportStatus().notNull().default('open'),
  resolution: varchar({ length: 1000 }),
  resolvedBy: uuid().references(() => user.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('reports_status_idx').on(t.status),
  check('reports_not_self_check', sql`${t.reporterId} <> ${t.targetUserId}`),
]);

export const auditLogs = pgTable('audit_logs', {
  id: id(),
  /** Liga as linhas geradas por uma mesma requisição. */
  requestId: varchar({ length: 64 }),
  actorId: uuid().references(() => user.id, { onDelete: 'set null' }),
  /** Papel do autor no momento da ação: o atual pode já ser outro. */
  actorRole: varchar({ length: 20 }),
  action: varchar({ length: 80 }).notNull(),
  targetType: varchar({ length: 40 }).notNull(),
  targetId: varchar({ length: 80 }),
  /** Frase legível sobre o que aconteceu, quando o rótulo da ação não basta. */
  summary: varchar({ length: 255 }),
  /** Campos alterados: [{ field, from, to }], já com a política de dados sensíveis aplicada. */
  changes: jsonb().$type<{ field: string; from: unknown; to: unknown }[]>(),
  metadata: jsonb(),
  createdAt: createdAt(),
}, (t) => [
  index('audit_actor_idx').on(t.actorId, t.createdAt),
  index('audit_target_idx').on(t.targetType, t.targetId, t.createdAt),
  index('audit_action_idx').on(t.action, t.createdAt),
  index('audit_created_idx').on(t.createdAt),
  index('audit_request_idx').on(t.requestId),
]);

/**
 * Permissões da equipe: por papel (`role`) ou por pessoa (`userId`), nunca as duas.
 * Só concessões positivas; `edit` implica `view`. O catálogo de recursos está em
 * @ergatis/shared (access.ts). `grantedBy` nulo = pacote inicial do sistema.
 */
export const accessGrants = pgTable('access_grants', {
  id: id(),
  resourceKey: varchar({ length: 60 }).notNull(),
  level: varchar({ length: 10 }).notNull(),
  role: varchar({ length: 20 }),
  userId: uuid().references(() => user.id, { onDelete: 'cascade' }),
  grantedBy: uuid().references(() => user.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('access_grants_role_uq').on(t.resourceKey, t.role).where(sql`${t.role} is not null`),
  uniqueIndex('access_grants_user_uq').on(t.resourceKey, t.userId).where(sql`${t.userId} is not null`),
  index('access_grants_user_idx').on(t.userId),
  check('access_grants_subject_check', sql`(${t.role} is null) <> (${t.userId} is null)`),
  check('access_grants_level_check', sql`${t.level} in ('view', 'edit')`),
  check('access_grants_role_check', sql`${t.role} is null or ${t.role} in ('admin', 'moderacao', 'suporte', 'financeiro', 'juridico')`),
]);

/** Regras ajustáveis pelo admin (chave -> valor). Ver `platformSettingsSchema` em @ergatis/shared. */
export const platformSettings = pgTable('platform_settings', {
  key: varchar({ length: 60 }).primaryKey(),
  value: jsonb().notNull(),
  updatedBy: uuid().references(() => user.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});

/**
 * Cadastro facial do profissional. Guarda o consentimento e a referência do rosto
 * no provedor (`subjectRef`); a imagem e o modelo biométrico ficam com o provedor,
 * nunca aqui. Retirar o consentimento apaga a linha e o rosto no provedor.
 */
export const faceEnrollments = pgTable('face_enrollments', {
  userId: uuid().primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  consentVersion: varchar({ length: 20 }).notNull(),
  consentAt: timestamp(tz).notNull(),
  provider: varchar({ length: 30 }),
  subjectRef: varchar({ length: 200 }),
  status: varchar({ length: 20 }),
  livenessScore: doublePrecision(),
  /** Semelhança com a foto do documento, quando o provedor compara (apoio à moderação). */
  documentMatchScore: doublePrecision(),
  capturedAt: timestamp(tz),
  decidedAt: timestamp(tz),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check('face_enrollments_status_check', sql`${t.status} is null or ${t.status} in ('captured', 'approved', 'rejected')`),
]);

/**
 * Cada checagem facial. Para proposta: vale por pouco tempo, uma vez só, e para o
 * pedido em que foi feita (`requestId`). Sem imagem: só o resultado.
 */
export const faceChecks = pgTable('face_checks', {
  id: id(),
  userId: uuid().notNull().references(() => user.id, { onDelete: 'cascade' }),
  purpose: varchar({ length: 20 }).notNull(),
  provider: varchar({ length: 30 }).notNull(),
  sessionRef: varchar({ length: 200 }).notNull(),
  status: varchar({ length: 20 }).notNull().default('pending'),
  livenessScore: doublePrecision(),
  matchScore: doublePrecision(),
  failureReason: varchar({ length: 200 }),
  requestId: uuid().references(() => serviceRequests.id, { onDelete: 'set null' }),
  proposalId: uuid().references(() => proposals.id, { onDelete: 'set null' }),
  expiresAt: timestamp(tz).notNull(),
  completedAt: timestamp(tz),
  usedAt: timestamp(tz),
  createdAt: createdAt(),
}, (t) => [
  index('face_checks_user_idx').on(t.userId, t.createdAt),
  check('face_checks_purpose_check', sql`${t.purpose} in ('enrollment', 'proposal')`),
  check('face_checks_status_check', sql`${t.status} in ('pending', 'passed', 'failed', 'expired')`),
]);
