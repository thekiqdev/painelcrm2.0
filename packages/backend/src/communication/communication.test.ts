import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./communicationFlags.js', () => ({
  getCommunicationGatewayFlag: vi.fn(),
  isCommunicationUazapiBridgeEnabled: vi.fn(),
  isCommunicationDualDispatchEnabled: vi.fn(),
  isCommunicationRoutingEnabled: vi.fn(),
  isCommunicationCapabilityRegistryEnabled: vi.fn(),
  isCommunicationWebhookNormalizerEnabled: vi.fn(),
}));

vi.mock('./channelProviderGateway/communicationMessageRepository.js', () => ({
  insertCommunicationMessage: vi.fn(),
  updateCommunicationMessageState: vi.fn(),
  communicationMessagesTableExists: vi.fn().mockResolvedValue(true),
}));

vi.mock('./adapters/uazapiBridgeAdapter.js', () => ({
  uazapiBridgeAdapter: {
    providerKey: 'uazapi',
    displayName: 'UazAPI Bridge',
    supportsChannel: () => true,
    getCapabilities: () => ['transactional_allowed'],
    healthCheck: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

import {
  getCommunicationGatewayFlag,
  isCommunicationRoutingEnabled,
  isCommunicationWebhookNormalizerEnabled,
} from './communicationFlags.js';
import { insertCommunicationMessage } from './channelProviderGateway/communicationMessageRepository.js';
import { sendMessage } from './channelProviderGateway/channelProviderGateway.js';
import { resolveCommunicationRouting } from './channelProviderGateway/communicationRoutingService.js';
import { providerSupportsCapability } from './channelProviderGateway/providerCapabilityRegistry.js';
import { normalizeUazapiWebhookPayload } from './webhooks/uazapiWebhookNormalizer.js';
import { normalizeProviderWebhook } from './webhooks/webhookNormalizerService.js';
import { uazapiBridgeAdapter } from './adapters/uazapiBridgeAdapter.js';

describe('channelProviderGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCommunicationRoutingEnabled).mockResolvedValue(true);
  });

  it('no-ops when gateway flag is off', async () => {
    vi.mocked(getCommunicationGatewayFlag).mockResolvedValue({ enabled: false, shadow: true });
    const result = await sendMessage({
      channel: 'whatsapp',
      messageIntent: 'billing',
      recipient: '5511999999999',
      body: 'test',
      idempotencyKey: 'comm:test:1',
    });
    expect(result.outcome).toBe('skipped');
    expect(insertCommunicationMessage).not.toHaveBeenCalled();
  });

  it('shadow logs without bridge send', async () => {
    vi.mocked(getCommunicationGatewayFlag).mockResolvedValue({ enabled: true, shadow: true });
    vi.mocked(insertCommunicationMessage).mockResolvedValue({
      inserted: true,
      row: {
        id: 'msg-1',
        tenant_id: null,
        channel: 'whatsapp',
        provider: 'uazapi',
        message_intent: 'billing',
        delivery_state: 'queued',
        correlation_id: 'corr-1',
        idempotency_key: 'comm:test:2',
        recipient: '5511999999999',
        provider_message_id: null,
        routing_json: {},
        metadata_json: {},
        shadow_mode: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    const result = await sendMessage({
      channel: 'whatsapp',
      messageIntent: 'billing',
      recipient: '5511999999999',
      body: 'hello',
      idempotencyKey: 'comm:test:2',
      correlationId: 'corr-1',
    });

    expect(result.outcome).toBe('shadow_logged');
    expect(result.shadow).toBe(true);
    expect(uazapiBridgeAdapter.sendMessage).not.toHaveBeenCalled();
  });
});

describe('communicationRoutingService', () => {
  beforeEach(() => {
    vi.mocked(isCommunicationRoutingEnabled).mockResolvedValue(true);
  });

  it('routes whatsapp to uazapi by default', async () => {
    const decision = await resolveCommunicationRouting({
      channel: 'whatsapp',
      messageIntent: 'transactional',
      tenantId: 'tenant-a',
    });
    expect(decision.primaryProvider).toBe('uazapi');
    expect(decision.fallbackProvider).toBe('meta_cloud');
  });
});

describe('providerCapabilityRegistry', () => {
  it('meta_cloud has official_api capability', () => {
    expect(providerSupportsCapability('meta_cloud', 'official_api')).toBe(true);
    expect(providerSupportsCapability('uazapi', 'official_api')).toBe(false);
  });
});

describe('webhook normalization', () => {
  beforeEach(() => {
    vi.mocked(isCommunicationWebhookNormalizerEnabled).mockResolvedValue({ enabled: true, shadow: true });
  });

  it('normalizes uazapi delivered webhook', () => {
    const events = normalizeUazapiWebhookPayload({
      rawPayload: { event: 'message.delivered', id: 'ext-1', from: '5511999999999' },
      tenantId: 'tenant-1',
      correlationId: 'corr-w',
    });
    expect(events[0]?.eventType).toBe('communication.message.delivered');
    expect(events[0]?.provider).toBe('uazapi');
  });

  it('returns empty when normalizer flag off', async () => {
    vi.mocked(isCommunicationWebhookNormalizerEnabled).mockResolvedValue({ enabled: false, shadow: true });
    const result = await normalizeProviderWebhook({
      provider: 'uazapi',
      rawPayload: { event: 'message.received' },
    });
    expect(result.events).toHaveLength(0);
  });
});

describe('uazapiBridgeAdapter contract', () => {
  it('supports whatsapp channel only', async () => {
    const { uazapiBridgeAdapter: realAdapter } = await vi.importActual<
      typeof import('./adapters/uazapiBridgeAdapter.js')
    >('./adapters/uazapiBridgeAdapter.js');
    expect(realAdapter.supportsChannel('whatsapp')).toBe(true);
    expect(realAdapter.supportsChannel('email')).toBe(false);
  });
});
