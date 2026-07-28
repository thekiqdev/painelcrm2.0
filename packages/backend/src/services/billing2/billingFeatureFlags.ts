/**
 * Billing 2.0 — Feature Flags.
 *
 * Precedência oficial (rollout / operação):
 *   1. Super Admin — `platform_feature_flags` (`billing2.<key>`, campo `default_enabled`)
 *   2. `.env` — `BILLING2_FLAG_<KEY>` (bootstrap / contingência se a flag não existir no DB)
 *   3. Default interno — `BILLING2_FLAG_CATALOG[].defaultEnabled` (PRD §18)
 *
 * A .env NÃO sobrescreve uma flag já persistida no Super Admin.
 * Rollback operacional: alterar a flag no Super Admin → Avançado → Feature Flags (namespace billing2).
 *
 * @see docs/architecture/commercial/PRD_BILLING_2_SUPERADMIN.md §18
 * @see docs/architecture/commercial/IMPLEMENTATION_PLAN_BILLING_2.md
 */

import { loadAllPlatformFeatureFlags } from '../../platform/featureFlagRepository.js';

export const BILLING2_FLAG_KEYS = [
  'card_auto_renew',
  'pix_automatic',
  'pix_auto_generate',
  'whatsapp_charge_notify',
  'email_charge_notify',
  'auto_suspend',
  'auto_cancel',
  'auto_reactivate',
  'reconciliation_auto',
  'detailed_logs',
  'collection_policy_engine_enabled',
  'past_due_writer_enabled',
  'dashboard_mrr_contracted',
  'reconciliation_l2_enabled',
  'dunning_enabled',
  'collection_policy_db_read',
  'multi_gateway',
] as const;

export type Billing2FlagKey = (typeof BILLING2_FLAG_KEYS)[number];

export type Billing2FlagMeta = {
  key: Billing2FlagKey;
  label: string;
  defaultEnabled: boolean;
  destructive: boolean;
  introducedInSprint: number;
  source: 'prd_18' | 'implementation_plan';
};

/** Catálogo imutável — defaults PRD / plano (camada 3). */
export const BILLING2_FLAG_CATALOG: readonly Billing2FlagMeta[] = [
  {
    key: 'card_auto_renew',
    label: 'Renovação automática por cartão',
    defaultEnabled: false,
    destructive: true,
    introducedInSprint: 9,
    source: 'prd_18',
  },
  {
    key: 'pix_automatic',
    label: 'PIX Automático',
    defaultEnabled: false,
    destructive: true,
    introducedInSprint: 10,
    source: 'prd_18',
  },
  {
    key: 'pix_auto_generate',
    label: 'Gerar PIX automaticamente',
    defaultEnabled: true,
    destructive: false,
    introducedInSprint: 3,
    source: 'prd_18',
  },
  {
    key: 'whatsapp_charge_notify',
    label: 'WhatsApp cobrança',
    defaultEnabled: true,
    destructive: false,
    introducedInSprint: 3,
    source: 'prd_18',
  },
  {
    key: 'email_charge_notify',
    label: 'Email cobrança',
    defaultEnabled: true,
    destructive: false,
    introducedInSprint: 3,
    source: 'prd_18',
  },
  {
    key: 'auto_suspend',
    label: 'Suspensão automática',
    defaultEnabled: false,
    destructive: true,
    introducedInSprint: 8,
    source: 'prd_18',
  },
  {
    key: 'auto_cancel',
    label: 'Cancelamento automático',
    defaultEnabled: false,
    destructive: true,
    introducedInSprint: 8,
    source: 'prd_18',
  },
  {
    key: 'auto_reactivate',
    label: 'Reativação automática',
    defaultEnabled: true,
    destructive: false,
    introducedInSprint: 3,
    source: 'prd_18',
  },
  {
    key: 'reconciliation_auto',
    label: 'Reconciliação automática',
    defaultEnabled: true,
    destructive: false,
    introducedInSprint: 8,
    source: 'prd_18',
  },
  {
    key: 'detailed_logs',
    label: 'Logs detalhados',
    defaultEnabled: true,
    destructive: false,
    introducedInSprint: 7,
    source: 'prd_18',
  },
  {
    key: 'collection_policy_engine_enabled',
    label: 'Collection Policy Engine',
    defaultEnabled: false,
    destructive: false,
    introducedInSprint: 3,
    source: 'implementation_plan',
  },
  {
    key: 'past_due_writer_enabled',
    label: 'Writer past_due',
    defaultEnabled: false,
    destructive: false,
    introducedInSprint: 5,
    source: 'implementation_plan',
  },
  {
    key: 'dashboard_mrr_contracted',
    label: 'Dashboard MRR contratado',
    defaultEnabled: false,
    destructive: false,
    introducedInSprint: 6,
    source: 'implementation_plan',
  },
  {
    key: 'reconciliation_l2_enabled',
    label: 'Reconciliação L2 (getPayment)',
    defaultEnabled: false,
    destructive: false,
    introducedInSprint: 8,
    source: 'implementation_plan',
  },
  {
    key: 'dunning_enabled',
    label: 'Dunning / Recovery engine',
    defaultEnabled: false,
    destructive: true,
    introducedInSprint: 8,
    source: 'implementation_plan',
  },
  {
    key: 'collection_policy_db_read',
    label: 'Ler Collection Policy do banco',
    defaultEnabled: true,
    destructive: false,
    introducedInSprint: 2,
    source: 'implementation_plan',
  },
  {
    key: 'multi_gateway',
    label: 'Multi Gateway SaaS (2º adapter)',
    defaultEnabled: false,
    destructive: true,
    introducedInSprint: 11,
    source: 'implementation_plan',
  },
] as const;

export type Billing2FlagResolvedFrom = 'db' | 'env' | 'default';

export type Billing2FlagRuntime = Billing2FlagMeta & {
  enabled: boolean;
  resolvedFrom: Billing2FlagResolvedFrom;
  /** Chave em platform_feature_flags */
  platform_key: string;
};

export function billing2PlatformFlagKey(flagKey: Billing2FlagKey): string {
  return `billing2.${flagKey}`;
}

function envOverrideKey(flagKey: Billing2FlagKey): string {
  return `BILLING2_FLAG_${flagKey.toUpperCase()}`;
}

function parseEnvBool(raw: string | undefined): boolean | null {
  if (raw == null || raw.trim() === '') return null;
  const v = raw.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return null;
}

export type GetBilling2FeatureFlagsOptions = {
  /**
   * Overrides de DB para testes, ou `null` para forçar skip do banco (só env → default).
   * `undefined` = carregar `platform_feature_flags`.
   */
  dbOverrides?: Partial<Record<Billing2FlagKey, boolean>> | null;
};

async function loadDbOverridesFromPlatform(): Promise<Partial<Record<Billing2FlagKey, boolean>>> {
  const out: Partial<Record<Billing2FlagKey, boolean>> = {};
  try {
    const rows = await loadAllPlatformFeatureFlags();
    for (const meta of BILLING2_FLAG_CATALOG) {
      const platformKey = billing2PlatformFlagKey(meta.key);
      const row = rows.find((r) => r.key === platformKey);
      if (row) {
        out[meta.key] = row.default_enabled === true;
      }
    }
  } catch (e: unknown) {
    console.warn(
      '[billing2.flags] falha ao ler platform_feature_flags; fallback env/default',
      e instanceof Error ? e.message : e
    );
  }
  return out;
}

/**
 * Resolve o mapa completo: Super Admin (DB) → env → default.
 */
export async function getBilling2FeatureFlags(
  env: NodeJS.ProcessEnv = process.env,
  opts?: GetBilling2FeatureFlagsOptions
): Promise<Record<Billing2FlagKey, Billing2FlagRuntime>> {
  const dbOverrides =
    opts && 'dbOverrides' in opts
      ? opts.dbOverrides === null
        ? {}
        : (opts.dbOverrides ?? {})
      : await loadDbOverridesFromPlatform();

  const out = {} as Record<Billing2FlagKey, Billing2FlagRuntime>;
  for (const meta of BILLING2_FLAG_CATALOG) {
    const platform_key = billing2PlatformFlagKey(meta.key);
    let enabled = meta.defaultEnabled;
    let resolvedFrom: Billing2FlagResolvedFrom = 'default';

    if (Object.prototype.hasOwnProperty.call(dbOverrides, meta.key)) {
      enabled = dbOverrides[meta.key] === true;
      resolvedFrom = 'db';
    } else {
      const parsed = parseEnvBool(env[envOverrideKey(meta.key)]);
      if (parsed != null) {
        enabled = parsed;
        resolvedFrom = 'env';
      }
    }

    out[meta.key] = {
      ...meta,
      enabled,
      resolvedFrom,
      platform_key,
    };
  }
  return out;
}

export async function isBilling2FlagEnabled(
  key: Billing2FlagKey,
  env: NodeJS.ProcessEnv = process.env,
  opts?: GetBilling2FeatureFlagsOptions
): Promise<boolean> {
  const map = await getBilling2FeatureFlags(env, opts);
  return map[key].enabled;
}

/** Snapshot serializável para API Super Admin. */
export async function getBilling2FeatureFlagsSnapshot(
  env: NodeJS.ProcessEnv = process.env,
  opts?: GetBilling2FeatureFlagsOptions
): Promise<{
  resolution_order: ['db', 'env', 'default'];
  consumed_by_billing_runtime: boolean;
  flags: Billing2FlagRuntime[];
  destructive_defaults_off: boolean;
}> {
  const map = await getBilling2FeatureFlags(env, opts);
  const flags = BILLING2_FLAG_KEYS.map((k) => map[k]);
  const destructive_defaults_off = flags
    .filter((f) => f.destructive)
    .every((f) => f.defaultEnabled === false);
  return {
    resolution_order: ['db', 'env', 'default'],
    // Flags já são consultadas por reader/hook; engine ainda noop se engine OFF
    consumed_by_billing_runtime: true,
    flags,
    destructive_defaults_off,
  };
}
