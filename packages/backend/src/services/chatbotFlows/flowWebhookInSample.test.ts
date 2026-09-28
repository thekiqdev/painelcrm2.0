/**
 * Testes S28 — sample URL fixa (sem DB: só path/url helpers + generate).
 * Ingest/rotate cobertos via smoke manual / integração.
 */
import { describe, expect, it } from 'vitest';
import {
  buildInboundWebhookSamplePath,
  buildInboundWebhookSampleUrl,
} from './flowWebhookInSample.js';
import { generateInboundWebhookToken } from './flowWebhookIn.js';

describe('flowWebhookInSample S28', () => {
  it('buildInboundWebhookSamplePath encodeia token', () => {
    const t = 'abc123';
    expect(buildInboundWebhookSamplePath(t)).toBe(
      '/webhooks/chatbot-flows-sample/abc123'
    );
  });

  it('generateInboundWebhookToken tem comprimento estável', () => {
    const a = generateInboundWebhookToken();
    const b = generateInboundWebhookToken();
    expect(a).toHaveLength(48);
    expect(b).toHaveLength(48);
    expect(a).not.toBe(b);
  });

  it('buildInboundWebhookSampleUrl sem base pública retorna path', () => {
    const prev = process.env.API_PUBLIC_BASE_URL;
    delete process.env.API_PUBLIC_BASE_URL;
    delete process.env.API_PUBLIC_ORIGIN;
    delete process.env.PUBLIC_API_URL;
    delete process.env.API_PUBLIC_URL;
    const url = buildInboundWebhookSampleUrl('tok');
    expect(url).toBe('/webhooks/chatbot-flows-sample/tok');
    if (prev != null) process.env.API_PUBLIC_BASE_URL = prev;
  });
});
