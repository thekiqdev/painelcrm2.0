/**
 * Billing Engine V2 — Sprint 3.0B: erros estruturados do context builder.
 */
export class BillingExecutionContextError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = 'BillingExecutionContextError';
  }
}

export const CONTEXT_ERROR_CODES = {
  BILLING_PLAN_NOT_FOUND: 'BILLING_PLAN_NOT_FOUND',
  BILLING_ITEMS_NOT_FOUND: 'BILLING_ITEMS_NOT_FOUND',
  NO_ELIGIBLE_ITEMS: 'NO_ELIGIBLE_ITEMS',
  LEGACY_PLAN_STRATEGY: 'LEGACY_PLAN_STRATEGY',
  LEGACY_ITEM_DETECTED: 'LEGACY_ITEM_DETECTED',
  CONTEXT_NOT_PURE: 'CONTEXT_NOT_PURE',
} as const;
