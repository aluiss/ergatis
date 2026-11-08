/**
 * Controle de acesso da equipe (inspirado no Workspace).
 *
 * - O catálogo de recursos vive aqui: a API valida contra ele e a tela tira daqui
 *   rótulos e grupos. Uma chave digitada errada não compila.
 * - Concessão é sempre positiva (não existe "negar"); vence a mais permissiva entre
 *   a do papel e as da pessoa. `edit` implica `view`.
 * - `owner` tem tudo, sem depender de concessão.
 */
export const STAFF_ROLES = ['owner', 'admin', 'moderacao', 'suporte', 'financeiro', 'juridico'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const USER_ROLES = ['user', ...STAFF_ROLES] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Usuário',
  owner: 'Proprietário',
  admin: 'Administrador',
  moderacao: 'Moderação',
  suporte: 'Suporte',
  financeiro: 'Financeiro',
  juridico: 'Jurídico',
};

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  owner: 'Acesso total, inclusive a quem pode fazer o quê. Não pode ser delegado por ninguém além de outro proprietário.',
  admin: 'Administra a plataforma inteira, menos o controle de acesso.',
  moderacao: 'Verificações de identidade, denúncias e banimentos.',
  suporte: 'Consulta usuários e assinaturas e concede cortesias para resolver atendimentos.',
  financeiro: 'Planos, preços, assinaturas e cortesias.',
  juridico: 'Denúncias e questões jurídicas dos usuários, auditoria e documentos para instruir casos.',
};

export const isStaffRole = (role: string | null | undefined): role is StaffRole =>
  !!role && (STAFF_ROLES as readonly string[]).includes(role);

export const ACCESS_LEVELS = ['view', 'edit'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

interface ResourceInfo {
  label: string;
  group: 'geral' | 'pessoas' | 'receita' | 'seguranca' | 'plataforma';
  /** Página tem Ver e Editar; ação é sim ou não (gravada como `edit`). */
  kind: 'page' | 'action';
  description: string;
}

export const ACCESS_RESOURCES = {
  'admin.overview': { label: 'Visão geral', group: 'geral', kind: 'page', description: 'Números da plataforma.' },
  'admin.users': { label: 'Usuários', group: 'pessoas', kind: 'page', description: 'Ver usuários. Editar permite banir e remover banimento.' },
  'admin.verifications': { label: 'Verificações', group: 'pessoas', kind: 'page', description: 'Fila de verificação de identidade. Editar permite aprovar e recusar.' },
  'admin.reports': { label: 'Denúncias', group: 'pessoas', kind: 'page', description: 'Ver denúncias. Editar permite resolver e arquivar.' },
  'admin.plans': { label: 'Planos', group: 'receita', kind: 'page', description: 'Ver planos. Editar permite mudar preços e benefícios.' },
  'admin.subscriptions': { label: 'Assinaturas', group: 'receita', kind: 'page', description: 'Assinaturas e pagamentos.' },
  'admin.audit': { label: 'Auditoria', group: 'seguranca', kind: 'page', description: 'Trilha de quem fez o quê.' },
  'admin.access': { label: 'Controle de acesso', group: 'seguranca', kind: 'page', description: 'Papéis da equipe e permissões. Editar só o proprietário concede.' },
  'admin.settings': { label: 'Regras da plataforma', group: 'plataforma', kind: 'page', description: 'Exigência de verificação e prazos de carência.' },
  'grants.manage': { label: 'Conceder cortesias', group: 'receita', kind: 'action', description: 'Dar e revogar planos ou benefícios avulsos.' },
  'documents.view': { label: 'Ver documentos e biometria', group: 'seguranca', kind: 'action', description: 'Baixar documentos de identidade e ver o resultado da comparação facial. Cada acesso fica na auditoria.' },
  'audit.export': { label: 'Exportar auditoria', group: 'seguranca', kind: 'action', description: 'Baixar a trilha em CSV.' },
} as const satisfies Record<string, ResourceInfo>;

export type AccessResource = keyof typeof ACCESS_RESOURCES;
export const ACCESS_RESOURCE_KEYS = Object.keys(ACCESS_RESOURCES) as AccessResource[];

export const ACCESS_GROUP_LABELS: Record<ResourceInfo['group'], string> = {
  geral: 'Geral', pessoas: 'Pessoas', receita: 'Receita', seguranca: 'Segurança', plataforma: 'Plataforma',
};

/**
 * Recursos que só o proprietário pode conceder. Quem recebe o controle de acesso
 * passa a poder conceder tudo o mais: delegá-lo é delegar o papel de proprietário.
 */
export const OWNER_ONLY_RESOURCES: readonly AccessResource[] = ['admin.access'];

type Grants = Partial<Record<AccessResource, AccessLevel>>;
const all = (level: AccessLevel): Grants =>
  Object.fromEntries(ACCESS_RESOURCE_KEYS.filter((k) => !OWNER_ONLY_RESOURCES.includes(k)).map((k) => [k, level])) as Grants;

/** Pacote inicial de cada papel. Grava-se no banco na primeira carga e pode ser ajustado na tela. */
export const DEFAULT_ROLE_GRANTS: Record<Exclude<StaffRole, 'owner'>, Grants> = {
  admin: { ...all('edit'), 'admin.access': 'view' },
  moderacao: {
    'admin.overview': 'view', 'admin.users': 'edit', 'admin.verifications': 'edit', 'admin.reports': 'edit',
    'documents.view': 'edit',
  },
  suporte: {
    'admin.overview': 'view', 'admin.users': 'view', 'admin.reports': 'view', 'admin.subscriptions': 'view',
    'grants.manage': 'edit',
  },
  financeiro: {
    'admin.overview': 'view', 'admin.users': 'view', 'admin.plans': 'edit', 'admin.subscriptions': 'view',
    'grants.manage': 'edit',
  },
  juridico: {
    'admin.overview': 'view', 'admin.users': 'view', 'admin.reports': 'edit', 'admin.audit': 'view',
    'audit.export': 'edit', 'documents.view': 'edit',
  },
};

/** O que a API devolve em GET /me/access. */
export interface ResolvedAccess {
  role: UserRole;
  isOwner: boolean;
  isStaff: boolean;
  resources: Grants;
  /** Da equipe, sem login em duas etapas, com a regra ligada: a administração fica bloqueada até ativar. */
  mustEnableTwoFactor?: boolean;
}

/** `edit` cobre `view`. Proprietário pode tudo. */
export function can(access: Pick<ResolvedAccess, 'isOwner' | 'resources'> | null | undefined, resource: AccessResource, level: AccessLevel = 'view') {
  if (!access) return false;
  if (access.isOwner) return true;
  const granted = access.resources[resource];
  return granted === 'edit' || (granted === 'view' && level === 'view');
}
