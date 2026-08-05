import { describe, expect, it } from 'vitest';
import {
  assertSafePublicHttpUrl,
  buildWebhookOutBody,
  getByDotPath,
} from './flowHttpActions.js';
import { sanitizeGraph } from './flowPortability.js';

describe('flowHttpActions SSRF', () => {
  it('bloqueia localhost e IP privado', () => {
    expect(() => assertSafePublicHttpUrl('http://127.0.0.1/x')).toThrow(/local|privado/i);
    expect(() => assertSafePublicHttpUrl('http://192.168.0.1/x')).toThrow(/privado/i);
    expect(() => assertSafePublicHttpUrl('http://10.0.0.2/x')).toThrow(/privado/i);
  });

  it('aceita https público', () => {
    const u = assertSafePublicHttpUrl('https://example.com/api');
    expect(u.hostname).toBe('example.com');
  });
});

describe('getByDotPath', () => {
  it('resolve paths simples', () => {
    expect(getByDotPath({ data: { id: 9 } }, 'data.id')).toBe(9);
    expect(getByDotPath({ items: [{ n: 'a' }] }, 'items.0.n')).toBe('a');
  });
});

describe('buildWebhookOutBody S8', () => {
  const base = {
    variables: { answer: 'Ana' },
    conversationId: 'c1',
    tenantId: 't1',
    includeSessionVars: true,
  };

  it('envelope padrão inclui variables', () => {
    const body = JSON.parse(
      buildWebhookOutBody({
        ...base,
        payloadMode: 'envelope',
        bodyTemplate: '',
      })
    );
    expect(body.event).toBe('chatbot_flows.webhook_out');
    expect(body.variables.answer).toBe('Ana');
    expect(body.data).toBeUndefined();
  });

  it('envelope_plus coloca template em data', () => {
    const body = JSON.parse(
      buildWebhookOutBody({
        ...base,
        payloadMode: 'envelope_plus',
        bodyTemplate: '{"nome":"{{answer}}"}',
      })
    );
    expect(body.data).toEqual({ nome: 'Ana' });
  });

  it('custom envia só o template', () => {
    const body = JSON.parse(
      buildWebhookOutBody({
        ...base,
        payloadMode: 'custom',
        bodyTemplate: '{"lead":"{{answer}}","x":1}',
      })
    );
    expect(body).toEqual({ lead: 'Ana', x: 1 });
    expect(body.event).toBeUndefined();
  });
});

describe('sanitizeGraph secrets S5', () => {
  it('remove secret e Authorization dos headers', () => {
    const g = sanitizeGraph({
      nodes: [
        {
          id: 'h1',
          type: 'http_request',
          data: {
            url: 'https://example.com',
            secret: 'should-go',
            headers: [
              { key: 'Authorization', value: 'Bearer tok' },
              { key: 'X-Custom', value: 'ok' },
            ],
          },
        },
        {
          id: 'w1',
          type: 'webhook_out',
          data: { url: 'https://example.com/hook', secret: 'hmac-secret' },
        },
      ],
      edges: [],
    });
    const http = g.nodes[0] as { data: Record<string, unknown> };
    const wh = g.nodes[1] as { data: Record<string, unknown> };
    expect(http.data.secret).toBeUndefined();
    expect(wh.data.secret).toBeUndefined();
    const headers = http.data.headers as Array<{ key: string; value: string }>;
    expect(headers.some((h) => /authorization/i.test(h.key))).toBe(false);
    expect(headers.some((h) => h.key === 'X-Custom')).toBe(true);
  });

  it('remove last_test_* do sample do editor (S14)', () => {
    const g = sanitizeGraph({
      nodes: [
        {
          id: 'h1',
          type: 'http_request',
          data: {
            url: 'https://example.com',
            last_test_body: '{"a":1}',
            last_test_status: 200,
            last_test_ok: true,
          },
        },
      ],
      edges: [],
    });
    const http = g.nodes[0] as { data: Record<string, unknown> };
    expect(http.data.last_test_body).toBeUndefined();
    expect(http.data.last_test_status).toBeUndefined();
    expect(http.data.url).toBe('https://example.com');
  });
});
