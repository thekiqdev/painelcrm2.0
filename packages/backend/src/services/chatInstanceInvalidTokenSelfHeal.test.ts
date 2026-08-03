import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  extractUazapiErrorStatus,
  isUazapiInvalidTokenSignal,
  markChatInstanceDisconnectedForInvalidToken,
} from './chatInstanceInvalidTokenSelfHeal.js';

describe('isUazapiInvalidTokenSignal', () => {
  it('detecta Invalid token e variantes', () => {
    expect(isUazapiInvalidTokenSignal('Invalid token.', undefined)).toBe(true);
    expect(isUazapiInvalidTokenSignal('invalid token', undefined)).toBe(true);
    expect(isUazapiInvalidTokenSignal('Token inválido na UazAPI', undefined)).toBe(true);
  });

  it('detecta HTTP 401 e 403', () => {
    expect(isUazapiInvalidTokenSignal('', 401)).toBe(true);
    expect(isUazapiInvalidTokenSignal('', 403)).toBe(true);
  });

  it('não classifica outros erros', () => {
    expect(isUazapiInvalidTokenSignal('true', undefined)).toBe(false);
    expect(isUazapiInvalidTokenSignal('timeout', 504)).toBe(false);
  });
});

describe('extractUazapiErrorStatus', () => {
  it('lê status anexado ao Error da UazAPI', () => {
    const err = new Error('Invalid token');
    (err as { status: number }).status = 401;
    expect(extractUazapiErrorStatus(err)).toBe(401);
  });
});

describe('markChatInstanceDisconnectedForInvalidToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('atualiza status disconnected e metadata sem alterar token', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const pool = { query } as unknown as import('pg').Pool;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await markChatInstanceDisconnectedForInvalidToken(pool, {
      instanceId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      tenantId: '33333333-3333-3333-3333-333333333333',
      externalInstanceName: 'painelcrmevo_test',
      reason: 'Invalid token.',
      source: 'dispatch_whatsapp_text',
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, args] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'disconnected'");
    expect(sql).not.toContain('instance_token');
    const patch = JSON.parse(String(args[0]));
    expect(patch.invalidTokenDetected).toBe(true);
    expect(typeof patch.invalidTokenDetectedAt).toBe('string');
    expect(patch.invalidTokenReason).toBe('Invalid token.');
    expect(patch.invalidTokenSource).toBe('dispatch_whatsapp_text');
    expect(args[1]).toBe('11111111-1111-1111-1111-111111111111');

    const healthLogs = warnSpy.mock.calls.filter((c) => String(c[0]).includes('[chat_instance_health]'));
    expect(healthLogs.length).toBe(2);
    const first = JSON.parse(String(healthLogs[0]![1]));
    expect(first.action).toBe('invalid_token_detected');
    const second = JSON.parse(String(healthLogs[1]![1]));
    expect(second.action).toBe('instance_marked_disconnected');
  });
});
