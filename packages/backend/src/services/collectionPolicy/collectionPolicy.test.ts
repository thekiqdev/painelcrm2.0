import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildDefaultCollectionPolicy,
  DEFAULT_COLLECTION_POLICY,
  deserializeCollectionPolicy,
  interpretCollectionPolicy,
  serializeCollectionPolicy,
  assertValidCollectionPolicyShape,
  COLLECTION_POLICY_SCHEMA_VERSION,
  buildCollectionActionIdempotencyKey,
} from './index.js';
import { runCollectionPolicyExtensionPoint } from './hook.js';
import type { CollectionEvent, CollectionPolicy } from './types.js';

describe('collectionPolicy defaults (Sprint 1)', () => {
  it('alinha defaults ao PRD §18 / fluxo atual', () => {
    const p = DEFAULT_COLLECTION_POLICY;
    expect(p.schema_version).toBe(COLLECTION_POLICY_SCHEMA_VERSION);
    expect(p.renew_card_auto).toBe(false);
    expect(p.generate_pix_auto).toBe(true);
    expect(p.pix_automatic_enabled).toBe(false);
    expect(p.auto_suspend_enabled).toBe(false);
    expect(p.auto_cancel_enabled).toBe(false);
    expect(p.reactivate_on_paid).toBe(true);
    expect(p.notify_whatsapp).toBe(true);
    expect(p.notify_email).toBe(true);
    expect(p.max_attempts).toBe(3);
    expect(p.attempt_interval_days).toBe(2);
    expect(p.actions_after_fail).toEqual(['create_pix', 'notify_whatsapp', 'notify_email']);
  });

  it('aceita grace_period override no builder', () => {
    expect(buildDefaultCollectionPolicy({ grace_period_days: 7 }).grace_period_days).toBe(7);
  });
});

describe('collectionPolicy serialize/deserialize', () => {
  it('round-trip estável', () => {
    const original = buildDefaultCollectionPolicy({ grace_period_days: 5 });
    const json = serializeCollectionPolicy(original);
    const again = deserializeCollectionPolicy(json);
    expect(again).toEqual(original);
    expect(() => assertValidCollectionPolicyShape(again)).not.toThrow();
  });

  it('completa campos faltantes com defaults', () => {
    const partial = deserializeCollectionPolicy(JSON.stringify({ generate_pix_auto: false }));
    expect(partial.generate_pix_auto).toBe(false);
    expect(partial.renew_card_auto).toBe(false);
    expect(partial.max_attempts).toBe(3);
  });

  it('rejeita JSON inválido', () => {
    expect(() => deserializeCollectionPolicy('[]')).toThrow(/objeto JSON/);
  });
});

describe('interpretCollectionPolicy (Sprint 3)', () => {
  const baseEvent: CollectionEvent = {
    type: 'renewal.charge_created',
    occurred_at: '2026-07-27T12:00:00.000Z',
    billing_id: 'b1',
    subscription_id: 's1',
    tenant_id: 't1',
    attempt: 1,
    metadata: { period_start: '2026-07-01' },
  };

  it('retorna [] com engine desligado', () => {
    expect(
      interpretCollectionPolicy(baseEvent, DEFAULT_COLLECTION_POLICY, { engine_enabled: false })
    ).toEqual([]);
  });

  it('renewal default: pix + whatsapp + email + audit (sem cartão)', () => {
    const actions = interpretCollectionPolicy(baseEvent, DEFAULT_COLLECTION_POLICY, {
      engine_enabled: true,
    });
    const types = actions.map((a) => a.type);
    expect(types).toEqual(['create_pix', 'notify_whatsapp', 'notify_email', 'write_audit_log']);
    expect(actions.every((a) => a.idempotency_key)).toBe(true);
    expect(types.includes('charge_card')).toBe(false);
  });

  it('policy só WhatsApp+Email não emite cartão nem pix', () => {
    const policy: CollectionPolicy = {
      ...DEFAULT_COLLECTION_POLICY,
      renew_card_auto: false,
      generate_pix_auto: false,
      pix_automatic_enabled: false,
      notify_whatsapp: true,
      notify_email: true,
    };
    const types = interpretCollectionPolicy(baseEvent, policy, { engine_enabled: true }).map(
      (a) => a.type
    );
    expect(types).toEqual(['notify_whatsapp', 'notify_email', 'write_audit_log']);
    expect(types.includes('charge_card')).toBe(false);
    expect(types.includes('create_pix')).toBe(false);
  });

  it('payment.overdue com suspend OFF não emite suspend', () => {
    const event: CollectionEvent = { ...baseEvent, type: 'payment.overdue' };
    const types = interpretCollectionPolicy(event, DEFAULT_COLLECTION_POLICY, {
      engine_enabled: true,
    }).map((a) => a.type);
    expect(types.includes('suspend_tenant')).toBe(false);
    expect(types.includes('cancel_subscription')).toBe(false);
    expect(types).toContain('notify_whatsapp');
    expect(types).toContain('mark_subscription_past_due');
  });

  it('payment.paid emite reactivate quando policy ON', () => {
    const event: CollectionEvent = { ...baseEvent, type: 'payment.paid' };
    const types = interpretCollectionPolicy(event, DEFAULT_COLLECTION_POLICY, {
      engine_enabled: true,
    }).map((a) => a.type);
    expect(types).toEqual(['reactivate_tenant', 'write_audit_log']);
  });

  it('payment.failed respeita actions_after_fail sem cartão se renew_card_auto OFF', () => {
    const event: CollectionEvent = { ...baseEvent, type: 'payment.failed' };
    const types = interpretCollectionPolicy(event, DEFAULT_COLLECTION_POLICY, {
      engine_enabled: true,
    }).map((a) => a.type);
    expect(types.includes('charge_card')).toBe(false);
    expect(types).toContain('create_pix');
    expect(types).toContain('notify_whatsapp');
  });

  it('idempotency key estável por entity/action/cycle/attempt', () => {
    const k1 = buildCollectionActionIdempotencyKey({
      entityType: 'tenant_billing',
      entityId: 'b1',
      action: 'notify_whatsapp',
      cycleKey: '2026-07-01',
      attempt: 1,
    });
    const k2 = buildCollectionActionIdempotencyKey({
      entityType: 'tenant_billing',
      entityId: 'b1',
      action: 'notify_whatsapp',
      cycleKey: '2026-07-01',
      attempt: 1,
    });
    expect(k1).toBe(k2);
    expect(k1).toBe('tenant_billing:b1:notify_whatsapp:2026-07-01:1');
  });
});

describe('runCollectionPolicyExtensionPoint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skip quando engine flag OFF (default)', async () => {
    vi.spyOn(await import('../billing2/billingFeatureFlags.js'), 'isBilling2FlagEnabled').mockImplementation(
      async (key) => (key === 'collection_policy_engine_enabled' ? false : true)
    );
    const r = await runCollectionPolicyExtensionPoint({
      type: 'payment.paid',
      occurred_at: new Date().toISOString(),
      billing_id: 'x',
    });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('engine_disabled');
    expect(r.actions).toEqual([]);
  });

  it('executa actions quando engine flag ON (mocks de side-effects)', async () => {
    vi.spyOn(await import('../billing2/billingFeatureFlags.js'), 'isBilling2FlagEnabled').mockResolvedValue(
      true
    );
    vi.spyOn(await import('../billingSettingsService.js'), 'getBillingSettings').mockResolvedValue({
      grace_period_days: 3,
      auto_suspend_enabled: false,
    });
    vi.spyOn(
      await import('./collectionPolicyRepository.js'),
      'getActiveGlobalCollectionPolicyRow'
    ).mockResolvedValue(null);

    const ensure = vi
      .spyOn(
        await import('../platformNotifications/platformBillingChargeNotification.js'),
        'ensureBillingChargeNotificationExists'
      )
      .mockResolvedValue({
        republished: false,
        reason: 'already_complete',
        channels: { whatsapp: true, email: true },
      });
    vi.spyOn(await import('../invoiceService.js'), 'getInvoiceById').mockResolvedValue({
      id: 'y',
      tenant_id: 't1',
      subscription_id: 's1',
      status: 'pending',
      amount_cents: 1000,
      gateway_reference_id: 'pay_1',
      due_date: '2026-07-01',
      period_start: '2026-07-01',
      idempotency_key: 'k',
      invoice_number: 'INV-1',
    } as never);
    vi.spyOn(await import('./idempotency.js'), 'wasCollectionActionExecuted').mockResolvedValue(false);
    vi.spyOn(await import('./idempotency.js'), 'markCollectionActionExecuted').mockResolvedValue();
    vi.spyOn(await import('./billingAuditEventWriter.js'), 'writeBillingAuditEvent').mockResolvedValue({
      id: 'a1',
    });

    const r = await runCollectionPolicyExtensionPoint({
      type: 'renewal.charge_created',
      occurred_at: new Date().toISOString(),
      billing_id: 'y',
      subscription_id: 's1',
      tenant_id: 't1',
      metadata: { period_start: '2026-07-01' },
      attempt: 1,
    });

    expect(r.skipped).toBe(false);
    expect(r.reason).toBe('executed');
    expect(r.actions.map((a) => a.type)).toEqual([
      'create_pix',
      'notify_whatsapp',
      'notify_email',
      'write_audit_log',
    ]);
    expect(ensure).toHaveBeenCalled();
    // create_pix skipped because gateway_reference already exists
    expect(r.results?.find((x) => x.type === 'create_pix')?.status).toBe('skipped');
  });

  it('suspend não roda com flag auto_suspend OFF mesmo se policy pedir', async () => {
    vi.spyOn(await import('../billing2/billingFeatureFlags.js'), 'isBilling2FlagEnabled').mockImplementation(
      async (key) => {
        if (key === 'collection_policy_engine_enabled') return true;
        if (key === 'auto_suspend') return false;
        if (key === 'past_due_writer_enabled') return false;
        return true;
      }
    );
    vi.spyOn(await import('../billingSettingsService.js'), 'getBillingSettings').mockResolvedValue({
      grace_period_days: 3,
      auto_suspend_enabled: true,
    });
    vi.spyOn(
      await import('./collectionPolicyRepository.js'),
      'getActiveGlobalCollectionPolicyRow'
    ).mockResolvedValue(null);

    // Force policy with suspend ON via mocking getActiveCollectionPolicy path:
    // reader uses buildDefault when row null — default suspend OFF.
    // Spy interpret by using a custom policy through reader mock:
    vi.spyOn(await import('./reader.js'), 'getActiveCollectionPolicy').mockResolvedValue({
      policy: { ...DEFAULT_COLLECTION_POLICY, auto_suspend_enabled: true },
      source: 'memory_default',
      legacy_auto_suspend_setting: false,
    });

    vi.spyOn(await import('./idempotency.js'), 'wasCollectionActionExecuted').mockResolvedValue(false);
    vi.spyOn(await import('./idempotency.js'), 'markCollectionActionExecuted').mockResolvedValue();
    vi.spyOn(await import('./billingAuditEventWriter.js'), 'writeBillingAuditEvent').mockResolvedValue({
      id: 'a1',
    });
    vi.spyOn(
      await import('../platformNotifications/platformBusinessNotifications.js'),
      'publishPlatformBillingChargeOverdue'
    ).mockResolvedValue();
    vi.spyOn(await import('../invoiceService.js'), 'getInvoiceById').mockResolvedValue({
      id: 'ov1',
      tenant_id: 't1',
      subscription_id: 's1',
      status: 'overdue',
    } as never);

    const poolMod = await import('../../utils/db.js');
    const querySpy = vi.spyOn(poolMod.pool, 'query').mockResolvedValue({ rows: [], rowCount: 0 } as never);

    const r = await runCollectionPolicyExtensionPoint({
      type: 'payment.overdue',
      occurred_at: new Date().toISOString(),
      billing_id: 'ov1',
      tenant_id: 't1',
      subscription_id: 's1',
      attempt: 1,
    });

    expect(r.actions.map((a) => a.type)).toContain('suspend_tenant');
    const suspend = r.results?.find((x) => x.type === 'suspend_tenant');
    expect(suspend?.status).toBe('skipped');
    expect(suspend?.detail).toBe('flag_auto_suspend_off');
    // UPDATE tenants suspend não deve ter sido chamado com payment_overdue
    const suspendCalls = querySpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes("suspension_reason = 'payment_overdue'")
    );
    expect(suspendCalls).toHaveLength(0);
  });
});
