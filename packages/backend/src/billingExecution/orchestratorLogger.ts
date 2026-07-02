/**
 * Billing Engine 3.0 — [EXECUTION_ORCHESTRATOR] structured logs.
 */
import { billingLog } from '../services/billingLogger.js';

type OrchestratorLogPayload = Record<string, string | number | boolean | undefined | null>;

function sanitizeLogPayload(
  payload: OrchestratorLogPayload
): Record<string, string | number | boolean | undefined> {
  const out: Record<string, string | number | boolean | undefined> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== null) {
      out[key] = value;
    }
  }
  return out;
}

export function logExecutionOrchestrator(
  tag:
    | 'EXECUTION_ORCHESTRATOR'
    | 'PERSIST_INVOICE'
    | 'PERSIST_ITEMS'
    | 'GATEWAY_EXECUTION'
    | 'NOTIFICATION_EXECUTION'
    | 'TIMELINE_EXECUTION'
    | 'HISTORY_EXECUTION'
    | 'SUBSCRIPTION_ADVANCE'
    | 'ORCHESTRATOR_RESULT',
  event: string,
  payload: OrchestratorLogPayload
): void {
  billingLog('job', `[${tag}] ${event}`, sanitizeLogPayload(payload));
}
