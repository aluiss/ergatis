import {
  BadgeCheck, Briefcase, ClipboardList, CreditCard, FileClock, Flag, Gauge, Handshake, House, MessageCircle,
  PlusCircle, Receipt, Search, Send, User, Users, Wrench, type LucideIcon,
} from 'lucide-react';

/**
 * Registro único da navegação. Menu do topo, barra inferior do celular, menu "Mais",
 * busca por Ctrl+K, breadcrumbs e o menu do admin saem todos daqui: uma página nova
 * entra num lugar só.
 *
 * Visibilidade aqui é conforto de interface. Quem barra o acesso é a API e o layout
 * de cada área no servidor.
 */
export interface NavContext { isAdmin: boolean; isProfessional: boolean }

export interface NavItem {
  id: string;
  label: string;
  /** Rótulo curto para a barra inferior, onde cabe pouco. */
  short?: string;
  href: string;
  icon: LucideIcon;
  /** Contador ao lado do item. */
  counter?: 'messages';
  visible?: (ctx: NavContext) => boolean;
  /** Termos extras para a busca do Ctrl+K. */
  keywords?: string;
}

export interface NavGroup { id: string; label: string; items: NavItem[]; visible?: (ctx: NavContext) => boolean }

const pro = (c: NavContext) => c.isProfessional;
const notPro = (c: NavContext) => !c.isProfessional;

export const ITEMS = {
  painel: { id: 'painel', label: 'Início', href: '/painel', icon: House, keywords: 'painel notificações' },
  pedidos: { id: 'pedidos', label: 'Meus pedidos', short: 'Pedidos', href: '/pedidos', icon: ClipboardList },
  novoPedido: { id: 'novo-pedido', label: 'Novo pedido', href: '/pedidos/novo', icon: PlusCircle, keywords: 'publicar contratar serviço' },
  contratacoes: { id: 'contratacoes', label: 'Contratações', href: '/contratacoes', icon: Handshake, keywords: 'serviços avaliar concluir' },
  profissionais: { id: 'profissionais', label: 'Buscar profissionais', short: 'Buscar', href: '/profissionais', icon: Search },
  oportunidades: { id: 'oportunidades', label: 'Oportunidades', short: 'Trabalhos', href: '/oportunidades', icon: Briefcase, visible: pro, keywords: 'pedidos abertos' },
  propostas: { id: 'propostas', label: 'Minhas propostas', short: 'Propostas', href: '/propostas', icon: Send, visible: pro },
  oferecer: { id: 'oferecer', label: 'Oferecer serviços', href: '/perfil#perfil-profissional', icon: Wrench, visible: notPro, keywords: 'profissional trabalhar' },
  mensagens: { id: 'mensagens', label: 'Mensagens', href: '/mensagens', icon: MessageCircle, counter: 'messages', keywords: 'conversas chat' },
  perfil: { id: 'perfil', label: 'Perfil', href: '/perfil', icon: User, keywords: 'foto dados portfólio' },
  planos: { id: 'planos', label: 'Planos', href: '/planos', icon: CreditCard, keywords: 'assinatura premium' },
  admin: { id: 'admin', label: 'Administração', href: '/admin', icon: Gauge, visible: (c) => c.isAdmin },
} satisfies Record<string, NavItem>;

export const APP_NAV: NavGroup[] = [
  { id: 'inicio', label: 'Início', items: [ITEMS.painel] },
  { id: 'contratar', label: 'Contratar', items: [ITEMS.pedidos, ITEMS.novoPedido, ITEMS.contratacoes, ITEMS.profissionais] },
  { id: 'trabalhar', label: 'Trabalhar', items: [ITEMS.oportunidades, ITEMS.propostas, ITEMS.oferecer] },
  { id: 'conversas', label: 'Conversas', items: [ITEMS.mensagens] },
  { id: 'conta', label: 'Conta', items: [ITEMS.perfil, ITEMS.planos] },
  { id: 'administracao', label: 'Administração', items: [ITEMS.admin], visible: (c) => c.isAdmin },
];

/** Links do topo no computador: o essencial do dia a dia. O resto fica no menu da conta e no Ctrl+K. */
export const topLinks = (ctx: NavContext): NavItem[] => [
  ITEMS.painel, ITEMS.pedidos, ITEMS.contratacoes,
  ...(ctx.isProfessional ? [ITEMS.oportunidades, ITEMS.propostas] : []),
  ITEMS.mensagens,
];

/** Abas da barra inferior no celular. A última posição é sempre o "Mais". */
export const bottomTabs = (ctx: NavContext): NavItem[] => [
  ITEMS.painel, ITEMS.pedidos,
  ctx.isProfessional ? ITEMS.oportunidades : ITEMS.contratacoes,
  ITEMS.mensagens,
];

export const ADMIN_NAV: NavGroup[] = [
  { id: 'geral', label: 'Geral', items: [{ id: 'admin-home', label: 'Visão geral', href: '/admin', icon: Gauge }] },
  {
    id: 'pessoas', label: 'Pessoas', items: [
      { id: 'admin-usuarios', label: 'Usuários', href: '/admin/usuarios', icon: Users },
      { id: 'admin-verificacoes', label: 'Verificações', href: '/admin/verificacoes', icon: BadgeCheck },
      { id: 'admin-denuncias', label: 'Denúncias', href: '/admin/denuncias', icon: Flag },
    ],
  },
  {
    id: 'receita', label: 'Receita', items: [
      { id: 'admin-planos', label: 'Planos', href: '/admin/planos', icon: CreditCard },
      { id: 'admin-assinaturas', label: 'Assinaturas', href: '/admin/assinaturas', icon: Receipt },
    ],
  },
  { id: 'seguranca', label: 'Segurança', items: [{ id: 'admin-auditoria', label: 'Auditoria', href: '/admin/auditoria', icon: FileClock }] },
];

export const visibleGroups = (groups: NavGroup[], ctx: NavContext) =>
  groups
    .filter((g) => !g.visible || g.visible(ctx))
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.visible || i.visible(ctx)) }))
    .filter((g) => g.items.length > 0);

const pathOf = (href: string) => href.split('#')[0];

/** Item ativo: o de prefixo mais longo que casa com a rota ("/pedidos/novo" vence "/pedidos"). */
export function activeItem(pathname: string, items: NavItem[]): NavItem | undefined {
  return items
    .filter((i) => { const p = pathOf(i.href); return pathname === p || pathname.startsWith(`${p}/`); })
    .sort((a, b) => pathOf(b.href).length - pathOf(a.href).length)[0];
}

/** Grupo e item da rota atual, para os breadcrumbs. */
export function trail(pathname: string, groups: NavGroup[]) {
  const item = activeItem(pathname, groups.flatMap((g) => g.items));
  const group = item && groups.find((g) => g.items.includes(item));
  return { group, item };
}
