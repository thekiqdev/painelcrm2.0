/**
 * Serialização estável da Collection Policy (Sprint 1).
 * Garante round-trip JSON sem perder campos obrigatórios.
 */
import { COLLECTION_POLICY_SCHEMA_VERSION, type CollectionFailAction, type CollectionPolicy } from './types.js';
import { buildDefaultCollectionPolicy } from './defaults.js';

const FAIL_ACTIONS = new Set<CollectionFailAction>([
  'create_pix',
  'notify_whatsapp',
  'notify_email',
  'charge_card',
  'create_pix_automatic_instruction',
]);

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function asFailActions(v: unknown, fallback: CollectionFailAction[]): CollectionFailAction[] {
  if (!Array.isArray(v)) return [...fallback];
  const out: CollectionFailAction[] = [];
  for (const x of v) {
    if (typeof x === 'string' && FAIL_ACTIONS.has(x as CollectionFailAction)) {
      out.push(x as CollectionFailAction);
    }
  }
  return out.length > 0 ? out : [...fallback];
}

/** Serializa policy para JSON string (ordem de chaves = Object.keys da policy). */
export function serializeCollectionPolicy(policy: CollectionPolicy): string {
  return JSON.stringify(policy);
}

/**
 * Deserializa e valida campos; completa com defaults se faltar algo.
 * Rejeita payload não-objeto com throw.
 */
export function deserializeCollectionPolicy(raw: string | unknown): CollectionPolicy {
  const base = buildDefaultCollectionPolicy();
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    parsed = JSON.parse(raw) as unknown;
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('CollectionPolicy inválida: esperado objeto JSON');
  }
  const o = parsed as Record<string, unknown>;
  const schema =
    o.schema_version === COLLECTION_POLICY_SCHEMA_VERSION
      ? COLLECTION_POLICY_SCHEMA_VERSION
      : COLLECTION_POLICY_SCHEMA_VERSION;

  return {
    schema_version: schema,
    renew_card_auto: asBool(o.renew_card_auto, base.renew_card_auto),
    generate_pix_auto: asBool(o.generate_pix_auto, base.generate_pix_auto),
    pix_automatic_enabled: asBool(o.pix_automatic_enabled, base.pix_automatic_enabled),
    max_attempts: asInt(o.max_attempts, base.max_attempts, 1, 20),
    attempt_interval_days: asInt(o.attempt_interval_days, base.attempt_interval_days, 1, 30),
    suspend_after_days: asInt(o.suspend_after_days, base.suspend_after_days, 0, 365),
    cancel_after_days: asInt(o.cancel_after_days, base.cancel_after_days, 0, 730),
    notify_whatsapp: asBool(o.notify_whatsapp, base.notify_whatsapp),
    notify_email: asBool(o.notify_email, base.notify_email),
    generate_pix_after_failure: asBool(o.generate_pix_after_failure, base.generate_pix_after_failure),
    reactivate_on_paid: asBool(o.reactivate_on_paid, base.reactivate_on_paid),
    auto_suspend_enabled: asBool(o.auto_suspend_enabled, base.auto_suspend_enabled),
    auto_cancel_enabled: asBool(o.auto_cancel_enabled, base.auto_cancel_enabled),
    grace_period_days: asInt(o.grace_period_days, base.grace_period_days, 0, 90),
    actions_after_fail: asFailActions(o.actions_after_fail, base.actions_after_fail),
  };
}

export function assertValidCollectionPolicyShape(policy: CollectionPolicy): void {
  if (policy.max_attempts < 1) throw new Error('max_attempts deve ser >= 1');
  if (policy.suspend_after_days > policy.cancel_after_days) {
    throw new Error('suspend_after_days não pode ser maior que cancel_after_days');
  }
}
