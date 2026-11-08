export const REQUEST_STATUSES = ['open', 'hired', 'completed', 'cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const PROPOSAL_STATUSES = ['sent', 'accepted', 'rejected', 'withdrawn'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const ENGAGEMENT_STATUSES = ['active', 'completed', 'cancelled'] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ['pending', 'active', 'past_due', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const REPORT_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const VERIFICATION_STATUSES = ['none', 'pending', 'approved', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const FILE_KINDS = ['avatar', 'portfolio', 'verification_document'] as const;
export type FileKind = (typeof FILE_KINDS)[number];
