/**
 * Billing Engine V2 — gerador de plan_number global (BP-00000001).
 */
import type { Pool, PoolClient } from 'pg';
import { pool } from '../utils/db.js';

const PREFIX = 'BP-';
const PAD_LENGTH = 8;

export function formatBillingPlanNumber(sequenceValue: number): string {
  if (!Number.isFinite(sequenceValue) || sequenceValue < 1) {
    throw new Error('billing_plan_number_invalid_sequence');
  }
  return `${PREFIX}${String(sequenceValue).padStart(PAD_LENGTH, '0')}`;
}

export function parseBillingPlanNumber(planNumber: string): number | null {
  const m = /^BP-(\d{8})$/.exec(planNumber.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function isValidBillingPlanNumber(planNumber: string): boolean {
  return parseBillingPlanNumber(planNumber) != null;
}

type Db = Pick<Pool, 'query'> | PoolClient;

/** Aloca próximo número via sequence PostgreSQL — nunca reutiliza. */
export async function allocateBillingPlanNumber(db: Db = pool): Promise<string> {
  const r = await db.query<{ n: string }>(
    `SELECT nextval('billing_plan_number_seq')::text AS n`
  );
  const seq = parseInt(r.rows[0]?.n ?? '0', 10);
  return formatBillingPlanNumber(seq);
}

export class BillingPlanNumberGenerator {
  constructor(private readonly db: Db = pool) {}

  format(sequenceValue: number): string {
    return formatBillingPlanNumber(sequenceValue);
  }

  parse(planNumber: string): number | null {
    return parseBillingPlanNumber(planNumber);
  }

  validate(planNumber: string): boolean {
    return isValidBillingPlanNumber(planNumber);
  }

  async allocateNext(): Promise<string> {
    return allocateBillingPlanNumber(this.db);
  }
}

export const billingPlanNumberGenerator = new BillingPlanNumberGenerator();
