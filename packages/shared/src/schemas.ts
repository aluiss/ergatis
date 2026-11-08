import { z } from 'zod';

const money = z.number().int().positive().max(100_000_000);
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().regex(/^\+?[0-9()\s-]{10,20}$/).optional(),
  bio: z.string().trim().max(1000).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().length(2).toUpperCase().optional(),
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  emailNotifications: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const professionalSetupSchema = z.object({
  headline: z.string().trim().min(5).max(120),
  serviceRadiusKm: z.number().int().min(1).max(300).default(20),
  categoryIds: z.array(z.uuid()).min(1).max(20),
});
export type ProfessionalSetupInput = z.infer<typeof professionalSetupSchema>;

export const createRequestSchema = z.object({
  categoryId: z.uuid(),
  title: z.string().trim().min(5).max(140),
  description: z.string().trim().min(10).max(4000),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().length(2).toUpperCase(),
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  budgetCents: money.optional(),
  urgent: z.boolean().default(false),
  scheduledFor: z.iso.datetime().optional(),
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const createProposalSchema = z.object({
  amountCents: money,
  message: z.string().trim().min(5).max(1000),
});
export type CreateProposalInput = z.infer<typeof createProposalSchema>;

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const sendMessageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const searchProfessionalsSchema = z.object({
  categoryId: z.uuid().optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().length(2).toUpperCase().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchProfessionalsInput = z.infer<typeof searchProfessionalsSchema>;

export const createReportSchema = z.object({
  targetUserId: z.uuid(),
  reason: z.string().trim().min(10).max(1000),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const grantSchema = z.object({
  userId: z.uuid(),
  planCode: z.enum(['pro', 'premium']).optional(),
  entitlements: z
    .object({
      monthlyProposalLimit: z.number().int().min(0).nullable().optional(),
      showCompletedServices: z.boolean().optional(),
      searchHighlight: z.boolean().optional(),
      badge: z.boolean().optional(),
      viewClientRating: z.boolean().optional(),
    })
    .optional(),
  reason: z.string().trim().min(3).max(500),
  endsAt: z.iso.datetime().optional(),
}).refine((v) => v.planCode || v.entitlements, {
  message: 'Informe um plano ou benefícios específicos',
});
export type GrantInput = z.infer<typeof grantSchema>;

export const uploadFileSchema = z.object({
  kind: z.enum(['avatar', 'portfolio', 'verification_document']),
  caption: z.string().trim().max(140).optional(),
});
export type UploadFileInput = z.infer<typeof uploadFileSchema>;

export const subscribeSchema = z.object({
  planCode: z.enum(['pro', 'premium']),
  cpfCnpj: z.string().regex(/^(\d{11}|\d{14})$/),
});
export type SubscribeInput = z.infer<typeof subscribeSchema>;
