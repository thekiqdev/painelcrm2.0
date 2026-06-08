import { createHash } from 'crypto';
import type { DomainEventKey } from './domainEventKeys.js';

export function buildDomainEventIdempotencyKey(
  eventKey: DomainEventKey | string,
  aggregateId: string,
  suffix?: string,
): string {
  const base = `${eventKey}:${aggregateId}`;
  return suffix ? `${base}:${suffix}` : base;
}

export function buildReplayIdempotencyKey(originalKey: string, replayId: string): string {
  return `${originalKey}:replay:${replayId}`;
}

export function subscriberConsumeKey(eventIdempotencyKey: string, subscriberName: string): string {
  return `${subscriberName}:${eventIdempotencyKey}`;
}

export function hashPayloadForAudit(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}
