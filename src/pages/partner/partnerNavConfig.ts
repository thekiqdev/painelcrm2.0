import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  Link2,
  Package,
  Palette,
  Percent,
  Globe,
  Users,
  UserPlus,
} from 'lucide-react';

export type PartnerNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Visível só para partner_admin */
  adminOnly?: boolean;
};

export type PartnerNavGroup = {
  id: string;
  label: string;
  items: PartnerNavItem[];
};

export const partnerAdminNavGroups: PartnerNavGroup[] = [
  {
    id: 'home',
    label: 'Início',
    items: [{ to: '/partner', label: 'Visão geral', icon: LayoutDashboard, end: true }],
  },
  {
    id: 'config',
    label: 'Configuração',
    items: [
      { to: '/partner/config/identity', label: 'Identidade', icon: Building2, adminOnly: true },
      { to: '/partner/config/brand', label: 'Marca', icon: Palette, adminOnly: true },
      { to: '/partner/config/domain', label: 'Domínio', icon: Globe, adminOnly: true },
    ],
  },
  {
    id: 'sales',
    label: 'Vendas',
    items: [
      { to: '/partner/sales/link', label: 'Link de vendas', icon: Link2, adminOnly: true },
      { to: '/partner/plans', label: 'Planos', icon: Package, adminOnly: true },
      { to: '/partner/commissions', label: 'Comissões', icon: Percent, adminOnly: true },
    ],
  },
  {
    id: 'ops',
    label: 'Operação',
    items: [
      { to: '/partner/customers', label: 'Clientes', icon: Users, adminOnly: true },
      { to: '/partner/sellers', label: 'Vendedores', icon: UserPlus, adminOnly: true },
      { to: '/partner/licenses', label: 'Licenças', icon: KeyRound, adminOnly: true },
    ],
  },
  {
    id: 'finance',
    label: 'Financeiro',
    items: [{ to: '/partner/gateway', label: 'Gateway', icon: CreditCard, adminOnly: true }],
  },
];

export const partnerSellerNavItems: PartnerNavItem[] = [
  { to: '/partner', label: 'Início', icon: LayoutDashboard, end: true },
  { to: '/partner/sales/link', label: 'Meu link', icon: Link2 },
  { to: '/partner/commissions', label: 'Meus ganhos', icon: Percent },
];

export function isPartnerNavActive(pathname: string, to: string, end?: boolean): boolean {
  const p = pathname.replace(/\/$/, '') || '/';
  const t = to.replace(/\/$/, '') || '/';
  if (end) return p === t;
  if (p === t) return true;
  return p.startsWith(`${t}/`);
}
