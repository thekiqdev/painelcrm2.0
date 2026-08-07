/**
 * S29.1 — testes de rate limit helpers (key / defaults).
 */
import { describe, expect, it } from 'vitest';
import {
  chatbotFlowsInboundWebhookLimiter,
  chatbotFlowsSampleWebhookLimiter,
} from './flowWebhookRateLimit.js';

describe('S29.1 flowWebhookRateLimit', () => {
  it('exporta limiters de produção e sample', () => {
    expect(chatbotFlowsInboundWebhookLimiter).toBeTypeOf('function');
    expect(chatbotFlowsSampleWebhookLimiter).toBeTypeOf('function');
  });
});
