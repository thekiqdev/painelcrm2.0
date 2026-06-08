import { pool } from '../../utils/db.js';
import {
  dispatchPlatformWhatsAppText,
  dispatchWhatsAppText,
} from '../../services/notificationsEngine/whatsappChannelDispatcher.js';import type { SendCommunicationInput } from '../communicationTypes.js';
import type { ICommunicationProviderAdapter, ProviderSendResult } from '../channelProviderGateway/providerContracts.js';
import { logCommunicationBridge } from '../communicationLogger.js';
export const uazapiBridgeAdapter: ICommunicationProviderAdapter = {
  providerKey: 'uazapi',
  displayName: 'UazAPI Bridge',

  supportsChannel(channel) {
    return channel === 'whatsapp';
  },

  getCapabilities() {
    return [
      'media_support',
      'typing_support',
      'read_receipt',
      'reactions',
      'session_window',
      'transactional_allowed',
      'marketing_allowed',
    ];
  },

  async healthCheck() {
    const baseUrl = (process.env.UAZAPI_BASE_URL || 'https://free.uazapi.com').replace(/\/$/, '');
    try {
      const res = await fetch(`${baseUrl}/`, { method: 'GET' });
      return {
        provider: 'uazapi',
        status: res.ok ? 'healthy' : 'degraded',
        checkedAt: new Date().toISOString(),
        details: { http_status: res.status, base_url: baseUrl },
      };
    } catch (err) {
      return {
        provider: 'uazapi',
        status: 'unavailable',
        checkedAt: new Date().toISOString(),
        details: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  },

  async sendMessage(input: SendCommunicationInput): Promise<ProviderSendResult> {
    logCommunicationBridge('send_message_delegate', {
      channel: input.channel,
      intent: input.messageIntent,
      tenant_id: input.tenantId ?? null,
      correlation_id: input.correlationId,
      has_instance_token: Boolean(input.instanceToken),
      has_sender_user: Boolean(input.senderUserId),
    });

    if (input.channel !== 'whatsapp') {
      return { ok: false, error: 'uazapi_bridge_whatsapp_only' };
    }

    const text = input.body?.trim();
    if (!text) {
      return { ok: false, error: 'body_required' };
    }

    if (input.instanceToken) {
      const result = await dispatchPlatformWhatsAppText({
        instanceToken: input.instanceToken,
        phone: input.recipient,
        text,
      });
      return mapDispatchResult(result);
    }

    if (input.tenantId && input.senderUserId) {
      const result = await dispatchWhatsAppText({
        pool,
        tenantId: input.tenantId,
        senderUserId: input.senderUserId,
        phone: input.recipient,
        text,
      });
      return mapDispatchResult(result);
    }

    return { ok: false, error: 'uazapi_bridge_missing_credentials' };
  },
  async sendTransactionalMessage(input: SendCommunicationInput): Promise<ProviderSendResult> {
    return this.sendMessage(input);
  },
};

function mapDispatchResult(result: { ok: boolean; providerMessageId?: string; error?: string }): ProviderSendResult {
  if (result.ok) {
    return { ok: true, externalMessageId: result.providerMessageId ?? null, accepted: true };
  }
  return { ok: false, error: result.error ?? 'dispatch_failed' };
}
