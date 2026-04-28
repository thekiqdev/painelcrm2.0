/**
 * Tipos centrais multicanal (Chat Engine). Alinhados ao backend em `communicationTypes.ts`.
 */

export type CommunicationProvider =
  | 'whatsapp_uazapi'
  | 'instagram'
  | 'facebook_messenger'
  | 'webchat'
  | 'email';

export type CommunicationMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'template'
  | 'system';

export type CommunicationConversationStatus = 'open' | 'pending' | 'closed' | 'archived';

export type CommunicationConversation = {
  id: string;
  provider: CommunicationProvider;
  displayName?: string | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
  avatarUrl?: string | null;
};

export type CommunicationMessage = {
  id: string;
  provider: CommunicationProvider;
  conversationId: string;
  direction: 'incoming' | 'outgoing';
  messageType?: CommunicationMessageType | string | null;
  body?: string | null;
  sentAt?: string | null;
  providerMessageId?: string | null;
};

export const DEFAULT_COMMUNICATION_PROVIDER: CommunicationProvider = 'whatsapp_uazapi';
