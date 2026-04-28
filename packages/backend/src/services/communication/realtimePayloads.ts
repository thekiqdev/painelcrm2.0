import { DEFAULT_COMMUNICATION_PROVIDER, type CommunicationProvider } from './communicationTypes.js';

export type MessageCreatedRealtimePayload = {
  provider: CommunicationProvider;
  conversation_id: string;
  message_id: string | null;
  provider_message_id: string | null;
  direction: string;
  message_type: string;
  body: string | null;
  media_url: string | null;
  sent_at: string | Date;
};

export type ConversationUpdatedRealtimePayload = {
  provider: CommunicationProvider;
  conversation_id: string;
  last_message_preview: string | null;
  last_message_at: string | Date | null;
  unread_count: number;
  status: string | null;
  assigned_user_id: string | null;
  assigned_team_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type ChannelStatusRealtimePayload = {
  provider: CommunicationProvider;
  channel_id: string;
  status: string;
  display_name?: string | null;
  profile_avatar_url?: string | null;
};

export function buildMessageCreatedPayload(
  input: Omit<MessageCreatedRealtimePayload, 'provider'> & { provider?: CommunicationProvider }
): MessageCreatedRealtimePayload {
  return {
    provider: input.provider ?? DEFAULT_COMMUNICATION_PROVIDER,
    conversation_id: input.conversation_id,
    message_id: input.message_id,
    provider_message_id: input.provider_message_id,
    direction: input.direction,
    message_type: input.message_type,
    body: input.body,
    media_url: input.media_url,
    sent_at: input.sent_at,
  };
}

export function buildConversationUpdatedPayload(
  input: Omit<ConversationUpdatedRealtimePayload, 'provider'> & { provider?: CommunicationProvider }
): ConversationUpdatedRealtimePayload {
  return {
    provider: input.provider ?? DEFAULT_COMMUNICATION_PROVIDER,
    conversation_id: input.conversation_id,
    last_message_preview: input.last_message_preview,
    last_message_at: input.last_message_at,
    unread_count: input.unread_count,
    status: input.status,
    assigned_user_id: input.assigned_user_id,
    assigned_team_id: input.assigned_team_id,
    display_name: input.display_name,
    avatar_url: input.avatar_url,
  };
}

export function buildChannelStatusPayload(
  input: Omit<ChannelStatusRealtimePayload, 'provider'> & { provider?: CommunicationProvider }
): ChannelStatusRealtimePayload {
  return {
    provider: input.provider ?? DEFAULT_COMMUNICATION_PROVIDER,
    channel_id: input.channel_id,
    status: input.status,
    display_name: input.display_name,
    profile_avatar_url: input.profile_avatar_url,
  };
}
