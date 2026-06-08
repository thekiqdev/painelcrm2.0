import type pg from 'pg';
import type { OutboxEventRow, OutboxEventStatus } from './outboxTypes.js';
import { stalePublishingThresholdMs } from './retryPolicy.js';

function mapRow(row: Record<string, unknown>): OutboxEventRow {
  return {
    id: String(row.id),
    event_key: String(row.event_key),
    event_version: Number(row.event_version),
    aggregate_type: String(row.aggregate_type),
    aggregate_id: String(row.aggregate_id),
    tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
    correlation_id: String(row.correlation_id),
    payload_json: (row.payload_json ?? {}) as Record<string, unknown>,
    metadata_json: (row.metadata_json ?? {}) as Record<string, unknown>,
    idempotency_key: String(row.idempotency_key),
    status: row.status as OutboxEventStatus,
    attempts: Number(row.attempts),
    max_attempts: Number(row.max_attempts),
    next_retry_at: String(row.next_retry_at),
    priority: Number(row.priority),
    last_error: row.last_error != null ? String(row.last_error) : null,
    locked_by: row.locked_by != null ? String(row.locked_by) : null,
    locked_at: row.locked_at != null ? String(row.locked_at) : null,
    published_at: row.published_at != null ? String(row.published_at) : null,
    failed_at: row.failed_at != null ? String(row.failed_at) : null,
    dead_letter_at: row.dead_letter_at != null ? String(row.dead_letter_at) : null,
    causation_id: row.causation_id != null ? String(row.causation_id) : null,
    replay_of_event_id: row.replay_of_event_id != null ? String(row.replay_of_event_id) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function insertOutboxEvent(
  client: pg.PoolClient | pg.Pool,
  input: {
    eventKey: string;
    eventVersion: number;
    aggregateType: string;
    aggregateId: string;
    tenantId: string | null;
    correlationId: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
    idempotencyKey: string;
    priority: number;
    maxAttempts: number;
    causationId: string | null;
    replayOfEventId: string | null;
  },
): Promise<{ inserted: boolean; row: OutboxEventRow }> {
  const ins = await client.query(
    `INSERT INTO outbox_events (
       event_key, event_version, aggregate_type, aggregate_id, tenant_id,
       correlation_id, payload_json, metadata_json, idempotency_key,
       priority, max_attempts, causation_id, replay_of_event_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [
      input.eventKey,
      input.eventVersion,
      input.aggregateType,
      input.aggregateId,
      input.tenantId,
      input.correlationId,
      JSON.stringify(input.payload),
      JSON.stringify(input.metadata),
      input.idempotencyKey,
      input.priority,
      input.maxAttempts,
      input.causationId,
      input.replayOfEventId,
    ],
  );
  if (ins.rows[0]) {
    return { inserted: true, row: mapRow(ins.rows[0]) };
  }
  const existing = await client.query(`SELECT * FROM outbox_events WHERE idempotency_key = $1 LIMIT 1`, [
    input.idempotencyKey,
  ]);
  return { inserted: false, row: mapRow(existing.rows[0]) };
}

export async function claimOutboxBatch(
  client: pg.PoolClient | pg.Pool,
  workerId: string,
  limit: number,
): Promise<OutboxEventRow[]> {
  const r = await client.query(
    `WITH picked AS (
       SELECT id
       FROM outbox_events
       WHERE status IN ('pending', 'failed')
         AND next_retry_at <= now()
       ORDER BY priority ASC, next_retry_at ASC, created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE outbox_events e
     SET status = 'publishing',
         locked_by = $2,
         locked_at = now(),
         updated_at = now()
     FROM picked
     WHERE e.id = picked.id
     RETURNING e.*`,
    [limit, workerId],
  );
  return r.rows.map((row) => mapRow(row));
}

export async function reclaimStalePublishing(
  client: pg.PoolClient | pg.Pool,
  staleMs: number,
): Promise<number> {
  const r = await client.query(
    `UPDATE outbox_events
     SET status = 'pending',
         locked_by = NULL,
         locked_at = NULL,
         updated_at = now()
     WHERE status = 'publishing'
       AND locked_at IS NOT NULL
       AND locked_at < now() - ($1::int * interval '1 millisecond')
     RETURNING id`,
    [staleMs],
  );
  return r.rowCount ?? 0;
}

export async function markOutboxPublished(
  client: pg.PoolClient | pg.Pool,
  eventId: string,
): Promise<void> {
  await client.query(
    `UPDATE outbox_events
     SET status = 'published',
         published_at = now(),
         locked_by = NULL,
         locked_at = NULL,
         last_error = NULL,
         updated_at = now()
     WHERE id = $1`,
    [eventId],
  );
}

export async function markOutboxRetry(
  client: pg.PoolClient | pg.Pool,
  input: {
    eventId: string;
    attempts: number;
    nextRetryAt: Date;
    lastError: string;
  },
): Promise<void> {
  await client.query(
    `UPDATE outbox_events
     SET status = 'failed',
         attempts = $2,
         next_retry_at = $3,
         failed_at = now(),
         last_error = $4,
         locked_by = NULL,
         locked_at = NULL,
         updated_at = now()
     WHERE id = $1`,
    [input.eventId, input.attempts, input.nextRetryAt.toISOString(), input.lastError.slice(0, 4000)],
  );
}

export async function markOutboxDeadLetter(
  client: pg.PoolClient | pg.Pool,
  input: { eventId: string; attempts: number; lastError: string },
): Promise<void> {
  await client.query(
    `UPDATE outbox_events
     SET status = 'dead_letter',
         attempts = $2,
         dead_letter_at = now(),
         last_error = $3,
         locked_by = NULL,
         locked_at = NULL,
         updated_at = now()
     WHERE id = $1`,
    [input.eventId, input.attempts, input.lastError.slice(0, 4000)],
  );
}

export async function insertDispatchLog(
  client: pg.PoolClient | pg.Pool,
  input: {
    outboxEventId: string;
    workerId: string;
    attemptNumber: number;
    outcome: string;
    errorMessage?: string | null;
    durationMs?: number;
    correlationId?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO outbox_dispatch_log (
       outbox_event_id, worker_id, attempt_number, outcome, error_message, duration_ms, correlation_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.outboxEventId,
      input.workerId,
      input.attemptNumber,
      input.outcome,
      input.errorMessage ?? null,
      input.durationMs ?? null,
      input.correlationId ?? null,
    ],
  );
}

export async function tryInsertSubscriberIdempotency(
  client: pg.PoolClient | pg.Pool,
  input: { subscriberName: string; idempotencyKey: string; outboxEventId: string },
): Promise<boolean> {
  const r = await client.query(
    `INSERT INTO outbox_subscriber_idempotency (subscriber_name, idempotency_key, outbox_event_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (subscriber_name, idempotency_key) DO NOTHING
     RETURNING subscriber_name`,
    [input.subscriberName, input.idempotencyKey, input.outboxEventId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function insertReplayMarker(
  client: pg.PoolClient | pg.Pool,
  input: {
    originalEventId: string;
    replayEventId: string;
    correlationId: string;
    createdBy?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO outbox_replay_markers (
       original_event_id, replay_event_id, correlation_id, created_by, reason
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      input.originalEventId,
      input.replayEventId,
      input.correlationId,
      input.createdBy ?? null,
      input.reason ?? null,
    ],
  );
}

export async function getOutboxEventById(
  client: pg.PoolClient | pg.Pool,
  eventId: string,
): Promise<OutboxEventRow | null> {
  const r = await client.query(`SELECT * FROM outbox_events WHERE id = $1 LIMIT 1`, [eventId]);
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export { stalePublishingThresholdMs };
