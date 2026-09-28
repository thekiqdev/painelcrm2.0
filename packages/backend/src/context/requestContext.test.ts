import { describe, it, expect } from 'vitest';
import { parseCorrelationHeader, runWithRequestContext, getCorrelationId } from './requestContext.js';

describe('requestContext', () => {
  it('parses valid correlation header', () => {
    expect(parseCorrelationHeader('abc-123-uuid-style')).toBe('abc-123-uuid-style');
  });

  it('rejects invalid correlation header', () => {
    expect(parseCorrelationHeader('')).toBeNull();
    expect(parseCorrelationHeader('bad chars!')).toBeNull();
  });

  it('propagates correlation in async context', async () => {
    const id = 'test-correlation-001';
    await runWithRequestContext({ correlationId: id, workerName: 'test' }, async () => {
      expect(getCorrelationId()).toBe(id);
    });
  });
});
