import { describe, it, expect } from 'vitest';
import {
  buildDomainEventIdempotencyKey,
  buildReplayIdempotencyKey,
  subscriberConsumeKey,
} from './idempotency.js';

describe('idempotency keys', () => {
  it('builds stable domain keys', () => {
    expect(buildDomainEventIdempotencyKey('ticket.created', 'abc')).toBe('ticket.created:abc');
  });

  it('builds replay keys', () => {
    expect(buildReplayIdempotencyKey('ticket.created:abc', 'r1')).toBe('ticket.created:abc:replay:r1');
  });

  it('builds subscriber keys', () => {
    expect(subscriberConsumeKey('ticket.created:abc', 'shadow.ticket.created')).toBe(
      'shadow.ticket.created:ticket.created:abc',
    );
  });
});
