import { describe, expect, it } from 'vitest';
import { applyWebhookPayloadMap, extractWebhookInFromGraph } from './flowWebhookIn.js';

describe('applyWebhookPayloadMap S27', () => {
  it('extrai paths dotted e serializa objetos', () => {
    const mapped = applyWebhookPayloadMap(
      {
        conversation_id: 'c1',
        order: { id: '99', items: [{ sku: 'A' }] },
        variables: { foo: 'bar' },
      },
      [
        { path: 'order.id', variable: 'order_id' },
        { path: 'variables.foo', variable: 'foo' },
        { path: 'order.items', variable: 'items_json' },
        { path: 'missing.path', variable: 'miss' },
      ]
    );
    expect(mapped).toEqual({
      order_id: '99',
      foo: 'bar',
      items_json: JSON.stringify([{ sku: 'A' }]),
      miss: '',
    });
  });

  it('ignora linhas sem path ou variável', () => {
    expect(
      applyWebhookPayloadMap({ a: 1 }, [
        { path: '', variable: 'x' },
        { path: 'a', variable: '' },
        { path: 'a', variable: 'ok' },
      ])
    ).toEqual({ ok: '1' });
  });
});

describe('extractWebhookInFromGraph S27', () => {
  it('retorna payloadMap e token', () => {
    const wh = extractWebhookInFromGraph({
      nodes: [
        {
          id: 'win',
          type: 'webhook_in',
          data: {
            token: 'tokentokentoken12',
            payload_map: [
              { path: 'order.id', variable: 'order_id' },
              { path: '', variable: 'skip' },
            ],
          },
        },
      ],
    });
    expect(wh?.token).toBe('tokentokentoken12');
    expect(wh?.nodeId).toBe('win');
    expect(wh?.payloadMap).toEqual([{ path: 'order.id', variable: 'order_id' }]);
  });

  it('legado sem payload_map → lista vazia', () => {
    const wh = extractWebhookInFromGraph({
      nodes: [
        {
          id: 'win',
          type: 'webhook_in',
          data: { token: 'tokentokentoken12' },
        },
      ],
    });
    expect(wh?.payloadMap).toEqual([]);
  });
});
