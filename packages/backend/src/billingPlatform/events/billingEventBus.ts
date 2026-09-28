/**
 * Billing Platform — in-memory event bus (foundation; no persistence).
 */
import { randomUUID } from 'node:crypto';
import type {
  BillingPlatformEvent,
  BillingPlatformEventHandler,
  BillingPlatformEventPayload,
  BillingPlatformEventType,
} from './types.js';

type HandlerEntry = {
  type: BillingPlatformEventType | '*';
  handler: BillingPlatformEventHandler;
};

const handlers: HandlerEntry[] = [];
const recentEvents: BillingPlatformEvent[] = [];
const MAX_RECENT = 500;

export function publishBillingPlatformEvent<T extends BillingPlatformEventType>(params: {
  type: T;
  payload: BillingPlatformEventPayload;
  correlation_id?: string | null;
}): BillingPlatformEvent<T> {
  const event: BillingPlatformEvent<T> = {
    id: randomUUID(),
    type: params.type,
    payload: params.payload,
    correlation_id: params.correlation_id ?? null,
  };

  recentEvents.push(event);
  if (recentEvents.length > MAX_RECENT) {
    recentEvents.shift();
  }

  for (const entry of handlers) {
    if (entry.type === '*' || entry.type === event.type) {
      void Promise.resolve(entry.handler(event as BillingPlatformEvent)).catch(() => {
        /* foundation: swallow handler errors */
      });
    }
  }

  return event;
}

export function subscribeBillingPlatformEvent(
  type: BillingPlatformEventType | '*',
  handler: BillingPlatformEventHandler
): () => void {
  const entry: HandlerEntry = { type, handler };
  handlers.push(entry);
  return () => {
    const idx = handlers.indexOf(entry);
    if (idx >= 0) handlers.splice(idx, 1);
  };
}

export function getRecentBillingPlatformEvents(limit = 50): BillingPlatformEvent[] {
  return recentEvents.slice(-limit);
}

export function resetBillingEventBusForTests(): void {
  handlers.length = 0;
  recentEvents.length = 0;
}
