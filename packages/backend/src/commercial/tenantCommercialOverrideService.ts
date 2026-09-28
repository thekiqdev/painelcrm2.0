/**
 * Sprint M1 — resolução de preço comercial por tenant (sem alterar catálogo global).
 */
import { findActiveCommercialOverrideCandidates } from './tenantCommercialOverrideRepository.js';
import type {
  ResolveTenantCommercialPriceInput,
  ResolveTenantCommercialPriceResult,
  TenantCommercialOverrideRow,
  TenantCommercialOverrideType,
} from './tenantCommercialTypes.js';
import { TENANT_COMMERCIAL_OVERRIDE_TYPES } from './tenantCommercialTypes.js';

export function isValidCommercialOverrideType(value: string): value is TenantCommercialOverrideType {
  return (TENANT_COMMERCIAL_OVERRIDE_TYPES as readonly string[]).includes(value);
}

/** Especificidade: plano+intervalo > plano > tenant global. */
export function scoreCommercialOverrideSpecificity(
  override: TenantCommercialOverrideRow,
  planId: string,
  billingInterval: string,
): number {
  let score = 0;
  if (override.plan_id != null && override.plan_id === planId) score += 2;
  if (override.billing_interval != null && override.billing_interval === billingInterval) score += 1;
  return score;
}

export function pickBestCommercialOverride(
  candidates: TenantCommercialOverrideRow[],
  planId: string,
  billingInterval: string,
): TenantCommercialOverrideRow | null {
  if (candidates.length === 0) return null;
  const ranked = [...candidates].sort((a, b) => {
    const specDiff =
      scoreCommercialOverrideSpecificity(b, planId, billingInterval) -
      scoreCommercialOverrideSpecificity(a, planId, billingInterval);
    if (specDiff !== 0) return specDiff;
    const aCreated = new Date(a.created_at).getTime();
    const bCreated = new Date(b.created_at).getTime();
    return bCreated - aCreated;
  });
  return ranked[0] ?? null;
}

export function applyCommercialOverrideToAmount(
  catalogAmountCents: number,
  override: TenantCommercialOverrideRow,
): number {
  const catalog = Math.max(0, Math.round(catalogAmountCents));

  switch (override.override_type) {
    case 'fixed_price': {
      if (override.value_cents == null || override.value_cents < 0) {
        throw new Error('fixed_price exige value_cents >= 0');
      }
      return Math.max(0, Math.round(override.value_cents));
    }
    case 'percent_discount': {
      if (override.percent_off == null || override.percent_off < 0 || override.percent_off > 100) {
        throw new Error('percent_discount exige percent_off entre 0 e 100');
      }
      const discounted = catalog * (1 - override.percent_off / 100);
      return Math.max(0, Math.round(discounted));
    }
    case 'amount_discount': {
      if (override.value_cents == null || override.value_cents < 0) {
        throw new Error('amount_discount exige value_cents >= 0');
      }
      return Math.max(0, catalog - Math.round(override.value_cents));
    }
    case 'waive':
      return 0;
    default:
      throw new Error(`override_type não suportado: ${override.override_type}`);
  }
}

function logCommercialOverrideApplied(input: {
  tenantId: string;
  planId: string;
  overrideId: string;
  overrideType: TenantCommercialOverrideType;
  catalogAmount: number;
  finalAmount: number;
  context: ResolveTenantCommercialPriceInput['context'];
}): void {
  console.info('[tenant_commercial_override]', {
    tenantId: input.tenantId,
    planId: input.planId,
    overrideId: input.overrideId,
    overrideType: input.overrideType,
    catalogAmount: input.catalogAmount,
    finalAmount: input.finalAmount,
    context: input.context,
  });
}

/**
 * Resolve preço final aplicando override comercial ativo (se houver).
 */
export async function resolveTenantCommercialPrice(
  input: ResolveTenantCommercialPriceInput,
): Promise<ResolveTenantCommercialPriceResult> {
  const catalogAmount = Math.max(0, Math.round(input.catalogAmountCents));

  const candidates = await findActiveCommercialOverrideCandidates({
    tenantId: input.tenantId,
    planId: input.planId,
    billingInterval: input.billingInterval,
    at: input.at,
  });

  const override = pickBestCommercialOverride(candidates, input.planId, input.billingInterval);
  if (!override) {
    return {
      finalAmountCents: catalogAmount,
      source: 'catalog',
      overrideId: null,
      overrideType: null,
    };
  }

  const finalAmountCents = applyCommercialOverrideToAmount(catalogAmount, override);

  logCommercialOverrideApplied({
    tenantId: input.tenantId,
    planId: input.planId,
    overrideId: override.id,
    overrideType: override.override_type,
    catalogAmount,
    finalAmount: finalAmountCents,
    context: input.context,
  });

  return {
    finalAmountCents,
    source: 'tenant_override',
    overrideId: override.id,
    overrideType: override.override_type,
  };
}
