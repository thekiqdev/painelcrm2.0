import type { NormalizedWebhookEvent, NormalizedWebhookEventType } from '../communicationTypes.js';
import { isCommunicationWebhookNormalizerEnabled } from '../communicationFlags.js';
import { logWebhook } from '../communicationLogger.js';
import { normalizeUazapiWebhookPayload } from './uazapiWebhookNormalizer.js';

export type WebhookNormalizeInput = {
  provider: 'uazapi' | 'meta_cloud' | 'smtp' | 'internal';
  rawPayload: unknown;
  headers?: Record<string, string>;
  tenantId?: string | null;
  correlationId?: string;
};

export type WebhookNormalizeResult = {
  enabled: boolean;
  shadow: boolean;
  events: NormalizedWebhookEvent[];
};

export async function normalizeProviderWebhook(input: WebhookNormalizeInput): Promise<WebhookNormalizeResult> {
  const flag = await isCommunicationWebhookNormalizerEnabled({ tenantId: input.tenantId ?? null });
  if (!flag.enabled) {
    return { enabled: false, shadow: true, events: [] };
  }

  let events: NormalizedWebhookEvent[] = [];
  if (input.provider === 'uazapi') {
    events = normalizeUazapiWebhookPayload({
      rawPayload: input.rawPayload,
      tenantId: input.tenantId ?? null,
      correlationId: input.correlationId,
    });
  }

  for (const ev of events) {
    logWebhook('normalized_event', {
      event_type: ev.eventType,
      provider: ev.provider,
      channel: ev.channel,
      external_message_id: ev.externalMessageId ?? null,
      tenant_id: ev.tenantId ?? null,
      correlation_id: ev.correlationId ?? null,
      shadow: flag.shadow,
    });
  }

  return { enabled: true, shadow: flag.shadow, events };
}

export function mapDeliveryStateToEventType(state: string): NormalizedWebhookEventType | null {
  const map: Record<string, NormalizedWebhookEventType> = {
    received: 'communication.message.received',
    sent: 'communication.message.sent',
    delivered: 'communication.message.delivered',
    read: 'communication.message.read',
    failed: 'communication.message.failed',
  };
  return map[state] ?? null;
}
