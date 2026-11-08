import { z } from 'zod';

/**
 * Verificação de identidade do profissional: documento + reconhecimento facial com
 * prova de vida, e uma nova checagem facial a cada proposta.
 *
 * Biometria é dado pessoal sensível (LGPD, art. 5º, II e art. 11): o consentimento é
 * específico e destacado, com versão própria, separado dos Termos.
 */
export const BIOMETRIC_CONSENT_VERSION = '2026-11-08';

/** Texto exibido no consentimento. Mudou o texto, mude a versão. */
export const BIOMETRIC_CONSENT_POINTS = [
  'Para oferecer serviços, você confirma sua identidade com um documento e o reconhecimento do seu rosto, com prova de vida.',
  'A cada proposta enviada, confirmamos de novo que é você, comparando o rosto com o cadastrado.',
  'Usamos a biometria só para isso: proteger clientes de golpes e contas falsas. Não vendemos nem usamos para publicidade.',
  'A comparação é feita por um provedor especializado, contratado por nós, que guarda o modelo do seu rosto com segurança.',
  'A selfie da verificação e os documentos são apagados quando a equipe termina a análise; ficam só o resultado e o modelo facial.',
  'Você pode retirar o consentimento quando quiser em Perfil › Verificação. O modelo facial é apagado, mas sem ele não é possível enviar propostas.',
] as const;

export const FACE_CHECK_PURPOSES = ['enrollment', 'proposal'] as const;
export type FaceCheckPurpose = (typeof FACE_CHECK_PURPOSES)[number];
export const FACE_CHECK_STATUSES = ['pending', 'passed', 'failed', 'expired'] as const;
export type FaceCheckStatus = (typeof FACE_CHECK_STATUSES)[number];
export const ENROLLMENT_STATUSES = ['captured', 'approved', 'rejected'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

/** Validade de uma checagem facial aprovada para ser usada numa proposta. */
export const FACE_CHECK_TTL_MINUTES = 10;

/** Regras ajustáveis pelo admin em Administração › Regras da plataforma. */
export const platformSettingsSchema = z.object({
  /** Sem verificação aprovada, o profissional não envia propostas nem aparece na busca. */
  requireVerificationToPropose: z.boolean(),
  /** Cada proposta exige uma checagem facial recente. */
  requireFaceCheckPerProposal: z.boolean(),
  /** Profissionais cadastrados antes desta data... */
  graceForProfessionalsBefore: z.iso.datetime().nullable(),
  /** ...podem propor sem verificação até esta data. */
  graceUntil: z.iso.datetime().nullable(),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;
export const updatePlatformSettingsSchema = platformSettingsSchema.partial();

/** Situação da verificação, como o profissional vê no perfil. */
export interface VerificationStatusView {
  consent: { version: string; givenAt: string } | null;
  /** Consentimento dado numa versão antiga do texto: pedir de novo. */
  consentOutdated: boolean;
  documents: number;
  face: { status: EnrollmentStatus; capturedAt: string } | null;
  /** Situação do pedido de verificação (none, pending, approved, rejected). */
  verification: string;
  canPropose: boolean;
  /** Por que não pode propor, em português, quando for o caso. */
  blockedReason: string | null;
  faceCheckRequired: boolean;
  inGrace: boolean;
  graceUntil: string | null;
  provider: string;
}

export const startFaceCheckSchema = z.object({
  purpose: z.enum(FACE_CHECK_PURPOSES),
  /** Na checagem para proposta, o pedido ao qual ela vai servir. */
  requestId: z.uuid().optional(),
});
export type StartFaceCheckInput = z.infer<typeof startFaceCheckSchema>;

/** Resposta ao iniciar a checagem: o front passa `clientConfig` ao componente do provedor. */
export interface FaceCheckSession {
  checkId: string;
  provider: string;
  clientConfig: Record<string, unknown>;
  expiresAt: string;
}
