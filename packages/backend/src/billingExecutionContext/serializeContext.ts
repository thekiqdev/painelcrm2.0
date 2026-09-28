/**
 * Billing Engine V2 — Sprint 2.3C: serialização segura do contexto (admin API).
 */
import type { BillingExecutionContext } from './types.js';

export function serializeBillingExecutionContext(
  context: BillingExecutionContext
): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(context, (_key, value) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    })
  ) as Record<string, unknown>;
}
