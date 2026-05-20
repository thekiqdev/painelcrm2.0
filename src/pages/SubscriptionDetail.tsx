import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { crmSubscriptionsService, type CrmSubscriptionDetailPayload } from "@/services/crmSubscriptions";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  CalendarSync,
  ChevronDown,
  FileText,
  MoreHorizontal,
  Pencil,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { ClientEntityLink } from "@/components/entities";
import { isInvoiceActionable } from "@/lib/customerInvoiceActions";
import {
  addCalendarDaysToIsoYmd,
  clampRecurringGenerateDaysBeforeDue,
  computeRecurringGenerationDateYmd,
} from "@/lib/recurringGenerationPreview";
import { SubscriptionOperationalHealthCard } from "@/components/subscriptions/SubscriptionOperationalHealthCard";
import { SubscriptionRecurringStatusBadge } from "@/components/subscriptions/SubscriptionRecurringStatusBadge";
import {
  resolveJobRecurringDisplay,
  resolveTimelineInvoiceColumn,
  resolveTimelineRecurringDisplay,
} from "@/lib/subscriptionRecurringDisplay";

function formatAmount(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function subscriptionHeadlineStatus(d: CrmSubscriptionDetailPayload): { label: string; variant: "default" | "secondary" | "outline" } {
  const { subscription: s } = d;
  if (s.status === "cancelled") return { label: "Encerrada", variant: "secondary" };
  if (s.status !== "active") return { label: s.status, variant: "outline" };
  if (s.cancel_at_period_end) return { label: "Encerra ao fim do período", variant: "outline" };
  return { label: "Ativa", variant: "default" };
}

function generationSummary(tb: CrmSubscriptionDetailPayload["tenant_billing"]): string {
  const t = tb.recurring_generate_time_local?.trim().slice(0, 5);
  const tz = tb.timezone?.trim();
  if (t && tz) return `Após ${t} no fuso ${tz}`;
  if (t) return `Após ${t} (horário da conta)`;
  return "Conforme horário configurado na conta (Configurações → Cobranças)";
}

function daysBeforeDueLabel(tb: CrmSubscriptionDetailPayload["tenant_billing"]): string {
  const n = clampRecurringGenerateDaysBeforeDue(tb.recurring_invoice_generate_days_before_due);
  if (n === 0) return "0 dias (geração a partir do dia do vencimento)";
  return `${n} dia(s) antes do vencimento`;
}

function formatYmdBr(ymd: string | null | undefined): string {
  if (!ymd || ymd.length < 10) return "—";
  const head = ymd.slice(0, 10);
  return format(new Date(`${head}T12:00:00`), "dd/MM/yyyy", { locale: ptBR });
}

const SubscriptionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermissionKey } = useModulePermissions();
  const canViewInvoices = hasPermissionKey("billing.view_invoices");
  const canEditInvoice = hasPermissionKey("billing.edit_invoice");
  const canEditSubscription = hasPermissionKey("billing.edit_subscription");
  const canCancelSubscription = hasPermissionKey("billing.cancel_subscription");
  const [detail, setDetail] = useState<CrmSubscriptionDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [techOpen, setTechOpen] = useState(false);
  const [nextOpen, setNextOpen] = useState(false);
  const [nextDate, setNextDate] = useState("");
  const [savingNext, setSavingNext] = useState(false);
  const [cancelOpen, setCancelOpen] = useState<"immediate" | "end_of_period" | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cyclesUnlimitedEdit, setCyclesUnlimitedEdit] = useState(true);
  const [maxCyclesEdit, setMaxCyclesEdit] = useState("12");
  const [cyclesSaving, setCyclesSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const d = await crmSubscriptionsService.getById(id);
      setDetail(d);
      const due = d.subscription.next_billing_date?.slice(0, 10) ?? "";
      const days = clampRecurringGenerateDaysBeforeDue(d.tenant_billing.recurring_invoice_generate_days_before_due);
      const gen = due.length === 10 ? computeRecurringGenerationDateYmd(due, days) : due;
      setNextDate(gen || due);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao carregar assinatura");
      navigate("/crm-subscriptions");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!detail) return;
    const u = detail.subscription.cycles_unlimited !== false;
    setCyclesUnlimitedEdit(u);
    setMaxCyclesEdit(detail.subscription.max_cycles != null ? String(detail.subscription.max_cycles) : "12");
  }, [detail?.subscription.id, detail?.subscription.cycles_unlimited, detail?.subscription.max_cycles]);

  const saveNext = async () => {
    if (!id || !nextDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      toast.error("Informe a data no formato AAAA-MM-DD");
      return;
    }
    if (!detail) return;
    const daysBefore = clampRecurringGenerateDaysBeforeDue(
      detail.tenant_billing.recurring_invoice_generate_days_before_due
    );
    /** O utilizador edita o 1.º dia de geração; a API continua a receber o vencimento do ciclo (`next_billing_date`). */
    const cycleDueYmd = addCalendarDaysToIsoYmd(nextDate, daysBefore);
    try {
      setSavingNext(true);
      await crmSubscriptionsService.patchNextBilling(id, cycleDueYmd);
      toast.success("Datas do ciclo atualizadas");
      setNextOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingNext(false);
    }
  };

  const saveCyclesConfig = async () => {
    if (!id) return;
    const unlimited = cyclesUnlimitedEdit;
    let maxCycles: number | null = null;
    if (!unlimited) {
      const n = Math.trunc(Number(maxCyclesEdit));
      if (!Number.isFinite(n) || n < 1) {
        toast.error("Indique a quantidade de ciclos (número inteiro maior que zero)");
        return;
      }
      maxCycles = n;
    }
    try {
      setCyclesSaving(true);
      await crmSubscriptionsService.patchCyclesConfig(id, {
        cycles_unlimited: unlimited,
        max_cycles: maxCycles,
      });
      toast.success("Configuração de ciclos actualizada");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setCyclesSaving(false);
    }
  };

  const runCancel = async () => {
    if (!id || !cancelOpen) return;
    try {
      setCancelling(true);
      await crmSubscriptionsService.cancel(id, cancelOpen);
      toast.success(
        cancelOpen === "immediate" ? "Assinatura encerrada" : "Cancelamento agendado para o fim do período atual"
      );
      setCancelOpen(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cancelar");
    } finally {
      setCancelling(false);
    }
  };

  if (loading || !detail) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground text-sm">Carregando…</div>
    );
  }

  const { subscription: s, stats, timeline, meta, tenant_billing, recent_jobs, cycles_raw, cycles_read_enabled } =
    detail;
  const head = subscriptionHeadlineStatus(detail);
  const nextYmd = s.next_billing_date?.slice(0, 10);
  const daysBeforeAcct = clampRecurringGenerateDaysBeforeDue(tenant_billing.recurring_invoice_generate_days_before_due);
  const generationYmd =
    nextYmd && nextYmd.length === 10 ? computeRecurringGenerationDateYmd(nextYmd, daysBeforeAcct) : null;
  const latestPaidId = detail.latest_paid_invoice_id;
  const canReschedule = s.status === "active" && Boolean(latestPaidId);
  const editHrefRaw =
    detail.latest_invoice_id &&
    detail.latest_invoice_status &&
    isInvoiceActionable(detail.latest_invoice_status)
      ? `/customer-invoices/${detail.latest_invoice_id}/edit`
      : null;
  const editHref = editHrefRaw && canEditInvoice ? editHrefRaw : null;

  return (
    <div className="space-y-6 max-w-[1100px] pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1 pl-0" onClick={() => navigate("/crm-subscriptions")}>
          <ArrowLeft className="h-4 w-4" />
          Assinaturas
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <CalendarSync className="h-4 w-4" />
            <span>Assinatura</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {!s.customer_id ? (
              <>
                <span>{detail.plan_label?.trim() || "Assinatura recorrente"}</span>
                <Badge variant="outline" className="text-sm font-normal">
                  Por link
                </Badge>
                <span className="text-muted-foreground font-normal text-base w-full sm:w-auto">
                  · {meta.periodicity_label_pt}
                </span>
              </>
            ) : detail.client_name?.trim() ? (
              <>
                <ClientEntityLink
                  clientId={s.customer_id}
                  name={detail.client_name}
                  variant="inline"
                  className="text-2xl font-semibold tracking-tight"
                  disabledFallbackText="Abrir cliente"
                />
                <span className="text-muted-foreground font-normal text-base">· {meta.periodicity_label_pt}</span>
              </>
            ) : (
              <>
                <span className="text-foreground/90">Assinatura CRM</span>
                <span className="text-muted-foreground font-normal text-base">· {meta.periodicity_label_pt}</span>
                <p className="text-xs text-muted-foreground w-full font-normal mt-1">
                  Há vínculo interno de cliente, mas o nome não foi encontrado no cadastro desta empresa.
                </p>
              </>
            )}
          </h1>
          {detail.plan_label && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{detail.plan_label}</p>
          )}
        </div>
        <Badge
          variant={head.variant}
          className={cn(
            "self-start sm:self-auto",
            head.variant === "default" && "bg-crm-primary/12 text-crm-primary border-crm-primary/25"
          )}
        >
          {head.label}
        </Badge>
      </div>

      {/* BLOCO 1 — Resumo */}
      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b py-4">
          <CardTitle className="text-base font-medium">Resumo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 pt-6">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Cliente</p>
            {!s.customer_id ? (
              <div className="space-y-1">
                <Badge variant="outline" className="text-xs font-normal">
                  Por link
                </Badge>
                <p className="text-sm text-muted-foreground">Sem cliente CRM vinculado a esta cobrança.</p>
              </div>
            ) : detail.client_name?.trim() ? (
              <ClientEntityLink
                clientId={s.customer_id}
                name={detail.client_name}
                variant="inline"
                className="text-sm font-medium"
                disabledFallbackText="Abrir cliente"
              />
            ) : (
              <p className="text-sm font-medium text-muted-foreground">
                Cliente referenciado no faturamento, mas sem dados no cadastro desta empresa.
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Valor</p>
            <p className="text-lg font-semibold tabular-nums">{formatAmount(s.amount_cents)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Periodicidade</p>
            <p className="text-sm font-medium">{meta.periodicity_label_pt}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Status</p>
            <p className="text-sm font-medium">{head.label}</p>
          </div>
          <div className="sm:col-span-2 lg:col-span-2 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Geração prevista (1.º dia em que o sistema pode gerar a fatura)
              </p>
              <p className="text-lg font-semibold tabular-nums tracking-tight">
                {nextYmd && generationYmd ? formatYmdBr(generationYmd) : "—"}
              </p>
              {nextYmd && generationYmd ? (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {daysBeforeAcct} dia(s) antes do vencimento do ciclo.
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Vencimento da cobrança (ciclo — data da fatura)</p>
              <p className="text-sm font-medium tabular-nums text-foreground/90">{formatYmdBr(nextYmd)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <SubscriptionOperationalHealthCard detail={detail} />

      {/* BLOCO 2 — Histórico */}
      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b py-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">Histórico de cobranças</CardTitle>
          {!cycles_read_enabled && (
            <span className="text-xs text-muted-foreground">Inclui todas as faturas da assinatura</span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-muted/20">
                <TableHead>Mês de referência</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right w-[120px]">Fatura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timeline.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                    Ainda não há faturas nesta assinatura.
                  </TableCell>
                </TableRow>
              ) : (
                timeline.map((row, idx) => {
                  const display = resolveTimelineRecurringDisplay(row, recent_jobs, tenant_billing);
                  const invoiceCol = resolveTimelineInvoiceColumn(row, recent_jobs, tenant_billing);
                  return (
                  <TableRow key={`${row.invoice_id ?? row.cycle_id ?? idx}`}>
                    <TableCell className="text-sm">{row.month_ref}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.period_label}</TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {row.due_date
                        ? format(new Date(`${row.due_date}T12:00:00`), "dd/MM/yyyy", { locale: ptBR })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm max-w-[220px]">
                      <SubscriptionRecurringStatusBadge display={display} showDetail />
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {row.amount_cents != null ? formatAmount(row.amount_cents) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.invoice_id ? (
                        canViewInvoices ? (
                          <Button variant="outline" size="sm" className="h-8" asChild>
                            <Link to={`/customer-invoices/${row.invoice_id}`}>
                              <FileText className="h-3.5 w-3.5 mr-1" />
                              Ver fatura
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground" title="Sem permissão para ver faturas">
                            —
                          </span>
                        )
                      ) : (
                        <span
                          className={cn(
                            "text-xs",
                            invoiceCol.muted ? "text-muted-foreground" : "text-foreground"
                          )}
                        >
                          {invoiceCol.label}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* BLOCO 3 — Estatísticas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total faturado", value: formatAmount(stats.total_invoiced_cents) },
          { label: "Total pago", value: formatAmount(stats.total_paid_cents) },
          { label: "Total pendente", value: formatAmount(stats.total_pending_cents) },
          { label: "Número de cobranças", value: String(stats.charge_count) },
        ].map((b) => (
          <Card key={b.label} className="border shadow-sm">
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground mb-1">{b.label}</p>
              <p className="text-xl font-semibold tabular-nums tracking-tight">{b.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* BLOCO 4 — Configurações */}
      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b py-4">
          <CardTitle className="text-base font-medium">Configurações da assinatura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Periodicidade</p>
              <p className="text-sm font-medium">{meta.periodicity_label_pt}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Antecipação na conta</p>
              <p className="text-sm">{daysBeforeDueLabel(tenant_billing)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Horário / fuso (conta)</p>
              <p className="text-sm">{generationSummary(tenant_billing)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-1">Próximo ciclo — geração e vencimento</p>
              {nextYmd && generationYmd ? (
                <>
                  <p className="text-xs text-muted-foreground">Geração (1.º dia elegível)</p>
                  <p className="text-sm font-semibold tabular-nums">{formatYmdBr(generationYmd)}</p>
                  <p className="text-xs text-muted-foreground mt-2">Vencimento da fatura (ciclo)</p>
                  <p className="text-sm font-medium tabular-nums">{formatYmdBr(nextYmd)}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-4 space-y-4 max-w-xl">
            <div>
              <p className="text-sm font-medium text-foreground">Ciclos de cobrança</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ilimitado projeta receita conforme o período do relatório; finito limita o número total de cobranças
                (inclui faturas já emitidas).
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label htmlFor="cycles_unlimited_sub" className="text-sm font-normal cursor-pointer">
                Ciclos ilimitados
              </Label>
              <Switch
                id="cycles_unlimited_sub"
                checked={cyclesUnlimitedEdit}
                onCheckedChange={setCyclesUnlimitedEdit}
                disabled={!canEditSubscription || s.status !== "active"}
              />
            </div>
            {!cyclesUnlimitedEdit && (
              <div className="max-w-[200px]">
                <Label htmlFor="max_cycles_sub">Quantidade de ciclos</Label>
                <Input
                  id="max_cycles_sub"
                  type="number"
                  min={1}
                  className="mt-1"
                  value={maxCyclesEdit}
                  onChange={(e) => setMaxCyclesEdit(e.target.value)}
                  disabled={!canEditSubscription || s.status !== "active"}
                />
              </div>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => void saveCyclesConfig()}
              disabled={!canEditSubscription || cyclesSaving || s.status !== "active"}
            >
              {cyclesSaving ? "A guardar…" : "Guardar ciclos"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canEditSubscription || !canReschedule}
              onClick={() => {
                const gen =
                  nextYmd && nextYmd.length === 10
                    ? computeRecurringGenerationDateYmd(nextYmd, daysBeforeAcct)
                    : (nextYmd ?? "");
                setNextDate(gen);
                setNextOpen(true);
              }}
            >
              Alterar próxima cobrança
            </Button>
            {detail.latest_invoice_id && canViewInvoices && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/customer-invoices/${detail.latest_invoice_id}`}>Ver fatura mais recente</Link>
              </Button>
            )}
            {editHref && (
              <Button variant="outline" size="sm" asChild>
                <Link to={editHref}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Editar última fatura
                </Link>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={s.status !== "active" || !canCancelSubscription}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  Encerrar assinatura
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setCancelOpen("end_of_period")}>
                  Ao fim do período atual
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setCancelOpen("immediate")}>
                  Imediato (interrompe renovações)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {!canReschedule && s.status === "active" && (
            <p className="text-xs text-muted-foreground">
              Para alterar a próxima cobrança automaticamente, é necessário pelo menos uma fatura paga nesta assinatura.
            </p>
          )}
        </CardContent>
      </Card>

      {/* BLOCO 5 — Técnico */}
      <Collapsible open={techOpen} onOpenChange={setTechOpen}>
        <Card className="border shadow-sm overflow-hidden">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-6 py-4 text-left bg-muted/30 border-b hover:bg-muted/40 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                Detalhes para suporte
              </span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", techOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6 pt-6 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Últimas tarefas automáticas</p>
                {recent_jobs.length === 0 ? (
                  <p className="text-muted-foreground text-xs">Nenhum registro recente.</p>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Estado</TableHead>
                          <TableHead>Referência do ciclo</TableHead>
                          <TableHead>Tentativas</TableHead>
                          <TableHead>Atualizado</TableHead>
                          <TableHead>Fatura gerada</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recent_jobs.map((j) => {
                          const jobDisplay = resolveJobRecurringDisplay(j);
                          return (
                          <TableRow key={j.id}>
                            <TableCell>
                              <SubscriptionRecurringStatusBadge display={jobDisplay} />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{j.cycle_key}</TableCell>
                            <TableCell>
                              {j.attempts}/{j.max_attempts}
                              {j.retry_at ? ` · retorno ${j.retry_at.slice(0, 16)}` : ""}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{j.updated_at?.slice(0, 19)}</TableCell>
                            <TableCell>
                              {j.result_invoice_id ? (
                                canViewInvoices ? (
                                  <Link className="text-primary underline text-xs" to={`/customer-invoices/${j.result_invoice_id}`}>
                                    Abrir
                                  </Link>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
              {cycles_read_enabled && cycles_raw.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Registros de ciclo (sistema)</p>
                  <pre className="text-[11px] leading-relaxed bg-muted/50 rounded-md p-3 overflow-x-auto max-h-56 overflow-y-auto">
                    {JSON.stringify(cycles_raw, null, 2)}
                  </pre>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Estes dados servem para diagnóstico. Em caso de dúvida, envie ao suporte o identificador da
                assinatura: <span className="font-mono">{s.id}</span>
              </p>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={nextOpen} onOpenChange={setNextOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar datas do ciclo</DialogTitle>
            <DialogDescription>
              Indique o <span className="font-medium text-foreground">primeiro dia em que a geração pode começar</span>.
              O sistema grava o <span className="font-medium text-foreground">vencimento do ciclo</span> na assinatura
              (campo <code className="text-xs">next_billing_date</code>) como esta data mais {daysBeforeAcct} dia(s) de
              antecipação configurados na conta. Só é possível com pelo menos uma fatura já paga nesta assinatura.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="nbd">Primeiro dia de geração</Label>
            <Input id="nbd" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            {nextDate.match(/^\d{4}-\d{2}-\d{2}$/) ? (
              <p className="text-xs text-muted-foreground">
                Vencimento do ciclo após gravar:{" "}
                <span className="font-medium text-foreground">{formatYmdBr(addCalendarDaysToIsoYmd(nextDate, daysBeforeAcct))}</span>
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNextOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveNext} disabled={!canEditSubscription || savingNext}>
              {savingNext ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelOpen != null} onOpenChange={(o) => !o && setCancelOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {cancelOpen === "immediate" ? "Encerrar assinatura agora?" : "Encerrar ao fim do período?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cancelOpen === "immediate"
                ? "Novas cobranças automáticas deixam de ser agendadas. Faturas já emitidas mantêm-se."
                : "A assinatura continua ativa até ao fim do período atual; depois deixa de renovar."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={runCancel} disabled={cancelling}>
              {cancelling ? "Processando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SubscriptionDetail;
