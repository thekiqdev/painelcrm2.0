import type { LucideIcon } from "lucide-react";
import {
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
} from "lucide-react";

export type SuperAdminHubCardDef = {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export type SuperAdminHubAreaDef = {
  /** Path completo (ex.: `/superadmin/comercial`) para corresponder a `location.pathname`. */
  path: string;
  title: string;
  description: string;
  cards: SuperAdminHubCardDef[];
};

export const superAdminHubAreas: SuperAdminHubAreaDef[] = [
  {
    path: "/superadmin/comercial",
    title: "Comercial",
    description:
      "Planos de subscrição e catálogo de recursos do sistema. Utilize as ligações abaixo para gerir preços, bundles e flags disponíveis nos contratos SaaS.",
    cards: [
      {
        to: "/superadmin/plans",
        title: "Planos",
        description: "Criar, editar e ordenar planos comerciais e preços.",
        icon: Package,
      },
      {
        to: "/superadmin/features",
        title: "Recursos do sistema",
        description: "Definir flags e recursos globais atribuíveis a planos e tenants.",
        icon: Flag,
      },
    ],
  },
  {
    path: "/superadmin/financeiro",
    title: "Financeiro",
    description:
      "Faturação da plataforma, gateway de cobrança SaaS, opções de ciclos de assinatura e relatórios exportáveis.",
    cards: [
      {
        to: "/superadmin/platform-billings",
        title: "Cobranças da plataforma",
        description: "Consultar faturas e cobranças internas do PainelCRM (SaaS).",
        icon: Receipt,
      },
      {
        to: "/superadmin/pagamentos",
        title: "Gateway de pagamento",
        description: "Configurar credenciais e métodos do gateway usado na cobrança da plataforma.",
        icon: CreditCard,
      },
      {
        to: "/superadmin/subscription-cycles",
        title: "Ciclos de assinatura",
        description: "Controlar leitura e escrita de dados de ciclos nas ferramentas internas.",
        icon: Repeat2,
      },
      {
        to: "/superadmin/reports",
        title: "Relatórios",
        description: "Adoção, receita estimada, churn e exportações CSV.",
        icon: BarChart3,
      },
    ],
  },
  {
    path: "/superadmin/comunicacao",
    title: "Comunicação",
    description:
      "Alertas internos, anúncios aos clientes, motor de notificações dos tenants, templates e canal da plataforma.",
    cards: [
      {
        to: "/superadmin/notifications",
        title: "Alertas operacionais",
        description: "Avisos internos (trials, cadastros) e verificação programática.",
        icon: Bell,
      },
      {
        to: "/superadmin/announcements",
        title: "Anúncios aos clientes",
        description: "Comunicados WhatsApp e página de atualizações.",
        icon: Megaphone,
      },
      {
        to: "/superadmin/notifications-engine",
        title: "Motor de notificações",
        description: "Ativar ou pausar globalmente o motor transacional dos tenants.",
        icon: Settings2,
      },
      {
        to: "/superadmin/notification-templates",
        title: "Templates padrão",
        description: "Editar templates sistema do CRM (e-mail e WhatsApp dos tenants).",
        icon: FileText,
      },
      {
        to: "/superadmin/platform-notifications",
        title: "Notificações da plataforma",
        description: "Eventos platform.*, histórico de envios e WhatsApp da instância plataforma.",
        icon: Building2,
      },
    ],
  },
  {
    path: "/superadmin/plataforma",
    title: "Plataforma",
    description:
      "Conteúdo institucional e páginas públicas geridas centralmente.",
    cards: [
      {
        to: "/superadmin/configuracoes/legal",
        title: "Páginas legais",
        description: "Política de privacidade, termos e textos legais públicos.",
        icon: Scale,
      },
    ],
  },
  {
    path: "/superadmin/seguranca",
    title: "Segurança",
    description:
      "Administradores com acesso ao Super Admin e registo de auditoria global.",
    cards: [
      {
        to: "/superadmin/users",
        title: "Administradores",
        description: "Criar, remover e gerir contas de super administrador.",
        icon: UserCog,
      },
      {
        to: "/superadmin/audit",
        title: "Auditoria",
        description: "Registo de ações administrativas na plataforma (paginado).",
        icon: ScrollText,
      },
    ],
  },
];

export function getSuperAdminHubByPath(pathname: string): SuperAdminHubAreaDef | undefined {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return superAdminHubAreas.find((h) => h.path === normalized);
}
