import { describe, expect, it, beforeEach } from 'vitest';
import {
  __resetWebhookInListenStoreForTests,
  cancelWebhookInListenSession,
  createWebhookInListenSession,
  getWebhookInListenSession,
  ingestWebhookInListenPayload,
  waitWebhookInListenPayload,
} from './flowWebhookInListen.js';

describe('flowWebhookInListen S27.1', () => {
  beforeEach(() => {
    __resetWebhookInListenStoreForTests();
  });

  it('cria sessão e captura payload one-shot', () => {
    const started = createWebhookInListenSession({
      tenantId: 't1',
      flowId: 'f1',
      ttlMs: 30_000,
    });
    expect(started.listenId).toMatch(/^[a-f0-9]+$/);
    expect(started.ingestPath).toContain(started.listenId);

    const r = ingestWebhookInListenPayload({
      listenId: started.listenId,
      body: { order: { id: '9' } },
    });
    expect(r).toEqual({ ok: true });

    const s = getWebhookInListenSession(started.listenId);
    expect(s?.payload).toEqual({ order: { id: '9' } });
    expect(s?.receivedAt).toBeTruthy();

    const again = ingestWebhookInListenPayload({
      listenId: started.listenId,
      body: { x: 1 },
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe('listen_ja_recebido');
  });

  it('wait consome sessão ao receber', async () => {
    const started = createWebhookInListenSession({
      tenantId: 't1',
      flowId: 'f1',
      ttlMs: 30_000,
    });
    ingestWebhookInListenPayload({
      listenId: started.listenId,
      body: { ok: true },
    });
    const result = await waitWebhookInListenPayload({
      listenId: started.listenId,
      tenantId: 't1',
      flowId: 'f1',
      waitMs: 1000,
    });
    expect(result.status).toBe('received');
    if (result.status === 'received') {
      expect(result.payload).toEqual({ ok: true });
    }
    expect(getWebhookInListenSession(started.listenId)).toBeNull();
  });

  it('cancel remove sessão', () => {
    const started = createWebhookInListenSession({
      tenantId: 't1',
      flowId: 'f1',
    });
    expect(
      cancelWebhookInListenSession({
        listenId: started.listenId,
        tenantId: 't1',
        flowId: 'f1',
      })
    ).toBe(true);
    expect(getWebhookInListenSession(started.listenId)).toBeNull();
  });

  it('forbidden se tenant/flow não batem', async () => {
    const started = createWebhookInListenSession({
      tenantId: 't1',
      flowId: 'f1',
    });
    const result = await waitWebhookInListenPayload({
      listenId: started.listenId,
      tenantId: 'other',
      flowId: 'f1',
      waitMs: 0,
    });
    expect(result.status).toBe('forbidden');
  });
});
