/**
 * Billing Engine V2 — contexto de snapshot (placeholder Sprint 2.3).
 */
import type { BillingItemSnapshot } from './types.js';

export type BillingItemSnapshotContext = {
  snapshot: BillingItemSnapshot | null;
  futureSnapshot: BillingItemSnapshot | null;
};

export function emptyBillingItemSnapshotContext(): BillingItemSnapshotContext {
  return {
    snapshot: null,
    futureSnapshot: null,
  };
}
