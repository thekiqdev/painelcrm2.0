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
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  ExternalLink,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

function badgeClassForTag(tag: CustomerInvoiceRecurrenceInsight["visual_tag"]): string {
  switch (tag) {
    case "processed":
      return "border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
    case "no_new_invoice":
      return "border-amber-600/45 bg-amber-500/10 text-amber-900 dark:text-amber-100";
    case "failed":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "cancelled":
      return "border-muted-foreground/40 bg-muted/60 text-muted-foreground";
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
    case "no_new_invoice":
      return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />;
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
}

export function InvoiceRecurrenceBlock({
  insight,
  loading,
  error,
  showOperational,
  currentInvoiceId,
}: InvoiceRecurrenceBlockProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card className="border-primary/25 bg-muted/20">
        <CardHeader className="py-3 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat2 className="h-4 w-4 text-primary shrink-0" aria-hidden />
            Recorrência
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground pb-4">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
          Carregando estado da recorrência…
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

  const nextLabel = insight.next_charge_date
    ? formatInvoiceDueDatePtBr(insight.next_charge_date)
    : "—";
  const lastProcLabel = insight.last_processing_at
    ? format(new Date(insight.last_processing_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
    : "Sem processamento recente registrado.";
  const parsed = insight.operational?.completion_detail_parsed;
  const genId = insight.last_generated_invoice_id;

  return (
    <Card className="border-primary/30 shadow-sm overflow-hidden">
      <CardHeader className="py-3 pb-2 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat2 className="h-4 w-4 text-primary shrink-0" aria-hidden />
            Recorrência
          </CardTitle>
          <Badge className={`${badgeClassForTag(insight.visual_tag)} gap-1`}>
            <StatusIcon tag={insight.visual_tag} />
            {insight.status_badge_pt}
          </Badge>
        </div>
        {insight.is_queued && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <RefreshCw className="h-3 w-3 shrink-0" aria-hidden />
            Job na fila ou em processamento ({insight.pending_jobs_count || 0} pendente(s)/ativo(s)).
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pt-0 pb-4">
        <dl className="grid gap-2 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs flex items-center gap-1">
                <Calendar className="h-3 w-3" aria-hidden />
                Próxima cobrança prevista
              </dt>
              <dd className="font-medium">{nextLabel}</dd>
              <dd className="text-xs text-muted-foreground pt-0.5">
                Data da assinatura (próximo ciclo automático), não o vencimento da fatura aberta — salvo coincidência.
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Periodicidade</dt>
              <dd>{insight.periodicity_label_pt ?? "—"}</dd>
            </div>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Último processamento</dt>
            <dd>{lastProcLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Último resultado</dt>
            <dd>{insight.last_result_summary_pt}</dd>
          </div>
          {insight.problem_hint_pt && (
            <Alert className="border-amber-600/35 bg-amber-500/5 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm text-foreground/90">{insight.problem_hint_pt}</AlertDescription>
            </Alert>
          )}
          {genId && genId !== currentInvoiceId && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => navigate(`/customer-invoices/${genId}`)}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Abrir última fatura gerada pelo ciclo
              </Button>
            </div>
          )}
          {genId && genId === currentInvoiceId && insight.visual_tag === "processed" && (
            <p className="text-xs text-muted-foreground">
              Esta fatura corresponde à última emissão gerada pelo ciclo automático.
            </p>
          )}
        </dl>

        {showOperational && insight.operational && (
          <Collapsible className="rounded-md border bg-muted/30">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50">
              Detalhes operacionais
              <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3 space-y-2 text-xs border-t bg-background/80">
              <div className="grid gap-1 pt-2">
                <span className="text-muted-foreground">Subscription</span>
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
                  <code className="break-all rounded bg-muted px-1.5 py-0.5">{insight.operational.result_invoice_id}</code>
                </div>
              )}
              {parsed && Object.keys(parsed).length > 0 && (
                <pre className="max-h-40 overflow-auto rounded border bg-muted/50 p-2 text-[11px] leading-snug">
                  {JSON.stringify(parsed, null, 2)}
                </pre>
              )}
              {!parsed && insight.operational.completion_detail_raw && (
                <p className="text-muted-foreground break-words">{insight.operational.completion_detail_raw}</p>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
