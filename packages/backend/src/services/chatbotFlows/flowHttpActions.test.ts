import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertSafePublicHttpUrl,
  buildHttpResponseMapped,
  buildWebhookOutBody,
  executeFlowHttpRequest,
  getByDotPath,
  isHttpSuccessStatus,
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

describe('buildHttpResponseMapped / isHttpSuccessStatus', () => {
  it('trata 201 como sucesso (2xx)', () => {
    expect(isHttpSuccessStatus(201)).toBe(true);
    expect(isHttpSuccessStatus(200)).toBe(true);
    expect(isHttpSuccessStatus(400)).toBe(false);
    expect(isHttpSuccessStatus(500)).toBe(false);
  });

  it('mapeia status/body/paths em qualquer status', () => {
    const mapped = buildHttpResponseMapped({
      status: 400,
      bodyText: '{"error":"bad","code":"E1"}',
      bodyJson: { error: 'bad', code: 'E1' },
      statusVariable: 'http_status',
      responseVariable: 'http_body',
      responseMap: [{ path: 'code', variable: 'err_code' }],
    });
    expect(mapped.http_status).toBe('400');
    expect(mapped.err_code).toBe('E1');
    expect(mapped.http_body).toContain('bad');
  });
});

describe('executeFlowHttpRequest — map em qualquer status', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(status: number, body: unknown) {
    const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status,
        text: async () => bodyText,
      })
    );
  }

  const mapOpts = {
    method: 'GET',
    url: 'https://example.com/api',
    timeoutMs: 5000,
    variables: {},
    statusVariable: 'http_status',
    responseVariable: 'http_body',
    responseMap: [{ path: 'id', variable: 'ext_id' }],
  };

  it('201 → ok:true e mapped preenchido', async () => {
    mockFetch(201, { id: 'created-1', ok: true });
    const res = await executeFlowHttpRequest(mapOpts);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(201);
    expect(res.mapped.http_status).toBe('201');
    expect(res.mapped.ext_id).toBe('created-1');
    expect(res.mapped.http_body).toContain('created-1');
  });

  it('400 → ok:false e mapped preenchido', async () => {
    mockFetch(400, { id: null, error: 'invalid', detail: { reason: 'x' } });
    const res = await executeFlowHttpRequest({
      ...mapOpts,
      responseMap: [
        { path: 'error', variable: 'api_error' },
        { path: 'detail.reason', variable: 'api_reason' },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.error).toBe('HTTP 400');
    expect(res.mapped.http_status).toBe('400');
    expect(res.mapped.api_error).toBe('invalid');
    expect(res.mapped.api_reason).toBe('x');
    expect(res.mapped.http_body).toContain('invalid');
  });

  it('500 → ok:false e mapped preenchido', async () => {
    mockFetch(500, { message: 'boom', id: 'srv' });
    const res = await executeFlowHttpRequest(mapOpts);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(res.mapped.http_status).toBe('500');
    expect(res.mapped.ext_id).toBe('srv');
    expect(res.mapped.http_body).toContain('boom');
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

  it('remove last_test_* e last_payload_* do sample do editor (S14/S27)', () => {
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
        {
          id: 'w1',
          type: 'webhook_in',
          data: {
            token: 'tokentokentoken12',
            payload_map: [{ path: 'a', variable: 'b' }],
            last_payload_json: { a: 1 },
            last_payload_at: '2026-01-01T00:00:00.000Z',
          },
        },
      ],
      edges: [],
    });
    const http = g.nodes[0] as { data: Record<string, unknown> };
    expect(http.data.last_test_body).toBeUndefined();
    expect(http.data.last_test_status).toBeUndefined();
    expect(http.data.url).toBe('https://example.com');
    const wh = g.nodes[1] as { data: Record<string, unknown> };
    expect(wh.data.last_payload_json).toBeUndefined();
    expect(wh.data.last_payload_at).toBeUndefined();
    // token é sensível e some no sanitize; payload_map permanece
    expect(wh.data.payload_map).toEqual([{ path: 'a', variable: 'b' }]);
  });
});
