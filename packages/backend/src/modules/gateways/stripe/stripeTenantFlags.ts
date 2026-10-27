import { featureFlagRegistry } from '../../../platform/featureFlagRegistry.js';

export const STRIPE_TENANT_FLAG_KEY = 'financial.stripe_tenant_v1' as const;

/** IX5 — Stripe do tenant. OFF = não aparece nas opções novas e não chama a API. */
export async function isStripeTenantEnabled(): Promise<boolean> {
  try {
    const res = await featureFlagRegistry.resolve(STRIPE_TENANT_FLAG_KEY, {});
    return res.enabled === true;
  } catch {
    return false;
  }
}

/** Catálogo do tenant: stripe fica habilitada só com a flag. A config salva não é apagada. */
export async function withStripeTenantCatalogFlag<T extends { key: string; is_enabled: boolean }>(
  items: T[]
): Promise<T[]> {
  const on = await isStripeTenantEnabled();
  return items.map((item) => (item.key === 'stripe' ? { ...item, is_enabled: on } : item));
}
