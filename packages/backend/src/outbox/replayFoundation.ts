import type pg from 'pg';
import { randomUUID } from 'crypto';
import { publishDomainEvent } from './publishDomainEvent.js';
import { buildReplayIdempotencyKey } from './idempotency.js';
import { getOutboxEventById, insertReplayMarker } from './outboxRepository.js';
import { isOutboxReplayFoundationEnabled } from './outboxFlags.js';
import { logOutboxReplay } from './outboxLogger.js';
import type { PublishDomainEventResult } from './outboxTypes.js';

export type PrepareReplayResult =
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'ready'; replayIdempotencyKey: string; originalEventId: string };

/**
 * Foundation para replay manual futuro — não expõe API admin nesta sprint.
 */
export async function prepareReplayPublication(
  client: pg.PoolClient,
  originalEventId: string,
  opts?: { createdBy?: string; reason?: string },
): Promise<PrepareReplayResult> {
  const enabled = await isOutboxReplayFoundationEnabled();
  if (!enabled) {
    return { outcome: 'skipped', reason: 'outbox.replay_foundation_v1_off' };
  }

  const original = await getOutboxEventById(client, originalEventId);
  if (!original) {
    return { outcome: 'skipped', reason: 'event_not_found' };
  }

  const replayNonce = randomUUID();
  const replayKey = buildReplayIdempotencyKey(original.idempotency_key, replayNonce);

  logOutboxReplay('replay_prepared', {
    original_event_id: original.id,
    replay_idempotency_key: replayKey,
    correlation_id: original.correlation_id,
  });

  return {
    outcome: 'ready',
    replayIdempotencyKey: replayKey,
    originalEventId: original.id,
  };
}

export async function publishReplayEvent(
  client: pg.PoolClient,
  originalEventId: string,
  opts?: { createdBy?: string; reason?: string },
): Promise<PublishDomainEventResult> {
  const prep = await prepareReplayPublication(client, originalEventId, opts);
  if (prep.outcome === 'skipped') {
    return { outcome: 'skipped', reason: prep.reason };
  }

  const original = await getOutboxEventById(client, originalEventId);
  if (!original) {
    return { outcome: 'skipped', reason: 'event_not_found' };
  }

  const result = await publishDomainEvent(
    {
      eventKey: original.event_key,
      aggregateType: original.aggregate_type,
      aggregateId: original.aggregate_id,
      tenantId: original.tenant_id,
      correlationId: original.correlation_id,
      causationId: original.id,
      payload: original.payload_json,
      metadata: {
        ...original.metadata_json,
        replay: true,
        replay_reason: opts?.reason ?? null,
      },
      idempotencyKey: prep.replayIdempotencyKey,
      replayOfEventId: original.id,
    },
    { client },
  );

  if (result.outcome === 'inserted' || result.outcome === 'duplicate') {
    await insertReplayMarker(client, {
      originalEventId: original.id,
      replayEventId: result.eventId,
      correlationId: original.correlation_id,
      createdBy: opts?.createdBy ?? null,
      reason: opts?.reason ?? null,
    });
    logOutboxReplay('replay_published', {
      original_event_id: original.id,
      replay_event_id: result.eventId,
      correlation_id: original.correlation_id,
    });
  }

  return result;
}
