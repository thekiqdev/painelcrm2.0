/**
 * Fonte única para itens de Configurações (sidebar desktop, hub mobile, busca).
 */
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Bot,
  Building,
  Calendar,
  CreditCard,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  LayoutTemplate,
  MessageSquare,
  PanelLeft,
  Settings,
  Shield,
  Tags,
  Users,
  Users2,
} from "lucide-react";

export type SettingSection =
  | "companyData"
  | "users"
  | "teams"
  | "userManagement"
  | "billing"
  | "notifications"
  | "security"
  | "preferences"
  | "leadsConfig"
  | "clientGroups"
  | "whatsapp"
  | "chatTemplates"
  | "domain"
  | "messageTemplates"
  | "paymentGateway"
  | "googleCalendar"
  | "googleDrive"
  | "agendaAvailability"
  | "chatAttendance"
  | "chatAutomation";

/** Grupos do hub mobile (pedido de UX). */
export type SettingsMobileCategory =
  | "Conta"
  | "Empresa"
  | "Comercial"
  | "Atendimento"
  | "Equipe"
  | "Sistema"
  | "Preferências";

export const SETTINGS_MOBILE_CATEGORY_ORDER: SettingsMobileCategory[] = [
  "Conta",
  "Empresa",
  "Comercial",
  "Atendimento",
  "Equipe",
  "Sistema",
  "Preferências",
];

/** Ordem das categorias na sidebar desktop (legado). */
export const SETTINGS_SIDEBAR_CATEGORY_ORDER = [
  "Geral",
  "Usuários e Acesso",
  "Preferências",
  "CRM",
  "Integrações",
  "Outros",
] as const;

export const INTEGRATIONS_SUBCATEGORY_ORDER = [
  "Mensagens",
  "Marca e domínio",
  "Modelos (CRM)",
  "Recebimentos",
  "Agenda",
  "Arquivos",
] as const;

const CHAT_AUTOMATION_UI_ENABLED = import.meta.env.VITE_CHAT_AUTOMATION_ENABLED === "true";

export type SettingsNavItem = {
  id: SettingSection;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Agrupamento sidebar desktop */
  sidebarCategory: string;
  /** Subtítulo na sidebar — Integrações */
  subcategory?: string;
  /** Hub mobile */
  mobileCategory: SettingsMobileCategory;
  /**
   * Segmento de URL para `/settings/:slug` (exceto rotas especiais).
   * `paymentGateway` usa só `/settings/payments`.
   */
  pathSegment: string | null;
};

const BASE_ITEMS: SettingsNavItem[] = [
  {
    id: "companyData",
    title: "Dados da Empresa",
    description: "Informações, identidade e dados cadastrais da empresa",
    icon: Building,
    sidebarCategory: "Geral",
    mobileCategory: "Empresa",
    pathSegment: "company",
  },
  {
    id: "billing",
    title: "Cobrança",
    description: "Plano, faturas e forma de pagamento",
    icon: CreditCard,
    sidebarCategory: "Geral",
    mobileCategory: "Comercial",
    pathSegment: "billing",
  },
  {
    id: "users",
    title: "Usuários",
    description: "Contas e acessos da equipe",
    icon: Users,
    sidebarCategory: "Usuários e Acesso",
    mobileCategory: "Equipe",
    pathSegment: "users",
  },
  {
    id: "teams",
    title: "Equipes",
    description: "Organização em equipes e grupos",
    icon: Users2,
    sidebarCategory: "Usuários e Acesso",
    mobileCategory: "Equipe",
    pathSegment: "teams",
  },
  {
    id: "userManagement",
    title: "Perfis de acesso",
    description: "Permissões e papéis no sistema",
    icon: Shield,
    sidebarCategory: "Usuários e Acesso",
    mobileCategory: "Equipe",
    pathSegment: "roles",
  },
  {
    id: "notifications",
    title: "Notificações",
    description: "Alertas e preferências de notificação",
    icon: Bell,
    sidebarCategory: "Preferências",
    mobileCategory: "Conta",
    pathSegment: "notifications",
  },
  {
    id: "security",
    title: "Segurança",
    description: "Senha, sessão e proteção da conta",
    icon: Settings,
    sidebarCategory: "Preferências",
    mobileCategory: "Conta",
    pathSegment: "security",
  },
  {
    id: "preferences",
    title: "Aparência",
    description: "Tema e layout do painel",
    icon: PanelLeft,
    sidebarCategory: "Preferências",
    mobileCategory: "Preferências",
    pathSegment: "preferences",
  },
  {
    id: "leadsConfig",
    title: "Configuração de Leads",
    description: "Funil e comportamento de leads",
    icon: Folder,
    sidebarCategory: "CRM",
    mobileCategory: "Comercial",
    pathSegment: "leads",
  },
  {
    id: "clientGroups",
    title: "Grupos de Clientes",
    description: "Segmentação de clientes",
    icon: Tags,
    sidebarCategory: "CRM",
    mobileCategory: "Comercial",
    pathSegment: "client-groups",
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    description: "Instâncias e conexões WhatsApp",
    icon: MessageSquare,
    sidebarCategory: "Integrações",
    subcategory: "Mensagens",
    mobileCategory: "Atendimento",
    pathSegment: "whatsapp",
  },
  {
    id: "chatTemplates",
    title: "Templates WhatsApp",
    description: "Modelos aprovados pela Meta",
    icon: LayoutTemplate,
    sidebarCategory: "Integrações",
    subcategory: "Mensagens",
    mobileCategory: "Atendimento",
    pathSegment: "chat-templates",
  },
  {
    id: "chatAttendance",
    title: "Chat e atendimento",
    description: "Filas, canais e atendimento",
    icon: MessageSquare,
    sidebarCategory: "Integrações",
    subcategory: "Mensagens",
    mobileCategory: "Atendimento",
    pathSegment: "chat",
  },
  {
    id: "domain",
    title: "Domínio",
    description: "Domínio e presença web",
    icon: Globe,
    sidebarCategory: "Integrações",
    subcategory: "Marca e domínio",
    mobileCategory: "Empresa",
    pathSegment: "domain",
  },
  {
    id: "messageTemplates",
    title: "Modelos de mensagem (CRM)",
    description: "Modelos para propostas e mensagens",
    icon: FileText,
    sidebarCategory: "Integrações",
    subcategory: "Modelos (CRM)",
    mobileCategory: "Atendimento",
    pathSegment: "message-templates",
  },
  {
    id: "paymentGateway",
    title: "Pagamentos",
    description: "Gateways Asaas, Mercado Pago e cobrança",
    icon: CreditCard,
    sidebarCategory: "Integrações",
    subcategory: "Recebimentos",
    mobileCategory: "Comercial",
    pathSegment: null,
  },
  {
    id: "googleCalendar",
    title: "Google Agenda",
    description: "Sincronização de calendário",
    icon: Calendar,
    sidebarCategory: "Integrações",
    subcategory: "Agenda",
    mobileCategory: "Sistema",
    pathSegment: "google-calendar",
  },
  {
    id: "googleDrive",
    title: "Google Drive",
    description: "Arquivos e integração Drive",
    icon: FolderOpen,
    sidebarCategory: "Integrações",
    subcategory: "Arquivos",
    mobileCategory: "Sistema",
    pathSegment: "google-drive",
  },
  {
    id: "agendaAvailability",
    title: "Disponibilidade da agenda",
    description: "Horários e bloqueios da agenda",
    icon: Calendar,
    sidebarCategory: "Integrações",
    subcategory: "Agenda",
    mobileCategory: "Sistema",
    pathSegment: "agenda-availability",
  },
];

const CHAT_AUTOMATION_ITEM: SettingsNavItem = {
  id: "chatAutomation",
  title: "Automação do chat (bot)",
  description: "Respostas e fluxos automáticos",
  icon: Bot,
  sidebarCategory: "Integrações",
  subcategory: "Mensagens",
  mobileCategory: "Atendimento",
  pathSegment: "chat-automation",
};

/** Lista completa respeitando feature flags. */
export function getSettingsNavItems(): SettingsNavItem[] {
  if (!CHAT_AUTOMATION_UI_ENABLED) return BASE_ITEMS;
  const idx = BASE_ITEMS.findIndex((i) => i.id === "chatAttendance");
  const next = [...BASE_ITEMS];
  next.splice(idx + 1, 0, CHAT_AUTOMATION_ITEM);
  return next;
}

const RESERVED_PATH_SEGMENTS = new Set(["payments", "integrations", "payment"]);

/** Slug da URL → secção (exceto rotas especiais). */
export function settingSectionFromPathSlug(slug: string): SettingSection | null {
  if (!slug || RESERVED_PATH_SEGMENTS.has(slug)) return null;
  const items = getSettingsNavItems();
  const hit = items.find((i) => i.pathSegment === slug);
  return hit ? hit.id : null;
}

/** Secção → path relativo (sem query). */
export function settingsPathForSection(section: SettingSection): string {
  if (section === "paymentGateway") return "/settings/payments";
  const items = getSettingsNavItems();
  const hit = items.find((i) => i.id === section);
  if (hit?.pathSegment) return `/settings/${hit.pathSegment}`;
  return "/settings";
}

export function settingsNavItemBySection(section: SettingSection): SettingsNavItem | undefined {
  return getSettingsNavItems().find((i) => i.id === section);
}

/** Valores aceites em ?section= / ?tab= (compatível com histórico). */
export const SECTION_QUERY_VALUES: SettingSection[] = [
  "companyData",
  "users",
  "teams",
  "userManagement",
  "billing",
  "notifications",
  "security",
  "preferences",
  "leadsConfig",
  "clientGroups",
  "whatsapp",
  "chatTemplates",
  "domain",
  "messageTemplates",
  "paymentGateway",
  "googleCalendar",
  "googleDrive",
  "agendaAvailability",
  "chatAttendance",
  "chatAutomation",
];

export function sectionFromQueryParam(raw: string | null): SettingSection | null {
  if (!raw) return null;
  return SECTION_QUERY_VALUES.includes(raw as SettingSection) ? (raw as SettingSection) : null;
}

export const SETTINGS_MOBILE_VIEW_STORAGE_KEY = "painelcrm_settings_mobile_view" as const;
export type SettingsMobileViewMode = "grid" | "list";
