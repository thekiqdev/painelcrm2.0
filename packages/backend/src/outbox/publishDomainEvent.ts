import type pg from 'pg';
import { randomUUID } from 'crypto';
import { dbRequestStorage } from '../utils/db.js';
import { requireCorrelationId } from '../context/requestContext.js';
import { isDomainEventKey } from './domainEventKeys.js';
import { isOutboxWriteEnabled } from './outboxFlags.js';
import { insertOutboxEvent } from './outboxRepository.js';
import { logOutbox } from './outboxLogger.js';
import type { PublishDomainEventInput, PublishDomainEventResult } from './outboxTypes.js';
import { OUTBOX_DEFAULT_MAX_ATTEMPTS } from './retryPolicy.js';
import { hashPayloadForAudit } from './idempotency.js';

function resolveDbClient(explicit?: pg.PoolClient): pg.PoolClient | pg.Pool {
  if (explicit) return explicit;
  const store = dbRequestStorage.getStore();
  if (store?.client) return store.client;
  throw new Error('publishDomainEvent requires an active transaction client or explicit client');
}

/**
 * Publica evento no outbox dentro da mesma transação do caller.
 * Com flag OFF: no-op (não altera comportamento do sistema).
 */
export async function publishDomainEvent(
  input: PublishDomainEventInput,
  opts?: { client?: pg.PoolClient },
): Promise<PublishDomainEventResult> {
  const flag = await isOutboxWriteEnabled({ tenantId: input.tenantId ?? null });
  if (!flag.enabled) {
    logOutbox('publish_skipped', {
      event_key: input.eventKey,
      reason: 'outbox.write_v1_off',
      tenant_id: input.tenantId ?? null,
    });
    return { outcome: 'skipped', reason: 'outbox.write_v1_off' };
  }

  if (!isDomainEventKey(input.eventKey)) {
    logOutbox('publish_skipped', {
      event_key: input.eventKey,
      reason: 'unknown_event_key',
    });
    return { outcome: 'skipped', reason: 'unknown_event_key' };
  }

  const client = resolveDbClient(opts?.client);
  const correlationId = input.correlationId?.trim() || requireCorrelationId();
  const metadata = {
    ...(input.metadata ?? {}),
    shadow: flag.shadow,
    published_via: 'publishDomainEvent',
    payload_hash: hashPayloadForAudit(input.payload ?? {}),
  };

  const { inserted, row } = await insertOutboxEvent(client, {
    eventKey: input.eventKey,
    eventVersion: input.eventVersion ?? 1,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    tenantId: input.tenantId ?? null,
    correlationId,
    payload: input.payload ?? {},
    metadata,
    idempotencyKey: input.idempotencyKey,
    priority: input.priority ?? 2,
    maxAttempts: input.maxAttempts ?? OUTBOX_DEFAULT_MAX_ATTEMPTS,
    causationId: input.causationId ?? null,
    replayOfEventId: input.replayOfEventId ?? null,
  });

  logOutbox(inserted ? 'publish_inserted' : 'publish_deduped', {
    event_id: row.id,
    event_key: row.event_key,
    aggregate_type: row.aggregate_type,
    aggregate_id: row.aggregate_id,
    correlation_id: correlationId,
    tenant_id: row.tenant_id,
    shadow: flag.shadow,
    idempotency_key: row.idempotency_key,
  });

  if (inserted) {
    return { outcome: 'inserted', eventId: row.id, shadow: flag.shadow };
  }
  return { outcome: 'duplicate', eventId: row.id, shadow: flag.shadow };
}

/**
 * Variante fire-and-forget fora de TX (shadow instrumentation apenas).
 * Nunca lança para o caller HTTP.
 */
export async function publishDomainEventDetached(
  input: PublishDomainEventInput,
): Promise<PublishDomainEventResult> {
  try {
    const { pool, runDetachedFromRequestDb } = await import('../utils/db.js');
    return await runDetachedFromRequestDb(async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await publishDomainEvent(input, { client });
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    });
  } catch (err) {
    logOutbox('publish_detached_error', {
      event_key: input.eventKey,
      error: err instanceof Error ? err.message : String(err),
    });
    return { outcome: 'skipped', reason: 'detached_error' };
  }
}
