/**
 * Reader da Collection Policy (Sprint 2).
 * Preferência: DB global ativa → fallback memory_default.
 * Rollback: BILLING2_FLAG_COLLECTION_POLICY_DB_READ=false força memória.
 */
import { getBillingSettings } from '../billingSettingsService.js';
import { isBilling2FlagEnabled } from '../billing2/billingFeatureFlags.js';
import { buildDefaultCollectionPolicy } from './defaults.js';
import {
  getActiveGlobalCollectionPolicyRow,
  policyFromRow,
} from './collectionPolicyRepository.js';
import type { CollectionPolicy } from './types.js';

export type CollectionPolicyReadSource = 'database' | 'memory_default';

export type CollectionPolicyReadResult = {
  policy: CollectionPolicy;
  source: CollectionPolicyReadSource;
  /** Valor legado em superadmin_settings — informativo */
  legacy_auto_suspend_setting: boolean;
  policy_row_id?: string;
  policy_version?: number;
};

async function loadLegacySettings(): Promise<{ grace: number; legacyAutoSuspend: boolean }> {
  let grace = buildDefaultCollectionPolicy().grace_period_days;
  let legacyAutoSuspend = false;
  try {
    const settings = await getBillingSettings();
    grace = settings.grace_period_days;
    legacyAutoSuspend = settings.auto_suspend_enabled;
  } catch {
    /* ignore */
  }
  return { grace, legacyAutoSuspend };
}

/**
 * Lê a policy ativa (DB se migration aplicada e flag db_read ON).
 */
export async function getActiveCollectionPolicy(): Promise<CollectionPolicyReadResult> {
  const { grace, legacyAutoSuspend } = await loadLegacySettings();

  const allowDb = await isBilling2FlagEnabled('collection_policy_db_read');
  if (allowDb) {
    try {
      const row = await getActiveGlobalCollectionPolicyRow();
      if (row) {
        const policy = policyFromRow(row);
        // Grace do settings legado pode atualizar o campo informativo se policy ainda default-ish
        // Não sobrescreve DB: policy persistida é SSOT após S2.
        return {
          policy,
          source: 'database',
          legacy_auto_suspend_setting: legacyAutoSuspend,
          policy_row_id: row.id,
          policy_version: row.version,
        };
      }
    } catch (e: unknown) {
      console.warn(
        '[collectionPolicy] falha ao ler DB; usando memory_default',
        e instanceof Error ? e.message : e
      );
    }
  }

  return {
    policy: buildDefaultCollectionPolicy({ grace_period_days: grace }),
    source: 'memory_default',
    legacy_auto_suspend_setting: legacyAutoSuspend,
  };
}
