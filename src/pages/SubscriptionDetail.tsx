import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { crmSubscriptionsService, type CrmSubscriptionBillingInterval, type CrmSubscriptionDetailPayload } from "@/services/crmSubscriptions";
import { toast } from "@/components/ui/sonner";
import { formatYmdBrSafe } from "@/lib/billingSafeDate";
import { executeDeterministicGenerateRenewal, resolveGenerateBillingCycleId, type GenerateBillingTarget } from "@/lib/subscriptionBillingGeneration";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { SubscriptionContractEditDialog, type SubscriptionContractModalPreset } from "@/components/subscriptions/SubscriptionContractEditDialog";
import { SubscriptionPendingContractBanner } from "@/components/subscriptions/SubscriptionPendingContractBanner";
import { Textarea } from "@/components/ui/textarea";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { isInvoiceActionable } from "@/lib/customerInvoiceActions";
import {
  FinancialCalendar,
  FinancialHeader,
  FinancialHistory,
  FinancialInsights,
  FinancialEventStoreProvider,
  FinancialResolveDialog,
  FinancialSmartScroll,
  FinancialSummarySidebar,
  FinancialTechnicalAccordion,
  LazyFinancialSection,
  RecurringRevenueCard,
  NextInvoiceCard,
} from "@/components/subscriptions/financial";
import {
  SubscriptionActionsPanel,
  SubscriptionExperienceSkeleton,
  SubscriptionSettingsActions,
} from "@/components/subscriptions/experience";
import { SIMPLIFIED_SECTION_GAP } from "@/lib/subscriptionExperienceSimplification";
import type { FinancialAlert, FinancialHistoryFilter } from "@/lib/subscriptionFinancialExperience";
import type { KpiClickAction } from "@/lib/subscriptionFinancialRefinement";
import { openInvoiceInNewTab } from "@/lib/invoiceQuickActions";
import {
  addCalendarDaysToIsoYmd,
  clampRecurringGenerateDaysBeforeDue,
  computeRecurringGenerationDateYmd,
} from "@/lib/recurringGenerationPreview";
import { SubscriptionContractHistoryPanel } from "@/components/subscriptions/SubscriptionContractHistoryPanel";
import { cn } from "@/lib/utils";

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
  return formatYmdBrSafe(ymd);
}

const BILLING_INTERVAL_OPTIONS: Array<{ value: CrmSubscriptionBillingInterval; label: string }> = [
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semi_annual", label: "Semestral" },
  { value: "yearly", label: "Anual" },
];

const SubscriptionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermissionKey } = useModulePermissions();
  const canViewInvoices = hasPermissionKey("billing.view_invoices");
  const canEditInvoice = hasPermissionKey("billing.edit_invoice");
  const canEditSubscription = hasPermissionKey("billing.edit_subscription");
  const canCancelSubscription = hasPermissionKey("billing.cancel_subscription");
  const isMobile = useIsMobile();
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
  const [contractOpen, setContractOpen] = useState(false);
  const [contractPreset, setContractPreset] = useState<SubscriptionContractModalPreset>("edit");
  const [contractSaving, setContractSaving] = useState(false);
  const [contractHistoryRefreshKey, setContractHistoryRefreshKey] = useState(0);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [pausing, setPausing] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeDate, setResumeDate] = useState("");
  const [resumeReason, setResumeReason] = useState("");
  const [resuming, setResuming] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [reactivateDate, setReactivateDate] = useState("");
  const [reactivateReason, setReactivateReason] = useState("");
  const [reactivating, setReactivating] = useState(false);
  const technicalSectionRef = useRef<HTMLDivElement>(null);
  const historySectionRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<FinancialHistoryFilter>("all");
  const [resolveAlert, setResolveAlert] = useState<FinancialAlert | null>(null);
  const [generatingBilling, setGeneratingBilling] = useState(false);
  const [generatingRowId, setGeneratingRowId] = useState<string | null>(null);
  const [repairingRowId, setRepairingRowId] = useState<string | null>(null);

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

  const handleGenerateBilling = useCallback(
    async (target?: GenerateBillingTarget | import('@/lib/billingSubscriptionExperience').FinancialHistoryRow) => {
      if (!id || !detail) return;
      const row = target && 'competence' in target ? target : undefined;
      const billingTarget = row ? undefined : (target as GenerateBillingTarget | undefined);
      const componentName =
        billingTarget?.componentName ??
        (row ? 'FinancialHistoryRow' : 'SubscriptionDetail');
      const cycleId = resolveGenerateBillingCycleId(billingTarget, row?.cycleId);
      const rowId = row?.id ?? billingTarget?.rowId ?? cycleId ?? 'next';
      if (detail.subscription.status !== 'active') {
        toast.error('Assinatura não está ativa para gerar cobrança');
        return;
      }
      try {
        setGeneratingBilling(true);
        setGeneratingRowId(rowId);
        const result = await executeDeterministicGenerateRenewal({
          subscriptionId: id,
          detail,
          target: billingTarget,
          rowCycleId: row?.cycleId,
          componentName,
        });
        if (result.success) {
          toast.success(result.invoice_id ? 'Cobrança gerada' : 'Renovação processada');
          await load();
        } else {
          toast.error(result.error_message ?? 'Não foi possível gerar a cobrança');
          await load();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao gerar cobrança');
      } finally {
        setGeneratingBilling(false);
        setGeneratingRowId(null);
      }
    },
    [id, detail, load]
  );

  const handleRepairCycleInvariant = useCallback(
    async (row?: { cycleId?: string | null; id?: string }) => {
      if (!id) return;
      if (!canEditSubscription) {
        toast.error('Sem permissão para corrigir competência');
        return;
      }
      const rowId = row?.id ?? row?.cycleId ?? 'repair';
      try {
        setRepairingRowId(rowId);
        const result = await crmSubscriptionsService.repairCycleInvariants(id, {
          cycleId: row?.cycleId ?? undefined,
        });
        if (result.cycles_reopened > 0) {
          toast.success('Competência corrigida — você pode gerar a cobrança novamente');
        } else {
          toast.info('Nenhuma competência inconsistente encontrada');
        }
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao corrigir competência');
      } finally {
        setRepairingRowId(null);
      }
    },
    [id, canEditSubscription, load]
  );

  const handleOpenInvoice = useCallback(
    (invoiceId: string) => {
      if (canViewInvoices) openInvoiceInNewTab(invoiceId);
    },
    [canViewInvoices]
  );

  const scrollToRenewal = () => {
    setHistoryFilter("pending");
    historySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

  const openContractEditor = (preset: SubscriptionContractModalPreset = "edit") => {
    if (!detail) return;
    setContractPreset(preset);
    setContractOpen(true);
  };

  const saveContract = async (body: {
    amount_cents: number;
    billing_interval: CrmSubscriptionBillingInterval;
    description: string;
    effective_at: "immediate" | "next_cycle";
    reason?: string;
  }) => {
    if (!id) return;
    try {
      setContractSaving(true);
      const result = await crmSubscriptionsService.patchContract(id, body);
      toast.success(
        result.pending
          ? "Alteração agendada para o próximo ciclo"
          : "Contrato da assinatura atualizado"
      );
      setContractOpen(false);
      setContractHistoryRefreshKey((k) => k + 1);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setContractSaving(false);
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

  const runPause = async () => {
    if (!id) return;
    const reason = pauseReason.trim();
    if (!reason) {
      toast.error("Informe o motivo da pausa");
      return;
    }
    try {
      setPausing(true);
      await crmSubscriptionsService.pause(id, reason);
      toast.success("Assinatura pausada");
      setPauseOpen(false);
      setPauseReason("");
      setContractHistoryRefreshKey((k) => k + 1);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao pausar");
    } finally {
      setPausing(false);
    }
  };

  const runResume = async () => {
    if (!id || !resumeDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      toast.error("Informe a próxima cobrança (AAAA-MM-DD)");
      return;
    }
    try {
      setResuming(true);
      await crmSubscriptionsService.resume(id, {
        next_billing_date: resumeDate,
        reason: resumeReason.trim() || undefined,
      });
      toast.success("Assinatura retomada");
      setResumeOpen(false);
      setResumeReason("");
      setContractHistoryRefreshKey((k) => k + 1);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao retomar");
    } finally {
      setResuming(false);
    }
  };

  const runReactivate = async () => {
    if (!id || !reactivateDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      toast.error("Informe a próxima cobrança (AAAA-MM-DD)");
      return;
    }
    try {
      setReactivating(true);
      await crmSubscriptionsService.reactivate(id, {
        next_billing_date: reactivateDate,
        reason: reactivateReason.trim() || undefined,
      });
      toast.success("Assinatura reativada");
      setReactivateOpen(false);
      setReactivateReason("");
      setContractHistoryRefreshKey((k) => k + 1);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reativar");
    } finally {
      setReactivating(false);
    }
  };

  if (loading || !detail) {
    return <SubscriptionExperienceSkeleton />;
  }

  const { subscription: s, meta, tenant_billing } = detail;
  const nextYmd = s.next_billing_date?.slice(0, 10);
  const daysBeforeAcct = clampRecurringGenerateDaysBeforeDue(tenant_billing.recurring_invoice_generate_days_before_due);
  const latestPaidId = detail.latest_paid_invoice_id;
  const canReschedule = s.status === "active" && Boolean(latestPaidId);
  const canEditContract =
    (s.status === "active" || s.status === "paused") && Boolean(latestPaidId) && canEditSubscription;
  const editHrefRaw =
    detail.latest_invoice_id &&
    detail.latest_invoice_status &&
    isInvoiceActionable(detail.latest_invoice_status)
      ? `/customer-invoices/${detail.latest_invoice_id}/edit`
      : null;
  const editHref = editHrefRaw && canEditInvoice ? editHrefRaw : null;

  const scrollToHistory = () => {
    historySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const scrollToTechnical = () => {
    setTechOpen(true);
    technicalSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleFinancialAlert = (alert: FinancialAlert) => {
    if (alert.kind === "client_overdue") {
      setHistoryFilter("overdue");
    }
    scrollToHistory();
  };

  const openResolveDialog = (alert: FinancialAlert) => {
    setResolveAlert(alert);
  };

  const handleKpiAction = (action: KpiClickAction) => {
    if (action.type === "scroll_history") {
      setHistoryFilter(action.filter);
      historySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (action.type === "open_invoice") {
      openInvoiceInNewTab(action.invoiceId);
    } else if (action.type === "scroll_to") {
      document.getElementById(action.targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const actionHandlers = {
    onGenerateNext: () => handleGenerateBilling({ componentName: 'SubscriptionActionsPanel' }),
    onChangeNextBilling: () => {
      const gen =
        nextYmd && nextYmd.length === 10
          ? computeRecurringGenerationDateYmd(nextYmd, daysBeforeAcct)
          : (nextYmd ?? "");
      setNextDate(gen);
      setNextOpen(true);
    },
    onEdit: () => openContractEditor("edit"),
    onUpgrade: () => openContractEditor("upgrade"),
    onDowngrade: () => openContractEditor("downgrade"),
    onPause: () => setPauseOpen(true),
    onResume: () => {
      setResumeDate(nextYmd ?? "");
      setResumeOpen(true);
    },
    onReactivate: () => {
      setReactivateDate("");
      setReactivateOpen(true);
    },
    onCancelEndOfPeriod: () => setCancelOpen("end_of_period"),
    onCancelImmediate: () => setCancelOpen("immediate"),
    onReprocess: scrollToRenewal,
    onOpenLogs: scrollToTechnical,
    onDiagnosis: scrollToRenewal,
  };

  const actionFlags = {
    status: s.status,
    canEditSubscription,
    canCancelSubscription,
    canEditContract,
    canReschedule,
    canViewInvoices,
    latestInvoiceId: detail.latest_invoice_id,
    editHref,
    showRenewalGenerate: s.status === "active",
  };

  return (
    <div className={cn(SIMPLIFIED_SECTION_GAP, "max-w-6xl pb-24 md:pb-10")}>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1 pl-0" onClick={() => navigate("/crm-subscriptions")}>
          <ArrowLeft className="h-4 w-4" />
          Assinaturas
        </Button>
      </div>

      {detail.pending_contract ? (
        <SubscriptionPendingContractBanner
          pending={detail.pending_contract}
          applicationYmd={nextYmd}
        />
      ) : null}

      <FinancialEventStoreProvider detail={detail} onPaymentConfirmed={load}>
      <FinancialHeader detail={detail} />
      <FinancialSmartScroll detail={detail} />
      <RecurringRevenueCard
        latestPaidInvoiceId={latestPaidId}
        onKpiAction={handleKpiAction}
      />

      <NextInvoiceCard
        detail={detail}
        generating={generatingBilling}
        onGenerateBilling={handleGenerateBilling}
        onOpenInvoice={handleOpenInvoice}
      />

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 order-2 lg:order-1">
          <LazyFinancialSection sectionId="financial-calendar">
            <FinancialCalendar
              detail={detail}
              canViewInvoices={canViewInvoices}
              onGenerateBilling={handleGenerateBilling}
              onRepairCycleInvariant={handleRepairCycleInvariant}
              canRepairCycle={canEditSubscription}
              repairingCycleId={repairingRowId}
              onChangeDue={actionHandlers.onChangeNextBilling}
              onViewHistory={scrollToHistory}
            />
          </LazyFinancialSection>
        </div>

        <div className="order-1 lg:order-2 lg:sticky lg:top-4 lg:self-start">
          <FinancialSummarySidebar
            detail={detail}
            onGenerateBilling={handleGenerateBilling}
            onViewTechnicalDetail={openResolveDialog}
            onResolveAlert={(alert) => {
              if (alert.kind !== 'billing_missing') {
                openResolveDialog(alert);
              }
              handleFinancialAlert(alert);
            }}
          />
        </div>
      </div>

      <div ref={historySectionRef}>
        <LazyFinancialSection sectionId="financial-history">
          <FinancialHistory
            canViewInvoices={canViewInvoices}
            filter={historyFilter}
            onFilterChange={setHistoryFilter}
            generatingRowId={generatingRowId}
            repairingRowId={repairingRowId}
            onGenerateBilling={handleGenerateBilling}
            onRepairCycleInvariant={handleRepairCycleInvariant}
            canRepairCycle={canEditSubscription}
          />
        </LazyFinancialSection>
      </div>

      <FinancialInsights />

      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <Card className="border shadow-sm overflow-hidden rounded-lg">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-6 py-4 text-left bg-muted/30 border-b hover:bg-muted/40 transition-colors"
            >
              <span className="text-sm font-medium">Configurações da assinatura</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", settingsOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6 pt-6">
              <SubscriptionSettingsActions handlers={actionHandlers} flags={actionFlags} />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 border-t pt-6">
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
                  </div>

                  <div className="rounded-lg border bg-muted/20 p-4 space-y-4 max-w-xl">
                    <div>
                      <p className="text-sm font-medium text-foreground">Configurar ciclos</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Ilimitado projeta receita conforme o período do relatório; finito limita o número total de cobranças.
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

                  {id ? (
                    <SubscriptionContractHistoryPanel subscriptionId={id} refreshKey={contractHistoryRefreshKey} />
                  ) : null}
                </CardContent>
              </CollapsibleContent>
        </Card>
      </Collapsible>

      <div ref={technicalSectionRef}>
        <FinancialTechnicalAccordion
          detail={detail}
          open={techOpen}
          onOpenChange={setTechOpen}
        />
      </div>
      </FinancialEventStoreProvider>

      <SubscriptionActionsPanel
        variant="fab"
        handlers={{
          onGenerateNext: () =>
            handleGenerateBilling({ componentName: 'SubscriptionActionsPanel' }),
          onChangeNextBilling: actionHandlers.onChangeNextBilling,
          onEdit: actionHandlers.onEdit,
          onPause: actionHandlers.onPause,
          onDiagnosis: scrollToRenewal,
        }}
        flags={{
          status: s.status,
          canEditSubscription,
          canCancelSubscription,
          canEditContract,
          canReschedule,
          canViewInvoices,
          showRenewalGenerate: s.status === "active",
        }}
      />

      <FinancialResolveDialog
        alert={resolveAlert}
        open={resolveAlert != null}
        onOpenChange={(o) => !o && setResolveAlert(null)}
        onExecute={handleFinancialAlert}
      />

      <SubscriptionContractEditDialog
        open={contractOpen}
        onOpenChange={setContractOpen}
        preset={contractPreset}
        currentAmountCents={s.amount_cents}
        currentInterval={
          (BILLING_INTERVAL_OPTIONS.some((o) => o.value === s.billing_interval)
            ? s.billing_interval
            : "monthly") as CrmSubscriptionBillingInterval
        }
        initialDescription={detail.plan_label?.trim() || detail.pending_contract?.description || ""}
        canSave={canEditContract}
        saving={contractSaving}
        onSave={saveContract}
      />

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

      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pausar assinatura</DialogTitle>
            <DialogDescription>
              A assinatura deixa de gerar faturas e tarefas automáticas até ser retomada. O histórico é preservado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="pause_reason">Motivo</Label>
            <Textarea
              id="pause_reason"
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              placeholder="Ex.: Cliente suspendeu temporariamente"
              rows={3}
            />
          </div>
          <DialogFooter className={cn(isMobile && "flex-col gap-2")}>
            <Button variant="outline" onClick={() => setPauseOpen(false)} className={cn(isMobile && "w-full")}>
              Cancelar
            </Button>
            <Button onClick={() => void runPause()} disabled={pausing || !pauseReason.trim()} className={cn(isMobile && "w-full")}>
              {pausing ? "Pausando…" : "Pausar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resumeOpen} onOpenChange={setResumeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retomar assinatura</DialogTitle>
            <DialogDescription>
              Defina a data da próxima cobrança (vencimento do ciclo). As renovações automáticas voltam a ser agendadas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="resume_nbd">Próxima cobrança</Label>
              <Input id="resume_nbd" type="date" value={resumeDate} onChange={(e) => setResumeDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resume_reason">Motivo (opcional)</Label>
              <Textarea
                id="resume_reason"
                value={resumeReason}
                onChange={(e) => setResumeReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className={cn(isMobile && "flex-col gap-2")}>
            <Button variant="outline" onClick={() => setResumeOpen(false)} className={cn(isMobile && "w-full")}>
              Cancelar
            </Button>
            <Button onClick={() => void runResume()} disabled={resuming} className={cn(isMobile && "w-full")}>
              {resuming ? "Retomando…" : "Retomar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reactivateOpen} onOpenChange={setReactivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reativar assinatura</DialogTitle>
            <DialogDescription>
              A mesma assinatura volta a ficar ativa, com histórico e contratos preservados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reactivate_nbd">Próxima cobrança</Label>
              <Input
                id="reactivate_nbd"
                type="date"
                value={reactivateDate}
                onChange={(e) => setReactivateDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reactivate_reason">Motivo (opcional)</Label>
              <Textarea
                id="reactivate_reason"
                value={reactivateReason}
                onChange={(e) => setReactivateReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className={cn(isMobile && "flex-col gap-2")}>
            <Button variant="outline" onClick={() => setReactivateOpen(false)} className={cn(isMobile && "w-full")}>
              Cancelar
            </Button>
            <Button onClick={() => void runReactivate()} disabled={reactivating} className={cn(isMobile && "w-full")}>
              {reactivating ? "Reativando…" : "Reativar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubscriptionDetail;
