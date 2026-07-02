/**
 * Billing Engine 3.0 — structured logs do Worker CRM.
 */
import { billingLog } from '../billingLogger.js';

type WorkerLogPayload = Record<string, string | number | boolean | undefined | null>;

function sanitize(payload: WorkerLogPayload): Record<string, string | number | boolean | undefined> {
  const out: Record<string, string | number | boolean | undefined> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== null) out[key] = value;
  }
  return out;
}

export function logWorker(
  tag: 'WORKER' | 'WORKER_CONTEXT' | 'WORKER_ENGINE' | 'WORKER_EXECUTION' | 'WORKER_COMPLETE',
  event: string,
  payload: WorkerLogPayload = {}
): void {
  billingLog('job', `[${tag}] ${event}`, sanitize(payload));
}

/** @deprecated Sprint 3.2B — use logWorker */
export const logWorkerV2 = logWorker;
