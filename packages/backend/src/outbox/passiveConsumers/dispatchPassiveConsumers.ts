import type pg from 'pg';
import { isOutboxPassiveConsumersEnabled } from '../outboxFlags.js';
import { tryInsertSubscriberIdempotency } from '../outboxRepository.js';
import { subscriberConsumeKey } from '../idempotency.js';
import { logOutbox } from '../outboxLogger.js';
import type { OutboxEventRow } from '../outboxTypes.js';
import { passiveConsumersForEvent } from './registry.js';
import type { PassiveConsumerContext } from './types.js';

export async function dispatchPassiveConsumers(
  client: pg.PoolClient | pg.Pool,
  event: OutboxEventRow,
  ctx: PassiveConsumerContext,
): Promise<{ dispatched: number; deduped: number }> {
  const enabled = await isOutboxPassiveConsumersEnabled({ tenantId: event.tenant_id });
  if (!enabled) {
    logOutbox('passive_skipped', { event_id: event.id, reason: 'passive_consumers_off' });
    return { dispatched: 0, deduped: 0 };
  }

  const consumers = passiveConsumersForEvent(event.event_key);
  let dispatched = 0;
  let deduped = 0;

  for (const consumer of consumers) {
    const consumeKey = subscriberConsumeKey(event.idempotency_key, consumer.name);
    const inserted = await tryInsertSubscriberIdempotency(client, {
      subscriberName: consumer.name,
      idempotencyKey: consumeKey,
      outboxEventId: event.id,
    });
    if (!inserted) {
      deduped += 1;
      continue;
    }
    await consumer.handle(event, ctx);
    dispatched += 1;
  }

  return { dispatched, deduped };
}
