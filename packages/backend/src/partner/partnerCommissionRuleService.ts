/**
 * M5 S5 — CRUD regras de comissão (equipe + override seller).
 */

import { pool } from '../utils/db.js';
import { PartnerAdminError } from './partnerAdminService.js';
import type {
  CommissionAppliesTo,
  CommissionCycleMode,
  CommissionRuleSnapshot,
  CommissionRuleType,
} from './partnerCommissionMath.js';

export type PartnerCommissionRuleRow = {
  id: string;
  partner_tenant_id: string;
  seller_user_id: string | null;
  name: string;
  rule_type: CommissionRuleType;
  percent_bps: number | null;
  fixed_cents: number | null;
  base_definition: 'profit';
  cycle_mode: CommissionCycleMode;
  custom_cycle_config_json: Record<string, unknown>;
  applies_to: CommissionAppliesTo;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
};

function mapRule(row: Record<string, unknown>): PartnerCommissionRuleRow {
  return {
    id: String(row.id),
    partner_tenant_id: String(row.partner_tenant_id),
    seller_user_id: row.seller_user_id != null ? String(row.seller_user_id) : null,
    name: String(row.name),
    rule_type: row.rule_type as CommissionRuleType,
    percent_bps: row.percent_bps != null ? Number(row.percent_bps) : null,
    fixed_cents: row.fixed_cents != null ? Number(row.fixed_cents) : null,
    base_definition: 'profit',
    cycle_mode: (row.cycle_mode as CommissionCycleMode) || 'recurring',
    custom_cycle_config_json: (row.custom_cycle_config_json ?? {}) as Record<string, unknown>,
    applies_to: (row.applies_to as CommissionAppliesTo) || 'both',
    status: row.status as 'active' | 'archived',
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function toRuleSnapshot(rule: PartnerCommissionRuleRow): CommissionRuleSnapshot {
  return {
    id: rule.id,
    name: rule.name,
    rule_type: rule.rule_type,
    percent_bps: rule.percent_bps,
    fixed_cents: rule.fixed_cents,
    base_definition: 'profit',
    cycle_mode: rule.cycle_mode,
    custom_cycle_config_json: rule.custom_cycle_config_json,
    applies_to: rule.applies_to,
    scope: rule.seller_user_id ? 'seller' : 'team',
  };
}

function assertRuleShape(input: {
  rule_type: CommissionRuleType;
  percent_bps?: number | null;
  fixed_cents?: number | null;
}): void {
  if (input.rule_type === 'percent') {
    if (input.percent_bps == null || input.percent_bps < 0 || input.percent_bps > 10000) {
      throw new PartnerAdminError('percent_bps inválido (0–10000)', 'RULE_PERCENT_INVALID', 400);
    }
  } else if (input.rule_type === 'fixed') {
    if (input.fixed_cents == null || input.fixed_cents < 0) {
      throw new PartnerAdminError('fixed_cents inválido', 'RULE_FIXED_INVALID', 400);
    }
  } else {
    if (input.percent_bps == null || input.fixed_cents == null) {
      throw new PartnerAdminError('hybrid exige percent_bps e fixed_cents', 'RULE_HYBRID_INVALID', 400);
    }
  }
}

export async function listCommissionRules(
  partnerTenantId: string
): Promise<PartnerCommissionRuleRow[]> {
  const r = await pool.query(
    `SELECT * FROM partner_commission_rules
     WHERE partner_tenant_id = $1
     ORDER BY seller_user_id NULLS FIRST, created_at DESC`,
    [partnerTenantId]
  );
  return r.rows.map((row) => mapRule(row));
}

export async function getActiveTeamRule(
  partnerTenantId: string
): Promise<PartnerCommissionRuleRow | null> {
  const r = await pool.query(
    `SELECT * FROM partner_commission_rules
     WHERE partner_tenant_id = $1 AND seller_user_id IS NULL AND status = 'active'
     LIMIT 1`,
    [partnerTenantId]
  );
  return r.rows[0] ? mapRule(r.rows[0]) : null;
}

export async function getActiveSellerRule(
  partnerTenantId: string,
  sellerUserId: string
): Promise<PartnerCommissionRuleRow | null> {
  const r = await pool.query(
    `SELECT * FROM partner_commission_rules
     WHERE partner_tenant_id = $1 AND seller_user_id = $2 AND status = 'active'
     LIMIT 1`,
    [partnerTenantId, sellerUserId]
  );
  return r.rows[0] ? mapRule(r.rows[0]) : null;
}

/** Override seller se existir; senão regra de equipe. */
export async function resolveEffectiveRule(
  partnerTenantId: string,
  sellerUserId: string
): Promise<PartnerCommissionRuleRow | null> {
  const seller = await getActiveSellerRule(partnerTenantId, sellerUserId);
  if (seller) return seller;
  return getActiveTeamRule(partnerTenantId);
}

export type UpsertCommissionRuleInput = {
  name: string;
  rule_type: CommissionRuleType;
  percent_bps?: number | null;
  fixed_cents?: number | null;
  cycle_mode?: CommissionCycleMode;
  custom_cycle_config_json?: Record<string, unknown>;
  applies_to?: CommissionAppliesTo;
  seller_user_id?: string | null;
};

export async function upsertCommissionRule(
  partnerTenantId: string,
  input: UpsertCommissionRuleInput
): Promise<PartnerCommissionRuleRow> {
  assertRuleShape(input);
  const sellerId = input.seller_user_id ?? null;

  if (sellerId) {
    const m = await pool.query(
      `SELECT id FROM partner_memberships
       WHERE partner_tenant_id = $1 AND user_id = $2
         AND role = 'partner_seller' AND status = 'active'
       LIMIT 1`,
      [partnerTenantId, sellerId]
    );
    if (!m.rows[0]) {
      throw new PartnerAdminError('Vendedor inválido', 'SELLER_INVALID', 400);
    }
  }

  // Arquiva regra ativa anterior do mesmo escopo
  if (sellerId) {
    await pool.query(
      `UPDATE partner_commission_rules SET status = 'archived', updated_at = now()
       WHERE partner_tenant_id = $1 AND seller_user_id = $2 AND status = 'active'`,
      [partnerTenantId, sellerId]
    );
  } else {
    await pool.query(
      `UPDATE partner_commission_rules SET status = 'archived', updated_at = now()
       WHERE partner_tenant_id = $1 AND seller_user_id IS NULL AND status = 'active'`,
      [partnerTenantId]
    );
  }

  const r = await pool.query(
    `INSERT INTO partner_commission_rules (
       partner_tenant_id, seller_user_id, name, rule_type, percent_bps, fixed_cents,
       cycle_mode, custom_cycle_config_json, applies_to, status
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 'active'
     )
     RETURNING *`,
    [
      partnerTenantId,
      sellerId,
      input.name.trim(),
      input.rule_type,
      input.rule_type === 'fixed' ? null : input.percent_bps ?? null,
      input.rule_type === 'percent' ? null : input.fixed_cents ?? null,
      input.cycle_mode ?? 'recurring',
      JSON.stringify(input.custom_cycle_config_json ?? {}),
      input.applies_to ?? 'both',
    ]
  );
  return mapRule(r.rows[0]);
}

export async function archiveCommissionRule(
  partnerTenantId: string,
  ruleId: string
): Promise<void> {
  const r = await pool.query(
    `UPDATE partner_commission_rules SET status = 'archived', updated_at = now()
     WHERE id = $1 AND partner_tenant_id = $2 AND status = 'active'
     RETURNING id`,
    [ruleId, partnerTenantId]
  );
  if (!r.rows[0]) {
    throw new PartnerAdminError('Regra não encontrada', 'RULE_NOT_FOUND', 404);
  }
}
