import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Calendar,
  CalendarSync,
  ClipboardCheck,
  CalendarDays,
  CreditCard,
  FileSearch,
  FileText,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  LifeBuoy,
  List,
  MessageSquare,
  Newspaper,
  Package,
  PieChart,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Tags,
  User,
  UserCircle,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";
import { routePreload } from "@/routePreload";

/** Ordem de exibição dos grupos no menu “Mais”. */
export const MOBILE_MORE_GROUP_ORDER: readonly string[] = [
  "Visão geral",
  "Relacionamento",
  "Atendimento",
  "Faturamento",
  "Vendas",
  "Documentação comercial",
  "Modelos",
  "Loja online",
  "Projetos",
  "Financeiro",
  "Conta",
] as const;

export type MobileMoreMenuFlags = {
  dashboard: boolean;
  clients: boolean;
  leads: boolean;
  funnels: boolean;
  products: boolean;
  projects: boolean;
  tasks: boolean;
  agenda: boolean;
  chat: boolean;
  tickets: boolean;
  chatbot_flows: boolean;
  proposals: boolean;
  contracts: boolean;
  invoices: boolean;
  expenses: boolean;
  settings: boolean;
};

export type MobileMoreMenuContext = {
  flags: MobileMoreMenuFlags;
  canView: (moduleId: string) => boolean;
  isSuperAdmin: boolean;
};

export const MOBILE_MORE_ICONS = {
  LayoutDashboard,
  Users,
  User,
  UserPlus,
  List,
  FileText,
  FileSearch,
  Receipt,
  CreditCard,
  CalendarSync,
  MessageSquare,
  LayoutGrid,
  LifeBuoy,
  Workflow,
  Package,
  ShoppingCart,
  Store,
  Calendar,
  ClipboardCheck,
  CalendarDays,
  LayoutTemplate,
  Newspaper,
  Landmark,
  ArrowLeftRight,
  Tags,
  PieChart,
  Settings,
  UserCircle,
  Sparkles,
  ShieldCheck,
} satisfies Record<string, LucideIcon>;

export type MobileMoreIconKey = keyof typeof MOBILE_MORE_ICONS;

export const MOBILE_MORE_ITEM_DEFS = [
  {
    id: "dashboard",
    label: "Dashboard",
    to: "/dashboard",
    description: "Indicadores e resumo",
    icon: "LayoutDashboard" as const,
    group: "Visão geral",
    featureFlag: "dashboard" as const,
    moduleView: "dashboard",
    quickRank: 5,
    tone: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
    preload: "dashboard" as const,
  },
  {
    id: "clients",
    label: "Clientes",
    to: "/clients",
    description: "Base e cadastros",
    icon: "User" as const,
    group: "Relacionamento",
    featureFlag: "clients" as const,
    moduleView: "clients",
    quickRank: 10,
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    preload: "clients",
  },
  {
    id: "leads",
    label: "Leads",
    to: "/leads",
    description: "Oportunidades a qualificar",
    icon: "UserPlus" as const,
    group: "Relacionamento",
    featureFlag: "leads" as const,
    moduleView: "leads",
    quickRank: 0,
    tone: "bg-violet-500/10 text-violet-700 dark:text-violet-200",
    preload: "leads",
  },
  {
    id: "funnel",
    label: "Funil de vendas",
    to: "/funnel",
    description: "Etapas e oportunidades",
    icon: "List" as const,
    group: "Vendas",
    featureFlag: "funnels" as const,
    moduleView: "funnels",
    quickRank: 15,
    tone: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-200",
    preload: "funnel",
  },
  {
    id: "customer-invoices",
    label: "Faturas",
    to: "/customer-invoices",
    description: "Cobranças a clientes",
    icon: "FileText" as const,
    group: "Faturamento",
    featureFlag: "invoices" as const,
    moduleView: "billing",
    quickRank: 12,
    tone: "bg-blue-500/10 text-blue-700 dark:text-blue-200",
    preload: "customerInvoices",
  },
  {
    id: "crm-subscriptions",
    label: "Assinaturas",
    to: "/crm-subscriptions",
    description: "Assinaturas CRM",
    icon: "CalendarSync" as const,
    group: "Faturamento",
    featureFlag: "invoices" as const,
    moduleView: "billing",
    quickRank: 40,
    tone: "bg-teal-500/10 text-teal-800 dark:text-teal-200",
    preload: "crmSubscriptions",
  },
  {
    id: "proposals",
    label: "Propostas",
    to: "/proposals",
    description: "Propostas comerciais",
    icon: "FileText" as const,
    group: "Documentação comercial",
    featureFlag: "proposals" as const,
    moduleView: "proposals",
    quickRank: 1,
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-200",
    preload: "proposals",
  },
  {
    id: "contracts",
    label: "Contratos",
    to: "/contracts",
    description: "Contratos e documentos",
    icon: "FileSearch" as const,
    group: "Documentação comercial",
    featureFlag: "contracts" as const,
    moduleView: "contracts",
    quickRank: 2,
    tone: "bg-orange-500/10 text-orange-800 dark:text-orange-200",
    preload: "contracts",
  },
  {
    id: "project-templates",
    label: "Templates de projeto",
    to: "/project-templates",
    description: "Modelos para novos projetos",
    icon: "LayoutTemplate" as const,
    group: "Modelos",
    featureFlag: "tasks" as const,
    moduleView: "project_templates",
    quickRank: 55,
    tone: "bg-slate-500/10 text-slate-800 dark:text-slate-200",
    preload: "projectTemplates",
  },
  {
    id: "proposal-templates",
    label: "Modelos de proposta",
    to: "/proposals/templates",
    description: "Biblioteca de modelos",
    icon: "FileText" as const,
    group: "Modelos",
    featureFlag: "proposals" as const,
    moduleView: "proposals",
    quickRank: 56,
    tone: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
    preload: "proposals",
  },
  {
    id: "contract-templates",
    label: "Modelos de contrato",
    to: "/contracts/templates",
    description: "Biblioteca de modelos",
    icon: "FileSearch" as const,
    group: "Modelos",
    featureFlag: "contracts" as const,
    moduleView: "contracts",
    quickRank: 57,
    tone: "bg-orange-500/10 text-orange-800 dark:text-orange-200",
    preload: "contracts",
  },
  {
    id: "chat",
    label: "Chat",
    to: "/chat",
    description: "Conversas em tempo real",
    icon: "MessageSquare" as const,
    group: "Atendimento",
    featureFlag: "chat" as const,
    moduleView: "chat",
    quickRank: 20,
    tone: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-200",
    preload: "chat",
  },
  {
    id: "chat-kanban",
    label: "Kanban do chat",
    to: "/chat/kanbam",
    description: "Pipelines de conversas",
    icon: "LayoutGrid" as const,
    group: "Atendimento",
    featureFlag: "chat" as const,
    moduleView: "chat",
    quickRank: 4,
    tone: "bg-purple-500/10 text-purple-700 dark:text-purple-200",
    preload: "chatKanban",
  },
  {
    id: "tickets",
    label: "Tickets",
    to: "/support/tickets",
    description: "Suporte e pedidos",
    icon: "LifeBuoy" as const,
    group: "Atendimento",
    featureFlag: "tickets" as const,
    moduleView: "tickets",
    quickRank: 3,
    tone: "bg-rose-500/10 text-rose-700 dark:text-rose-200",
    preload: "tickets",
  },
  {
    id: "chatbot_flows",
    label: "Chatbot Flows",
    to: "/chatbot-flows",
    description: "Fluxos visuais de atendimento",
    icon: "Workflow" as const,
    group: "Atendimento",
    featureFlag: "chatbot_flows" as const,
    moduleView: "chatbot_flows",
    quickRank: 7,
    tone: "bg-teal-500/10 text-teal-800 dark:text-teal-200",
    preload: "chatbotFlows" as const,
  },
  {
    id: "catalog",
    label: "Catálogo",
    to: "/admin/products",
    description: "Produtos e serviços",
    icon: "Package" as const,
    group: "Loja online",
    featureFlag: "products" as const,
    moduleView: "products",
    quickRank: 6,
    tone: "bg-lime-500/10 text-lime-900 dark:text-lime-200",
    preload: "products",
  },
  {
    id: "orders",
    label: "Pedidos",
    to: "/orders",
    description: "Encomendas da loja",
    icon: "ShoppingCart" as const,
    group: "Loja online",
    featureFlag: "products" as const,
    moduleView: "products",
    quickRank: 50,
    tone: "bg-green-500/10 text-green-800 dark:text-green-200",
    preload: "orders",
  },
  {
    id: "store-settings",
    label: "Config. da loja",
    to: "/admin/loja",
    description: "Loja pública e checkout",
    icon: "Store" as const,
    group: "Loja online",
    featureFlag: "products" as const,
    moduleView: "products",
    quickRank: 52,
    tone: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    preload: "storeSettings",
  },
  {
    id: "projects",
    label: "Projetos",
    to: "/projects",
    description: "Projetos e entregas",
    icon: "Calendar" as const,
    group: "Projetos",
    featureFlag: "projects" as const,
    moduleView: "projects",
    quickRank: 30,
    tone: "bg-blue-500/10 text-blue-800 dark:text-blue-200",
    preload: "projects",
  },
  {
    id: "tasks",
    label: "Tarefas",
    to: "/tasks",
    description: "Tarefas e checklist",
    icon: "ClipboardCheck" as const,
    group: "Projetos",
    featureFlag: "tasks" as const,
    moduleView: "tasks",
    quickRank: 35,
    tone: "bg-cyan-500/10 text-cyan-800 dark:text-cyan-200",
    preload: "tasks",
  },
  {
    id: "agenda",
    label: "Agenda",
    to: "/agenda",
    description: "Compromissos e calendário",
    icon: "CalendarDays" as const,
    group: "Relacionamento",
    featureFlag: "agenda" as const,
    moduleView: "agenda",
    quickRank: 33,
    tone: "bg-violet-500/10 text-violet-800 dark:text-violet-200",
    preload: "agenda",
  },
  {
    id: "updates",
    label: "Atualizações",
    to: "/updates",
    description: "Novidades do produto",
    icon: "Newspaper" as const,
    group: "Conta",
    featureFlag: "dashboard" as const,
    moduleView: "dashboard",
    quickRank: 103,
    tone: "bg-muted text-foreground",
  },
  {
    id: "finance-overview",
    label: "Resumo geral",
    to: "/finance",
    description: "Visão consolidada",
    icon: "LayoutDashboard" as const,
    group: "Financeiro",
    featureFlag: "expenses" as const,
    moduleView: "finance",
    quickRank: 60,
    tone: "bg-teal-500/10 text-teal-800 dark:text-teal-200",
    preload: "finance",
  },
  {
    id: "finance-accounts",
    label: "Bancos e contas",
    to: "/finance/accounts",
    description: "Contas e saldos",
    icon: "Landmark" as const,
    group: "Financeiro",
    featureFlag: "expenses" as const,
    moduleView: "finance",
    quickRank: 61,
    tone: "bg-teal-500/10 text-teal-800 dark:text-teal-200",
    preload: "finance",
  },
  {
    id: "finance-transactions",
    label: "Entradas e saídas",
    to: "/finance/transactions",
    description: "Movimentações",
    icon: "ArrowLeftRight" as const,
    group: "Financeiro",
    featureFlag: "expenses" as const,
    moduleView: "finance",
    quickRank: 62,
    tone: "bg-teal-500/10 text-teal-800 dark:text-teal-200",
    preload: "finance",
  },
  {
    id: "finance-expenses",
    label: "Contas a pagar",
    to: "/finance/accounts-payable",
    description: "Avulsas e recorrentes",
    icon: "Receipt" as const,
    group: "Financeiro",
    featureFlag: "expenses" as const,
    moduleView: "finance",
    quickRank: 63,
    tone: "bg-teal-500/10 text-teal-800 dark:text-teal-200",
    preload: "finance",
  },
  {
    id: "finance-categories",
    label: "Categorias",
    to: "/finance/categories",
    description: "Classificação",
    icon: "Tags" as const,
    group: "Financeiro",
    featureFlag: "expenses" as const,
    moduleView: "finance",
    quickRank: 64,
    tone: "bg-teal-500/10 text-teal-800 dark:text-teal-200",
    preload: "finance",
  },
  {
    id: "finance-cards",
    label: "Cartões de crédito",
    to: "/finance/credit-cards",
    description: "Faturas e limites",
    icon: "CreditCard" as const,
    group: "Financeiro",
    featureFlag: "expenses" as const,
    moduleView: "finance",
    quickRank: 66,
    tone: "bg-teal-500/10 text-teal-800 dark:text-teal-200",
    preload: "finance",
  },
  {
    id: "finance-reports",
    label: "Relatórios",
    to: "/finance/relatorios",
    description: "Análises financeiras",
    icon: "PieChart" as const,
    group: "Financeiro",
    featureFlag: "expenses" as const,
    moduleView: "finance",
    quickRank: 67,
    tone: "bg-teal-500/10 text-teal-800 dark:text-teal-200",
    preload: "finance",
  },
  {
    id: "profile",
    label: "Meu perfil",
    to: "/profile",
    description: "Dados pessoais",
    icon: "UserCircle" as const,
    group: "Conta",
    featureFlag: "dashboard" as const,
    moduleView: "settings",
    quickRank: 100,
    tone: "bg-muted text-foreground",
  },
  {
    id: "meu-plano",
    label: "Meu plano",
    to: "/meu-plano",
    description: "Subscrição e facturação",
    icon: "Sparkles" as const,
    group: "Conta",
    featureFlag: "dashboard" as const,
    moduleView: "meu_plano",
    quickRank: 101,
    tone: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
    preload: "meuPlano",
  },
  {
    id: "settings",
    label: "Configurações",
    to: "/settings",
    description: "Conta e integrações",
    icon: "Settings" as const,
    group: "Conta",
    featureFlag: "settings" as const,
    moduleView: "settings",
    quickRank: 102,
    tone: "bg-slate-500/10 text-slate-800 dark:text-slate-200",
    preload: "settings",
  },
  {
    id: "superadmin",
    label: "Administração",
    to: "/superadmin",
    description: "Plataforma",
    icon: "ShieldCheck" as const,
    group: "Conta",
    featureFlag: "dashboard" as const,
    moduleView: "dashboard",
    quickRank: 200,
    tone: "bg-destructive/10 text-destructive",
    superAdminOnly: true,
  },
] as const;

export type MobileMoreItemDef = (typeof MOBILE_MORE_ITEM_DEFS)[number];
export type MobileMoreQuickActionId = MobileMoreItemDef["id"];

/**
 * Ordem inicial do strip "Acesso rápido" (menu Mais mobile) quando ainda não há preferências guardadas.
 * Alinhado ao padrão de produto: Leads → Propostas → Contratos → Tickets → Clientes → Faturas.
 */
export const DEFAULT_MOBILE_QUICK_ACCESS_STRIP_IDS: readonly MobileMoreQuickActionId[] = [
  "leads",
  "proposals",
  "contracts",
  "tickets",
  "clients",
  "customer-invoices",
];

export type MobileMoreQuickAccessPrefsV1 = {
  v: 1;
  disabledIds: MobileMoreQuickActionId[];
  order: MobileMoreQuickActionId[];
};

const PREFS_STORAGE_PREFIX = "painelcrm.mobileMoreQuickAccess.v1:";

export function mobileMoreQuickAccessStorageKey(userId: string): string {
  return `${PREFS_STORAGE_PREFIX}${userId}`;
}

const ALL_IDS = new Set<string>(MOBILE_MORE_ITEM_DEFS.map((d) => d.id));

export function parseMobileMoreQuickAccessPrefs(raw: string | null): MobileMoreQuickAccessPrefsV1 | null {
  if (!raw?.trim()) return null;
  try {
    const j = JSON.parse(raw) as Partial<MobileMoreQuickAccessPrefsV1>;
    if (j?.v !== 1 || !Array.isArray(j.order) || !Array.isArray(j.disabledIds)) return null;
    return {
      v: 1,
      order: j.order.filter((id): id is MobileMoreQuickActionId => ALL_IDS.has(id as string)),
      disabledIds: j.disabledIds.filter((id): id is MobileMoreQuickActionId => ALL_IDS.has(id as string)),
    };
  } catch {
    return null;
  }
}

export function buildMobileMoreQuickAccessPrefsFromState(
  order: MobileMoreQuickActionId[],
  disabledIds: MobileMoreQuickActionId[],
): MobileMoreQuickAccessPrefsV1 {
  return { v: 1, order, disabledIds };
}

export function isMobileMoreItemVisible(def: MobileMoreItemDef, ctx: MobileMoreMenuContext): boolean {
  if ("superAdminOnly" in def && def.superAdminOnly) {
    return ctx.isSuperAdmin;
  }
  if (def.id === "updates") {
    return true;
  }
  if (def.id === "profile") {
    return true;
  }
  const ff = ctx.flags[def.featureFlag];
  if (!ff || !ctx.canView(def.moduleView)) return false;
  return true;
}

/** Lista completa de itens visíveis: primeiro a ordem padrão do strip, depois o restante por `quickRank`. */
export function defaultVisiblePriorityOrder(ctx: MobileMoreMenuContext): MobileMoreQuickActionId[] {
  const visible = MOBILE_MORE_ITEM_DEFS.filter((d) => isMobileMoreItemVisible(d, ctx));
  const visibleSet = new Set(visible.map((d) => d.id));
  const ordered: MobileMoreQuickActionId[] = [];
  for (const id of DEFAULT_MOBILE_QUICK_ACCESS_STRIP_IDS) {
    if (visibleSet.has(id)) ordered.push(id);
  }
  const remaining = visible
    .map((d) => d.id)
    .filter((id) => !ordered.includes(id))
    .sort((a, b) => {
      const da = MOBILE_MORE_ITEM_DEFS.find((d) => d.id === a);
      const db = MOBILE_MORE_ITEM_DEFS.find((d) => d.id === b);
      return (da?.quickRank ?? 999) - (db?.quickRank ?? 999);
    });
  return [...ordered, ...remaining];
}

/**
 * Preferências efectivas sem persistência: acesso rápido mostra só os 6 atalhos padrão
 * (Leads → Propostas → Contratos → Tickets → Clientes → Faturas), na medida em que estiverem
 * visíveis por flags/permissões; o restante fica desactivado até o utilizador personalizar.
 */
export function effectiveMobileMoreQuickAccessPrefs(
  ctx: MobileMoreMenuContext,
  prefs: MobileMoreQuickAccessPrefsV1 | null,
): MobileMoreQuickAccessPrefsV1 {
  if (prefs) return prefs;
  const fullOrder = defaultVisiblePriorityOrder(ctx);
  const visibleIds = MOBILE_MORE_ITEM_DEFS.filter((d) => isMobileMoreItemVisible(d, ctx)).map((d) => d.id);
  const stripDefaultSet = new Set<MobileMoreQuickActionId>(DEFAULT_MOBILE_QUICK_ACCESS_STRIP_IDS);
  const disabledIds = visibleIds.filter((id) => !stripDefaultSet.has(id));
  return { v: 1, order: fullOrder, disabledIds };
}

function mergeOrder(
  prefs: MobileMoreQuickAccessPrefsV1,
  visibleIds: Set<MobileMoreQuickActionId>,
  defaultOrder: MobileMoreQuickActionId[],
): MobileMoreQuickActionId[] {
  const disabled = new Set(prefs.disabledIds);
  let order = prefs.order.filter((id) => visibleIds.has(id) && !disabled.has(id));
  for (const id of defaultOrder) {
    if (visibleIds.has(id) && !disabled.has(id) && !order.includes(id)) {
      order.push(id);
    }
  }
  const seen = new Set<MobileMoreQuickActionId>();
  return order.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return visibleIds.has(id) && !disabled.has(id);
  });
}

/** Ordem completa dos itens activos para o acesso rápido (sem limite de quantidade). */
export function computeFullMobileQuickAccessOrder(
  ctx: MobileMoreMenuContext,
  prefs: MobileMoreQuickAccessPrefsV1 | null,
): MobileMoreQuickActionId[] {
  const eff = effectiveMobileMoreQuickAccessPrefs(ctx, prefs);
  const visibleDefs = MOBILE_MORE_ITEM_DEFS.filter((d) => isMobileMoreItemVisible(d, ctx));
  const visibleIds = new Set(visibleDefs.map((d) => d.id));
  const defaultOrder = defaultVisiblePriorityOrder(ctx);
  return mergeOrder(eff, visibleIds, defaultOrder);
}

export type MobileQuickAccessRuntimeItem = {
  id: MobileMoreQuickActionId;
  label: string;
  to: string;
  icon: LucideIcon;
  tone: string;
  preload?: () => Promise<unknown>;
};

export function resolveMobileQuickAccessRuntime(
  id: MobileMoreQuickActionId,
): Omit<MobileQuickAccessRuntimeItem, "id"> | null {
  const def = MOBILE_MORE_ITEM_DEFS.find((d) => d.id === id);
  if (!def) return null;
  const Icon = MOBILE_MORE_ICONS[def.icon];
  const preload = def.preload ? routePreload[def.preload] : undefined;
  return {
    label: def.label,
    to: def.to,
    icon: Icon,
    tone: def.tone,
    preload,
  };
}

/** Itens mostrados no bloco “Acesso rápido” (todos os activos na ordem guardada). */
export function computeMobileQuickAccessStrip(
  ctx: MobileMoreMenuContext,
  prefs: MobileMoreQuickAccessPrefsV1 | null,
): MobileQuickAccessRuntimeItem[] {
  const order = computeFullMobileQuickAccessOrder(ctx, prefs);
  const out: MobileQuickAccessRuntimeItem[] = [];
  for (const id of order) {
    const run = resolveMobileQuickAccessRuntime(id);
    if (!run) continue;
    out.push({ id, ...run });
  }
  return out;
}

export function groupIndex(title: string): number {
  const i = MOBILE_MORE_GROUP_ORDER.indexOf(title);
  return i === -1 ? 999 : i;
}
