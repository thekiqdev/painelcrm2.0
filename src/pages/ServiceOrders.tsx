import { useCallback, useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  CalendarPlus,
  ClipboardList,
  Download,
  Eye,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CommercialListingPageShell } from "@/components/listing/CommercialListingPageShell";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { ServiceOrderStatusMenu } from "@/components/service-orders/ServiceOrderStatusMenu";
import { ServiceOrdersKanbanBoard } from "@/components/service-orders/ServiceOrdersKanbanBoard";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { cn } from "@/lib/utils";
import { formatAppMoney } from "@/lib/i18n/formatApp";
import { serviceOrdersService } from "@/services/serviceOrders";
import type { ServiceOrder, ServiceOrderStatus } from "@/types/serviceOrders";
import {
  SERVICE_ORDER_STATUS_CLASS,
  SERVICE_ORDER_STATUS_KEYS,
  isServiceOrderManualStatus,
} from "@/utils/serviceOrdersStatus";

type ViewMode = "list" | "kanban";

const SHAREABLE_STATUSES = new Set<ServiceOrderStatus>(["draft", "scheduled", "in_progress", "sent"]);
const BODY_EDITABLE_STATUSES = new Set<ServiceOrderStatus>([
  "draft",
  "scheduled",
  "in_progress",
  "sent",
]);

export default function ServiceOrders() {
  const { t } = useTranslation("serviceOrders");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const {
    canView,
    canCreate,
    canEdit,
    canEditRecord,
    canDelete,
    canDeleteRecord,
    hasPermissionKey,
  } = useModulePermissions();
  const [rows, setRows] = useState<ServiceOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const statusFilter = (searchParams.get("status") as ServiceOrderStatus | "all" | null) ?? "all";
  const viewMode: ViewMode = searchParams.get("view") === "kanban" ? "kanban" : "list";
  const hasActiveFilters = Boolean(q.trim()) || statusFilter !== "all";
  const statusLabel = useCallback((s: ServiceOrderStatus) => t(`status.${s}`), [t]);

  const setViewMode = (mode: ViewMode) => {
    const next = new URLSearchParams(searchParams);
    if (mode === "kanban") next.set("view", "kanban");
    else next.delete("view");
    setSearchParams(next);
  };

  const load = useCallback(async () => {
    if (!canView("service_orders")) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await serviceOrdersService.list({
        q: q.trim() || undefined,
        status: viewMode === "list" && statusFilter !== "all" ? statusFilter : undefined,
        limit: viewMode === "kanban" ? 200 : 50,
        offset: 0,
      });
      setRows(res.data);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao listar ordens de serviço");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [canView, q, statusFilter, viewMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEditOrder = useCallback(
    (row: ServiceOrder) => {
      if (!canEdit("service_orders")) return false;
      return canEditRecord("service_orders", row.created_by, user?.id ?? null);
    },
    [canEdit, canEditRecord, user?.id],
  );

  const canCancelOrder = useCallback(
    (row: ServiceOrder) => {
      if (row.status === "cancelled" || row.status === "invoiced" || row.status === "completed") {
        return false;
      }
      if (!hasPermissionKey("service_orders.cancel")) return false;
      return canEditOrder(row);
    },
    [canEditOrder, hasPermissionKey],
  );

  const canSendOrder = useCallback(
    (row: ServiceOrder) => {
      if (!SHAREABLE_STATUSES.has(row.status)) return false;
      if (!hasPermissionKey("service_orders.send")) return false;
      return canEditOrder(row);
    },
    [canEditOrder, hasPermissionKey],
  );

  const canScheduleVisitOrder = useCallback(
    (row: ServiceOrder) => {
      if (row.status === "cancelled") return false;
      if (row.appointment_id) return false;
      if (!canCreate("agenda")) return false;
      return canEditOrder(row);
    },
    [canCreate, canEditOrder],
  );

  const canBodyEditOrder = useCallback(
    (row: ServiceOrder) => BODY_EDITABLE_STATUSES.has(row.status) && canEditOrder(row),
    [canEditOrder],
  );

  const downloadPdf = useCallback(async (row: ServiceOrder) => {
    setActionBusyId(row.id);
    try {
      await serviceOrdersService.downloadPdf(row.id);
      toast.success("PDF gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar PDF");
    } finally {
      setActionBusyId(null);
    }
  }, []);

  const sendOrder = useCallback(
    async (row: ServiceOrder) => {
      if (!canSendOrder(row)) {
        toast.error("Sem permissão ou status inválido para enviar");
        return;
      }
      setActionBusyId(row.id);
      try {
        const res = await serviceOrdersService.sendToClient(row.id, {
          regenerate: row.status === "sent",
        });
        setRows((prev) =>
          prev.map((r) => (r.id === res.order.id ? { ...r, ...res.order } : r)),
        );
        toast.success(row.status === "sent" ? "OS reenviada ao cliente" : "OS enviada ao cliente");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao enviar OS");
      } finally {
        setActionBusyId(null);
      }
    },
    [canSendOrder],
  );

  const cancelOrder = useCallback(
    async (row: ServiceOrder) => {
      if (!canCancelOrder(row)) {
        toast.error("Sem permissão para cancelar");
        return;
      }
      if (!window.confirm(`Cancelar OS Nº ${row.service_order_number}?`)) return;
      setActionBusyId(row.id);
      try {
        const updated = await serviceOrdersService.update(row.id, { status: "cancelled" });
        setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
        toast.success("Ordem cancelada");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao cancelar");
      } finally {
        setActionBusyId(null);
      }
    },
    [canCancelOrder],
  );

  const changeStatus = useCallback(
    async (row: ServiceOrder, next: ServiceOrderStatus) => {
      if (next === row.status) return;
      if (!isServiceOrderManualStatus(next)) {
        toast.error("Este status só muda pelo fluxo de envio, assinatura ou fatura.");
        return;
      }
      if (next === "cancelled" && !canCancelOrder(row)) {
        toast.error("Sem permissão para cancelar esta OS");
        return;
      }
      if (!canEditOrder(row)) {
        toast.error("Sem permissão para alterar status");
        return;
      }
      setStatusBusyId(row.id);
      try {
        const updated = await serviceOrdersService.update(row.id, { status: next });
        setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
        toast.success(`Status atualizado: ${statusLabel(next)}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao alterar status");
        void load();
      } finally {
        setStatusBusyId(null);
      }
    },
    [canCancelOrder, canEditOrder, load, statusLabel],
  );

  const onDelete = async (row: ServiceOrder) => {
    if (!canDelete("service_orders") || !canDeleteRecord("service_orders", row.created_by, user?.id)) {
      toast.error("Sem permissão para excluir");
      return;
    }
    if (!window.confirm(`Excluir OS Nº ${row.service_order_number}?`)) return;
    try {
      await serviceOrdersService.remove(row.id);
      toast.success("Ordem excluída");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    }
  };

  const viewToggle = (
    <div className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5">
      <Button
        type="button"
        size="sm"
        variant={viewMode === "list" ? "default" : "ghost"}
        className="h-8 gap-1.5 px-2.5"
        onClick={() => setViewMode("list")}
      >
        <ListIcon className="h-4 w-4" />
        Lista
      </Button>
      <Button
        type="button"
        size="sm"
        variant={viewMode === "kanban" ? "default" : "ghost"}
        className="h-8 gap-1.5 px-2.5"
        onClick={() => setViewMode("kanban")}
      >
        <LayoutGrid className="h-4 w-4" />
        Kanban
      </Button>
    </div>
  );

  if (!canView("service_orders")) {
    return (
      <CommercialListingPageShell>
        <p className="text-sm text-muted-foreground">Sem permissão para ver ordens de serviço.</p>
      </CommercialListingPageShell>
    );
  }

  return (
    <CommercialListingPageShell>
      <div className="md:hidden sticky top-0 z-30 -mx-0.5 border-b border-border/70 bg-background/95 px-0.5 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <MobilePageHeader
          title={t("title")}
          primaryAction={
            canCreate("service_orders")
              ? {
                  label: t("new"),
                  icon: <Plus className="h-4 w-4" />,
                  href: "/service-orders/new",
                }
              : undefined
          }
        />
        <div className="mt-2 flex justify-end">{viewToggle}</div>
      </div>

      <div className="mb-4 hidden items-center justify-between gap-3 md:flex">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{total} registro{total === 1 ? "" : "s"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {viewToggle}
          {canCreate("service_orders") ? (
            <Button onClick={() => navigate("/service-orders/new")}>
              <Plus className="mr-2 h-4 w-4" />
              {t("new")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-10 pl-8"
            placeholder="Buscar por número, cliente ou observação…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const next = new URLSearchParams(searchParams);
                if (q.trim()) next.set("q", q.trim());
                else next.delete("q");
                setSearchParams(next);
              }
            }}
          />
        </div>
        {viewMode === "list" ? (
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              const next = new URLSearchParams(searchParams);
              if (v === "all") next.delete("status");
              else next.set("status", v);
              setSearchParams(next);
            }}
          >
            <SelectTrigger className="h-10 w-full sm:w-[220px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {SERVICE_ORDER_STATUS_KEYS.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="h-10"
          onClick={() => {
            const next = new URLSearchParams(searchParams);
            if (q.trim()) next.set("q", q.trim());
            else next.delete("q");
            setSearchParams(next);
            void load();
          }}
        >
          Filtrar
        </Button>
      </div>

      {loading ? (
        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-8 text-center text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin" />
          <p className="text-sm font-medium text-foreground">Carregando ordens de serviço</p>
          <p className="text-xs text-muted-foreground">Aguarde um instante.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-8 text-center">
          <ClipboardList className="h-7 w-7 text-muted-foreground/80" aria-hidden />
          <div>
            <p className="text-sm font-medium text-foreground">
              {hasActiveFilters ? t("emptyFiltered") : t("empty")}
            </p>
            {!hasActiveFilters ? (
              <p className="mt-1 text-xs text-muted-foreground">{t("createFirst")}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Revise os filtros ou limpe a busca.</p>
            )}
          </div>
          {canCreate("service_orders") && !hasActiveFilters ? (
            <Button onClick={() => navigate("/service-orders/new")}>
              <Plus className="mr-2 h-4 w-4" />
              {t("new")}
            </Button>
          ) : null}
        </div>
      ) : viewMode === "kanban" ? (
        <ServiceOrdersKanbanBoard
          orders={rows}
          statusLabel={statusLabel}
          loading={loading}
          onOpenOrder={(order) => navigate(`/service-orders/${order.id}`)}
          canMoveOrder={(order) => canEditOrder(order) && order.status !== "cancelled"}
          moveBlockedReason={(order) => {
            if (order.status === "cancelled") return "OS cancelada não pode mudar de status.";
            if (!canEditOrder(order)) return "Sem permissão para alterar esta OS.";
            return null;
          }}
          onMoveOrder={async (orderId, next) => {
            const row = rows.find((r) => r.id === orderId);
            if (!row) return;
            await changeStatus(row, next);
          }}
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium text-muted-foreground">Nº</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Cliente</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">Total</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Criada em</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const openOrder = () => navigate(`/service-orders/${row.id}`);
                  const onRowActivate = (e: MouseEvent | KeyboardEvent) => {
                    const target = e.target as HTMLElement | null;
                    if (target?.closest("a, button, [role='menuitem'], [data-radix-collection-item]")) {
                      return;
                    }
                    if ("key" in e) {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                    }
                    openOrder();
                  };
                  return (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer border-b border-border/60 hover:bg-muted/50"
                      onClick={onRowActivate}
                      onKeyDown={onRowActivate}
                      tabIndex={0}
                      role="link"
                      aria-label={`Abrir OS Nº ${row.service_order_number}`}
                    >
                      <TableCell className="font-medium tabular-nums">#{row.service_order_number}</TableCell>
                      <TableCell className="max-w-[240px]">
                        <span className="block truncate">
                          {row.client_name?.trim() || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <ServiceOrderStatusMenu
                          status={row.status}
                          label={statusLabel}
                          compact
                          disabled={!canEditOrder(row) || row.status === "cancelled"}
                          busy={statusBusyId === row.id}
                          canCancel={canCancelOrder(row)}
                          onChange={(next) => void changeStatus(row, next)}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAppMoney(Number(row.total_cents) || 0, row.currency || "BRL")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.created_at ? format(new Date(row.created_at), "dd/MM/yyyy HH:mm") : "—"}
                      </TableCell>
                      <TableCell
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Abrir"
                            onClick={openOrder}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {(row.status === "draft" || row.status === "cancelled") &&
                          canDelete("service_orders") &&
                          canDeleteRecord("service_orders", row.created_by, user?.id) ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Excluir"
                              onClick={() => void onDelete(row)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden">
            {rows.map((row) => {
              const openOrder = () => navigate(`/service-orders/${row.id}`);
              const busy = actionBusyId === row.id;
              const showSend = canSendOrder(row);
              const showSchedule = canScheduleVisitOrder(row);
              const showEdit = canBodyEditOrder(row);
              const showCancel = canCancelOrder(row);
              return (
                <div
                  key={`m-${row.id}`}
                  className="min-h-[9.5rem] rounded-2xl border border-border bg-card p-4 shadow-sm"
                >
                  <button type="button" onClick={openOrder} className="w-full text-left">
                    <p className="font-mono text-xs text-muted-foreground">
                      OS Nº {row.service_order_number}
                    </p>
                    <p className="mt-1 min-w-0 truncate font-semibold leading-snug">
                      {row.client_name?.trim() || "Sem cliente"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                          SERVICE_ORDER_STATUS_CLASS[row.status],
                        )}
                      >
                        {statusLabel(row.status)}
                      </span>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatAppMoney(Number(row.total_cents) || 0, row.currency || "BRL")}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {row.created_at
                        ? `Criada em ${format(new Date(row.created_at), "dd/MM/yyyy HH:mm")}`
                        : "Sem data de criação"}
                    </p>
                  </button>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <div onClick={(e) => e.stopPropagation()}>
                      <ServiceOrderStatusMenu
                        status={row.status}
                        label={statusLabel}
                        compact
                        disabled={!canEditOrder(row) || row.status === "cancelled"}
                        busy={statusBusyId === row.id}
                        canCancel={canCancelOrder(row)}
                        onChange={(next) => void changeStatus(row, next)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" className="h-9 px-3" onClick={openOrder}>
                        Abrir
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 gap-1 px-3"
                            disabled={busy}
                          >
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                Ações
                                <MoreHorizontal className="h-4 w-4" />
                              </>
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem disabled={busy} onClick={() => void downloadPdf(row)}>
                            <Download className="mr-2 h-4 w-4" />
                            Baixar PDF
                          </DropdownMenuItem>
                          {showSend ? (
                            <DropdownMenuItem disabled={busy} onClick={() => void sendOrder(row)}>
                              <Send className="mr-2 h-4 w-4" />
                              {row.status === "sent" ? "Reenviar OS" : "Enviar OS"}
                            </DropdownMenuItem>
                          ) : null}
                          {showSchedule ? (
                            <DropdownMenuItem
                              onClick={() =>
                                navigate(`/service-orders/${row.id}`, {
                                  state: { openScheduleVisit: true },
                                })
                              }
                            >
                              <CalendarPlus className="mr-2 h-4 w-4" />
                              Marcar visita técnica
                            </DropdownMenuItem>
                          ) : null}
                          {showEdit ? (
                            <DropdownMenuItem
                              onClick={() =>
                                navigate(`/service-orders/${row.id}`, {
                                  state: { startEditing: true },
                                })
                              }
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                          ) : null}
                          {showCancel ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={busy}
                                className="text-destructive focus:text-destructive"
                                onClick={() => void cancelOrder(row)}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancelar
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </CommercialListingPageShell>
  );
}
