import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./notificationsEngine/businessTransactionalNotifications.js', () => ({
  publishInvoiceCreatedNotification: vi.fn(),
}));

import { publishInvoiceCreatedNotification } from './notificationsEngine/businessTransactionalNotifications.js';
import { replayInvoiceCreatedOutbound } from './invoiceNotificationsService.js';

describe('replayInvoiceCreatedOutbound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publica outbound com idempotency manual sem sino', () => {
    replayInvoiceCreatedOutbound({
      tenantId: '33333333-3333-3333-3333-333333333333',
      invoiceId: '11111111-1111-1111-1111-111111111111',
    });

    expect(publishInvoiceCreatedNotification).toHaveBeenCalledTimes(1);
    const call = vi.mocked(publishInvoiceCreatedNotification).mock.calls[0]![0];
    expect(call.tenantId).toBe('33333333-3333-3333-3333-333333333333');
    expect(call.invoiceId).toBe('11111111-1111-1111-1111-111111111111');
    expect(call.idempotencyKey).toMatch(
      /^invoice\.created:11111111-1111-1111-1111-111111111111:manual:[0-9a-f-]{36}$/,
    );
  });
});
