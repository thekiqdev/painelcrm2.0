import { chatService, type ChatConversation } from '@/services/chat';

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
}): Promise<string | null> {
  const { clientId, leadId, instanceIds, inboxScope } = params;
  if (!clientId && !leadId) return null;
  if (instanceIds.length === 0) return null;

  const buckets: ChatConversation[] = [];
  for (const instanceId of instanceIds) {
    try {
      const rows = await chatService.getConversations({ instanceId, inboxScope });
      buckets.push(...rows);
    } catch {
      /* ignora instância */
    }
  }

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
