import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Loader2, PlayCircle, RefreshCw, Zap, CheckCircle2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  crmSubscriptionsService,
  type CrmSubscriptionManualRenewalResult,
  type CrmSubscriptionManualRenewalStatus,
} from "@/services/crmSubscriptions";
import { formatDateTimeBrSafe, safeNowIso } from "@/lib/billingSafeDate";
import { friendlyBillingMessage } from "@/lib/billingSubscriptionExperience";
import { executeDeterministicGenerateRenewal } from "@/lib/subscriptionBillingGeneration";
import { resolveOperationalCompetency } from "@/lib/operationalCompetencyResolver";

type Props = {
  subscriptionId: string;
  subscriptionStatus: string;
  canEdit: boolean;
  onActionComplete?: () => void;
};

function formatWhen(iso: string | null | undefined): string {
  return formatDateTimeBrSafe(iso);
}

function blockerLabel(code: string): string {
  return friendlyBillingMessage(code);
}

export function SubscriptionRenewalActionsCard({
  subscriptionId,
  subscriptionStatus,
  canEdit,
  onActionComplete,
}: Props) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<CrmSubscriptionManualRenewalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<"generate" | "reprocess" | null>(null);
  const [lastResult, setLastResult] = useState<CrmSubscriptionManualRenewalResult | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [confirmReprocess, setConfirmReprocess] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!subscriptionId) return;
    try {
      setLoading(true);
      setError(null);
      const s = await crmSubscriptionsService.getRenewalDiagnosis(subscriptionId);
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar o diagnóstico.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const [processingMessage, setProcessingMessage] = useState<string | null>(null);

  const pollWhileProcessing = useCallback(
    async (signal: { cancelled: boolean }) => {
      while (!signal.cancelled) {
        try {
          const s = await crmSubscriptionsService.getRenewalDiagnosis(subscriptionId);
          if (!signal.cancelled) setStatus(s);
        } catch {
          /* ignore polling errors during action */
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    },
    [subscriptionId]
  );

  const runGenerate = async () => {
    setConfirmGenerate(false);
    setActionLoading("generate");
    setLastResult(null);
    setProcessingMessage("Processando renovação…");
    const pollSignal = { cancelled: false };
    void pollWhileProcessing(pollSignal);
    try {
      const detail = await crmSubscriptionsService.get(subscriptionId);
      const resolved = resolveOperationalCompetency(detail, { mode: 'NEXT_GENERATE' });
      const cycle = resolved.cycleId
        ? detail.cycles_raw?.find((c) => c.id === resolved.cycleId) ?? null
        : null;
      if (!cycle) {
        setLastResult({
          success: false,
          job_id: null,
          invoice_id: null,
          invoice_number: null,
          gateway_status: null,
          notification_sent: false,
          subscription_status: detail.subscription.status,
          cycle_key: null,
          execution_mode: 'manual',
          duration_ms: 0,
          message: 'Nenhum ciclo elegível em subscription_cycles.',
          result: 'cycle_id_required',
          error_code: 'CYCLE_ID_REQUIRED',
          stage: 'CYCLE_RESOLUTION',
          reason: 'cycle_id_required',
          repaired_fields: [],
          logs: [],
          correlation_id: `manual-cycle-${subscriptionId}-${Date.now()}`,
        });
        return;
      }
      const result = await executeDeterministicGenerateRenewal({
        subscriptionId,
        detail,
        target: {
          cycleId: cycle.id,
          dueYmd: cycle.cycle_date,
          componentName: 'SubscriptionRenewalActionsCard',
        },
        componentName: 'SubscriptionRenewalActionsCard',
      });
      pollSignal.cancelled = true;
      setLastResult(result);
      await loadStatus();
      onActionComplete?.();
    } catch (e) {
      pollSignal.cancelled = true;
      const transportError = e instanceof Error ? e.message : "Falha na requisição";
      console.log(
        "[BILLING_JOB_TRACE][frontend]",
        JSON.stringify({
          ts: safeNowIso(),
          event: "manual_renew_ui_catch",
          subscription_id: subscriptionId,
          message: transportError,
          stack: e instanceof Error ? e.stack : undefined,
        })
      );
      setLastResult({
        success: false,
        job_id: null,
        invoice_id: null,
        invoice_number: null,
        gateway_status: null,
        notification_sent: false,
        subscription_status: null,
        cycle_key: null,
        execution_mode: "manual",
        repaired_fields: [],
        logs: [],
        result: "transport_error",
        error_code: "TRANSPORT_ERROR",
        stage: "HTTP_RECEIVED",
        reason: transportError,
        duration_ms: 0,
        message: transportError,
      });
    } finally {
      setActionLoading(null);
      setProcessingMessage(null);
    }
  };

  const runReprocess = async () => {
    setConfirmReprocess(false);
    setActionLoading("reprocess");
    setLastResult(null);
    setProcessingMessage("Processando renovação…");
    const pollSignal = { cancelled: false };
    void pollWhileProcessing(pollSignal);
    try {
      const result = await crmSubscriptionsService.reprocessRenewal(
        subscriptionId,
        status?.reprocess_job?.id
      );
      pollSignal.cancelled = true;
      setLastResult(result);
      await loadStatus();
      onActionComplete?.();
    } catch (e) {
      pollSignal.cancelled = true;
      const transportError = e instanceof Error ? e.message : "Falha na requisição";
      setLastResult({
        success: false,
        job_id: status?.reprocess_job?.id ?? null,
        invoice_id: null,
        invoice_number: null,
        gateway_status: null,
        notification_sent: false,
        subscription_status: null,
        cycle_key: null,
        execution_mode: "manual",
        repaired_fields: [],
        logs: [],
        result: "transport_error",
        error_code: "TRANSPORT_ERROR",
        stage: "HTTP_RECEIVED",
        reason: transportError,
        duration_ms: 0,
        message: transportError,
      });
    } finally {
      setActionLoading(null);
      setProcessingMessage(null);
    }
  };

  if (subscriptionStatus === "cancelled") return null;

  const reprocessJob = status?.reprocess_job;
  const showReprocess =
    Boolean(status?.can_reprocess && reprocessJob && (reprocessJob.status === "failed" || reprocessJob.status === "pending"));

  return (
    <>
      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b py-4">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-600" aria-hidden />
            Ações de Renovação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando diagnóstico…
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {!loading && status ? (
            <>
              <div className="space-y-3 rounded-lg border bg-muted/15 p-4">
                <p className="text-sm text-muted-foreground">
                  Gerar imediatamente a próxima cobrança utilizando o mesmo motor automático do sistema.
                </p>
                <Button
                  type="button"
                  disabled={!canEdit || !status.can_generate_now || actionLoading != null || Boolean(status.processing_job_id)}
                  onClick={() => setConfirmGenerate(true)}
                  className="gap-2"
                >
                  {actionLoading === "generate" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4" />
                  )}
                  Gerar próxima cobrança agora
                </Button>
                {!status.can_generate_now && status.generate_blockers.length > 0 ? (
                  <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                    {status.generate_blockers.map((b) => (
                      <li key={b}>{blockerLabel(b)}</li>
                    ))}
                  </ul>
                ) : null}
                {actionLoading ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {processingMessage ?? "Processando renovação…"}
                  </p>
                ) : null}
              </div>

              {showReprocess ? (
                <div className="space-y-3 rounded-lg border border-dashed p-4">
                  <p className="text-sm text-muted-foreground">
                    Reprocessar tentativa que falhou ou está aguardando retry no ciclo atual.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canEdit || actionLoading != null}
                    onClick={() => setConfirmReprocess(true)}
                    className="gap-2"
                  >
                    {actionLoading === "reprocess" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Reprocessar ciclo pendente
                  </Button>
                </div>
              ) : null}

              <div className="border-t pt-4 space-y-2 text-sm">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Última execução / estado</p>
                {reprocessJob ? (
                  <dl className="grid gap-1.5 sm:grid-cols-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Status do job</dt>
                      <dd className="font-medium">{reprocessJob.status}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Ciclo (cycle_key)</dt>
                      <dd className="font-mono">{reprocessJob.cycle_key || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Tentativas</dt>
                      <dd>
                        {reprocessJob.attempts}/{reprocessJob.max_attempts}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Atualizado em</dt>
                      <dd>{formatWhen(reprocessJob.updated_at)}</dd>
                    </div>
                    {reprocessJob.error_message ? (
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground">Último erro</dt>
                        <dd className="text-destructive break-words">{reprocessJob.error_message.slice(0, 300)}</dd>
                      </div>
                    ) : null}
                    {reprocessJob.result_invoice_id ? (
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground">Fatura do job</dt>
                        <dd>
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0 text-xs"
                            onClick={() => navigate(`/invoices/${reprocessJob.result_invoice_id}`)}
                          >
                            Abrir fatura
                          </Button>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum job pendente ou com falha no ciclo atual.</p>
                )}

                {lastResult ? (
                  <Alert variant={lastResult.success ? "default" : "destructive"} className="mt-3">
                    <AlertDescription className="space-y-2">
                      <p>{lastResult.message}</p>
                      {lastResult.success ? (
                        <ul className="text-xs space-y-1">
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                            {lastResult.invoice_id
                              ? `Fatura criada${lastResult.invoice_number ? ` (${lastResult.invoice_number})` : ""}`
                              : "Ciclo processado"}
                          </li>
                          <li className="flex items-center gap-1.5">
                            {lastResult.gateway_status ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                            Gateway{lastResult.gateway_status ? `: ${lastResult.gateway_status}` : " não iniciado"}
                          </li>
                          <li className="flex items-center gap-1.5">
                            {lastResult.notification_sent ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                            Notificação {lastResult.notification_sent ? "enviada" : "não detectada"}
                          </li>
                        </ul>
                      ) : null}
                      <p className="text-xs opacity-80">
                        Resultado: {lastResult.result}
                        {lastResult.error_code ? ` · ${lastResult.error_code}` : ""}
                        {lastResult.stage ? ` · ${lastResult.stage}` : ""}
                        {" · "}
                        {lastResult.duration_ms}ms
                        {lastResult.cycle_key ? ` · ciclo ${lastResult.cycle_key}` : ""}
                        {lastResult.job_id ? ` · Job ${lastResult.job_id.slice(0, 8)}…` : ""}
                      </p>
                      {lastResult.invoice_id ? (
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 text-xs"
                          onClick={() => navigate(`/invoices/${lastResult.invoice_id}`)}
                        >
                          Ver fatura gerada
                        </Button>
                      ) : null}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog open={confirmGenerate} onOpenChange={setConfirmGenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar próxima cobrança agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Será executado exatamente o mesmo processo automático utilizado pelo sistema. Uma nova cobrança poderá ser
              criada caso a assinatura esteja apta. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runGenerate()}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReprocess} onOpenChange={setConfirmReprocess}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprocessar ciclo pendente?</AlertDialogTitle>
            <AlertDialogDescription>
              O ciclo pendente será processado novamente utilizando o Billing Engine. Nenhuma regra financeira será
              ignorada. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runReprocess()}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
