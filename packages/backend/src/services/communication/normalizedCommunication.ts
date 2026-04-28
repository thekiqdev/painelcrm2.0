import type {
  CommunicationConversationStatus,
  CommunicationDirection,
  CommunicationMessageType,
  CommunicationProvider,
} from './communicationTypes.js';

/** Contato externo normalizado (linguagem interna do engine). */
export type NormalizedCommunicationContact = {
  provider: CommunicationProvider;
  provider_contact_id: string | null;
  phone: string | null;
  username: string | null;
  display_name: string | null;
  profile_avatar_url: string | null;
  raw_profile: Record<string, unknown> | null;
};

/** Conversa normalizada (linguagem interna do engine). */
export type NormalizedCommunicationConversation = {
  provider: CommunicationProvider;
  provider_conversation_id: string | null;
  provider_contact_id: string | null;
  phone: string | null;
  display_name: string | null;
  avatar_url: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  status?: CommunicationConversationStatus | null;
  unread_count?: number | null;
  raw_payload: Record<string, unknown> | null;
};

/** Mensagem normalizada (linguagem interna do engine). */
export type NormalizedCommunicationMessage = {
  provider: CommunicationProvider;
  provider_message_id: string | null;
  provider_conversation_id: string | null;
  provider_contact_id: string | null;
  direction: CommunicationDirection;
  message_type: CommunicationMessageType;
  body: string | null;
  media_url: string | null;
  sent_at: string | null;
  raw_payload: Record<string, unknown> | null;
};
