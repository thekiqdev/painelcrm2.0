import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buildTechnicalDiagnostics } from '@/lib/billingSubscriptionExperience';
import { buildWorkerHistoryEntries } from '@/lib/subscriptionRenewalRecovery';
import type { FinancialEventType } from '@/lib/financialEventTypes';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { SubscriptionRecurringStatusBadge } from '@/components/subscriptions/SubscriptionRecurringStatusBadge';
import { resolveJobRecurringDisplay } from '@/lib/subscriptionRecurringDisplay';
import { formatDateTimeBrSafe } from '@/lib/billingSafeDate';
import { useFinancialEventStore, useFinancialTimeZone } from './FinancialEventStoreContext';
import { cn } from '@/lib/utils';
import { ChevronDown, Wrench } from 'lucide-react';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
};

const EVENT_TYPE_ORDER: FinancialEventType[] = [
  'payment',
  'invoice_generated',
  'invoice_due',
  'invoice_failed',
  'invoice_cancelled',
  'invoice_reprocessed',
  'invoice_refunded',
  'upcoming_cycle',
  'manual_charge',
  'charge_attempt',
];

function groupEventsByType(events: ReturnType<typeof useFinancialEventStore>['events']) {
  const map = new Map<FinancialEventType, typeof events>();
  for (const type of EVENT_TYPE_ORDER) map.set(type, []);
  for (const ev of events) {
    const list = map.get(ev.type) ?? [];
    list.push(ev);
    map.set(ev.type, list);
  }
  return map;
}

export function FinancialTechnicalAccordion({ detail, open, onOpenChange, className }: Props) {
  const store = useFinancialEventStore();
  const timeZone = useFinancialTimeZone();
  const technicalView = store.getTechnicalView();
  const technical = technicalView?.diagnostics ?? buildTechnicalDiagnostics(detail);
  const workerHistory = buildWorkerHistoryEntries(detail);
  const { subscription: s, recent_jobs, automation_summary } = detail;
  const cycles_raw = store.getAggregate()?.cycles ?? [];
  const cycles_read_enabled = technicalView?.cyclesReadEnabled ?? detail.cycles_read_enabled;
  const eventsByType = groupEventsByType(store.events);
  const [workerOpen, setWorkerOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className={className}>
      <Card className="border shadow-sm overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-6 py-4 text-left bg-muted/30 border-b hover:bg-muted/40 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wrench className="h-4 w-4" />
              Informações técnicas
            </span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-6 text-xs font-mono text-muted-foreground">
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              <p>Engine: {technical.engineVersion ?? '3.0'}</p>
              <p>Worker v: {technical.workerVersion ?? '—'}</p>
              <p>Execution v: {technical.executionVersion ?? '—'}</p>
              <p>Runtime: {technical.runtimeVersion ?? '—'}</p>
              <p>Pipeline: {technical.pipeline ?? '—'}</p>
              <p>Stage: {technical.currentStage ?? '—'}</p>
              <p>Worker status: {technical.workerStatus ?? '—'}</p>
              <p>Cycle atual: {technical.currentCycleYmd ?? technical.cycleKey ?? '—'}</p>
              <p>Próximo ciclo: {technical.nextCycleYmd ?? '—'}</p>
              <p>Job: {technical.jobId ?? '—'}</p>
              <p>Retry: {technical.retryCount ?? '—'} / tentativa {technical.workerAttempt ?? '—'}</p>
              <p>Request: {technical.requestId ?? '—'}</p>
              <p>Caller: {technical.caller ?? '—'}</p>
              <p>Billing Plan: {technical.billingPlanId ?? s.plan_id ?? '—'}</p>
              <p>Plan items: {technical.billingPlanItemCount ?? '—'}</p>
              <p>Invoice atual: {technical.currentInvoiceId ?? '—'}</p>
              <p>Última geração: {technical.lastGenerationAt ? formatDateTimeBrSafe(technical.lastGenerationAt, timeZone) : '—'}</p>
              <p>Último retry: {technical.lastRetryAt ? formatDateTimeBrSafe(technical.lastRetryAt, timeZone) : '—'}</p>
              <p>Health: {automation_summary?.last_worker_check_at ? formatDateTimeBrSafe(automation_summary.last_worker_check_at, timeZone) : '—'}</p>
            </div>

            {technical.normalizedDates && Object.keys(technical.normalizedDates).length > 0 ? (
              <div className="rounded-md border border-dashed p-3 space-y-1">
                <p className="font-sans text-xs font-medium text-foreground">Datas normalizadas</p>
                {Object.entries(technical.normalizedDates).map(([k, v]) => (
                  <p key={k}>{k}: {v ?? '—'}</p>
                ))}
              </div>
            ) : null}

            {technical.lastError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                <p className="font-sans text-xs font-medium text-destructive">Último erro</p>
                <p className="break-all">{technical.lastError}</p>
                {technical.lastErrorOrigin?.file ? (
                  <p>Origem: {technical.lastErrorOrigin.file} → {technical.lastErrorOrigin.function}</p>
                ) : null}
                {technical.lastErrorOrigin?.stackSummary ? (
                  <p className="text-[10px] opacity-80">{technical.lastErrorOrigin.stackSummary}</p>
                ) : null}
              </div>
            ) : null}

            {detail.runtime_validation?.repairs?.length ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="font-sans text-xs font-medium text-foreground">Reparos automáticos</p>
                <ul className="text-[10px] list-disc pl-4">
                  {detail.runtime_validation.repairs.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {workerHistory.length > 0 ? (
              <Collapsible open={workerOpen} onOpenChange={setWorkerOpen}>
                <div className="rounded-md border overflow-hidden font-sans text-sm">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-foreground border-b bg-muted/20 hover:bg-muted/30"
                    >
                      Histórico operacional (worker)
                      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', workerOpen && 'rotate-180')} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Erro</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {workerHistory.map((entry) => (
                          <TableRow key={`${entry.id}-${entry.atIso}`}>
                            <TableCell className="text-xs whitespace-nowrap">{entry.dateLabel}</TableCell>
                            <TableCell className="text-xs">{entry.label}</TableCell>
                            <TableCell className="text-xs text-destructive font-mono break-all max-w-[280px]">
                              {entry.error ?? '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ) : null}

            {recent_jobs.length > 0 ? (
              <div className="rounded-md border overflow-x-auto font-sans text-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estado</TableHead>
                      <TableHead>Ciclo</TableHead>
                      <TableHead>Tentativas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent_jobs.map((j) => (
                      <TableRow key={j.id}>
                        <TableCell><SubscriptionRecurringStatusBadge display={resolveJobRecurringDisplay(j)} /></TableCell>
                        <TableCell className="font-mono text-xs">{j.cycle_key}</TableCell>
                        <TableCell>{j.attempts}/{j.max_attempts}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            {cycles_read_enabled && cycles_raw.length > 0 ? (
              <pre className="text-[10px] bg-muted/50 rounded p-3 max-h-40 overflow-auto">{JSON.stringify(cycles_raw, null, 2)}</pre>
            ) : null}
            <div className="rounded-md border border-dashed p-3 space-y-2">
              <p className="font-sans text-xs font-medium text-foreground">Financial Events ({store.events.length})</p>
              {EVENT_TYPE_ORDER.map((type) => {
                const list = eventsByType.get(type) ?? [];
                if (list.length === 0) return null;
                return (
                  <div key={type} className="space-y-1">
                    <p className="font-sans text-[11px] text-foreground">{type} ({list.length})</p>
                    <ul className="text-[10px] space-y-0.5 pl-2">
                      {list.map((ev) => (
                        <li key={ev.id}>
                          {ev.ymd} · {ev.statusLabel}
                          {ev.amountCents != null ? ` · ${ev.amountCents}` : ''}
                          {ev.invoiceId ? ` · ${ev.invoiceId}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <p className="font-sans text-xs">ID: {s.id}</p>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
