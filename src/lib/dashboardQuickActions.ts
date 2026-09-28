import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CreditCard,
  DollarSign,
  FileSignature,
  FileText,
  MessageSquare,
  Receipt,
  TrendingUp,
  UserPlus,
} from "lucide-react";

/** Identificadores estáveis dos atalhos (persistência). */
export type DashboardQuickActionId =
  | "invoice_new"
  | "customer_charges"
  | "clients"
  | "proposal_new"
  | "contract_new"
  | "chat"
  | "finance_metrics"
  | "finance_income"
  | "finance_expense"
  | "finance_transfer";

export type DashboardQuickActionDef = {
  id: DashboardQuickActionId;
  label: string;
  /** Nome do ícone Lucide (mapa em `DASHBOARD_QUICK_ACTION_ICONS`). */
  icon: string;
  route: string;
  /** Cor de fundo / texto (Tailwind) — alinhado ao dashboard atual. */
  tone: string;
  defaultEnabled: boolean;
  defaultOrder: number;
  /** Flag de produto (`useFeatureFlag`). */
  featureFlag:
    | "invoices"
    | "clients"
    | "proposals"
    | "contracts"
    | "chat"
    | "expenses"
    | "dashboard";
  /** Módulo para `canView` (ModulePermissions). */
  moduleView: string;
  /** Se true, só aparece com `canManageFinance` (create/edit em finance). */
  requiresFinanceManage?: boolean;
};

export const DASHBOARD_QUICK_ACTION_DEFS: DashboardQuickActionDef[] = [
  {
    id: "invoice_new",
    label: "Nova cobrança",
    icon: "FileText",
    route: "/customer-invoices/new",
    tone: "bg-blue-500/10 text-blue-700 dark:text-blue-200",
    defaultEnabled: true,
    defaultOrder: 0,
    featureFlag: "invoices",
    moduleView: "billing",
  },
  {
    id: "customer_charges",
    label: "Faturas",
    icon: "Receipt",
    route: "/customer-invoices",
    tone: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
    defaultEnabled: true,
    defaultOrder: 1,
    featureFlag: "invoices",
    moduleView: "billing",
  },
  {
    id: "clients",
    label: "Clientes",
    icon: "UserPlus",
    route: "/clients",
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    defaultEnabled: true,
    defaultOrder: 2,
    featureFlag: "clients",
    moduleView: "clients",
  },
  {
    id: "proposal_new",
    label: "Nova proposta",
    icon: "FileText",
    route: "/proposals/new",
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-200",
    defaultEnabled: true,
    defaultOrder: 3,
    featureFlag: "proposals",
    moduleView: "proposals",
  },
  {
    id: "contract_new",
    label: "Novo contrato",
    icon: "FileSignature",
    route: "/contracts/new",
    tone: "bg-violet-500/10 text-violet-700 dark:text-violet-200",
    defaultEnabled: true,
    defaultOrder: 4,
    featureFlag: "contracts",
    moduleView: "contracts",
  },
  {
    id: "chat",
    label: "Chat",
    icon: "MessageSquare",
    route: "/chat",
    tone: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-200",
    defaultEnabled: true,
    defaultOrder: 5,
    featureFlag: "chat",
    moduleView: "chat",
  },
  {
    id: "finance_metrics",
    label: "Financeiro",
    icon: "DollarSign",
    route: "/finance",
    tone: "bg-teal-500/10 text-teal-700 dark:text-teal-200",
    defaultEnabled: true,
    defaultOrder: 6,
    featureFlag: "expenses",
    moduleView: "finance",
  },
  {
    id: "finance_income",
    label: "Lançar entrada",
    icon: "TrendingUp",
    route: "/finance/transactions?new=income",
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    defaultEnabled: true,
    defaultOrder: 7,
    featureFlag: "expenses",
    moduleView: "finance",
    requiresFinanceManage: true,
  },
  {
    id: "finance_expense",
    label: "Lançar despesa",
    icon: "AlertTriangle",
    route: "/finance/transactions?new=expense",
    tone: "bg-orange-500/10 text-orange-700 dark:text-orange-200",
    defaultEnabled: true,
    defaultOrder: 8,
    featureFlag: "expenses",
    moduleView: "finance",
    requiresFinanceManage: true,
  },
  {
    id: "finance_transfer",
    label: "Transferir",
    icon: "CreditCard",
    route: "/finance/accounts?transfer=1",
    tone: "bg-blue-500/10 text-blue-700 dark:text-blue-200",
    defaultEnabled: true,
    defaultOrder: 9,
    featureFlag: "expenses",
    moduleView: "finance",
    requiresFinanceManage: true,
  },
];

export const DASHBOARD_QUICK_ACTION_ICONS: Record<string, LucideIcon> = {
  FileText,
  CreditCard,
  Receipt,
  UserPlus,
  FileSignature,
  MessageSquare,
  DollarSign,
  TrendingUp,
  AlertTriangle,
};

export type DashboardQuickActionsPrefsV1 = {
  v: 1;
  /** IDs desativados pelo utilizador. */
  disabledIds: DashboardQuickActionId[];
  /** Ordem dos atalhos activos (só IDs visíveis e não desactivados). */
  order: DashboardQuickActionId[];
};

export type DashboardQuickActionContext = {
  flags: {
    invoices: boolean;
    clients: boolean;
    proposals: boolean;
    contracts: boolean;
    chat: boolean;
    expenses: boolean;
    dashboard: boolean;
  };
  canView: (moduleId: string) => boolean;
  canCreate: (moduleId: string) => boolean;
  canEdit: (moduleId: string) => boolean;
  canManageFinance: boolean;
};

export function isQuickActionVisible(def: DashboardQuickActionDef, ctx: DashboardQuickActionContext): boolean {
  if (def.id === "finance_metrics") {
    const financePath = ctx.flags.expenses && ctx.canView("finance");
    const metricsPath = ctx.flags.dashboard && ctx.canView("dashboard");
    return Boolean(financePath || metricsPath);
  }
  const ff = ctx.flags[def.featureFlag];
  if (!ff || !ctx.canView(def.moduleView)) return false;
  if (def.requiresFinanceManage && !ctx.canManageFinance) return false;
  return true;
}

export function resolveQuickActionRuntime(
  def: DashboardQuickActionDef,
  ctx: DashboardQuickActionContext,
): { to: string; label: string; icon: LucideIcon } | null {
  if (!isQuickActionVisible(def, ctx)) return null;
  const Icon = DASHBOARD_QUICK_ACTION_ICONS[def.icon] ?? FileText;
  if (def.id === "finance_metrics") {
    const useFinance = ctx.flags.expenses && ctx.canView("finance");
    if (useFinance) {
      return { to: "/finance", label: "Financeiro", icon: Icon };
    }
    return { to: "/dashboard", label: "Métricas", icon: Icon };
  }
  return { to: def.route, label: def.label, icon: Icon };
}

const PREFS_STORAGE_PREFIX = "painelcrm.dashboardQuickActions.v1:";

export function dashboardQuickActionsStorageKey(userId: string): string {
  return `${PREFS_STORAGE_PREFIX}${userId}`;
}

export function parseDashboardQuickActionsPrefs(raw: string | null): DashboardQuickActionsPrefsV1 | null {
  if (!raw?.trim()) return null;
  try {
    const j = JSON.parse(raw) as Partial<DashboardQuickActionsPrefsV1>;
    if (j?.v !== 1 || !Array.isArray(j.order) || !Array.isArray(j.disabledIds)) return null;
    return {
      v: 1,
      order: j.order.filter((id): id is DashboardQuickActionId =>
        DASHBOARD_QUICK_ACTION_DEFS.some((d) => d.id === id),
      ),
      disabledIds: j.disabledIds.filter((id): id is DashboardQuickActionId =>
        DASHBOARD_QUICK_ACTION_DEFS.some((d) => d.id === id),
      ),
    };
  } catch {
    return null;
  }
}

function defaultOrderForVisible(
  visibleDefs: DashboardQuickActionDef[],
  ctx: DashboardQuickActionContext,
): DashboardQuickActionId[] {
  const resolved = visibleDefs
    .map((d) => ({ def: d, run: resolveQuickActionRuntime(d, ctx) }))
    .filter((x): x is { def: DashboardQuickActionDef; run: NonNullable<ReturnType<typeof resolveQuickActionRuntime>> } =>
      Boolean(x.run),
    );
  resolved.sort((a, b) => a.def.defaultOrder - b.def.defaultOrder);
  return resolved.map((x) => x.def.id);
}

/** Lista final de atalhos a mostrar (ordenados, só activos). */
export function computeOrderedQuickActions(
  ctx: DashboardQuickActionContext,
  prefs: DashboardQuickActionsPrefsV1 | null,
): Array<{
  id: DashboardQuickActionId;
  label: string;
  to: string;
  icon: LucideIcon;
  tone: string;
}> {
  const visibleDefs = DASHBOARD_QUICK_ACTION_DEFS.filter((d) => isQuickActionVisible(d, ctx));
  const visibleIds = new Set(visibleDefs.map((d) => d.id));
  const disabled = new Set(prefs?.disabledIds ?? []);
  const defaultOrder = defaultOrderForVisible(visibleDefs, ctx);

  let order: DashboardQuickActionId[];
  if (prefs?.order?.length) {
    order = prefs.order.filter((id) => visibleIds.has(id) && !disabled.has(id));
    for (const id of defaultOrder) {
      if (visibleIds.has(id) && !disabled.has(id) && !order.includes(id)) {
        order.push(id);
      }
    }
  } else {
    order = defaultOrder.filter((id) => !disabled.has(id));
  }

  const seen = new Set<DashboardQuickActionId>();
  order = order.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return visibleIds.has(id) && !disabled.has(id);
  });

  const out: Array<{ id: DashboardQuickActionId; label: string; to: string; icon: LucideIcon; tone: string }> = [];
  for (const id of order) {
    const def = DASHBOARD_QUICK_ACTION_DEFS.find((d) => d.id === id);
    if (!def) continue;
    const run = resolveQuickActionRuntime(def, ctx);
    if (!run) continue;
    out.push({ id, label: run.label, to: run.to, icon: run.icon, tone: def.tone });
  }
  return out;
}

export function buildPrefsFromState(
  order: DashboardQuickActionId[],
  disabledIds: DashboardQuickActionId[],
): DashboardQuickActionsPrefsV1 {
  return { v: 1, order, disabledIds };
}
