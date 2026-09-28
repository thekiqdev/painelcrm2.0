/**
 * Sprint 5.0-22 — Cutover feature flags.
 */

let useAggregateOverride: boolean | null = null;
let shadowOverride: boolean | null = null;

/** Apenas testes — não usar em produção. */
export function setBillingUseAggregateForTests(enabled: boolean | null): void {
  useAggregateOverride = enabled;
}

export function setBillingShadowModeForTests(enabled: boolean | null): void {
  shadowOverride = enabled;
}

function parseTruthyFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  if (value === 'false' || value === '0') return false;
  return value === 'true' || value === '1';
}

/** Default: true (Aggregate é a fonte oficial da UI após cutover). Rollback: VITE_BILLING_USE_AGGREGATE=false */
export function isBillingUseAggregateEnabled(): boolean {
  if (useAggregateOverride !== null) return useAggregateOverride;
  try {
    return parseTruthyFlag(import.meta.env.VITE_BILLING_USE_AGGREGATE, true);
  } catch {
    return true;
  }
}

/** Default: false — Shadow apenas para diagnóstico/rollback. */
export function isBillingShadowModeEnabled(): boolean {
  if (shadowOverride !== null) return shadowOverride;
  try {
    return parseTruthyFlag(import.meta.env.VITE_BILLING_SHADOW_MODE, false);
  } catch {
    return false;
  }
}
