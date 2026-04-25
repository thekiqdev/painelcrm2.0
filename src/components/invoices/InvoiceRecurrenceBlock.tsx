import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { CustomerInvoiceRecurrenceInsight } from "@/services/customerInvoices";
import { formatInvoiceDueDatePtBr } from "@/lib/formatInvoiceDates";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Repeat2,
  ChevronDown,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  ExternalLink,
  Calendar,
  CalendarClock,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  friendlyProblemHintForMain,
  friendlyQueuedSummary,
  friendlyRenewalBlockReason,
  friendlySubscriptionCycleLine,
  renewalBlockReasonIsInformational,
} from "@/lib/recurrenceInsightFriendly";

function mainBadgeClassForTag(tag: CustomerInvoiceRecurrenceInsight["visual_tag"]): string {
  switch (tag) {
    case "processed":
      return "border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
    case "no_new_invoice":
      return "border-muted-foreground/35 bg-muted/50 text-foreground";
    case "failed":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "cancelled":
      return "border-muted-foreground/40 bg-muted/60 text-muted-foreground";
    case "stale_after_reschedule":
      return "border-amber-700/45 bg-amber-600/10 text-amber-950 dark:text-amber-100";
    case "scheduled":
    default:
      return "border-primary/45 bg-primary/10 text-primary";
  }
}

function StatusIcon({ tag }: { tag: CustomerInvoiceRecurrenceInsight["visual_tag"] }) {
  switch (tag) {
    case "processed":
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />;
    case "failed":
      return <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />;
    case "cancelled":
      return <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    case "stale_after_reschedule":
      return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />;
    case "no_new_invoice":
      return <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    case "scheduled":
      return <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden />;
    default:
      return <Repeat2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />;
  }
}

export interface InvoiceRecurrenceBlockProps {
  insight: CustomerInvoiceRecurrenceInsight | null;
  loading: boolean;
  error: string | null;
  showOperational: boolean;
  currentInvoiceId: string;
  /** Valor de referência exibido como “valor recorrente” (ex.: valor desta fatura). */
  recurringAmountLabel?: string | null;
  showChangeNextBilling?: boolean;
  onChangeNextBilling?: () => void;
}

export function InvoiceRecurrenceBlock({
  insight,
  loading,
  error,
  showOperational,
  currentInvoiceId,
  recurringAmountLabel,
  showChangeNextBilling,
  onChangeNextBilling,
}: InvoiceRecurrenceBlockProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card className="border-primary/25 bg-muted/20">
        <CardHeader className="py-3 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat2 className="h-4 w-4 text-primary shrink-0" aria-hidden />
            Assinatura recorrente
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground pb-4">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
          Carregando informação da assinatura…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="border-destructive/40">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!insight || !insight.is_recurring) {
    return null;
  }

  const subscriptionNext =
    insight.subscription?.next_billing_date?.slice(0, 10) ?? insight.next_charge_date?.slice(0, 10) ?? null;
  const trg = insight.tenant_recurring_generation;
  const generationYmdForUi = trg?.generation_date_ymd ?? subscriptionNext;
  const cycleDueYmdForUi = trg?.cycle_due_ymd ?? subscriptionNext;
  const generationLabel = generationYmdForUi ? formatInvoiceDueDatePtBr(generationYmdForUi) : "—";
  const cycleDueLabel = cycleDueYmdForUi ? formatInvoiceDueDatePtBr(cycleDueYmdForUi) : "—";

  const lastProcLabel = insight.last_processing_at
    ? format(new Date(insight.last_processing_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
    : "—";
  const parsed = insight.operational?.completion_detail_parsed;
  const genId = insight.last_generated_invoice_id;

  const renewalWhy = insight.renewal_enqueue_status?.why_no_job_for_cycle ?? null;
  const showRenewalWhyAlert =
    renewalWhy != null && (insight.renewal_enqueue_status?.pending_jobs_for_current_cycle ?? 0) === 0;
  const renewalWhyInformational = renewalWhy != null && renewalBlockReasonIsInformational(renewalWhy.code);

  const queuedLine = friendlyQueuedSummary(insight);
  const problemMain = friendlyProblemHintForMain(insight.problem_hint_pt);
  const subCycleLine = friendlySubscriptionCycleLine(insight);

  return (
    <Card className="border-primary/30 shadow-sm overflow-hidden">
      <CardHeader className="py-3 pb-2 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat2 className="h-4 w-4 text-primary shrink-0" aria-hidden />
            Assinatura recorrente
          </CardTitle>
          <Badge className={`${mainBadgeClassForTag(insight.visual_tag)} gap-1`}>
            <StatusIcon tag={insight.visual_tag} />
            {insight.status_badge_pt}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Esta fatura faz parte de uma assinatura recorrente. A{" "}
          <span className="font-medium text-foreground">geração automática</span> segue a data do{" "}
          <span className="font-medium text-foreground">1.º dia elegível</span> (e horário da conta); o{" "}
          <span className="font-medium text-foreground">vencimento</span> da fatura é a data do ciclo, que pode ser
          posterior quando há antecipação.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-0 pb-4">
        <div className="rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-3 space-y-3">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-3">
              <div>
                <dt className="text-muted-foreground text-xs flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" aria-hidden />
                  Geração prevista (1.º dia em que o sistema pode gerar a fatura)
                </dt>
                <dd className="text-base font-semibold tabular-nums tracking-tight">{generationLabel}</dd>
                {trg ? (
                  <dd className="text-[11px] text-muted-foreground pt-1">
                    {trg.days_before_due} dia(s) antes do vencimento do ciclo.
                  </dd>
                ) : null}
              </div>
              <div>
                <dt className="text-muted-foreground text-xs flex items-center gap-1">
                  <Calendar className="h-3 w-3" aria-hidden />
                  Vencimento da cobrança (ciclo — data da fatura)
                </dt>
                <dd className="text-sm font-medium tabular-nums text-foreground/90">{cycleDueLabel}</dd>
              </div>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Periodicidade</dt>
              <dd className="font-medium">{insight.periodicity_label_pt ?? "—"}</dd>
            </div>
            {recurringAmountLabel ? (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground text-xs">Valor recorrente (referência)</dt>
                <dd className="font-medium">{recurringAmountLabel}</dd>
                <dd className="text-[11px] text-muted-foreground pt-0.5">
                  Valor associado a esta linha de cobrança; confirme sempre o valor na fatura emitida.
                </dd>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground text-xs">Estado da assinatura</dt>
              <dd className="font-medium text-foreground/90">
                {subCycleLine ?? "Assinatura ativa para renovações automáticas."}
              </dd>
            </div>
          </dl>

          {showChangeNextBilling && onChangeNextBilling ? (
            <Button type="button" variant="secondary" size="sm" className="gap-2 w-full sm:w-auto" onClick={onChangeNextBilling}>
              <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
              Alterar próxima cobrança
            </Button>
          ) : null}
        </div>

        {insight.visual_tag === "failed" && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <AlertDescription className="text-sm">
              O último processamento automático não foi concluído com sucesso. Verifique a situação no provedor de
              pagamentos ou contacte o suporte.
            </AlertDescription>
          </Alert>
        )}

        {insight.visual_tag === "stale_after_reschedule" && (
          <Alert className="border-amber-700/35 bg-amber-500/[0.06] py-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
            <AlertDescription className="text-sm text-foreground/90">
              A data da próxima cobrança foi alterada. O sistema irá alinhar o processamento ao novo calendário.
            </AlertDescription>
          </Alert>
        )}

        {queuedLine ? (
          <Alert className="border-border bg-muted/30 py-2">
            <Info className="h-4 w-4 text-primary shrink-0" />
            <AlertDescription className="text-sm text-foreground/90">{queuedLine}</AlertDescription>
          </Alert>
        ) : null}

        {showRenewalWhyAlert && renewalWhy && !renewalWhyInformational ? (
          <Alert className="border-amber-700/30 bg-amber-500/[0.07] py-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
            <AlertDescription className="text-sm text-foreground/90">
              {friendlyRenewalBlockReason(renewalWhy.code)}
            </AlertDescription>
          </Alert>
        ) : null}

        {problemMain ? (
          <Alert className="border-border bg-muted/30 py-2">
            <Info className="h-4 w-4 text-primary shrink-0" />
            <AlertDescription className="text-sm text-foreground/90">{problemMain}</AlertDescription>
          </Alert>
        ) : null}

        {genId && genId !== currentInvoiceId && (
          <div className="flex flex-wrap items-center gap-2 pt-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => navigate(`/customer-invoices/${genId}`)}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Abrir última fatura gerada nesta assinatura
            </Button>
          </div>
        )}
        {genId && genId === currentInvoiceId && insight.visual_tag === "processed" && (
          <p className="text-xs text-muted-foreground">
            Esta fatura corresponde à última emissão gerada automaticamente para a assinatura.
          </p>
        )}

        {showOperational && (
          <Collapsible className="rounded-md border border-dashed border-muted-foreground/25 bg-muted/20">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/40">
              <span>Detalhes técnicos da recorrência</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3 pt-0 border-t border-border/60 space-y-3 text-xs">
              <div className="grid gap-2 pt-2">
                {insight.operational && (
                  <>
                    <div className="grid gap-1">
                      <span className="text-muted-foreground">subscription_id</span>
                      <code className="break-all rounded bg-muted px-1.5 py-0.5">{insight.operational.subscription_id}</code>
                    </div>
                    {insight.operational.latest_job_id && (
                      <div className="grid gap-1">
                        <span className="text-muted-foreground">Último job</span>
                        <code className="break-all rounded bg-muted px-1.5 py-0.5">{insight.operational.latest_job_id}</code>
                      </div>
                    )}
                    <div className="grid gap-1">
                      <span className="text-muted-foreground">completion_outcome</span>
                      <code className="break-all rounded bg-muted px-1.5 py-0.5">
                        {insight.operational.completion_outcome ?? "—"}
                      </code>
                    </div>
                    {insight.operational.result_invoice_id && (
                      <div className="grid gap-1">
                        <span className="text-muted-foreground">result_invoice_id</span>
                        <code className="break-all rounded bg-muted px-1.5 py-0.5">
                          {insight.operational.result_invoice_id}
                        </code>
                      </div>
                    )}
                    {parsed && Object.keys(parsed).length > 0 ? (
                      <pre className="max-h-40 overflow-auto rounded border bg-muted/50 p-2 text-[11px] leading-snug">
                        {JSON.stringify(parsed, null, 2)}
                      </pre>
                    ) : null}
                    {!parsed && insight.operational.completion_detail_raw ? (
                      <p className="text-muted-foreground break-words">{insight.operational.completion_detail_raw}</p>
                    ) : null}
                  </>
                )}

                {insight.latest_job && (
                  <div className="rounded border bg-background/80 p-2 space-y-1">
                    <span className="font-medium text-foreground">Job recente</span>
                    <div className="grid gap-1 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">id: </span>
                        <code className="break-all">{insight.latest_job.id}</code>
                      </div>
                      <div>
                        <span className="text-muted-foreground">status: </span>
                        {insight.latest_job.status}
                      </div>
                      <div>
                        <span className="text-muted-foreground">cycle_key: </span>
                        <code className="break-all">{insight.latest_job.cycle_key}</code>
                      </div>
                      <div>
                        <span className="text-muted-foreground">completion_outcome: </span>
                        {insight.latest_job.completion_outcome ?? "—"}
                      </div>
                      {insight.latest_job.error_message ? (
                        <p className="text-destructive break-words">{insight.latest_job.error_message}</p>
                      ) : null}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <span className="text-muted-foreground">Fila / pendentes</span>
                  <p>
                    is_queued={String(insight.is_queued)} · pending_jobs_count={insight.pending_jobs_count}
                  </p>
                  {insight.renewal_enqueue_status ? (
                    <div className="rounded border bg-background/80 p-2 space-y-1 font-mono text-[11px] break-all">
                      <div>current_cycle_key={insight.renewal_enqueue_status.current_cycle_key}</div>
                      <div>
                        pending_jobs_for_current_cycle={insight.renewal_enqueue_status.pending_jobs_for_current_cycle}
                      </div>
                      {insight.renewal_enqueue_status.why_no_job_for_cycle ? (
                        <div className="space-y-1 pt-1 border-t border-border/60">
                          <div>why.code={insight.renewal_enqueue_status.why_no_job_for_cycle.code}</div>
                          <div className="whitespace-pre-wrap font-sans text-foreground">
                            {insight.renewal_enqueue_status.why_no_job_for_cycle.message_pt}
                          </div>
                          {insight.renewal_enqueue_status.why_no_job_for_cycle.window_reason ? (
                            <div>window_reason={insight.renewal_enqueue_status.why_no_job_for_cycle.window_reason}</div>
                          ) : null}
                          {insight.renewal_enqueue_status.why_no_job_for_cycle.predicted_insert ? (
                            <div>predicted_insert={insight.renewal_enqueue_status.why_no_job_for_cycle.predicted_insert}</div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <span className="text-muted-foreground">Último processamento (timestamp)</span>
                  <p>{lastProcLabel}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground">last_result_summary_pt (bruto)</span>
                  <p className="break-words">{insight.last_result_summary_pt}</p>
                </div>
                {insight.problem_hint_pt ? (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">problem_hint_pt (bruto)</span>
                    <p className="break-words">{insight.problem_hint_pt}</p>
                  </div>
                ) : null}

                {insight.subscription_cycles_insight && (
                  <div className="space-y-2">
                    <span className="font-medium text-foreground">Ciclos da assinatura (subscription_cycles)</span>
                    {insight.subscription_cycles_insight.matched_cycle && (
                      <p className="text-muted-foreground">
                        Ciclo desta fatura:{" "}
                        {formatInvoiceDueDatePtBr(insight.subscription_cycles_insight.matched_cycle.cycle_date)} —{" "}
                        {insight.subscription_cycles_insight.matched_cycle.status_label_pt}
                      </p>
                    )}
                    {insight.subscription_cycles_insight.recent_cycles.length === 0 ? (
                      <p className="text-muted-foreground">Sem ciclos indexados.</p>
                    ) : (
                      <div className="overflow-x-auto rounded border bg-background/80">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                              <th className="px-2 py-1.5 font-medium">Ciclo</th>
                              <th className="px-2 py-1.5 font-medium">Estado</th>
                              <th className="px-2 py-1.5 font-medium">Fatura</th>
                            </tr>
                          </thead>
                          <tbody>
                            {insight.subscription_cycles_insight.recent_cycles.map((c) => {
                              const isMatch =
                                insight.subscription_cycles_insight?.matched_cycle?.id === c.id;
                              return (
                                <tr
                                  key={c.id}
                                  className={`border-b border-border/60 last:border-0 ${isMatch ? "bg-primary/10" : ""}`}
                                >
                                  <td className="px-2 py-1.5 whitespace-nowrap">
                                    {formatInvoiceDueDatePtBr(c.cycle_date)}
                                  </td>
                                  <td className="px-2 py-1.5">{c.status_label_pt}</td>
                                  <td className="px-2 py-1.5">
                                    {c.invoice_id ? (
                                      <Button
                                        type="button"
                                        variant="link"
                                        className="h-auto p-0 text-xs"
                                        onClick={() => navigate(`/customer-invoices/${c.invoice_id}`)}
                                      >
                                        Abrir
                                      </Button>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
