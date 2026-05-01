import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chatService, type ChatConversation } from '@/services/chat';
import { resolveConversationIdentity, type ChatCrmEntity } from '@/utils/chatIdentityDisplay';

/**
 * Floating / overlay do chat não está na página `/chat`: não há `clientsById` / `leadsById`.
 * Carrega o perfil CRM da conversa para o mesmo merge de avatar que a lista principal.
 */
export function useFloatingConversationIdentity(
  conversationId: string,
  conversation: ChatConversation | null | undefined,
) {
  const { data: crmProfile } = useQuery({
    queryKey: ['floating-chat', 'conversation-crm-profile', conversationId],
    queryFn: () => chatService.getConversationProfile(conversationId),
    staleTime: 30_000,
  });

  const crmClient: ChatCrmEntity =
    crmProfile?.type === 'client' ? (crmProfile.profile as ChatCrmEntity) : null;
  const crmLead: ChatCrmEntity =
    crmProfile?.type === 'lead' ? (crmProfile.profile as ChatCrmEntity) : null;

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
