/**
 * Billing Engine V2 — Sprint 3.0D: registra eventos de timeline operacional.
 */
import type { NormalizedTimelineEvent } from '../internal-tools/billing-migration/billingShadow/types.js';
import { pool } from '../utils/db.js';
import { logExecutionOrchestrator } from './orchestratorLogger.js';
import type { TimelineExecutionOutcome } from './types.js';

export async function executeTimelineEvents(params: {
  subscriptionId: string;
  tenantId: string;
  invoiceId: string;
  cycleKey: string;
  correlationId: string;
  events: NormalizedTimelineEvent[];
}): Promise<TimelineExecutionOutcome> {
  logExecutionOrchestrator('TIMELINE_EXECUTION', 'start', {
    subscription_id: params.subscriptionId,
    invoice_id: params.invoiceId,
    event_count: params.events.length,
  });

  try {
    await pool.query(
      `INSERT INTO billing_recovery_audit (detail, created_at)
       VALUES ($1::jsonb, now())`,
      [
        JSON.stringify({
          kind: 'renewal_timeline_v2',
          subscription_id: params.subscriptionId,
          tenant_id: params.tenantId,
          invoice_id: params.invoiceId,
          cycle_key: params.cycleKey,
          correlation_id: params.correlationId,
          events: params.events,
        }),
      ]
    );
    logExecutionOrchestrator('TIMELINE_EXECUTION', 'complete', {
      subscription_id: params.subscriptionId,
      events_recorded: params.events.length,
    });
    return { status: 'ok', eventsRecorded: params.events.length };
  } catch {
    logExecutionOrchestrator('TIMELINE_EXECUTION', 'failed', {
      subscription_id: params.subscriptionId,
    });
    return { status: 'failed', eventsRecorded: 0 };
  }
}
