import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chatService, type ChatConversation } from '@/services/chat';
import { resolveConversationIdentity, type ChatCrmEntity } from '@/utils/chatIdentityDisplay';
import { conversationCrmProfileQueryKey } from '@/features/chat-core/crm/crmDetailProjection';
import { recordCrmDetailFetchScheduled } from '@/features/chat-core/metrics/crmDetailProjectionMetrics';

/**
 * Floating identity — vínculo SoT = conversation.client_id / leadId (Store).
 * Profile GET = projeção (Sprint 4 / 10H).
 */
export function useFloatingConversationIdentity(
  conversationId: string,
  conversation: ChatConversation | null | undefined,
) {
  const clientId = conversation?.client_id ?? null;
  const leadId = conversation?.leadId ?? null;
  const linked = Boolean(clientId || leadId);

  const { data: crmProfile } = useQuery({
    queryKey: conversationCrmProfileQueryKey(conversationId, clientId, leadId),
    queryFn: async () => {
      recordCrmDetailFetchScheduled();
      return chatService.getConversationProfile(conversationId);
    },
    enabled: Boolean(conversationId) && linked,
    staleTime: 30_000,
  });

  const crmClient: ChatCrmEntity =
    linked && clientId && crmProfile?.type === 'client'
      ? (crmProfile.profile as ChatCrmEntity)
      : null;
  const crmLead: ChatCrmEntity =
    linked && !clientId && leadId && crmProfile?.type === 'lead'
      ? (crmProfile.profile as ChatCrmEntity)
      : null;

  return useMemo(
    () =>
      resolveConversationIdentity(
        conversation ?? ({ id: conversationId } as ChatConversation),
        crmClient,
        crmLead,
      ),
    [conversation, conversationId, crmClient, crmLead],
  );
}
