/**
 * Fila rastreável de side-effects de notificação (fire-and-forget com drain).
 * Workers one-shot devem chamar flushBillingNotificationSideEffects() antes de exit.
 */

import { runDetachedFromRequestDb } from '../../utils/db.js';

const pending = new Set<Promise<void>>();

export type BillingNotificationFlushResult = {
  rounds: number;
  drained: number;
  fulfilled: number;
  rejected: number;
  pending_remaining: number;
};

export function scheduleBillingNotificationSideEffect(
  label: string,
  fn: () => Promise<void>,
): void {
  const run = async (): Promise<void> => {
    try {
      await runDetachedFromRequestDb(fn);
    } catch (err) {
      console.error(`[notifications-engine/business] ${label}`, err);
      // Fire-and-forget: nunca propagar — evita uncaught rejection e crash do processo.
    }
  };
  const tracked = run().finally(() => {
    pending.delete(tracked);
  });
  pending.add(tracked);
  console.log(
    '[BILLING_NOTIFY_ENQUEUED]',
    JSON.stringify({ label, pending_count: pending.size, ts: new Date().toISOString() }),
  );
}

/**
 * Aguarda todas as tarefas enfileiradas até a fila estabilizar (sem sleep arbitrário).
 * Novas tarefas enfileiradas durante o drain são incluídas na rodada seguinte.
 */
export async function flushBillingNotificationSideEffects(): Promise<BillingNotificationFlushResult> {
  let rounds = 0;
  let drained = 0;
  let fulfilled = 0;
  let rejected = 0;
  const maxRounds = 32;

  while (pending.size > 0 && rounds < maxRounds) {
    rounds += 1;
    const snapshot = [...pending];
    drained += snapshot.length;
    const results = await Promise.allSettled(snapshot);
    for (const r of results) {
      if (r.status === 'fulfilled') fulfilled += 1;
      else rejected += 1;
    }
  }

  const result: BillingNotificationFlushResult = {
    rounds,
    drained,
    fulfilled,
    rejected,
    pending_remaining: pending.size,
  };

  console.log('[BILLING_NOTIFY_FLUSH]', JSON.stringify({ ...result, ts: new Date().toISOString() }));

  if (pending.size > 0) {
    console.warn(
      '[BILLING_NOTIFY_FLUSH]',
      JSON.stringify({
        warning: 'pending_tasks_remain_after_max_rounds',
        pending_remaining: pending.size,
        max_rounds: maxRounds,
      }),
    );
  }

  return result;
}
