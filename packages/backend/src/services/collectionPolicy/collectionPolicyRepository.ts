/**
 * Persistência Collection Policy (Sprint 2).
 */
import { pool } from '../../utils/db.js';
import {
  assertValidCollectionPolicyShape,
  deserializeCollectionPolicy,
} from './serialize.js';
import { buildDefaultCollectionPolicy } from './defaults.js';
import type { CollectionPolicy } from './types.js';

export type BillingCollectionPolicyRow = {
  id: string;
  scope: string;
  name: string;
  policy_json: unknown;
  version: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  updated_by: string | null;
};

function isMissingRelation(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return code === '42P01' || /billing_collection_policy/i.test(msg);
}

function isUniqueViolation(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  return code === '23505';
}

export async function getActiveGlobalCollectionPolicyRow(): Promise<BillingCollectionPolicyRow | null> {
  try {
    const r = await pool.query<BillingCollectionPolicyRow>(
      `SELECT id, scope, name, policy_json, version, is_active, created_at, updated_at, updated_by
       FROM billing_collection_policy
       WHERE scope = 'global' AND is_active = true
       ORDER BY updated_at DESC
       LIMIT 1`
    );
    return r.rows[0] ?? null;
  } catch (e: unknown) {
    if (isMissingRelation(e)) return null;
    throw e;
  }
}

export function policyFromRow(row: BillingCollectionPolicyRow): CollectionPolicy {
  return deserializeCollectionPolicy(row.policy_json);
}

/** Garante seed global com defaults S1 se não houver linha ativa. */
export async function ensureGlobalCollectionPolicySeeded(
  updatedBy = 'system:seed'
): Promise<BillingCollectionPolicyRow> {
  const existing = await getActiveGlobalCollectionPolicyRow();
  if (existing) return existing;

  const policy = buildDefaultCollectionPolicy();
  try {
    const r = await pool.query<BillingCollectionPolicyRow>(
      `INSERT INTO billing_collection_policy (scope, name, policy_json, version, is_active, updated_by)
       VALUES ('global', 'default', $1::jsonb, 1, true, $2)
       RETURNING id, scope, name, policy_json, version, is_active, created_at, updated_at, updated_by`,
      [JSON.stringify(policy), updatedBy]
    );
    if (r.rows[0]) return r.rows[0];
  } catch (e: unknown) {
    if (isMissingRelation(e)) {
      throw new Error('Tabela billing_collection_policy ausente. Rode migration 298.');
    }
    if (isUniqueViolation(e)) {
      const again = await getActiveGlobalCollectionPolicyRow();
      if (again) return again;
    }
    throw e;
  }

  const again = await getActiveGlobalCollectionPolicyRow();
  if (again) return again;
  throw new Error('Não foi possível seedar billing_collection_policy');
}

export async function updateActiveGlobalCollectionPolicy(input: {
  policy: CollectionPolicy;
  updatedBy: string;
}): Promise<BillingCollectionPolicyRow> {
  assertValidCollectionPolicyShape(input.policy);
  const current = await ensureGlobalCollectionPolicySeeded(input.updatedBy);
  const r = await pool.query<BillingCollectionPolicyRow>(
    `UPDATE billing_collection_policy
     SET policy_json = $1::jsonb,
         version = version + 1,
         updated_at = now(),
         updated_by = $2
     WHERE id = $3
     RETURNING id, scope, name, policy_json, version, is_active, created_at, updated_at, updated_by`,
    [JSON.stringify(input.policy), input.updatedBy, current.id]
  );
  if (!r.rows[0]) throw new Error('Falha ao atualizar billing_collection_policy');
  return r.rows[0];
}
