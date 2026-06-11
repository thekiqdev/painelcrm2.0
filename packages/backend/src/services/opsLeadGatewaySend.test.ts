import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./platformNotifications/platformNotificationDispatchContext.js', () => ({
  resolvePlatformWhatsAppOutboundReady: vi.fn(),
}));

import { resolvePlatformWhatsAppOutboundReady } from './platformNotifications/platformNotificationDispatchContext.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';
import { buildOpsLeadGatewaySendInput } from './opsLeadGatewaySend.js';

describe('opsLeadGatewaySend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('N5.2 — usa tenant Ops para flags e instanceToken da plataforma', async () => {
    vi.mocked(resolvePlatformWhatsAppOutboundReady).mockResolvedValue({
      chatInstanceId: 'inst-1',
      instanceToken: 'platform-wa-token',
      ownerUserId: 'owner-1',
    });

    const input = await buildOpsLeadGatewaySendInput(
      {
        channel: 'whatsapp',
        messageIntent: 'transactional',
        recipient: '5511999999999',
        idempotencyKey: 'ops:test',
        body: 'Olá',
        metadata: { source: 'test' },
      },
      {
        acquisitionLeadId: 'lead-1',
        targetTenantId: 'target-tenant-1',
      },
    );

    expect(input.tenantId).toBe(SUPERADMIN_OPS_KANBAN_TENANT_ID);
    expect(input.instanceToken).toBe('platform-wa-token');
    expect(input.metadata).toMatchObject({
      acquisition_lead_id: 'lead-1',
      target_tenant_id: 'target-tenant-1',
      ops_gateway_rollout: true,
      source: 'test',
    });
  });

  it('permite opsTenantId explícito do contexto Phase2', async () => {
    vi.mocked(resolvePlatformWhatsAppOutboundReady).mockResolvedValue(null);

    const input = await buildOpsLeadGatewaySendInput(
      {
        channel: 'whatsapp',
        messageIntent: 'transactional',
        recipient: '5511999999999',
        idempotencyKey: 'ops:test',
        body: 'Olá',
      },
      {
        opsTenantId: SUPERADMIN_OPS_KANBAN_TENANT_ID,
        acquisitionLeadId: 'lead-2',
      },
    );

    expect(input.tenantId).toBe(SUPERADMIN_OPS_KANBAN_TENANT_ID);
    expect(input.instanceToken).toBeUndefined();
  });
});
