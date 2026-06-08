import type { NormalizedWebhookEvent } from '../communicationTypes.js';
import { logWebhook } from '../communicationLogger.js';

type UazapiWebhookPayload = {
  event?: string;
  type?: string;
  data?: Record<string, unknown>;
  message?: Record<string, unknown>;
  key?: { id?: string };
  status?: string;
  from?: string;
  number?: string;
  id?: string;
  messageId?: string;
};

function pickEventType(payload: UazapiWebhookPayload): NormalizedWebhookEvent['eventType'] | null {
  const raw = String(payload.event ?? payload.type ?? payload.status ?? '').toLowerCase();
  if (raw.includes('receive') || raw === 'message' || raw === 'messages.upsert') {
    return 'communication.message.received';
  }
  if (raw.includes('deliver')) return 'communication.message.delivered';
  if (raw.includes('read') || raw.includes('ack')) return 'communication.message.read';
  if (raw.includes('fail') || raw.includes('error')) return 'communication.message.failed';
  if (raw.includes('sent') || raw.includes('send')) return 'communication.message.sent';
  return null;
}

export function normalizeUazapiWebhookPayload(input: {
  rawPayload: unknown;
  tenantId?: string | null;
  correlationId?: string;
}): NormalizedWebhookEvent[] {
  const payload = (input.rawPayload ?? {}) as UazapiWebhookPayload;
  const eventType = pickEventType(payload);
  if (!eventType) {
    logWebhook('uazapi_unmapped', {
      event: payload.event ?? payload.type ?? payload.status ?? null,
    });
    return [];
  }

  const data = payload.data ?? payload.message ?? payload;
  const externalMessageId =
    (data as Record<string, unknown>)?.id ??
    (data as Record<string, unknown>)?.messageId ??
    payload.key?.id ??
    payload.id ??
    payload.messageId;

  const recipient = String(payload.from ?? payload.number ?? (data as Record<string, unknown>)?.from ?? '');

  return [
    {
      eventType,
      provider: 'uazapi',
      channel: 'whatsapp',
      externalMessageId: externalMessageId != null ? String(externalMessageId) : undefined,
      recipient: recipient || undefined,
      tenantId: input.tenantId ?? null,
      correlationId: input.correlationId,
      occurredAt: new Date().toISOString(),
      rawProvider: 'uazapi',
      payload: payload as Record<string, unknown>,
    },
  ];
}
