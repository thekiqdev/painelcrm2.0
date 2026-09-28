import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./outboxFlags.js', () => ({
  isOutboxWriteEnabled: vi.fn(),
}));

vi.mock('./outboxRepository.js', () => ({
  insertOutboxEvent: vi.fn(),
}));

import { isOutboxWriteEnabled } from './outboxFlags.js';
import { insertOutboxEvent } from './outboxRepository.js';
import { publishDomainEvent } from './publishDomainEvent.js';

describe('publishDomainEvent', () => {
  const mockClient = { query: vi.fn() } as unknown as import('pg').PoolClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips when write flag is off', async () => {
    vi.mocked(isOutboxWriteEnabled).mockResolvedValue({ enabled: false, shadow: false });
    const result = await publishDomainEvent(
      {
        eventKey: 'ticket.created',
        aggregateType: 'ticket',
        aggregateId: 't1',
        correlationId: 'corr-test-001',
        idempotencyKey: 'ticket.created:t1',
      },
      { client: mockClient },
    );
    expect(result.outcome).toBe('skipped');
    expect(insertOutboxEvent).not.toHaveBeenCalled();
  });

  it('inserts when flag is on', async () => {
    vi.mocked(isOutboxWriteEnabled).mockResolvedValue({ enabled: true, shadow: true });
    vi.mocked(insertOutboxEvent).mockResolvedValue({
      inserted: true,
      row: {
        id: 'evt-1',
        event_key: 'ticket.created',
        idempotency_key: 'ticket.created:t1',
      } as never,
    });
    const result = await publishDomainEvent(
      {
        eventKey: 'ticket.created',
        aggregateType: 'ticket',
        aggregateId: 't1',
        tenantId: 'tenant-1',
        correlationId: 'corr-test-002',
        idempotencyKey: 'ticket.created:t1',
      },
      { client: mockClient },
    );
    expect(result).toEqual({ outcome: 'inserted', eventId: 'evt-1', shadow: true });
  });
});
