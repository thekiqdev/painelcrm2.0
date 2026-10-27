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
    label: 'g_home',
    items: [{ to: '/partner', label: 'overview', icon: LayoutDashboard, end: true }],
  },
  {
    id: 'config',
    label: 'g_setup',
    items: [
      { to: '/partner/config/identity', label: 'identity', icon: Building2, adminOnly: true },
      { to: '/partner/config/brand', label: 'brand', icon: Palette, adminOnly: true },
      { to: '/partner/config/domain', label: 'domain', icon: Globe, adminOnly: true },
    ],
  },
  {
    id: 'sales',
    label: 'g_sales',
    items: [
      { to: '/partner/sales/link', label: 'sales_link', icon: Link2, adminOnly: true },
      { to: '/partner/plans', label: 'plans', icon: Package, adminOnly: true },
      { to: '/partner/commissions', label: 'commissions', icon: Percent, adminOnly: true },
    ],
  },
  {
    id: 'ops',
    label: 'g_ops',
    items: [
      { to: '/partner/customers', label: 'customers', icon: Users, adminOnly: true },
      { to: '/partner/sellers', label: 'sellers', icon: UserPlus, adminOnly: true },
      { to: '/partner/licenses', label: 'licenses', icon: KeyRound, adminOnly: true },
      { to: '/partner/platform-plan', label: 'platform_plan', icon: Package, adminOnly: true },
    ],
  },
  {
    id: 'finance',
    label: 'g_finance',
    items: [{ to: '/partner/gateway', label: 'gateway', icon: CreditCard, adminOnly: true }],
  },
];

export const partnerSellerNavItems: PartnerNavItem[] = [
  { to: '/partner', label: 'home', icon: LayoutDashboard, end: true },
  { to: '/partner/sales/link', label: 'my_link', icon: Link2 },
  { to: '/partner/commissions', label: 'my_earnings', icon: Percent },
];

export function isPartnerNavActive(pathname: string, to: string, end?: boolean): boolean {
  const p = pathname.replace(/\/$/, '') || '/';
  const t = to.replace(/\/$/, '') || '/';
  if (end) return p === t;
  if (p === t) return true;
  return p.startsWith(`${t}/`);
}
