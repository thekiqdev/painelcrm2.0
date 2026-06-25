import { describe, expect, it } from 'vitest';
import { buildSubscriptionTimeline } from './subscriptionTimelineUx.js';

describe('buildSubscriptionTimeline lifecycle events', () => {
  it('inclui pause, resume e reactivate na timeline mesclada', () => {
    const rows = buildSubscriptionTimeline(
      [],
      [],
      10000,
      false,
      [],
      [
        {
          id: 'e1',
          created_at: '2026-06-01T10:00:00.000Z',
          change_type: 'pause',
          reason: 'Cliente viajando',
          next_billing_date: null,
          actor_name: 'Ana',
        },
        {
          id: 'e2',
          created_at: '2026-08-01T10:00:00.000Z',
          change_type: 'resume',
          reason: null,
          next_billing_date: '2026-08-15',
          actor_name: 'Ana',
        },
      ]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.merge_source).toBe('lifecycle');
    expect(rows[0]?.lifecycle_event).toBe('resume');
    expect(rows[0]?.lifecycle_next_billing_date).toBe('2026-08-15');
    expect(rows[1]?.lifecycle_event).toBe('pause');
    expect(rows[1]?.generation_note).toBe('Cliente viajando');
  });
});
