import type pg from 'pg';
import { withBillingWorkerRlsBypass } from '../utils/db.js';
import { runWithRequestContext } from '../context/requestContext.js';
import {
  claimOutboxBatch,
  insertDispatchLog,
  markOutboxDeadLetter,
  markOutboxPublished,
  markOutboxRetry,
  reclaimStalePublishing,
  stalePublishingThresholdMs,
} from './outboxRepository.js';
import {
  computeNextRetryAt,
  outboxPublisherBatchSize,
  OUTBOX_DEFAULT_MAX_ATTEMPTS,
} from './retryPolicy.js';
import { isOutboxDeadLetterEnabled, isOutboxPublisherEnabled } from './outboxFlags.js';
import { dispatchPassiveConsumers } from './passiveConsumers/dispatchPassiveConsumers.js';
import { isWorkerShutdownRequested } from '../workerRuntime/workerRuntime.js';
import { logOutboxDlq, logOutboxRetry, logOutboxWorker } from './outboxLogger.js';
import type { OutboxEventRow, OutboxPublisherBatchResult } from './outboxTypes.js';

async function processOneEvent(
  client: pg.PoolClient,
  event: OutboxEventRow,
  workerId: string,
): Promise<'published' | 'retry' | 'dead_letter' | 'error'> {
  const started = Date.now();
  const attemptNumber = event.attempts + 1;
  const shadow = Boolean(event.metadata_json?.shadow);

  try {
    await runWithRequestContext(
      {
        correlationId: event.correlation_id,
        tenantId: event.tenant_id ?? undefined,
        workerName: 'outboxPublisherWorker',
      },
      async () => {
        await dispatchPassiveConsumers(client, event, { shadow, workerId });
      },
    );

    await markOutboxPublished(client, event.id);
    await insertDispatchLog(client, {
      outboxEventId: event.id,
      workerId,
      attemptNumber,
      outcome: 'published',
      durationMs: Date.now() - started,
      correlationId: event.correlation_id,
    });
    return 'published';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const nextAttempts = attemptNumber;
    const maxAttempts = event.max_attempts || OUTBOX_DEFAULT_MAX_ATTEMPTS;
    const dlqEnabled = await isOutboxDeadLetterEnabled({ tenantId: event.tenant_id });

    if (dlqEnabled && nextAttempts >= maxAttempts) {
      await markOutboxDeadLetter(client, {
        eventId: event.id,
        attempts: nextAttempts,
        lastError: message,
      });
      await insertDispatchLog(client, {
        outboxEventId: event.id,
        workerId,
        attemptNumber,
        outcome: 'dead_letter',
        errorMessage: message,
        durationMs: Date.now() - started,
        correlationId: event.correlation_id,
      });
      logOutboxDlq('dead_letter', {
        event_id: event.id,
        event_key: event.event_key,
        attempts: nextAttempts,
        correlation_id: event.correlation_id,
      });
      return 'dead_letter';
    }

    const nextRetryAt = computeNextRetryAt(nextAttempts);
    await markOutboxRetry(client, {
      eventId: event.id,
      attempts: nextAttempts,
      nextRetryAt,
      lastError: message,
    });
    await insertDispatchLog(client, {
      outboxEventId: event.id,
      workerId,
      attemptNumber,
      outcome: 'retry',
      errorMessage: message,
      durationMs: Date.now() - started,
      correlationId: event.correlation_id,
    });
    logOutboxRetry('scheduled', {
      event_id: event.id,
      attempts: nextAttempts,
      next_retry_at: nextRetryAt.toISOString(),
      correlation_id: event.correlation_id,
    });
    return 'retry';
  }
}

export async function runOutboxPublisherBatch(workerId: string): Promise<OutboxPublisherBatchResult> {
  const publisherOn = await isOutboxPublisherEnabled();
  if (!publisherOn) {
    logOutboxWorker('batch_skipped', { worker_id: workerId, reason: 'publisher_flag_off' });
    return {
      reclaimed: 0,
      claimed: 0,
      published: 0,
      retried: 0,
      deadLettered: 0,
      errors: 0,
      skipped_flag_off: true,
    };
  }

  return withBillingWorkerRlsBypass(async () => {
    const { pool } = await import('../utils/db.js');
    const client = await pool.connect();
    try {
      const staleMs = stalePublishingThresholdMs();
      const reclaimed = await reclaimStalePublishing(client, staleMs);
      if (reclaimed > 0) {
        logOutboxWorker('stale_reclaimed', { worker_id: workerId, count: reclaimed, stale_ms: staleMs });
      }

      const batch = await claimOutboxBatch(client, workerId, outboxPublisherBatchSize());
      const result: OutboxPublisherBatchResult = {
        reclaimed,
        claimed: batch.length,
        published: 0,
        retried: 0,
        deadLettered: 0,
        errors: 0,
        skipped_flag_off: false,
      };

      for (const event of batch) {
        const outcome = await processOneEvent(client, event, workerId);
        if (outcome === 'published') result.published += 1;
        else if (outcome === 'retry') result.retried += 1;
        else if (outcome === 'dead_letter') result.deadLettered += 1;
        else result.errors += 1;
      }

      logOutboxWorker('batch_complete', { worker_id: workerId, ...result });
      return result;
    } finally {
      client.release();
    }
  });
}

let shutdownRequested = false;

export function requestOutboxPublisherShutdown(): void {
  shutdownRequested = true;
}

export function isOutboxPublisherShutdownRequested(): boolean {
  return shutdownRequested;
}

export async function runOutboxPublisherLoop(workerId: string): Promise<void> {
  const pollMs = Math.max(500, parseInt(process.env.OUTBOX_POLL_MS || '2000', 10));
  logOutboxWorker('loop_start', { worker_id: workerId, poll_ms: pollMs });

  while (!shutdownRequested && !isWorkerShutdownRequested()) {
    await runOutboxPublisherBatch(workerId);
    if (shutdownRequested || isWorkerShutdownRequested()) break;
    await new Promise((r) => setTimeout(r, pollMs));
  }

  logOutboxWorker('loop_shutdown', { worker_id: workerId });
}
