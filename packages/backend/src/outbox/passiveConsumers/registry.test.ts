import { describe, it, expect } from 'vitest';
import { passiveConsumersForEvent } from './registry.js';

describe('passiveConsumersForEvent', () => {
  it('returns consumers for ticket.created', () => {
    const list = passiveConsumersForEvent('ticket.created');
    expect(list.some((c) => c.name === 'shadow.ticket.created')).toBe(true);
    expect(list.some((c) => c.name === 'support.ticket.created')).toBe(true);
  });

  it('returns empty for unknown events', () => {
    expect(passiveConsumersForEvent('unknown.event')).toHaveLength(0);
  });
});
