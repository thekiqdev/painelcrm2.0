import { pool } from '../utils/db.js';
import { FEATURE_KEYS, isValidFeatureKey } from '../constants/features.js';

/**
 * Retorna se o usuário tem a feature habilitada.
 * Regra: super_admin sempre true; senão tenant → plano → plan_features; depois aplica tenant_feature_overrides.
 * Se usuário não tem tenant_id, retorna false para todas (ou podemos dar todas true para compatibilidade - optamos false).
 */
export async function userHasFeature(userId: string, featureKey: string): Promise<boolean> {
  if (!isValidFeatureKey(featureKey)) return false;

  const userRow = await pool.query(
    'SELECT tenant_id, is_super_admin FROM users WHERE id = $1',
    [userId]
  );
  if (userRow.rows.length === 0) return false;
  const user = userRow.rows[0];
  if (user.is_super_admin === true) return true;

  const tenantId = user.tenant_id;
  if (!tenantId) return false;

  const tenantRow = await pool.query(
    'SELECT plan_id, status, trial_ends_at, activated_billing_id FROM tenants WHERE id = $1',
    [tenantId]
  );
  if (tenantRow.rows.length === 0) return false;
  const tenant = tenantRow.rows[0];
  if (tenant.status === 'suspended') return false;
  if (tenant.status === 'active' || tenant.activated_billing_id != null) {
    /* plano ativo ou já vinculado a cobrança paga — não bloquear features por trial_ends_at */
  } else if (
    tenant.trial_ends_at &&
    new Date(tenant.trial_ends_at) < new Date() &&
    (tenant.status === 'trial' || tenant.status === 'payment_pending')
  ) {
    return false;
  }

  const overrideRow = await pool.query(
    'SELECT enabled FROM tenant_feature_overrides WHERE tenant_id = $1 AND feature_key = $2',
    [tenantId, featureKey]
  );
  if (overrideRow.rows.length > 0) return overrideRow.rows[0].enabled === true;

  const planRow = await pool.query(
    'SELECT enabled FROM plan_features WHERE plan_id = $1 AND feature_key = $2',
    [tenant.plan_id, featureKey]
  );
  if (planRow.rows.length > 0) return planRow.rows[0].enabled === true;
  return false;
}

/**
 * Retorna a lista de feature_key habilitadas para o usuário (para uso em lote no frontend).
 */
export async function getEnabledFeaturesForUser(userId: string): Promise<string[]> {
  const userRow = await pool.query(
    'SELECT tenant_id, is_super_admin FROM users WHERE id = $1',
    [userId]
  );
  if (userRow.rows.length === 0) return [];
  const user = userRow.rows[0];
  if (user.is_super_admin === true) return [...FEATURE_KEYS];

  const tenantId = user.tenant_id;
  if (!tenantId) return [];

  const tenantRow = await pool.query(
    'SELECT plan_id, status, trial_ends_at, activated_billing_id FROM tenants WHERE id = $1',
    [tenantId]
  );
  if (tenantRow.rows.length === 0) return [];
  const tenant = tenantRow.rows[0];
  if (tenant.status === 'suspended') return [];
  if (tenant.status === 'active' || tenant.activated_billing_id != null) {
    /* idem userHasFeature */
  } else if (
    tenant.trial_ends_at &&
    new Date(tenant.trial_ends_at) < new Date() &&
    (tenant.status === 'trial' || tenant.status === 'payment_pending')
  ) {
    return [];
  }

  const overrides = await pool.query(
    'SELECT feature_key, enabled FROM tenant_feature_overrides WHERE tenant_id = $1',
    [tenantId]
  );
  const planFeatures = await pool.query(
    'SELECT feature_key, enabled FROM plan_features WHERE plan_id = $1 AND enabled = true',
    [tenant.plan_id]
  );

  const fromPlan = new Set(planFeatures.rows.map((r: { feature_key: string }) => r.feature_key));
  const result = new Set<string>();
  for (const key of FEATURE_KEYS) {
    const override = overrides.rows.find((r: { feature_key: string }) => r.feature_key === key);
    if (override !== undefined) {
      if (override.enabled) result.add(key);
    } else if (fromPlan.has(key)) {
      result.add(key);
    }
  }
  return Array.from(result);
}
