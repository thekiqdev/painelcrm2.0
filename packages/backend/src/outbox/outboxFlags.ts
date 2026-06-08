import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';

type FlagCtx = { tenantId?: string | null };

async function resolve(key: string, ctx: FlagCtx = {}) {
  return featureFlagRegistry.resolve(key, {
    tenantId: ctx.tenantId ?? undefined,
  });
}

export async function isOutboxWriteEnabled(ctx: FlagCtx = {}): Promise<{ enabled: boolean; shadow: boolean }> {
  const r = await resolve('outbox.write_v1', ctx);
  return { enabled: r.enabled, shadow: r.shadow };
}

export async function isOutboxPublisherEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  const [worker, legacy] = await Promise.all([
    resolve('outbox.publisher_worker_v1', ctx),
    resolve('outbox.publisher_v1', ctx),
  ]);
  return worker.enabled || legacy.enabled;
}

export async function isOutboxPassiveConsumersEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  const [passive, legacy] = await Promise.all([
    resolve('outbox.passive_consumers_v1', ctx),
    resolve('outbox.subscribers_v1', ctx),
  ]);
  return passive.enabled || legacy.enabled;
}

export async function isOutboxDeadLetterEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  const r = await resolve('outbox.dead_letter_v1', ctx);
  return r.enabled;
}

export async function isOutboxReplayFoundationEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  const r = await resolve('outbox.replay_foundation_v1', ctx);
  return r.enabled;
}
