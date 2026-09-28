/**
 * M5-W Block Sprint 1 — quantos dias após o vencimento o Partner entra em past_due/freeze.
 * Persistido em superadmin_settings.partner_wholesale_block_after_days.
 */

import { pool } from '../utils/db.js';
import { PartnerAdminError } from './partnerErrors.js';
import { logSuperAdminAction } from '../services/auditLogService.js';

export const PARTNER_WHOLESALE_BLOCK_AFTER_DAYS_KEY = 'partner_wholesale_block_after_days';
export const DEFAULT_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS = 3;
export const MIN_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS = 0;
export const MAX_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS = 90;

export type PartnerWholesaleBlockSettings = {
  block_after_days: number;
};

function clampDays(raw: unknown): number {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? parseInt(raw, 10)
        : NaN;
  if (!Number.isFinite(n)) return DEFAULT_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS;
  return Math.min(
    MAX_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS,
    Math.max(MIN_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS, Math.floor(n))
  );
}

function isMissingSettingsTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return code === '42P01' || /relation\s+["']?superadmin_settings["']?\s+does not exist/i.test(msg);
}

export async function getPartnerWholesaleBlockSettings(): Promise<PartnerWholesaleBlockSettings> {
  try {
    const r = await pool.query<{ value: string | null }>(
      `SELECT value FROM superadmin_settings WHERE key = $1 LIMIT 1`,
      [PARTNER_WHOLESALE_BLOCK_AFTER_DAYS_KEY]
    );
    return { block_after_days: clampDays(r.rows[0]?.value) };
  } catch (e: unknown) {
    if (isMissingSettingsTable(e)) {
      return { block_after_days: DEFAULT_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS };
    }
    throw e;
  }
}

export async function getPartnerWholesaleBlockAfterDays(): Promise<number> {
  const s = await getPartnerWholesaleBlockSettings();
  return s.block_after_days;
}

export async function updatePartnerWholesaleBlockSettings(
  input: { block_after_days: number },
  actorUserId?: string | null
): Promise<PartnerWholesaleBlockSettings> {
  const n = Math.floor(Number(input.block_after_days));
  if (
    !Number.isFinite(n) ||
    n < MIN_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS ||
    n > MAX_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS
  ) {
    throw new PartnerAdminError(
      `block_after_days deve ser inteiro entre ${MIN_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS} e ${MAX_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS}`,
      'BLOCK_AFTER_DAYS_INVALID',
      400
    );
  }
  const days = n;

  try {
    await pool.query(
      `INSERT INTO superadmin_settings (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [PARTNER_WHOLESALE_BLOCK_AFTER_DAYS_KEY, String(days)]
    );
  } catch (e: unknown) {
    if (isMissingSettingsTable(e)) {
      throw new PartnerAdminError(
        'Tabela superadmin_settings ausente — rode as migrações',
        'SETTINGS_TABLE_MISSING',
        500
      );
    }
    throw e;
  }

  if (actorUserId) {
    await logSuperAdminAction(
      actorUserId,
      'partner_wholesale.block_settings_updated',
      'superadmin_settings',
      PARTNER_WHOLESALE_BLOCK_AFTER_DAYS_KEY,
      { block_after_days: days }
    );
  }

  return { block_after_days: days };
}

/**
 * True se há cobrança da subscription wholesale vencida há >= block_after_days.
 * Se blockAfterDays não for passado, resolve override do Partner ou global (Block S3).
 */
export async function isPartnerWholesaleBlockEligible(
  subscriptionId: string,
  blockAfterDays?: number
): Promise<boolean> {
  const days =
    blockAfterDays ??
    (await resolveWholesaleBlockAfterDaysForSubscription(subscriptionId)).days;
  const r = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM tenant_billing tb
     WHERE tb.subscription_id = $1
       AND tb.status = ANY($2::text[])
       AND tb.due_date IS NOT NULL
       AND (CURRENT_DATE - tb.due_date::date) >= $3
     LIMIT 1`,
    [
      subscriptionId,
      ['overdue', 'pending', 'waiting_payment', 'processing'],
      days,
    ]
  );
  return (r.rowCount ?? 0) > 0;
}

export type ResolvedWholesaleBlockDays = {
  days: number;
  source: 'override' | 'global';
  partnerTenantId: string | null;
  override_days: number | null;
};

export async function resolveWholesaleBlockAfterDaysForSubscription(
  subscriptionId: string
): Promise<ResolvedWholesaleBlockDays> {
  const globalDays = await getPartnerWholesaleBlockAfterDays();
  try {
    const r = await pool.query<{
      partner_tenant_id: string;
      wholesale_block_after_days: number | null;
    }>(
      `SELECT partner_tenant_id::text, wholesale_block_after_days
       FROM partner_profiles
       WHERE wholesale_subscription_id = $1
       LIMIT 1`,
      [subscriptionId]
    );
    const row = r.rows[0];
    if (!row) {
      return {
        days: globalDays,
        source: 'global',
        partnerTenantId: null,
        override_days: null,
      };
    }
    if (row.wholesale_block_after_days != null) {
      return {
        days: clampDays(row.wholesale_block_after_days),
        source: 'override',
        partnerTenantId: row.partner_tenant_id,
        override_days: clampDays(row.wholesale_block_after_days),
      };
    }
    return {
      days: globalDays,
      source: 'global',
      partnerTenantId: row.partner_tenant_id,
      override_days: null,
    };
  } catch (e: unknown) {
    // Coluna ausente antes da migration 334
    const msg = e instanceof Error ? e.message : String(e);
    if (/wholesale_block_after_days/i.test(msg)) {
      return {
        days: globalDays,
        source: 'global',
        partnerTenantId: null,
        override_days: null,
      };
    }
    throw e;
  }
}

export async function resolveWholesaleBlockAfterDaysForPartner(
  partnerTenantId: string
): Promise<ResolvedWholesaleBlockDays> {
  const globalDays = await getPartnerWholesaleBlockAfterDays();
  try {
    const r = await pool.query<{ wholesale_block_after_days: number | null }>(
      `SELECT wholesale_block_after_days
       FROM partner_profiles
       WHERE partner_tenant_id = $1
       LIMIT 1`,
      [partnerTenantId]
    );
    const override = r.rows[0]?.wholesale_block_after_days ?? null;
    if (override != null) {
      return {
        days: clampDays(override),
        source: 'override',
        partnerTenantId,
        override_days: clampDays(override),
      };
    }
    return {
      days: globalDays,
      source: 'global',
      partnerTenantId,
      override_days: null,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/wholesale_block_after_days/i.test(msg)) {
      return {
        days: globalDays,
        source: 'global',
        partnerTenantId,
        override_days: null,
      };
    }
    throw e;
  }
}
