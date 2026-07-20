import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../uazapi.js', () => ({
  uazapiService: {
    getInstanceStatus: vi.fn(),
    sendTextMessage: vi.fn(),
  },
}));

vi.mock('../chatInstanceInvalidTokenSelfHeal.js', () => ({
  extractUazapiErrorStatus: (e: unknown) =>
    typeof e === 'object' && e && 'status' in e ? Number((e as { status: unknown }).status) : undefined,
  isUazapiInvalidTokenSignal: () => false,
  markChatInstanceDisconnectedForInvalidToken: vi.fn(),
}));

import { uazapiService } from '../uazapi.js';
import { dispatchWhatsAppText } from './whatsappChannelDispatcher.js';

describe('dispatchWhatsAppText status SSOT', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(uazapiService.getInstanceStatus).mockReset();
    vi.mocked(uazapiService.sendTextMessage).mockReset();
  });

  it('refresh eleva status open/disconnected no DB e envia quando Uaz está connected', async () => {
    const query = vi
      .fn()
      // member check
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      // load operable → empty
      .mockResolvedValueOnce({ rows: [] })
      // load any → stale disconnected
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'inst-1',
            instance_token: 'tok',
            user_id: 'user-1',
            external_instance_name: 'demo',
            status: 'disconnected',
          },
        ],
      })
      // UPDATE after refresh
      .mockResolvedValueOnce({ rowCount: 1 });

    vi.mocked(uazapiService.getInstanceStatus).mockResolvedValue({ status: 'open', connected: true });
    vi.mocked(uazapiService.sendTextMessage).mockResolvedValue({ id: 'msg-1' });

    const result = await dispatchWhatsAppText({
      pool: { query } as unknown as import('pg').Pool,
      tenantId: 'tenant-1',
      senderUserId: 'user-1',
      phone: '5511999999999',
      text: 'Olá fatura',
    });

    expect(result).toEqual({ ok: true, providerMessageId: 'msg-1', chatInstanceId: 'inst-1' });
    expect(uazapiService.getInstanceStatus).toHaveBeenCalledWith('tok');
    expect(uazapiService.sendTextMessage).toHaveBeenCalledTimes(1);
    const updateSql = String(query.mock.calls[3]?.[0] ?? '');
    expect(updateSql).toContain('UPDATE chat_instances');
    expect(query.mock.calls[3]?.[1]).toEqual(['connected', 'inst-1']);
  });

  it('não mascara erro com nenhuma instância quando Uaz continua offline após refresh', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'inst-1',
            instance_token: 'tok',
            user_id: 'user-1',
            external_instance_name: 'demo',
            status: 'connected',
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 });

    vi.mocked(uazapiService.getInstanceStatus).mockResolvedValue({ status: 'disconnected' });

    const result = await dispatchWhatsAppText({
      pool: { query } as unknown as import('pg').Pool,
      tenantId: 'tenant-1',
      senderUserId: 'user-1',
      phone: '5511999999999',
      text: 'Olá',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/não está conectada/i);
      expect(result.error).toMatch(/disconnected/i);
      expect(result.error).not.toMatch(/Nenhuma instância/i);
    }
    expect(uazapiService.sendTextMessage).not.toHaveBeenCalled();
  });

  it('em 503 WhatsApp disconnected faz refresh e retenta send se voltar connected', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'inst-1',
            instance_token: 'tok',
            user_id: 'user-1',
            external_instance_name: 'demo',
            status: 'connected',
          },
        ],
      });

    vi.mocked(uazapiService.getInstanceStatus)
      .mockResolvedValueOnce({ status: 'connected', connected: true })
      .mockResolvedValueOnce({ status: 'connected', connected: true });

    const disc = new Error('WhatsApp disconnected');
    (disc as { status: number }).status = 503;
    vi.mocked(uazapiService.sendTextMessage)
      .mockRejectedValueOnce(disc)
      .mockResolvedValueOnce({ id: 'msg-retry' });

    const result = await dispatchWhatsAppText({
      pool: { query } as unknown as import('pg').Pool,
      tenantId: 'tenant-1',
      senderUserId: 'user-1',
      phone: '5511999999999',
      text: 'Retry',
    });

    expect(result).toEqual({ ok: true, providerMessageId: 'msg-retry', chatInstanceId: 'inst-1' });
    expect(uazapiService.sendTextMessage).toHaveBeenCalledTimes(2);
    expect(uazapiService.getInstanceStatus).toHaveBeenCalledTimes(2);
  });
});
