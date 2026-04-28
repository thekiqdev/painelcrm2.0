import type { CommunicationProviderAdapter, RefreshProfileParams, SendProviderMessageParams, SyncConversationHistoryParams, SyncConversationsParams } from './communicationProviderAdapter.js';
import {
  type CommunicationMessageType,
  type CommunicationProvider,
  DEFAULT_COMMUNICATION_PROVIDER,
  dbDirectionToCanonical,
} from './communicationTypes.js';
import type {
  NormalizedCommunicationContact,
  NormalizedCommunicationConversation,
  NormalizedCommunicationMessage,
} from './normalizedCommunication.js';

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function pickString(r: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Adapter inicial para WhatsApp via Uazapi.
 * Normalização “rica” continua em chatController/normalizeChatPayload na transição;
 * aqui mapeamos shapes comuns e linhas já normalizadas para o modelo canónico.
 */
export const whatsappUazapiAdapter: CommunicationProviderAdapter = {
  provider: DEFAULT_COMMUNICATION_PROVIDER,

  normalizeWebhookEvent(payload: unknown) {
    const r = asRecord(payload);
    const hint =
      (r && (pickString(r, ['event', 'type']) || 'unknown')) || 'unknown';
    return { eventHint: hint, payload };
  },

  normalizeConversation(raw: unknown): NormalizedCommunicationConversation | null {
    const r = asRecord(raw);
    if (!r) return null;
    const externalId = pickString(r, ['external_chat_id', 'provider_conversation_id', 'wa_chatid']);
    return {
      provider: DEFAULT_COMMUNICATION_PROVIDER,
      provider_conversation_id: externalId,
      provider_contact_id: pickString(r, ['canonical_chat_id', 'external_chat_id']),
      phone: pickString(r, ['canonical_phone', 'phone_number', 'phone']),
      display_name: pickString(r, ['display_name', 'contact_name', 'profile_name']),
      avatar_url: pickString(r, ['avatar_url']),
      last_message_at: pickString(r, ['last_message_at', 'lastMessageAt']),
      last_message_preview: pickString(r, ['last_message_preview', 'lastMessagePreview']),
      status: (pickString(r, ['status']) as NormalizedCommunicationConversation['status']) ?? null,
      unread_count: typeof r.unread_count === 'number' ? r.unread_count : null,
      raw_payload: r,
    };
  },

  normalizeMessage(raw: unknown): NormalizedCommunicationMessage | null {
    const r = asRecord(raw);
    if (!r) return null;
    const dirRaw = pickString(r, ['direction']);
    const direction = dbDirectionToCanonical(dirRaw);
    const kind = (pickString(r, ['message_type', 'kind']) || 'text') as CommunicationMessageType;
    const mediaUrl = pickString(r, ['media_url']);
    return {
      provider: DEFAULT_COMMUNICATION_PROVIDER,
      provider_message_id: pickString(r, ['provider_message_id', 'external_message_id', 'id']),
      provider_conversation_id: pickString(r, ['conversation_id', 'provider_conversation_id']),
      provider_contact_id: null,
      direction,
      message_type: kind,
      body: pickString(r, ['body', 'text']),
      media_url: mediaUrl,
      sent_at: pickString(r, ['sent_at', 'sentAt']),
      raw_payload: r,
    };
  },

  normalizeContact(raw: unknown): NormalizedCommunicationContact | null {
    const r = asRecord(raw);
    if (!r) return null;
    return {
      provider: DEFAULT_COMMUNICATION_PROVIDER,
      provider_contact_id: pickString(r, ['provider_contact_id', 'external_chat_id', 'wa_chatid']),
      phone: pickString(r, ['phone', 'phone_number', 'canonical_phone']),
      username: pickString(r, ['username', 'profile_username']),
      display_name: pickString(r, ['display_name', 'displayName', 'contact_name', 'name']),
      profile_avatar_url: pickString(r, ['profile_avatar_url', 'avatar_url']),
      raw_profile: r,
    };
  },

  async sendMessage(_params: SendProviderMessageParams) {
    return {
      ok: false,
      error: 'whatsapp_uazapi_send_use_chat_controller',
    };
  },

  async syncConversations(_params: SyncConversationsParams) {
    return {
      ok: false,
      error: 'whatsapp_uazapi_sync_use_chat_controller',
    };
  },

  async syncConversationHistory(_params: SyncConversationHistoryParams) {
    return {
      ok: false,
      error: 'whatsapp_uazapi_history_use_chat_controller',
    };
  },

  async refreshProfile(_params: RefreshProfileParams) {
    return {
      ok: false,
      error: 'whatsapp_uazapi_refresh_use_chat_controller',
    };
  },
};

export function isWhatsappUazapiProvider(p: CommunicationProvider): boolean {
  return p === DEFAULT_COMMUNICATION_PROVIDER;
}
