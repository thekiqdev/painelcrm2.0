import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { ClipboardList, Eye, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { formatAppMoney } from "@/lib/i18n/formatApp";
import { cn } from "@/lib/utils";
import { serviceOrdersService } from "@/services/serviceOrders";
import type { ServiceOrder, ServiceOrderStatus } from "@/types/serviceOrders";

const STATUS_KEYS: ServiceOrderStatus[] = [
  "draft",
  "scheduled",
  "in_progress",
  "awaiting_signature",
  "signed",
  "invoiced",
  "completed",
  "cancelled",
];

const STATUS_CLASS: Record<ServiceOrderStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border/60",
  scheduled: "bg-sky-100 text-sky-950 border-sky-200/80 dark:bg-sky-950/35 dark:text-sky-100",
  in_progress: "bg-amber-100 text-amber-950 border-amber-200/80 dark:bg-amber-950/35 dark:text-amber-100",
  awaiting_signature: "bg-violet-100 text-violet-950 border-violet-200/80 dark:bg-violet-950/35 dark:text-violet-100",
  signed: "bg-emerald-100 text-emerald-950 border-emerald-200/80 dark:bg-emerald-950/35 dark:text-emerald-100",
  invoiced: "bg-blue-100 text-blue-950 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-100",
  completed: "bg-emerald-100 text-emerald-950 border-emerald-200/80",
  cancelled: "bg-red-100 text-red-900 border-red-200/80 dark:bg-red-950/40 dark:text-red-100",
};

export default function ServiceOrders() {
  const { t } = useTranslation("serviceOrders");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { canView, canCreate, canDelete, canDeleteRecord } = useModulePermissions();
  const [rows, setRows] = useState<ServiceOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const statusFilter = (searchParams.get("status") as ServiceOrderStatus | "all" | null) ?? "all";
  const hasActiveFilters = Boolean(q.trim()) || statusFilter !== "all";
  const statusLabel = (s: ServiceOrderStatus) => t(`status.${s}`);

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
        status: statusFilter !== "all" ? statusFilter : undefined,
        limit: 50,
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
  }, [canView, q, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

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
      </div>

      <div className="mb-4 hidden items-center justify-between gap-3 md:flex">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{total} registro{total === 1 ? "" : "s"}</p>
        </div>
        {canCreate("service_orders") ? (
          <Button onClick={() => navigate("/service-orders/new")}>
            <Plus className="mr-2 h-4 w-4" />
            {t("new")}
          </Button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
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
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            const next = new URLSearchParams(searchParams);
            if (v === "all") next.delete("status");
            else next.set("status", v);
            setSearchParams(next);
          }}
        >
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {STATUS_KEYS.map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const next = new URLSearchParams(searchParams);
            if (q.trim()) next.set("q", q.trim());
            else next.delete("q");
            setSearchParams(next);
          }}
        >
          Filtrar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/60" />
          <div>
            <p className="font-medium">{hasActiveFilters ? t("emptyFiltered") : t("empty")}</p>
            {!hasActiveFilters ? (
              <p className="text-sm text-muted-foreground">{t("createFirst")}</p>
            ) : null}
          </div>
          {canCreate("service_orders") && !hasActiveFilters ? (
            <Button onClick={() => navigate("/service-orders/new")}>
              <Plus className="mr-2 h-4 w-4" />
              {t("new")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(`/service-orders/${row.id}`)}>
                  <TableCell className="font-medium tabular-nums">#{row.service_order_number}</TableCell>
                  <TableCell>
                    {row.client_id ? (
                      <Link
                        to={`/clients/${row.client_id}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.client_name || "Cliente"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
                        STATUS_CLASS[row.status],
                      )}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAppMoney(Number(row.total_cents) || 0, row.currency || "BRL")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.created_at ? format(new Date(row.created_at), "dd/MM/yyyy HH:mm") : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" asChild aria-label="Abrir">
                        <Link to={`/service-orders/${row.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      {(row.status === "draft" || row.status === "cancelled") &&
                      canDelete("service_orders") &&
                      canDeleteRecord("service_orders", row.created_by, user?.id) ? (
                        <Button
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </CommercialListingPageShell>
  );
}
