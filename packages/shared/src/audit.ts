/**
 * Catálogo das ações de auditoria: nome técnico, rótulo e grupo.
 *
 * É a única fonte. A API só aceita gravar o que está aqui (o tipo `AuditActionKey`
 * barra erro de digitação em tempo de compilação) e a tela tira daqui rótulo e cor.
 */
export const AUDIT_GROUPS = {
  access: 'Acesso',
  accounts: 'Contas e papéis',
  email: 'E-mails',
  privacy: 'Dados pessoais',
  marketplace: 'Pedidos e serviços',
  files: 'Arquivos e documentos',
  billing: 'Planos e cobrança',
  moderation: 'Moderação',
  audit: 'Auditoria',
} as const;
export type AuditGroup = keyof typeof AUDIT_GROUPS;

/** Tom visual: o que é rotina, o que muda algo, o que merece atenção. */
export type AuditTone = 'neutral' | 'positive' | 'change' | 'warning' | 'danger';

interface ActionInfo { label: string; group: AuditGroup; tone: AuditTone }

export const AUDIT_ACTIONS = {
  // Acesso
  'auth.signed_in': { label: 'Login', group: 'access', tone: 'neutral' },
  'auth.signed_out': { label: 'Logout', group: 'access', tone: 'neutral' },
  'auth.sign_in_failed': { label: 'Login recusado', group: 'access', tone: 'warning' },
  'auth.sign_up_failed': { label: 'Cadastro recusado', group: 'access', tone: 'warning' },
  'auth.email_verified': { label: 'E-mail confirmado', group: 'access', tone: 'positive' },
  'auth.password_reset_requested': { label: 'Pediu redefinição de senha', group: 'access', tone: 'neutral' },
  'auth.password_reset': { label: 'Senha redefinida', group: 'access', tone: 'change' },
  'auth.password_reset_failed': { label: 'Redefinição de senha recusada', group: 'access', tone: 'warning' },
  'auth.impersonation_started': { label: 'Acesso como outro usuário', group: 'access', tone: 'danger' },
  // Contas e papéis
  'user.created': { label: 'Conta criada', group: 'accounts', tone: 'positive' },
  'user.banned': { label: 'Usuário banido', group: 'accounts', tone: 'danger' },
  'user.unbanned': { label: 'Banimento removido', group: 'accounts', tone: 'change' },
  'user.role_changed': { label: 'Papel alterado', group: 'accounts', tone: 'danger' },
  'access.granted': { label: 'Permissão concedida', group: 'accounts', tone: 'danger' },
  'access.revoked': { label: 'Permissão revogada', group: 'accounts', tone: 'change' },
  'access.denied': { label: 'Acesso negado', group: 'access', tone: 'warning' },
  'settings.updated': { label: 'Regra da plataforma alterada', group: 'accounts', tone: 'danger' },
  'user.made_admin_cli': { label: 'Promovido a admin (linha de comando)', group: 'accounts', tone: 'danger' },
  'user.made_admin_seed': { label: 'Promovido a admin (seed)', group: 'accounts', tone: 'danger' },
  'profile.updated': { label: 'Perfil atualizado', group: 'accounts', tone: 'change' },
  'professional.profile_updated': { label: 'Perfil profissional atualizado', group: 'accounts', tone: 'change' },
  'professional.verification_requested': { label: 'Pediu verificação', group: 'accounts', tone: 'neutral' },
  'biometric.consent_given': { label: 'Consentiu com a biometria', group: 'privacy', tone: 'neutral' },
  'biometric.consent_revoked': { label: 'Retirou o consentimento da biometria', group: 'privacy', tone: 'warning' },
  'face.enrolled': { label: 'Rosto cadastrado', group: 'accounts', tone: 'change' },
  'face.check_passed': { label: 'Checagem facial aprovada', group: 'access', tone: 'positive' },
  'face.check_failed': { label: 'Checagem facial recusada', group: 'access', tone: 'danger' },
  'face.check_used': { label: 'Checagem facial usada em proposta', group: 'marketplace', tone: 'neutral' },
  // E-mails
  'email.sent': { label: 'E-mail enviado', group: 'email', tone: 'neutral' },
  'email.not_sent': { label: 'E-mail não enviado (sem SMTP)', group: 'email', tone: 'warning' },
  'email.failed': { label: 'Falha no envio de e-mail', group: 'email', tone: 'danger' },
  // Dados pessoais
  'account.data_exported': { label: 'Dados exportados pelo titular', group: 'privacy', tone: 'neutral' },
  'account.deleted': { label: 'Conta excluída', group: 'privacy', tone: 'danger' },
  // Pedidos e serviços
  'service_request.created': { label: 'Pedido criado', group: 'marketplace', tone: 'positive' },
  'service_request.cancelled': { label: 'Pedido cancelado', group: 'marketplace', tone: 'change' },
  'proposal.created': { label: 'Proposta enviada', group: 'marketplace', tone: 'positive' },
  'proposal.withdrawn': { label: 'Proposta retirada', group: 'marketplace', tone: 'change' },
  'proposal.accepted': { label: 'Proposta aceita', group: 'marketplace', tone: 'positive' },
  'proposal.rejected': { label: 'Proposta recusada', group: 'marketplace', tone: 'change' },
  'engagement.completed': { label: 'Serviço concluído', group: 'marketplace', tone: 'positive' },
  'engagement.cancelled': { label: 'Serviço cancelado', group: 'marketplace', tone: 'change' },
  'review.created': { label: 'Avaliação enviada', group: 'marketplace', tone: 'neutral' },
  'message.sent': { label: 'Mensagem enviada', group: 'marketplace', tone: 'neutral' },
  // Arquivos e documentos
  'file.uploaded': { label: 'Arquivo enviado', group: 'files', tone: 'neutral' },
  'file.removed': { label: 'Arquivo removido', group: 'files', tone: 'change' },
  'document.viewed': { label: 'Documento de identidade consultado', group: 'files', tone: 'warning' },
  // Planos e cobrança
  'subscription.requested': { label: 'Assinatura solicitada', group: 'billing', tone: 'neutral' },
  'subscription.cancelled': { label: 'Assinatura cancelada', group: 'billing', tone: 'change' },
  'billing.event_processed': { label: 'Evento de cobrança', group: 'billing', tone: 'neutral' },
  'grant.created': { label: 'Cortesia concedida', group: 'billing', tone: 'change' },
  'grant.revoked': { label: 'Cortesia revogada', group: 'billing', tone: 'change' },
  'plan.updated': { label: 'Plano alterado', group: 'billing', tone: 'danger' },
  // Moderação
  'report.created': { label: 'Denúncia enviada', group: 'moderation', tone: 'warning' },
  'report.updated': { label: 'Denúncia tratada', group: 'moderation', tone: 'change' },
  'verification.approved': { label: 'Verificação aprovada', group: 'moderation', tone: 'positive' },
  'verification.rejected': { label: 'Verificação recusada', group: 'moderation', tone: 'change' },
  // Auditoria
  'audit.exported': { label: 'Auditoria exportada', group: 'audit', tone: 'warning' },
} as const satisfies Record<string, ActionInfo>;

export type AuditActionKey = keyof typeof AUDIT_ACTIONS;

/** Rótulo da ação; ações antigas ou desconhecidas aparecem pelo nome técnico. */
export const auditActionLabel = (action: string) =>
  (AUDIT_ACTIONS as Record<string, ActionInfo>)[action]?.label ?? action;

export const auditActionInfo = (action: string): ActionInfo | undefined =>
  (AUDIT_ACTIONS as Record<string, ActionInfo>)[action];

/** Tipos de alvo e como chamá-los na tela. */
export const AUDIT_TARGET_LABELS: Record<string, string> = {
  user: 'Usuário',
  service_request: 'Pedido',
  proposal: 'Proposta',
  engagement: 'Contratação',
  conversation: 'Conversa',
  report: 'Denúncia',
  file: 'Arquivo',
  subscription: 'Assinatura',
  plan: 'Plano',
  audit: 'Auditoria',
  role: 'Papel',
  face_check: 'Checagem facial',
  settings: 'Regras da plataforma',
  route: 'Rota',
};

/** Uma alteração de campo, como a API grava em `changes`. */
export interface AuditChange { field: string; from: unknown; to: unknown }

/** Mínimo exigido pelo Marco Civil (art. 15) para registros de acesso a aplicações. */
export const AUDIT_MIN_RETENTION_MONTHS = 6;
