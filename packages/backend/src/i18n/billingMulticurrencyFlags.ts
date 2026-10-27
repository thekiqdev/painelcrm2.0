import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';

export const BILLING_MULTICURRENCY_FLAG_KEY = 'billing.multicurrency_v1' as const;

/** IX3 — catálogo público filtra por moeda. OFF = só BRL como hoje. */
export async function isBillingMulticurrencyEnabled(): Promise<boolean> {
  try {
    const res = await featureFlagRegistry.resolve(BILLING_MULTICURRENCY_FLAG_KEY, {});
    return res.enabled === true;
  } catch {
    return false;
  }
}
