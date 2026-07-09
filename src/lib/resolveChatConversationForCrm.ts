import type { ChatConversation } from '@/services/chat';
import {
  listChatConversationsForCrmResolve,
  type ChatAggregatedSurface,
} from '@/repositories/chatConversationsRepository';

function normEq(a: string | null | undefined, b: string): boolean {
  return Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());
}

/**
 * Resolve `conversation_id` para um cliente ou lead, espelhando a lógica do `/chat?openClientId=` / `openLeadId=`.
 */
export async function resolveConversationIdForCrmRecord(params: {
  clientId?: string;
  leadId?: string;
  instanceIds: string[];
  inboxScope: 'tenant' | 'owner';
  surface?: ChatAggregatedSurface;
}): Promise<string | null> {
  const { clientId, leadId, instanceIds, inboxScope } = params;
  const surface = params.surface ?? 'lead';
  if (!clientId && !leadId) return null;
  if (instanceIds.length === 0) return null;

  const buckets = await listChatConversationsForCrmResolve({
    surface,
    instanceIds,
    inboxScope,
  });

  if (leadId) {
    return (
      buckets.find((x) => normEq(x.leadId, leadId))?.id ??
      buckets.find((x) => x.leadId === leadId)?.id ??
      null
    );
  }

  return (
    buckets.find((x) => normEq(x.client_id, clientId))?.id ??
    buckets.find((x) => x.client_id === clientId)?.id ??
    null
  );
}
