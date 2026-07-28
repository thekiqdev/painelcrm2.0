import { describe, expect, it } from 'vitest';
import {
  BILLING2_FLAG_CATALOG,
  BILLING2_FLAG_KEYS,
  billing2PlatformFlagKey,
  getBilling2FeatureFlags,
  getBilling2FeatureFlagsSnapshot,
  isBilling2FlagEnabled,
} from './billingFeatureFlags.js';

describe('billingFeatureFlags resolution (DB → env → default)', () => {
  it('catálogo cobre todas as keys', () => {
    expect(BILLING2_FLAG_CATALOG).toHaveLength(BILLING2_FLAG_KEYS.length);
    const keys = new Set(BILLING2_FLAG_CATALOG.map((f) => f.key));
    for (const k of BILLING2_FLAG_KEYS) {
      expect(keys.has(k)).toBe(true);
    }
  });

  it('defaults destrutivos estão OFF (PRD §18)', async () => {
    const snap = await getBilling2FeatureFlagsSnapshot({}, { dbOverrides: null });
    expect(snap.destructive_defaults_off).toBe(true);
    expect(snap.resolution_order).toEqual(['db', 'env', 'default']);

    const map = await getBilling2FeatureFlags({}, { dbOverrides: null });
    expect(map.card_auto_renew.enabled).toBe(false);
    expect(map.pix_automatic.enabled).toBe(false);
    expect(map.auto_suspend.enabled).toBe(false);
    expect(map.auto_cancel.enabled).toBe(false);
    expect(map.dunning_enabled.enabled).toBe(false);
    expect(map.collection_policy_engine_enabled.enabled).toBe(false);
    expect(map.multi_gateway.enabled).toBe(false);
    expect(map.card_auto_renew.resolvedFrom).toBe('default');
    expect(map.card_auto_renew.platform_key).toBe('billing2.card_auto_renew');
  });

  it('defaults seguros ON via catálogo quando sem DB/env', async () => {
    const map = await getBilling2FeatureFlags({}, { dbOverrides: null });
    expect(map.pix_auto_generate.enabled).toBe(true);
    expect(map.whatsapp_charge_notify.enabled).toBe(true);
    expect(map.email_charge_notify.enabled).toBe(true);
    expect(map.auto_reactivate.enabled).toBe(true);
    expect(map.reconciliation_auto.enabled).toBe(true);
    expect(map.detailed_logs.enabled).toBe(true);
    expect(map.collection_policy_db_read.enabled).toBe(true);
  });

  it('env vence default quando não há DB', async () => {
    const env = {
      BILLING2_FLAG_AUTO_SUSPEND: 'true',
      BILLING2_FLAG_PIX_AUTO_GENERATE: '0',
    } as NodeJS.ProcessEnv;
    const map = await getBilling2FeatureFlags(env, { dbOverrides: null });
    expect(map.auto_suspend.enabled).toBe(true);
    expect(map.auto_suspend.resolvedFrom).toBe('env');
    expect(map.pix_auto_generate.enabled).toBe(false);
    expect(map.pix_auto_generate.resolvedFrom).toBe('env');
    expect(await isBilling2FlagEnabled('card_auto_renew', env, { dbOverrides: null })).toBe(false);
  });

  it('DB Super Admin vence env', async () => {
    const env = {
      BILLING2_FLAG_AUTO_SUSPEND: 'true',
      BILLING2_FLAG_COLLECTION_POLICY_ENGINE_ENABLED: 'true',
    } as NodeJS.ProcessEnv;
    const map = await getBilling2FeatureFlags(env, {
      dbOverrides: {
        auto_suspend: false,
        collection_policy_engine_enabled: false,
        pix_auto_generate: true,
      },
    });
    expect(map.auto_suspend.enabled).toBe(false);
    expect(map.auto_suspend.resolvedFrom).toBe('db');
    expect(map.collection_policy_engine_enabled.enabled).toBe(false);
    expect(map.collection_policy_engine_enabled.resolvedFrom).toBe('db');
    // key ausente no DB → default (sem env)
    expect(map.detailed_logs.resolvedFrom).toBe('default');
  });

  it('key ausente no DB usa env antes do default', async () => {
    const env = { BILLING2_FLAG_DETAILED_LOGS: 'false' } as NodeJS.ProcessEnv;
    const map = await getBilling2FeatureFlags(env, {
      dbOverrides: { auto_suspend: false },
    });
    expect(map.detailed_logs.enabled).toBe(false);
    expect(map.detailed_logs.resolvedFrom).toBe('env');
    expect(map.auto_suspend.resolvedFrom).toBe('db');
  });

  it('billing2PlatformFlagKey formata namespace', () => {
    expect(billing2PlatformFlagKey('dunning_enabled')).toBe('billing2.dunning_enabled');
  });
});
