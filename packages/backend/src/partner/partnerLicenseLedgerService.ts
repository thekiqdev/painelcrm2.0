/**
 * M5-W Sprint 1 — ledger de seats do Partner.
 */

import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { PartnerAdminError } from './partnerErrors.js';

export type PartnerLicenseLedgerReason =
  | 'grant'
  | 'plan_activate'
  | 'plan_renewal'
  | 'topup_purchase'
  | 'topup_downgrade'
  | 'clawback'
  | 'admin_adjust'
  | 'legacy_manual';

export type ApplyPartnerLicenseDeltaInput = {
  partnerTenantId: string;
  deltaSeats: number;
  reason: PartnerLicenseLedgerReason;
  actorUserId?: string | null;
  billingId?: string | null;
  externalRef?: string | null;
  wholesalePlanId?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
  /** Cliente de transação opcional (createPartner / patch). */
  client?: PoolClient;
};

export type PartnerLicenseLedgerRow = {
  id: string;
  partner_tenant_id: string;
  delta_seats: number;
  balance_after: number;
  reason: PartnerLicenseLedgerReason;
  billing_id: string | null;
  external_ref: string | null;
  wholesale_plan_id: string | null;
  actor_user_id: string | null;
  note: string | null;
  created_at: string;
};

type Db = PoolClient | typeof pool;

/**
 * Aplica delta em purchased_seats e grava linha no ledger (atômico no client/pool).
 */
export async function applyPartnerLicenseDelta(
  input: ApplyPartnerLicenseDeltaInput
): Promise<{ balanceAfter: number; ledgerId: string }> {
  const delta = Math.trunc(input.deltaSeats);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new PartnerAdminError('delta_seats deve ser inteiro ≠ 0', 'LEDGER_DELTA_INVALID');
  }

  const db: Db = input.client ?? pool;
  const ownTx = !input.client;

  try {
    if (ownTx) await (db as typeof pool).query('BEGIN');

    const poolRow = await db.query<{
      purchased_seats: number;
      used_seats_cache: number;
      included_seats: number | null;
      extra_seats: number | null;
    }>(
      `SELECT purchased_seats, used_seats_cache,
              COALESCE(included_seats, 0) AS included_seats,
              COALESCE(extra_seats, 0) AS extra_seats
       FROM partner_license_pool
       WHERE partner_tenant_id = $1
       FOR UPDATE`,
      [input.partnerTenantId]
    );
    if (poolRow.rows.length === 0) {
      throw new PartnerAdminError('Pool de licenças não encontrado', 'POOL_NOT_FOUND', 404);
    }

    const current = poolRow.rows[0].purchased_seats;
    const used = poolRow.rows[0].used_seats_cache;
    const balanceAfter = current + delta;
    if (balanceAfter < 0) {
      throw new PartnerAdminError('Saldo de seats não pode ficar negativo', 'SEATS_NEGATIVE');
    }
    if (balanceAfter < used) {
      throw new PartnerAdminError(
        'purchased_seats não pode ser menor que used_seats',
        'SEATS_BELOW_USED'
      );
    }

    const includedBefore = Number(poolRow.rows[0].included_seats ?? 0);
    const extraBefore = Number(poolRow.rows[0].extra_seats ?? 0);
    const breakdown = nextSeatBreakdown({
      included: includedBefore,
      extra: extraBefore,
      delta,
      reason: input.reason,
      wholesalePlanId: input.wholesalePlanId ?? null,
    });
    if (input.reason === 'topup_downgrade' && breakdown.included < includedBefore) {
      throw new PartnerAdminError(
        'Downgrade só pode reduzir licenças avulsas, não o pacote do plano',
        'DOWNGRADE_INCLUDED_FORBIDDEN',
        409
      );
    }

    await db.query(
      `UPDATE partner_license_pool
       SET purchased_seats = $1,
           included_seats = $2,
           extra_seats = $3,
           updated_at = now()
       WHERE partner_tenant_id = $4`,
      [balanceAfter, breakdown.included, breakdown.extra, input.partnerTenantId]
    );

    const led = await db.query<{ id: string }>(
      `INSERT INTO partner_license_ledger (
         partner_tenant_id, delta_seats, balance_after, reason,
         billing_id, external_ref, wholesale_plan_id, actor_user_id, note, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING id`,
      [
        input.partnerTenantId,
        delta,
        balanceAfter,
        input.reason,
        input.billingId ?? null,
        input.externalRef ?? null,
        input.wholesalePlanId ?? null,
        input.actorUserId ?? null,
        input.note ?? null,
        JSON.stringify(input.metadata ?? {}),
      ]
    );

    // min_seats no program_config: não reduzir abaixo do novo saldo (alinha com patch legado)
    await db.query(
      `UPDATE partner_profiles
       SET program_config_json =
             jsonb_set(
               COALESCE(program_config_json, '{}'::jsonb),
               '{min_seats}',
               to_jsonb(
                 GREATEST(
                   COALESCE((program_config_json->>'min_seats')::int, 0),
                   $1::int
                 )
               )
             ),
           updated_at = now()
       WHERE partner_tenant_id = $2`,
      [balanceAfter, input.partnerTenantId]
    );

    if (ownTx) await (db as typeof pool).query('COMMIT');
    return { balanceAfter, ledgerId: led.rows[0].id };
  } catch (err) {
    if (ownTx) {
      try {
        await (db as typeof pool).query('ROLLBACK');
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
}

function seatBucket(
  reason: PartnerLicenseLedgerReason,
  wholesalePlanId: string | null
): 'included' | 'extra' {
  if (reason === 'topup_purchase' || reason === 'topup_downgrade') return 'extra';
  if ((reason === 'plan_activate' || reason === 'plan_renewal' || reason === 'grant') && wholesalePlanId) {
    return 'included';
  }
  return 'extra';
}

/** Ajusta included/extra após delta. Redução come extra primeiro (base do downgrade). */
export function nextSeatBreakdown(input: {
  included: number;
  extra: number;
  delta: number;
  reason: PartnerLicenseLedgerReason;
  wholesalePlanId: string | null;
}): { included: number; extra: number } {
  let included = Math.max(0, Math.floor(input.included));
  let extra = Math.max(0, Math.floor(input.extra));
  if (input.delta > 0) {
    if (seatBucket(input.reason, input.wholesalePlanId) === 'included') {
      included += input.delta;
    } else {
      extra += input.delta;
    }
  } else {
    let remain = -input.delta;
    const fromExtra = Math.min(extra, remain);
    extra -= fromExtra;
    remain -= fromExtra;
    included = Math.max(0, included - remain);
  }
  return { included, extra };
}

export async function listPartnerLicenseLedger(
  partnerTenantId: string,
  limit = 50
): Promise<PartnerLicenseLedgerRow[]> {
  const lim = Math.min(200, Math.max(1, Math.floor(limit)));
  const r = await pool.query<PartnerLicenseLedgerRow>(
    `SELECT id, partner_tenant_id, delta_seats, balance_after, reason,
            billing_id::text, external_ref, wholesale_plan_id::text,
            actor_user_id::text, note, created_at::text
     FROM partner_license_ledger
     WHERE partner_tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [partnerTenantId, lim]
  );
  return r.rows;
}
