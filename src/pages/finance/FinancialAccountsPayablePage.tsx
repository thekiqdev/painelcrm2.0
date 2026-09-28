import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  financialService,
  type FinancialAccountDto,
  type FinancialPayableItemDto,
  type FinancialPayablesListDto,
  type FinancialRecurringExpenseDto,
  type ExpenseCategoryDto,
  type PayableOperationalStatusDto,
} from "@/services/financial";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import {
  Banknote,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RecurringExpenseRuleDialog } from "@/components/finance/RecurringExpenseRuleDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { UnifiedPayableList } from "@/components/finance/UnifiedPayableList";
import { compareYmd, groupPayableQueue, sumCents, todayYmdLocal } from "@/components/finance/accountsPayableGrouping";
import { FinanceMobileBottomBar, financeMobilePageBottomPad } from "@/components/finance/FinanceMobileBottomBar";
import { useFinanceBottomBarVisibility } from "@/contexts/FinanceMobileChromeContext";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";

function formatBrlCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function monthRangeUtc(y: number, m0: number): { from: string; to: string } {
  const from = `${y}-${String(m0 + 1).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const to = `${y}-${String(m0 + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

const PERIOD_LABEL: Record<string, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

function statusLabel(s: PayableOperationalStatusDto): string {
  switch (s) {
    case "forecast":
      return "Prevista";
    case "open":
      return "Pendente";
    case "due_today":
      return "Vence hoje";
    case "overdue":
      return "Vencida";
    case "paid":
      return "Paga";
    case "cancelled":
      return "Cancelada";
    default:
      return s;
  }
}

/** Data de pagamento para ordenar histórico de pagas (API envia paid_at para recorrentes e avulsas concluídas). */
function paymentYmdForPayableItem(it: FinancialPayableItemDto): string {
  if (it.paid_at) return it.paid_at.slice(0, 10);
  return it.due_date;
}

function statusBadgeClass(s: PayableOperationalStatusDto): string {
  switch (s) {
    case "forecast":
      return "bg-muted text-muted-foreground";
    case "open":
      return "bg-amber-500/15 text-amber-900 dark:text-amber-100";
    case "due_today":
      return "bg-orange-500/15 text-orange-900 dark:text-orange-100";
    case "overdue":
      return "bg-destructive/15 text-destructive";
    case "paid":
      return "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100";
    case "cancelled":
      return "bg-muted text-muted-foreground line-through";
    default:
      return "";
  }
}

type PeriodPreset = "today" | "week" | "month" | "custom";

type StatusFilter = "all" | "not_paid" | PayableOperationalStatusDto;

type DueSituationFilter = "all" | "overdue" | "upcoming" | "paid";

type SecondaryFilterBundle = {
  filterStatus: StatusFilter;
  filterDueSituation: DueSituationFilter;
  filterRecurring: "all" | "recurring" | "single";
  filterCategoryId: string;
  filterSearch: string;
  filterPaidAccountId: string;
};

/** Histórico “pagas no período”: refinamento próprio — `not_paid` na fila não esconde pagos aqui. */
function matchesPaidHistoricoSection(it: FinancialPayableItemDto, f: SecondaryFilterBundle): boolean {
  if (it.operational_status !== "paid") return false;
  if (f.filterDueSituation === "overdue" || f.filterDueSituation === "upcoming") return false;

  if (f.filterStatus !== "all" && f.filterStatus !== "not_paid") {
    if (it.operational_status !== f.filterStatus) return false;
  }

  if (f.filterRecurring === "recurring" && !it.is_recurring) return false;
  if (f.filterRecurring === "single" && it.is_recurring) return false;

  if (f.filterCategoryId !== "__all__" && (it.category_id ?? "") !== f.filterCategoryId) return false;

  const q = f.filterSearch.trim().toLowerCase();
  if (q && !it.description.toLowerCase().includes(q)) return false;

  if (f.filterPaidAccountId !== "__all__") {
    if ((it.payment_account_id ?? "") !== f.filterPaidAccountId) return false;
  }

  return true;
}

/** Base de avulsas no período: `not_paid` na fila operacional não remove avulsas pagas deste cadastro. */
function matchesAvulsaCadastroSection(it: FinancialPayableItemDto, f: SecondaryFilterBundle): boolean {
  if (it.source !== "expense_transaction") return false;
  if (f.filterRecurring === "recurring") return false;

  if (f.filterCategoryId !== "__all__" && (it.category_id ?? "") !== f.filterCategoryId) return false;

  const q = f.filterSearch.trim().toLowerCase();
  if (q && !it.description.toLowerCase().includes(q)) return false;

  if (f.filterPaidAccountId !== "__all__" && it.operational_status === "paid") {
    if ((it.payment_account_id ?? "") !== f.filterPaidAccountId) return false;
  }

  if (f.filterDueSituation === "paid" && it.operational_status !== "paid") return false;
  if (f.filterDueSituation === "overdue" && it.operational_status !== "overdue") return false;
  if (f.filterDueSituation === "upcoming") {
    if (!["forecast", "open", "due_today"].includes(it.operational_status)) return false;
  }

  if (f.filterStatus === "all" || f.filterStatus === "not_paid") {
    return it.operational_status !== "cancelled";
  }
  return it.operational_status === f.filterStatus;
}

function PayableDesktopRows(props: {
  items: FinancialPayableItemDto[];
  showRecurrenceCol: boolean;
  periodicityOf: (it: FinancialPayableItemDto) => string | null;
  onDetail: (it: FinancialPayableItemDto) => void;
  onPay: (it: FinancialPayableItemDto) => void;
  onEdit: (it: FinancialPayableItemDto) => void;
}) {
  const { items, showRecurrenceCol, periodicityOf, onDetail, onPay, onEdit } = props;
  return (
    <>
      {items.map((it) => (
        <TableRow key={`${it.source}-${it.id}`}>
          <TableCell className="whitespace-nowrap text-muted-foreground">
            {formatDateOnlyPtBr(paymentYmdForPayableItem(it))}
          </TableCell>
          <TableCell className="font-medium max-w-[200px] truncate">{it.description}</TableCell>
          <TableCell className="text-muted-foreground text-sm">{it.category_name ?? "—"}</TableCell>
          <TableCell className="text-right tabular-nums">{formatBrlCents(it.amount_cents)}</TableCell>
          <TableCell>
            <Badge variant="secondary" className={cn("font-normal", statusBadgeClass(it.operational_status))}>
              {statusLabel(it.operational_status)}
            </Badge>
          </TableCell>
          {showRecurrenceCol ? (
            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
              {periodicityOf(it) ?? "—"}
            </TableCell>
          ) : null}
          {!showRecurrenceCol ? (
            <TableCell className="text-sm text-muted-foreground">Não</TableCell>
          ) : null}
          <TableCell className="text-sm max-w-[130px] truncate">{it.payment_account_name ?? "—"}</TableCell>
          <TableCell className="text-right space-x-1 whitespace-nowrap">
            <Button variant="ghost" size="sm" onClick={() => onDetail(it)}>
              Ver
            </Button>
            {it.operational_status !== "paid" && it.operational_status !== "cancelled" ? (
              <Button variant="default" size="sm" onClick={() => onPay(it)}>
                <Wallet className="h-3.5 w-3.5 mr-1" />
                Pagar
              </Button>
            ) : null}
            {it.source === "expense_transaction" ? (
              <Button variant="outline" size="sm" onClick={() => onEdit(it)}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Editar
              </Button>
            ) : null}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function PayableMobileCards(props: {
  items: FinancialPayableItemDto[];
  variant: "single" | "recurring" | "auto";
  periodicityOf: (it: FinancialPayableItemDto) => string | null;
  onDetail: (it: FinancialPayableItemDto) => void;
  onPay: (it: FinancialPayableItemDto) => void;
  onEdit: (it: FinancialPayableItemDto) => void;
}) {
  const { items, variant, periodicityOf, onDetail, onPay, onEdit } = props;
  return (
    <ul className="space-y-2 md:space-y-3">
      {items.map((it) => {
        const showAsRecurring =
          variant === "auto" ? it.source === "recurring_occurrence" : variant === "recurring";
        return (
        <li
          key={`${it.source}-${it.id}`}
          className="rounded-lg border border-border/80 bg-card p-3 shadow-sm md:p-4"
        >
          <div className="flex justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug text-sm md:text-base line-clamp-2">{it.description}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 md:text-xs">
                {it.operational_status === "paid"
                  ? `Pago em ${formatDateOnlyPtBr(paymentYmdForPayableItem(it))}`
                  : `Venc. ${formatDateOnlyPtBr(it.due_date)}`}
              </p>
            </div>
            <p className="text-sm font-semibold tabular-nums shrink-0 md:text-base">{formatBrlCents(it.amount_cents)}</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 items-center">
            <Badge variant="secondary" className={cn("font-normal text-[10px] md:text-xs", statusBadgeClass(it.operational_status))}>
              {statusLabel(it.operational_status)}
            </Badge>
            {showAsRecurring ? (
              <Badge variant="outline" className="text-[10px] gap-0.5 px-1.5 py-0 md:text-xs md:gap-1">
                <Repeat className="h-3 w-3" />
                Ocorrência
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-0.5 px-1.5 py-0 md:text-xs md:gap-1">
                <Layers className="h-3 w-3" />
                Avulsa
              </Badge>
            )}
          </div>
          {showAsRecurring && periodicityOf(it) ? (
            <p className="text-[11px] text-muted-foreground mt-1 md:text-xs">Regra: {periodicityOf(it)}</p>
          ) : null}
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1 md:text-xs">
            {it.category_name ?? "Sem categoria"}
            {it.operational_status === "paid" && it.payment_account_name ? <> · {it.payment_account_name}</> : null}
          </p>
          <div
            className={cn(
              "mt-2.5 gap-2",
              it.operational_status !== "paid" && it.operational_status !== "cancelled"
                ? "grid grid-cols-2"
                : "flex"
            )}
          >
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 text-xs",
                it.operational_status === "paid" || it.operational_status === "cancelled" ? "w-full" : ""
              )}
              onClick={() => onDetail(it)}
            >
              Detalhe
            </Button>
            {it.operational_status !== "paid" && it.operational_status !== "cancelled" ? (
              <Button size="sm" className="h-9 text-xs" onClick={() => onPay(it)}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1 shrink-0" />
                Pagar
              </Button>
            ) : null}
          </div>
          {it.source === "expense_transaction" ? (
            <Button variant="ghost" size="sm" className="mt-1 h-8 w-full text-xs text-muted-foreground md:h-9" onClick={() => onEdit(it)}>
              <Pencil className="h-3 w-3 mr-1" />
              Editar
            </Button>
          ) : null}
        </li>
        );
      })}
    </ul>
  );
}

const FinancialAccountsPayablePage = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [accounts, setAccounts] = useState<FinancialAccountDto[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryDto[]>([]);
  const [recurringRules, setRecurringRules] = useState<FinancialRecurringExpenseDto[]>([]);
  const [data, setData] = useState<FinancialPayablesListDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<PeriodPreset>(() => {
    const p = searchParams.get("preset");
    if (p === "today" || p === "week" || p === "month") return p;
    return "month";
  });
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [filterStatus, setFilterStatus] = useState<StatusFilter>("not_paid");
  const [filterDueSituation, setFilterDueSituation] = useState<DueSituationFilter>("all");
  const [filterRecurring, setFilterRecurring] = useState<"all" | "recurring" | "single">("all");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("__all__");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterPaidAccountId, setFilterPaidAccountId] = useState<string>("__all__");

  const [detailItem, setDetailItem] = useState<FinancialPayableItemDto | null>(null);
  const [payItem, setPayItem] = useState<FinancialPayableItemDto | null>(null);
  const [payAccountId, setPayAccountId] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState("");
  const [paySaving, setPaySaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editAccount, setEditAccount] = useState("");
  const [editStatus, setEditStatus] = useState<"pending" | "completed">("pending");
  const [editSaving, setEditSaving] = useState(false);

  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [recurringEditing, setRecurringEditing] = useState<FinancialRecurringExpenseDto | null>(null);

  const [novaDespesaOpen, setNovaDespesaOpen] = useState(false);
  const [novaSaving, setNovaSaving] = useState(false);
  const [novaAccount, setNovaAccount] = useState("");
  const [novaAmount, setNovaAmount] = useState("");
  const [novaDesc, setNovaDesc] = useState("");
  const [novaDate, setNovaDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [novaCategory, setNovaCategory] = useState<string>("");
  const [novaStatus, setNovaStatus] = useState<"pending" | "completed">("pending");

  /** Filtros avançados expandidos no mobile (painel colapsável). */
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  /** Secções secundárias colapsáveis — por defeito recolhidas para dar protagonismo à fila unificada. */
  const [secRulesOpen, setSecRulesOpen] = useState(false);
  const [secHistoricoOpen, setSecHistoricoOpen] = useState(false);
  const [secAvulsasOpen, setSecAvulsasOpen] = useState(false);

  const loadAccountsAndCategories = useCallback(() => {
    Promise.all([financialService.listAccounts(), financialService.listCategories()])
      .then(([ac, cat]) => {
        setAccounts(ac);
        setCategories(cat);
      })
      .catch(() => toast.error("Erro ao carregar contas/categorias"));
  }, []);

  const loadPayables = useCallback(async () => {
    setLoading(true);
    try {
      let res: FinancialPayablesListDto;
      if (preset === "custom") {
        if (!customFrom || !customTo) {
          const now = new Date();
          const { from, to } = monthRangeUtc(now.getUTCFullYear(), now.getUTCMonth());
          res = await financialService.getPayables({ from, to });
        } else {
          res = await financialService.getPayables({ from: customFrom, to: customTo });
        }
      } else if (preset === "month") {
        res = await financialService.getPayables({ preset: "month" });
      } else if (preset === "week") {
        res = await financialService.getPayables({ preset: "week" });
      } else {
        res = await financialService.getPayables({ preset: "today" });
      }
      const rules = await financialService.listRecurringExpenses(true);
      setData(res);
      setRecurringRules(rules);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar contas a pagar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    loadAccountsAndCategories();
  }, [loadAccountsAndCategories]);

  useEffect(() => {
    void loadPayables();
  }, [loadPayables]);

  useEffect(() => {
    if (preset === "custom" && !customFrom && !customTo && data?.period) {
      setCustomFrom(data.period.from);
      setCustomTo(data.period.to);
    }
  }, [preset, customFrom, customTo, data?.period]);

  useEffect(() => {
    if (location.hash !== "#hub-regras-recorrencia") return;
    const t = window.setTimeout(() => {
      document.getElementById("hub-regras-recorrencia")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
    return () => window.clearTimeout(t);
  }, [location.hash, loading, recurringRules.length]);

  useEffect(() => {
    if (searchParams.get("dialog") !== "recorrente") return;
    setRecurringEditing(null);
    setRecurringDialogOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("dialog");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const items = data?.items ?? [];
  const summary = data?.summary;

  const recurringById = useMemo(() => new Map(recurringRules.map((r) => [r.id, r])), [recurringRules]);

  const secondaryFilters: SecondaryFilterBundle = useMemo(
    () => ({
      filterStatus,
      filterDueSituation,
      filterRecurring,
      filterCategoryId,
      filterSearch,
      filterPaidAccountId,
    }),
    [filterStatus, filterDueSituation, filterRecurring, filterCategoryId, filterSearch, filterPaidAccountId]
  );

  const periodicityOf = useCallback(
    (it: FinancialPayableItemDto): string | null => {
      if (!it.recurring_expense_id) return null;
      const r = recurringById.get(it.recurring_expense_id);
      return r ? PERIOD_LABEL[r.periodicity] ?? r.periodicity : null;
    },
    [recurringById]
  );

  const nextOpenDueByRuleId = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) {
      if (it.source !== "recurring_occurrence" || !it.recurring_expense_id) continue;
      if (it.operational_status === "paid" || it.operational_status === "cancelled") continue;
      const rid = it.recurring_expense_id;
      const cur = m.get(rid);
      if (!cur || compareYmd(it.due_date, cur) < 0) m.set(rid, it.due_date);
    }
    return m;
  }, [items]);

  /** Fila operacional (contas em aberto): estado “Não pagos” por defeito — não alimenta directamente o histórico de pagos. */
  const openQueueItems = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return items.filter((it) => {
      if (filterStatus === "not_paid") {
        if (it.operational_status === "paid" || it.operational_status === "cancelled") return false;
      } else if (filterStatus !== "all" && it.operational_status !== filterStatus) return false;

      if (filterDueSituation === "overdue" && it.operational_status !== "overdue") return false;
      if (filterDueSituation === "upcoming") {
        if (!["forecast", "open", "due_today"].includes(it.operational_status)) return false;
      }
      if (filterDueSituation === "paid" && it.operational_status !== "paid") return false;

      if (filterRecurring === "recurring" && !it.is_recurring) return false;
      if (filterRecurring === "single" && it.is_recurring) return false;

      if (filterCategoryId !== "__all__") {
        if ((it.category_id ?? "") !== filterCategoryId) return false;
      }

      if (q && !it.description.toLowerCase().includes(q)) return false;

      if (filterPaidAccountId !== "__all__" && it.operational_status === "paid") {
        if ((it.payment_account_id ?? "") !== filterPaidAccountId) return false;
      }

      return true;
    });
  }, [items, filterStatus, filterDueSituation, filterRecurring, filterCategoryId, filterSearch, filterPaidAccountId]);

  const paidHistoricoItems = useMemo(() => {
    const list = items.filter((it) => matchesPaidHistoricoSection(it, secondaryFilters));
    return [...list].sort((a, b) => compareYmd(paymentYmdForPayableItem(b), paymentYmdForPayableItem(a)));
  }, [items, secondaryFilters]);

  const filteredAvulsas = useMemo(
    () => items.filter((it) => matchesAvulsaCadastroSection(it, secondaryFilters)),
    [items, secondaryFilters]
  );

  const filteredRules = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return recurringRules.filter((r) => {
      if (filterRecurring === "single") return false;
      if (filterCategoryId !== "__all__" && r.category_id !== filterCategoryId) return false;
      if (q && !r.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [recurringRules, filterSearch, filterCategoryId, filterRecurring]);

  const groupedPayables = useMemo(() => {
    if (!summary) {
      return {
        overdue: [] as FinancialPayableItemDto[],
        today: [] as FinancialPayableItemDto[],
        this_week: [] as FinancialPayableItemDto[],
        later: [] as FinancialPayableItemDto[],
      };
    }
    const todayStr = todayYmdLocal();
    return groupPayableQueue(openQueueItems, todayStr, summary.week_start, summary.week_end);
  }, [openQueueItems, summary]);

  const displaySummary = useMemo(() => {
    if (!summary) return null;
    const openOutstanding = openQueueItems.filter(
      (it) => it.operational_status !== "paid" && it.operational_status !== "cancelled"
    );
    return {
      due_today_cents: sumCents(groupedPayables.today),
      due_today_count: groupedPayables.today.length,
      due_week_cents: sumCents(groupedPayables.this_week),
      due_week_count: groupedPayables.this_week.length,
      pending_not_paid_cents: sumCents(openOutstanding),
      pending_not_paid_count: openOutstanding.length,
      paid_in_period_cents: sumCents(paidHistoricoItems),
      paid_in_period_count: paidHistoricoItems.length,
      total_outstanding_cents: sumCents(openOutstanding),
      week_start: summary.week_start,
      week_end: summary.week_end,
    };
  }, [summary, groupedPayables, openQueueItems, paidHistoricoItems]);

  const showSectionRules = filterRecurring !== "single";
  const showCollapsibleAvulsas = filterRecurring !== "recurring";

  const urgentPayablesBadge = useMemo(
    () => groupedPayables.overdue.length + groupedPayables.today.length,
    [groupedPayables]
  );

  useFinanceBottomBarVisibility(
    !!detailItem || !!payItem || editOpen || recurringDialogOpen || novaDespesaOpen
  );

  const openPay = (it: FinancialPayableItemDto) => {
    setPayItem(it);
    setPayAccountId(it.payment_account_id ?? accounts[0]?.id ?? "");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayAmount(String(it.amount_cents / 100));
  };

  const submitPay = async () => {
    if (!payItem) return;
    const cents = Math.round(parseFloat(payAmount.replace(",", ".")) * 100);
    if (!payAccountId) {
      toast.error("Escolha a conta de origem do pagamento");
      return;
    }
    if (Number.isNaN(cents) || cents < 0) {
      toast.error("Valor inválido");
      return;
    }
    setPaySaving(true);
    try {
      if (payItem.source === "recurring_occurrence") {
        await financialService.payRecurringOccurrence(payItem.id, {
          account_id: payAccountId,
          transaction_date: payDate,
        });
        if (cents !== payItem.amount_cents) {
          toast.message("Valor da ocorrência", {
            description:
              "O pagamento de recorrência usa o valor da ocorrência. Para valores diferentes, ajuste a regra ou crie uma despesa avulsa.",
          });
        }
      } else {
        await financialService.updateTransaction(payItem.id, {
          status: "completed",
          account_id: payAccountId,
          transaction_date: payDate,
          amount_cents: cents,
        });
      }
      toast.success("Pagamento registado");
      setPayItem(null);
      await loadPayables();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao pagar");
    } finally {
      setPaySaving(false);
    }
  };

  const openEdit = (it: FinancialPayableItemDto) => {
    if (it.source !== "expense_transaction") return;
    setEditId(it.id);
    setEditDesc(it.description);
    setEditAmount(String(it.amount_cents / 100));
    setEditDate(it.due_date);
    setEditCategory(it.category_id ?? "");
    setEditAccount(it.payment_account_id ?? "");
    setEditStatus(it.operational_status === "paid" ? "completed" : "pending");
    setEditOpen(true);
  };

  const openNovaDespesa = () => {
    setNovaAccount(accounts[0]?.id ?? "");
    setNovaDate(new Date().toISOString().slice(0, 10));
    setNovaAmount("");
    setNovaDesc("");
    setNovaCategory("");
    setNovaStatus("pending");
    setNovaDespesaOpen(true);
  };

  const handleNovaCreate = async () => {
    const cents = Math.round(parseFloat(novaAmount.replace(",", ".")) * 100);
    if (!novaAccount) {
      toast.error("Crie uma conta em Bancos e contas primeiro");
      return;
    }
    if (!novaDesc.trim()) {
      toast.error("Descreva a despesa");
      return;
    }
    if (Number.isNaN(cents) || cents < 0) {
      toast.error("Valor inválido");
      return;
    }
    try {
      setNovaSaving(true);
      await financialService.createTransaction({
        account_id: novaAccount,
        type: "expense",
        amount_cents: cents,
        description: novaDesc.trim(),
        transaction_date: novaDate,
        status: novaStatus,
        category_id: novaCategory || null,
      });
      toast.success("Despesa registada");
      setNovaDespesaOpen(false);
      await loadPayables();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setNovaSaving(false);
    }
  };

  const handleRegenerateRule = async (id: string) => {
    try {
      await financialService.regenerateRecurringExpense(id);
      toast.success("Ocorrências futuras actualizadas");
      await loadPayables();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const submitEdit = async () => {
    if (!editId) return;
    const cents = Math.round(parseFloat(editAmount.replace(",", ".")) * 100);
    if (!editDesc.trim()) {
      toast.error("Descrição obrigatória");
      return;
    }
    if (Number.isNaN(cents) || cents < 0) {
      toast.error("Valor inválido");
      return;
    }
    setEditSaving(true);
    try {
      await financialService.updateTransaction(editId, {
        description: editDesc.trim(),
        amount_cents: cents,
        transaction_date: editDate,
        category_id: editCategory || null,
        account_id: editAccount,
        status: editStatus,
      });
      toast.success("Actualizado");
      setEditOpen(false);
      setEditId(null);
      await loadPayables();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setEditSaving(false);
    }
  };

  const periodLabel = useMemo(() => {
    if (!data) return "";
    return `${data.period.from} — ${data.period.to}`;
  }, [data]);

  const setPeriodPreset = (p: PeriodPreset) => {
    setPreset(p);
    if (p === "custom" && data?.period) {
      setCustomFrom(data.period.from);
      setCustomTo(data.period.to);
    }
  };

  const hasAnyRows =
    openQueueItems.length > 0 || paidHistoricoItems.length > 0 || filteredRules.length > 0 || filteredAvulsas.length > 0;

  return (
    <div className={cn("space-y-3 md:space-y-6", financeMobilePageBottomPad)}>
      {/* Mobile: período compacto no topo — acções no bottom bar */}
      <div className="md:hidden sticky top-0 z-30 -mx-4 border-b border-border/60 bg-background/95 px-4 pb-2 pt-1 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/90">
        <div className="flex items-center justify-between gap-2 pb-2">
          <h2 className="text-base font-semibold tracking-tight">Contas a pagar</h2>
          {periodLabel ? (
            <span className="max-w-[55%] truncate text-right text-[10px] leading-tight text-muted-foreground tabular-nums">
              {periodLabel}
            </span>
          ) : null}
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Button
            variant={preset === "today" ? "default" : "secondary"}
            size="sm"
            className="h-8 shrink-0 px-3 text-xs"
            onClick={() => setPeriodPreset("today")}
          >
            Hoje
          </Button>
          <Button
            variant={preset === "week" ? "default" : "secondary"}
            size="sm"
            className="h-8 shrink-0 px-3 text-xs"
            onClick={() => setPeriodPreset("week")}
          >
            Semana
          </Button>
          <Button
            variant={preset === "month" ? "default" : "secondary"}
            size="sm"
            className="h-8 shrink-0 px-3 text-xs"
            onClick={() => setPeriodPreset("month")}
          >
            Mês
          </Button>
          <Button
            variant={preset === "custom" ? "default" : "secondary"}
            size="sm"
            className="h-8 shrink-0 px-3 text-xs"
            onClick={() => setPeriodPreset("custom")}
          >
            Período
          </Button>
        </div>
      </div>

      <div className="hidden flex-col gap-3 lg:flex-row lg:items-start lg:justify-between md:flex">
        <div>
          <h2 className="text-lg font-semibold inline-flex items-center gap-2">
            <ClipboardList className="h-5 w-5 opacity-80" />
            Contas a pagar
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Hub único de <strong className="font-medium text-foreground">contas a pagar</strong>: avulsas e ocorrências
            de recorrência, resumo por período (topo), refinamento abaixo e registo de pagamento. A origem do pagamento é
            a conta em <span className="font-medium text-foreground">Bancos e contas</span>.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant={preset === "today" ? "default" : "outline"} size="sm" onClick={() => setPeriodPreset("today")}>
            Hoje
          </Button>
          <Button variant={preset === "week" ? "default" : "outline"} size="sm" onClick={() => setPeriodPreset("week")}>
            Semana
          </Button>
          <Button variant={preset === "month" ? "default" : "outline"} size="sm" onClick={() => setPeriodPreset("month")}>
            Mês
          </Button>
          <Button variant={preset === "custom" ? "default" : "outline"} size="sm" onClick={() => setPeriodPreset("custom")}>
            Período
          </Button>
          <Button variant="secondary" size="sm" onClick={openNovaDespesa}>
            <Plus className="mr-1 h-4 w-4" />
            Nova despesa
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setRecurringEditing(null);
              setRecurringDialogOpen(true);
            }}
          >
            <Repeat className="mr-1 h-4 w-4" />
            Nova recorrente
          </Button>
        </div>
      </div>

      {preset === "custom" && (
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="py-3 pb-0">
            <CardTitle className="text-sm font-medium">Intervalo personalizado</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3 pt-3">
            <div className="grid gap-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-[160px]" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-[160px]" />
            </div>
            <Button size="sm" onClick={() => void loadPayables()}>
              Aplicar
            </Button>
          </CardContent>
        </Card>
      )}

      {displaySummary ? (
        <div className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <Card className="border-border/70 py-0 shadow-sm md:shadow">
            <CardHeader className="space-y-0.5 px-3 pb-1 pt-3 md:px-4 md:pb-1.5 md:pt-3">
              <CardDescription className="text-[10px] leading-tight md:text-xs">Vence hoje</CardDescription>
              <CardTitle className="text-sm tabular-nums md:text-base">{formatBrlCents(displaySummary.due_today_cents)}</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2.5 text-[10px] text-muted-foreground md:px-4 md:pb-3 md:text-xs">
              {displaySummary.due_today_count} item(ns)
            </CardContent>
          </Card>
          <Card className="border-border/70 py-0 shadow-sm md:shadow">
            <CardHeader className="space-y-0.5 px-3 pb-1 pt-3 md:px-4 md:pb-1.5 md:pt-3">
              <CardDescription className="text-[10px] leading-tight md:text-xs">
                <span className="md:hidden">Semana</span>
                <span className="hidden md:inline">
                  Semana ({displaySummary.week_start} — {displaySummary.week_end})
                </span>
              </CardDescription>
              <CardTitle className="text-sm tabular-nums md:text-base">{formatBrlCents(displaySummary.due_week_cents)}</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2.5 text-[10px] text-muted-foreground md:px-4 md:pb-3 md:text-xs">
              <span className="md:hidden">{displaySummary.due_week_count} em aberto</span>
              <span className="hidden md:inline">{displaySummary.due_week_count} em aberto</span>
            </CardContent>
          </Card>
          <Card className="border-border/70 py-0 shadow-sm md:shadow">
            <CardHeader className="space-y-0.5 px-3 pb-1 pt-3 md:px-4 md:pb-1.5 md:pt-3">
              <CardDescription className="text-[10px] leading-tight md:text-xs">Pendentes</CardDescription>
              <CardTitle className="text-sm tabular-nums md:text-base">{formatBrlCents(displaySummary.pending_not_paid_cents)}</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2.5 text-[10px] text-muted-foreground md:px-4 md:pb-3 md:text-xs">
              {displaySummary.pending_not_paid_count} não pagos
            </CardContent>
          </Card>
          <Card className="border-border/70 py-0 shadow-sm md:shadow">
            <CardHeader className="space-y-0.5 px-3 pb-1 pt-3 md:px-4 md:pb-1.5 md:pt-3">
              <CardDescription className="text-[10px] leading-tight md:text-xs">Pago no período</CardDescription>
              <CardTitle className="text-sm tabular-nums md:text-base">{formatBrlCents(displaySummary.paid_in_period_cents)}</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2.5 text-[10px] text-muted-foreground md:px-4 md:pb-3 md:text-xs">
              {displaySummary.paid_in_period_count} liquidado(s)
            </CardContent>
          </Card>
          <Card className="border-border/70 py-0 shadow-sm md:shadow col-span-2 lg:col-span-1">
            <CardHeader className="space-y-0.5 px-3 pb-1 pt-3 md:px-4 md:pb-1.5 md:pt-3">
              <CardDescription className="text-[10px] leading-tight md:text-xs">Total em aberto</CardDescription>
              <CardTitle className="text-sm tabular-nums md:text-base">{formatBrlCents(displaySummary.total_outstanding_cents)}</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2.5 text-[10px] text-muted-foreground md:px-4 md:pb-3 md:text-xs">
              activos
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2 md:pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm md:text-base">Filtros e pesquisa</CardTitle>
              <CardDescription className="mt-0.5 text-xs md:mt-1">
                Refinam o conjunto já limitado pelo{" "}
                <span className="font-medium text-foreground">período em cima</span> (Hoje / Semana / Mês / Período): estado,
                natureza, categoria, texto, conta de pagamento.
              </CardDescription>
            </div>
            <div className="hidden flex-wrap gap-2 md:flex">
              <Button variant="outline" size="sm" onClick={openNovaDespesa}>
                Nova despesa avulsa
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRecurringEditing(null);
                  setRecurringDialogOpen(true);
                }}
              >
                Nova regra recorrente
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 md:space-y-4">
          <Collapsible open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen} className="md:hidden">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 w-full justify-between gap-2 font-normal">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <CalendarRange className="h-4 w-4 opacity-70" />
                  Filtros avançados
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 opacity-70 transition-transform", mobileFiltersOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=closed]:animate-none">
              <div className="grid grid-cols-1 gap-3 border-t border-border/60 pt-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Estado</Label>
                  <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as StatusFilter)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="not_paid">Não pagos</SelectItem>
                      <SelectItem value="forecast">Prevista</SelectItem>
                      <SelectItem value="open">Pendente</SelectItem>
                      <SelectItem value="due_today">Vence hoje</SelectItem>
                      <SelectItem value="overdue">Vencida</SelectItem>
                      <SelectItem value="paid">Paga</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Vencimento / situação</Label>
                  <Select value={filterDueSituation} onValueChange={(v) => setFilterDueSituation(v as DueSituationFilter)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="overdue">Vencidas</SelectItem>
                      <SelectItem value="upcoming">A vencer (não paga)</SelectItem>
                      <SelectItem value="paid">Pagas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Natureza</Label>
                  <Select value={filterRecurring} onValueChange={(v) => setFilterRecurring(v as typeof filterRecurring)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Avulsas + recorrentes</SelectItem>
                      <SelectItem value="recurring">Só recorrentes</SelectItem>
                      <SelectItem value="single">Só avulsas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Categoria</Label>
                  <Select value={filterCategoryId} onValueChange={setFilterCategoryId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Origem (pagas)</Label>
                  <Select value={filterPaidAccountId} onValueChange={setFilterPaidAccountId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Descrição / fornecedor</Label>
                  <Input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Filtrar…" className="h-9" />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="grid gap-1.5">
              <Label className="text-xs">Estado</Label>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as StatusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="not_paid">Não pagos</SelectItem>
                  <SelectItem value="forecast">Prevista</SelectItem>
                  <SelectItem value="open">Pendente</SelectItem>
                  <SelectItem value="due_today">Vence hoje</SelectItem>
                  <SelectItem value="overdue">Vencida</SelectItem>
                  <SelectItem value="paid">Paga</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Vencimento / situação</Label>
              <Select value={filterDueSituation} onValueChange={(v) => setFilterDueSituation(v as DueSituationFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="overdue">Vencidas</SelectItem>
                  <SelectItem value="upcoming">A vencer (não paga)</SelectItem>
                  <SelectItem value="paid">Pagas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Natureza</Label>
              <Select value={filterRecurring} onValueChange={(v) => setFilterRecurring(v as typeof filterRecurring)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Avulsas + recorrentes</SelectItem>
                  <SelectItem value="recurring">Só recorrentes</SelectItem>
                  <SelectItem value="single">Só avulsas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select value={filterCategoryId} onValueChange={setFilterCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Origem (pagas)</Label>
              <Select value={filterPaidAccountId} onValueChange={setFilterPaidAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 md:col-span-2 lg:col-span-1 xl:col-span-1">
              <Label className="text-xs">Descrição / fornecedor</Label>
              <Input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Filtrar…" />
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-10 text-center">A carregar…</p>
          ) : !hasAnyRows ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Nenhum registo com estes filtros.</p>
          ) : (
            <div className="space-y-8 md:space-y-10">
              <section
                id="hub-contas-unificadas"
                className="scroll-mt-28 space-y-4 rounded-xl border border-primary/20 bg-gradient-to-b from-primary/[0.06] via-background to-background p-4 shadow-sm md:space-y-5 md:p-6"
              >
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold tracking-tight md:text-xl">Contas a pagar</h3>
                  <p className="text-sm text-muted-foreground">
                    Despesas avulsas e recorrentes organizadas por vencimento.
                  </p>
                </div>
                <UnifiedPayableList
                  grouped={groupedPayables}
                  isDesktop={isDesktop}
                  formatBrlCents={formatBrlCents}
                  statusLabel={statusLabel}
                  statusBadgeClass={statusBadgeClass}
                  periodicityOf={periodicityOf}
                  onDetail={setDetailItem}
                  onPay={openPay}
                  onEdit={openEdit}
                />
              </section>

              <div className="space-y-3 border-t border-border/60 pt-6">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mais detalhes</p>

                {showSectionRules ? (
                  <Collapsible open={secRulesOpen} onOpenChange={setSecRulesOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" className="h-11 w-full justify-between gap-2 font-normal md:h-10">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <Repeat className="h-4 w-4 opacity-80" />
                          Despesas recorrentes
                        </span>
                        <ChevronDown
                          className={cn("h-4 w-4 shrink-0 opacity-70 transition-transform", secRulesOpen && "rotate-180")}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="data-[state=closed]:animate-none pt-3">
                      <div
                        id="hub-regras-recorrencia"
                        className="scroll-mt-28 space-y-3 rounded-xl border border-border/70 bg-card/40 p-3 md:scroll-mt-24 md:p-5"
                      >
                        <p className="text-xs text-muted-foreground md:text-sm">
                          Regras activas; o pagamento das ocorrências está na lista principal acima.
                        </p>
                        {filteredRules.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">Nenhuma regra activa no filtro actual.</p>
                        ) : isDesktop ? (
                          <div className="rounded-md border overflow-x-auto bg-background">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Descrição</TableHead>
                                  <TableHead>Periodicidade</TableHead>
                                  <TableHead className="text-right">Valor base</TableHead>
                                  <TableHead>Próxima pendência</TableHead>
                                  <TableHead>Estado</TableHead>
                                  <TableHead className="text-right">Acções</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredRules.map((r) => (
                                  <TableRow key={r.id}>
                                    <TableCell className="font-medium max-w-[200px]">{r.description}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                      {PERIOD_LABEL[r.periodicity] ?? r.periodicity}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{formatBrlCents(r.amount_cents)}</TableCell>
                                    <TableCell className="text-sm whitespace-nowrap">
                                      {nextOpenDueByRuleId.get(r.id) ?? "—"}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant={r.is_active ? "secondary" : "outline"}>
                                        {r.is_active ? "Activa" : "Inactiva"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right space-x-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setRecurringEditing(r);
                                          setRecurringDialogOpen(true);
                                        }}
                                      >
                                        Editar
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => void handleRegenerateRule(r.id)}
                                        title="Regenerar ocorrências futuras"
                                      >
                                        <RefreshCw className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <ul className="space-y-2">
                            {filteredRules.map((r) => (
                              <li key={r.id} className="space-y-1 rounded-lg border border-border/80 bg-background p-2.5 text-sm">
                                <p className="font-medium">{r.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  {PERIOD_LABEL[r.periodicity] ?? r.periodicity} · {formatBrlCents(r.amount_cents)}
                                </p>
                                <p className="text-xs">
                                  Próxima pendência:{" "}
                                  <span className="font-medium">{nextOpenDueByRuleId.get(r.id) ?? "—"}</span>
                                </p>
                                <Button
                                  variant="link"
                                  className="h-auto p-0 text-xs"
                                  onClick={() => {
                                    setRecurringEditing(r);
                                    setRecurringDialogOpen(true);
                                  }}
                                >
                                  Editar regra
                                </Button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}

                {showCollapsibleAvulsas ? (
                  <Collapsible open={secAvulsasOpen} onOpenChange={setSecAvulsasOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" className="h-11 w-full justify-between gap-2 font-normal md:h-10">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <Layers className="h-4 w-4 opacity-80" />
                          Despesas avulsas
                          {filteredAvulsas.length > 0 ? (
                            <Badge variant="secondary" className="ml-1 font-normal">
                              {filteredAvulsas.length}
                            </Badge>
                          ) : null}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 opacity-70 transition-transform",
                            secAvulsasOpen && "rotate-180"
                          )}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="data-[state=closed]:animate-none pt-3">
                      {filteredAvulsas.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center rounded-lg border border-dashed border-border/70 bg-muted/10 px-3">
                          Sem despesas avulsas neste contexto.
                        </p>
                      ) : isDesktop ? (
                        <div className="rounded-md border overflow-x-auto bg-background">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Vencimento</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead>Categoria</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Rec.</TableHead>
                                <TableHead>Origem</TableHead>
                                <TableHead className="text-right">Acções</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              <PayableDesktopRows
                                items={filteredAvulsas}
                                showRecurrenceCol={false}
                                periodicityOf={periodicityOf}
                                onDetail={setDetailItem}
                                onPay={openPay}
                                onEdit={openEdit}
                              />
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <PayableMobileCards
                          items={filteredAvulsas}
                          variant="single"
                          periodicityOf={periodicityOf}
                          onDetail={setDetailItem}
                          onPay={openPay}
                          onEdit={openEdit}
                        />
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}

                <Collapsible open={secHistoricoOpen} onOpenChange={setSecHistoricoOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="h-11 w-full justify-between gap-2 font-normal md:h-10">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 opacity-90" />
                        Histórico de pagamento
                        {paidHistoricoItems.length > 0 ? (
                          <Badge variant="secondary" className="ml-1 font-normal">
                            {paidHistoricoItems.length}
                          </Badge>
                        ) : null}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 opacity-70 transition-transform",
                          secHistoricoOpen && "rotate-180"
                        )}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="data-[state=closed]:animate-none pt-3">
                    {paidHistoricoItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center rounded-lg border border-dashed border-border/70 bg-muted/10 px-3">
                        Nenhuma despesa paga neste período com os filtros actuais.
                      </p>
                    ) : isDesktop ? (
                      <div className="rounded-md border overflow-x-auto bg-background">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Pagamento</TableHead>
                              <TableHead>Descrição</TableHead>
                              <TableHead>Categoria</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                              <TableHead>Estado</TableHead>
                              <TableHead>Rec.</TableHead>
                              <TableHead>Origem</TableHead>
                              <TableHead className="text-right">Acções</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <PayableDesktopRows
                              items={paidHistoricoItems}
                              showRecurrenceCol
                              periodicityOf={periodicityOf}
                              onDetail={setDetailItem}
                              onPay={openPay}
                              onEdit={openEdit}
                            />
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <PayableMobileCards
                        items={paidHistoricoItems}
                        variant="auto"
                        periodicityOf={periodicityOf}
                        onDetail={setDetailItem}
                        onPay={openPay}
                        onEdit={openEdit}
                      />
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <FinanceMobileBottomBar
        actions={[
          {
            key: "nova-despesa",
            label: "+ Nova despesa",
            variant: "primary",
            icon: Banknote,
            onClick: openNovaDespesa,
            badge: urgentPayablesBadge > 0 ? urgentPayablesBadge : undefined,
          },
          {
            key: "recorrente",
            label: "+ Recorrente",
            variant: "outline",
            icon: Repeat,
            onClick: () => {
              setRecurringEditing(null);
              setRecurringDialogOpen(true);
            },
          },
        ]}
      />

      <Sheet open={!!detailItem} onOpenChange={(o) => !o && setDetailItem(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Detalhe</SheetTitle>
            <SheetDescription>Conta a pagar / ocorrência</SheetDescription>
          </SheetHeader>
          {detailItem ? (
            <div className="mt-6 space-y-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Descrição</p>
                <p className="font-medium">{detailItem.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="tabular-nums font-semibold">{formatBrlCents(detailItem.amount_cents)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vencimento</p>
                  <p>{formatDateOnlyPtBr(detailItem.due_date)}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Estado operacional</p>
                <Badge variant="secondary" className={cn("mt-1", statusBadgeClass(detailItem.operational_status))}>
                  {statusLabel(detailItem.operational_status)}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Natureza</p>
                <p>
                  {detailItem.is_recurring
                    ? `Ocorrência de recorrência · ${detailItem.recurrence_title ?? ""}`
                    : "Despesa avulsa (movimento financeiro)"}
                </p>
              </div>
              {detailItem.recurring_expense_id ? (
                <div>
                  <p className="text-xs text-muted-foreground">Periodicidade da regra</p>
                  <p>{periodicityOf(detailItem) ?? "—"}</p>
                </div>
              ) : null}
              <div>
                <p className="text-xs text-muted-foreground">Categoria</p>
                <p>{detailItem.category_name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Origem do pagamento (conta)</p>
                <p>{detailItem.payment_account_name ?? "—"}</p>
              </div>
              {detailItem.paid_at ? (
                <div>
                  <p className="text-xs text-muted-foreground">Pago em (registo)</p>
                  <p>{new Date(detailItem.paid_at).toLocaleString("pt-BR")}</p>
                </div>
              ) : detailItem.operational_status === "paid" && detailItem.source === "expense_transaction" ? (
                <div>
                  <p className="text-xs text-muted-foreground">Data contabilística</p>
                  <p>{formatDateOnlyPtBr(detailItem.due_date)}</p>
                </div>
              ) : null}
              <div>
                <p className="text-xs text-muted-foreground">Actualização</p>
                <p className="text-xs text-muted-foreground">
                  Criado: {new Date(detailItem.created_at).toLocaleString("pt-BR")} · Actualizado:{" "}
                  {new Date(detailItem.updated_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Referência técnica</p>
                <p className="text-xs font-mono text-muted-foreground">
                  {detailItem.source} · {detailItem.id}
                </p>
              </div>
              {detailItem.is_recurring && detailItem.recurring_expense_id ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const rule = recurringById.get(detailItem.recurring_expense_id!);
                    if (rule) {
                      setDetailItem(null);
                      setRecurringEditing(rule);
                      setRecurringDialogOpen(true);
                    }
                  }}
                >
                  Abrir regra desta recorrência
                </Button>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={!!payItem} onOpenChange={(o) => !o && setPayItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registar pagamento</DialogTitle>
          </DialogHeader>
          {payItem ? (
            <div className="grid gap-3 py-2">
              <p className="text-sm text-muted-foreground">{payItem.description}</p>
              <div className="grid gap-2">
                <Label>Conta de origem do pagamento</Label>
                <Select value={payAccountId} onValueChange={setPayAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Banco, caixa ou carteira conforme cadastro em{" "}
                  <Link to="/finance/accounts" className="text-primary underline-offset-2 hover:underline">
                    Bancos e contas
                  </Link>
                  .
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Data do pagamento</Label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
              {payItem.source === "expense_transaction" ? (
                <div className="grid gap-2">
                  <Label>Valor pago (R$)</Label>
                  <Input inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground rounded-md border bg-muted/30 px-2 py-2">
                  Recorrência: o valor pago corresponde à ocorrência ({formatBrlCents(payItem.amount_cents)}). Para
                  divergências, ajuste a regra ou use uma despesa avulsa.
                </p>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayItem(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitPay()} disabled={paySaving}>
              {paySaving ? "A guardar…" : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar despesa avulsa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Valor (R$)</Label>
              <Input inputMode="decimal" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Data (vencimento / competência)</Label>
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Conta</Label>
              <Select value={editAccount} onValueChange={setEditAccount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Categoria</Label>
              <Select value={editCategory || "__none__"} onValueChange={(v) => setEditCategory(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Estado</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as "pending" | "completed")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente (prevista / em aberto)</SelectItem>
                  <SelectItem value="completed">Paga (concluída)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitEdit()} disabled={editSaving}>
              {editSaving ? "A guardar…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecurringExpenseRuleDialog
        open={recurringDialogOpen}
        onOpenChange={(o) => {
          setRecurringDialogOpen(o);
          if (!o) setRecurringEditing(null);
        }}
        editing={recurringEditing}
        accounts={accounts}
        categories={categories}
        onSaved={() => void loadPayables()}
      />

      <Dialog open={novaDespesaOpen} onOpenChange={setNovaDespesaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova despesa avulsa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Conta</Label>
              <Select value={novaAccount} onValueChange={setNovaAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Categoria</Label>
              <Select value={novaCategory || "__none__"} onValueChange={(v) => setNovaCategory(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nv-val">Valor (R$)</Label>
              <Input id="nv-val" inputMode="decimal" value={novaAmount} onChange={(e) => setNovaAmount(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nv-desc">Descrição</Label>
              <Input id="nv-desc" value={novaDesc} onChange={(e) => setNovaDesc(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nv-date">Data (vencimento / competência)</Label>
              <Input id="nv-date" type="date" value={novaDate} onChange={(e) => setNovaDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Estado</Label>
              <Select value={novaStatus} onValueChange={(v) => setNovaStatus(v as "pending" | "completed")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente / prevista</SelectItem>
                  <SelectItem value="completed">Paga (concluída)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaDespesaOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleNovaCreate()} disabled={novaSaving}>
              {novaSaving ? "A guardar…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinancialAccountsPayablePage;
