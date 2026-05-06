import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Package,
  Flag,
  Receipt,
  CreditCard,
  Repeat2,
  BarChart3,
  Bell,
  Megaphone,
  Settings2,
  FileText,
  Building2,
  Scale,
  UserCog,
  ScrollText,
  Briefcase,
  Wallet,
  MessageSquare,
  Globe,
  Shield,
  Mail,
  Link2,
  RadioTower,
  Terminal,
  FileCode2,
} from "lucide-react";

/** Item da sidebar do Super Admin — `to` deve coincidir com rotas em `App.tsx`. */
export type SuperAdminNavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  /** `true` só para match exato (ex.: raiz `/superadmin` sem ativar em sub-rotas). */
  end?: boolean;
};

export type SuperAdminNavGroup = {
  id: string;
  label: string;
  items: SuperAdminNavItem[];
};

/**
 * Navegação declarativa — Fase 1 reorganização (labels e grupos).
 * Não alterar paths sem atualizar `App.tsx` e documentação.
 */
export const superAdminNavGroups: SuperAdminNavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    items: [
      {
        label: "Visão geral",
        to: "/superadmin",
        icon: LayoutDashboard,
        end: true,
      },
    ],
  },
  {
    id: "empresas",
    label: "Empresas",
    items: [
      {
        label: "Empresas cadastradas",
        to: "/superadmin/clients",
        icon: Users,
      },
      {
        label: "Nova empresa",
        to: "/superadmin/clients/new",
        icon: UserPlus,
      },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    items: [
      {
        label: "Visão comercial",
        to: "/superadmin/comercial",
        icon: Briefcase,
        end: true,
      },
      {
        label: "Planos",
        to: "/superadmin/plans",
        icon: Package,
      },
      {
        label: "Recursos do sistema",
        to: "/superadmin/features",
        icon: Flag,
      },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    items: [
      {
        label: "Visão financeira",
        to: "/superadmin/financeiro",
        icon: Wallet,
        end: true,
      },
      {
        label: "Cobranças da plataforma",
        to: "/superadmin/platform-billings",
        icon: Receipt,
      },
      {
        label: "Gateway de pagamento",
        to: "/superadmin/pagamentos",
        icon: CreditCard,
      },
      {
        label: "Ciclos de assinatura",
        to: "/superadmin/subscription-cycles",
        icon: Repeat2,
      },
      {
        label: "Relatórios",
        to: "/superadmin/reports",
        icon: BarChart3,
      },
    ],
  },
  {
    id: "conexoes",
    label: "Conexões",
    items: [
      {
        label: "Central de conexões",
        to: "/superadmin/conexoes",
        icon: Link2,
        end: true,
      },
      {
        label: "WhatsApp oficial (Meta)",
        to: "/superadmin/conexoes/whatsapp-oficial",
        icon: MessageSquare,
      },
      {
        label: "WhatsApp (UazAPI)",
        to: "/superadmin/conexoes/uazapi",
        icon: RadioTower,
      },
    ],
  },
  {
    id: "comunicacao",
    label: "Comunicação",
    items: [
      {
        label: "Central de comunicação",
        to: "/superadmin/comunicacao",
        icon: MessageSquare,
        end: true,
      },
      {
        label: "Alertas operacionais",
        to: "/superadmin/notifications",
        icon: Bell,
      },
      {
        label: "Anúncios aos clientes",
        to: "/superadmin/announcements",
        icon: Megaphone,
      },
      {
        label: "Motor de notificações",
        to: "/superadmin/notifications-engine",
        icon: Settings2,
      },
      {
        label: "Templates padrão",
        to: "/superadmin/notification-templates",
        icon: FileText,
      },
      {
        label: "Notificações da plataforma",
        to: "/superadmin/platform-notifications",
        icon: Building2,
      },
      {
        label: "SMTP",
        to: "/superadmin/smtp",
        icon: Mail,
      },
    ],
  },
  {
    id: "plataforma",
    label: "Plataforma",
    items: [
      {
        label: "Visão da plataforma",
        to: "/superadmin/plataforma",
        icon: Globe,
        end: true,
      },
      {
        label: "Páginas legais",
        to: "/superadmin/configuracoes/legal",
        icon: Scale,
      },
    ],
  },
  {
    id: "seguranca",
    label: "Segurança",
    items: [
      {
        label: "Visão de segurança",
        to: "/superadmin/seguranca",
        icon: Shield,
        end: true,
      },
      {
        label: "Administradores",
        to: "/superadmin/users",
        icon: UserCog,
      },
      {
        label: "Auditoria",
        to: "/superadmin/audit",
        icon: ScrollText,
      },
    ],
  },
  {
    id: "avancado",
    label: "Avançado",
    items: [
      {
        label: "Visão geral",
        to: "/superadmin/avancado",
        icon: Terminal,
        end: true,
      },
      {
        label: "Scripts",
        to: "/superadmin/avancado/scripts",
        icon: FileCode2,
      },
    ],
  },
];
