/**
 * Adaptadores F0 → tipos legados (`@/services/chat`).
 *
 * Não entram no hot path da UI. F5 usará estes bridges para
 * converter Domain ↔ API sem duplicar normalizers.
 */

export {
  normalizeChatMessage as adaptLegacyChatMessage,
  normalizeConversation as adaptLegacyConversation,
} from '@/services/chat';
