/**
 * Feature flag do Shadow Mode (Sprint 5.0-21).
 * Default: desligado. Ativar com VITE_BILLING_SHADOW_MODE=true|1.
 */

let testOverride: boolean | null = null;

/** Apenas testes — não usar em produção. */
export function setBillingShadowModeForTests(enabled: boolean | null): void {
  testOverride = enabled;
}

export function isBillingShadowModeEnabled(): boolean {
  if (testOverride !== null) return testOverride;
  try {
    const flag = import.meta.env.VITE_BILLING_SHADOW_MODE;
    return flag === 'true' || flag === '1';
  } catch {
    return false;
  }
}
