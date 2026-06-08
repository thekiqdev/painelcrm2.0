/**
 * Sprint M2 — gestão Superadmin de overrides comerciais (CRUD + resumo + simulação).
 * Reutiliza resolveTenantCommercialPrice da Sprint M1 sem alterar sua lógica.
 */
import { pool } from '../utils/db.js';
import { calculateInvoiceAmount, type BillingInterval } from '../services/billingService.js';
import { insertCommercialOverrideAudit } from './tenantCommercialOverrideAuditRepository.js';
import {
  disableCommercialOverride,
  findActiveCommercialOverrideCandidates,
  findCommercialOverrideById,
  insertCommercialOverride,
  listCommercialOverridesForTenant,
  updateCommercialOverride,
} from './tenantCommercialOverrideRepository.js';
import {
  applyCommercialOverrideToAmount,
  isValidCommercialOverrideType,
  pickBestCommercialOverride,
  resolveTenantCommercialPrice,
} from './tenantCommercialOverrideService.js';
import type {
  TenantCommercialBillingInterval,
  TenantCommercialOverrideRow,
  TenantCommercialOverrideType,
} from './tenantCommercialTypes.js';

export type CommercialOverrideStatus = 'active' | 'expired' | 'disabled';

export type CreateCommercialOverrideInput = {
  override_type: TenantCommercialOverrideType;
  value_cents?: number | null;
  percent_off?: number | null;
  valid_from?: string | null;
  valid_until?: string | null;
  reason?: string | null;
  plan_id?: string | null;
  billing_interval?: TenantCommercialBillingInterval | null;
};

export type PatchCommercialOverrideInput = Partial<CreateCommercialOverrideInput>;

type TenantCommercialContext = {
  tenant: {
    id: string;
    name: string;
    status: string;
    plan_id: string;
    max_users_override: number | null;
  };
  plan: {
    id: string;
    name: string;
    slug: string;
    plan_type: string;
    price_cents: number | null;
    billing_interval: string | null;
  };
  billing_interval: BillingInterval;
  users_count: number | null;
  catalog_price_cents: number;
};

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

function parseDateOrThrow(value: string | null | undefined, field: string): Date | null {
  if (value == null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${field} inválido`);
  }
  return d;
}

export function computeOverrideStatus(
  row: TenantCommercialOverrideRow,
  at: Date = new Date(),
): CommercialOverrideStatus {
  if (!row.is_active) return 'disabled';
  const from = new Date(row.valid_from);
  if (from > at) return 'expired';
  if (row.valid_until != null && new Date(row.valid_until) <= at) return 'expired';
  return 'active';
}

function serializeOverride(row: TenantCommercialOverrideRow) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    plan_id: row.plan_id,
    billing_interval: row.billing_interval,
    override_type: row.override_type,
    value_cents: row.value_cents,
    percent_off: row.percent_off,
    valid_from: toIso(row.valid_from),
    valid_until: row.valid_until != null ? toIso(row.valid_until) : null,
    reason: row.reason,
    is_active: row.is_active,
    created_by: row.created_by,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    created_by_email:
      typeof row.metadata_json?.created_by_email === 'string'
        ? row.metadata_json.created_by_email
        : null,
  };
}

function validateOverridePayload(
  input: CreateCommercialOverrideInput,
  partial = false,
): {
  overrideType: TenantCommercialOverrideType;
  valueCents: number | null;
  percentOff: number | null;
} {
  const type = input.override_type;
  if (!partial || type != null) {
    if (!type || !isValidCommercialOverrideType(type)) {
      throw new Error('override_type inválido');
    }
  } else {
    throw new Error('override_type é obrigatório');
  }

  const overrideType = type as TenantCommercialOverrideType;
  let valueCents: number | null = input.value_cents ?? null;
  let percentOff: number | null = input.percent_off ?? null;

  switch (overrideType) {
    case 'fixed_price':
      if (valueCents == null || valueCents < 0) throw new Error('fixed_price exige value_cents >= 0');
      percentOff = null;
      break;
    case 'percent_discount':
      if (percentOff == null || percentOff < 0 || percentOff > 100) {
        throw new Error('percent_discount exige percent_off entre 0 e 100');
      }
      valueCents = null;
      break;
    case 'amount_discount':
      if (valueCents == null || valueCents < 0) throw new Error('amount_discount exige value_cents >= 0');
      percentOff = null;
      break;
    case 'waive':
      valueCents = null;
      percentOff = null;
      break;
  }

  return { overrideType, valueCents, percentOff };
}

export async function loadTenantCommercialContext(tenantId: string): Promise<TenantCommercialContext> {
  const tenantRes = await pool.query<{
    id: string;
    name: string;
    status: string;
    plan_id: string;
    max_users_override: number | null;
  }>(
    `SELECT t.id::text, t.name, t.status, t.plan_id::text, t.max_users_override
     FROM tenants t WHERE t.id = $1::uuid`,
    [tenantId],
  );
  const tenant = tenantRes.rows[0];
  if (!tenant?.plan_id) {
    throw new Error('Cliente não encontrado');
  }

  const planRes = await pool.query<{
    id: string;
    name: string;
    slug: string;
    plan_type: string;
    price_cents: number | null;
    billing_interval: string | null;
    max_users: number | null;
  }>(
    `SELECT id::text, name, slug, plan_type, price_cents, billing_interval, max_users
     FROM plans WHERE id = $1::uuid`,
    [tenant.plan_id],
  );
  const plan = planRes.rows[0];
  if (!plan) {
    throw new Error('Plano do cliente não encontrado');
  }

  const subRes = await pool.query<{ billing_interval: string; users_count: number | null }>(
    `SELECT billing_interval, users_count
     FROM subscriptions
     WHERE tenant_id = $1::uuid AND type = 'saas' AND status = 'active'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [tenantId],
  );

  const billingInterval = (subRes.rows[0]?.billing_interval ??
    plan.billing_interval ??
    'monthly') as BillingInterval;

  const isCustom = (plan.plan_type ?? 'standard') === 'custom';
  let usersCount: number | null = null;
  if (isCustom) {
    usersCount =
      tenant.max_users_override != null
        ? Number(tenant.max_users_override)
        : plan.max_users != null
          ? Number(plan.max_users)
          : 1;
  }

  const catalog_price_cents = await calculateInvoiceAmount(tenant.plan_id, billingInterval, usersCount);

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      status: tenant.status,
      plan_id: tenant.plan_id,
      max_users_override: tenant.max_users_override,
    },
    plan: {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      plan_type: plan.plan_type ?? 'standard',
      price_cents: plan.price_cents,
      billing_interval: plan.billing_interval,
    },
    billing_interval: billingInterval,
    users_count: usersCount,
    catalog_price_cents,
  };
}

export async function getTenantCommercialSummary(tenantId: string) {
  const ctx = await loadTenantCommercialContext(tenantId);

  const resolved = await resolveTenantCommercialPrice({
    tenantId,
    planId: ctx.tenant.plan_id,
    billingInterval: ctx.billing_interval,
    catalogAmountCents: ctx.catalog_price_cents,
    context: 'renewal',
  });

  const candidates = await findActiveCommercialOverrideCandidates({
    tenantId,
    planId: ctx.tenant.plan_id,
    billingInterval: ctx.billing_interval,
  });
  const active = pickBestCommercialOverride(candidates, ctx.tenant.plan_id, ctx.billing_interval);

  const simulation = {
    catalog_price_cents: ctx.catalog_price_cents,
    override_applied: resolved.source === 'tenant_override',
    override_type: resolved.overrideType,
    override_id: resolved.overrideId,
    final_price_cents: resolved.finalAmountCents,
    discount_cents: Math.max(0, ctx.catalog_price_cents - resolved.finalAmountCents),
    source: resolved.source === 'tenant_override' ? 'Override Comercial' : 'Catálogo',
  };

  return {
    tenant: ctx.tenant,
    plan: ctx.plan,
    billing_interval: ctx.billing_interval,
    catalog_price_cents: ctx.catalog_price_cents,
    effective_price_cents: resolved.finalAmountCents,
    price_source: resolved.source === 'tenant_override' ? 'Override Comercial' : 'Catálogo',
    active_override: active
      ? {
          ...serializeOverride(active),
          status: computeOverrideStatus(active),
          catalog_price_cents: ctx.catalog_price_cents,
          final_price_cents: resolved.finalAmountCents,
        }
      : null,
    simulation,
  };
}

export async function simulateTenantCommercialPrice(
  tenantId: string,
  draft?: CreateCommercialOverrideInput,
) {
  const ctx = await loadTenantCommercialContext(tenantId);

  if (!draft?.override_type) {
    return getTenantCommercialSummary(tenantId).then((s) => s.simulation);
  }

  const { overrideType, valueCents, percentOff } = validateOverridePayload(draft);
  const draftRow: TenantCommercialOverrideRow = {
    id: 'draft',
    tenant_id: tenantId,
    plan_id: draft.plan_id ?? null,
    billing_interval: draft.billing_interval ?? null,
    override_type: overrideType,
    value_cents: valueCents,
    percent_off: percentOff,
    valid_from: new Date().toISOString(),
    valid_until: null,
    reason: draft.reason ?? null,
    metadata_json: null,
    created_by: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const finalAmountCents = applyCommercialOverrideToAmount(ctx.catalog_price_cents, draftRow);

  return {
    catalog_price_cents: ctx.catalog_price_cents,
    override_applied: true,
    override_type: overrideType,
    override_id: null,
    final_price_cents: finalAmountCents,
    discount_cents: Math.max(0, ctx.catalog_price_cents - finalAmountCents),
    source: 'Override Comercial',
  };
}

function enrichOverrideListItem(row: TenantCommercialOverrideRow, catalogPriceCents: number) {
  const status = computeOverrideStatus(row);
  let finalPrice = catalogPriceCents;
  if (status === 'active') {
    try {
      finalPrice = applyCommercialOverrideToAmount(catalogPriceCents, row);
    } catch {
      finalPrice = catalogPriceCents;
    }
  }

  return {
    ...serializeOverride(row),
    status,
    catalog_price_cents: catalogPriceCents,
    final_price_cents: finalPrice,
  };
}

export async function listTenantCommercialOverrides(tenantId: string) {
  const ctx = await loadTenantCommercialContext(tenantId);
  const rows = await listCommercialOverridesForTenant(tenantId);
  return {
    items: rows.map((row) => enrichOverrideListItem(row, ctx.catalog_price_cents)),
    catalog_price_cents: ctx.catalog_price_cents,
  };
}

export async function createTenantCommercialOverride(
  tenantId: string,
  input: CreateCommercialOverrideInput,
  createdBy: string | null,
) {
  const ctx = await loadTenantCommercialContext(tenantId);
  const { overrideType, valueCents, percentOff } = validateOverridePayload(input);

  const validFrom = parseDateOrThrow(input.valid_from ?? new Date().toISOString(), 'valid_from')!;
  const validUntil = parseDateOrThrow(input.valid_until ?? null, 'valid_until');

  if (validUntil && validUntil <= validFrom) {
    throw new Error('valid_until deve ser posterior a valid_from');
  }

  const row = await insertCommercialOverride({
    tenantId,
    planId: input.plan_id ?? null,
    billingInterval: input.billing_interval ?? null,
    overrideType,
    valueCents,
    percentOff,
    validFrom,
    validUntil,
    reason: input.reason?.trim() || null,
    createdBy,
  });

  await insertCommercialOverrideAudit({
    overrideId: row.id,
    tenantId,
    action: 'created',
    beforeJson: null,
    afterJson: serializeOverride(row) as unknown as Record<string, unknown>,
    createdBy,
  });

  return enrichOverrideListItem(row, ctx.catalog_price_cents);
}

export async function patchTenantCommercialOverride(
  tenantId: string,
  overrideId: string,
  input: PatchCommercialOverrideInput,
  updatedBy: string | null,
) {
  const existing = await findCommercialOverrideById(tenantId, overrideId);
  if (!existing) {
    throw new Error('Override não encontrado');
  }
  if (!existing.is_active) {
    throw new Error('Override desativado não pode ser editado');
  }

  const merged: CreateCommercialOverrideInput = {
    override_type: input.override_type ?? existing.override_type,
    value_cents: input.value_cents !== undefined ? input.value_cents : existing.value_cents,
    percent_off: input.percent_off !== undefined ? input.percent_off : existing.percent_off,
    valid_from: input.valid_from ?? toIso(existing.valid_from),
    valid_until:
      input.valid_until !== undefined
        ? input.valid_until
        : existing.valid_until != null
          ? toIso(existing.valid_until)
          : null,
    reason: input.reason !== undefined ? input.reason : existing.reason,
    plan_id: input.plan_id !== undefined ? input.plan_id : existing.plan_id,
    billing_interval:
      input.billing_interval !== undefined ? input.billing_interval : existing.billing_interval,
  };

  const ctx = await loadTenantCommercialContext(tenantId);
  const { overrideType, valueCents, percentOff } = validateOverridePayload(merged);

  const validFrom = parseDateOrThrow(merged.valid_from ?? null, 'valid_from')!;
  const validUntil = parseDateOrThrow(merged.valid_until ?? null, 'valid_until');
  if (validUntil && validUntil <= validFrom) {
    throw new Error('valid_until deve ser posterior a valid_from');
  }

  const updated = await updateCommercialOverride({
    tenantId,
    overrideId,
    planId: merged.plan_id ?? null,
    billingInterval: merged.billing_interval ?? null,
    overrideType,
    valueCents,
    percentOff,
    validFrom,
    validUntil,
    reason: merged.reason?.trim() || null,
  });

  if (!updated) {
    throw new Error('Falha ao atualizar override');
  }

  await insertCommercialOverrideAudit({
    overrideId,
    tenantId,
    action: 'updated',
    beforeJson: serializeOverride(existing) as unknown as Record<string, unknown>,
    afterJson: serializeOverride(updated) as unknown as Record<string, unknown>,
    createdBy: updatedBy,
  });

  return enrichOverrideListItem(updated, ctx.catalog_price_cents);
}

export async function disableTenantCommercialOverride(
  tenantId: string,
  overrideId: string,
  disabledBy: string | null,
) {
  const existing = await findCommercialOverrideById(tenantId, overrideId);
  if (!existing) {
    throw new Error('Override não encontrado');
  }
  if (!existing.is_active) {
    return enrichOverrideListItem(existing, (await loadTenantCommercialContext(tenantId)).catalog_price_cents);
  }

  const disabled = await disableCommercialOverride(tenantId, overrideId);
  if (!disabled) {
    throw new Error('Falha ao desativar override');
  }

  await insertCommercialOverrideAudit({
    overrideId,
    tenantId,
    action: 'disabled',
    beforeJson: serializeOverride(existing) as unknown as Record<string, unknown>,
    afterJson: serializeOverride(disabled) as unknown as Record<string, unknown>,
    createdBy: disabledBy,
  });

  const ctx = await loadTenantCommercialContext(tenantId);
  return enrichOverrideListItem(disabled, ctx.catalog_price_cents);
}
