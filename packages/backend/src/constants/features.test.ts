import { describe, expect, it } from 'vitest';
import { FEATURE_KEYS, FEATURE_LABELS, isValidFeatureKey } from './features.js';

describe('FEATURE_KEYS', () => {
  it('inclui service_orders para go-live da flag de plano', () => {
    expect(FEATURE_KEYS).toContain('service_orders');
    expect(isValidFeatureKey('service_orders')).toBe(true);
    expect(FEATURE_LABELS.service_orders).toMatch(/ordens/i);
  });
});
