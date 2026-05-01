/** Sincroniza `conv_unread_count` dos cartões com abertura da conversa no chat / flutuante / drawer (sem esperar WS). */

export const KANBAN_CONVERSATION_UNREAD_BRIDGE_EVENT = 'painelcrm:kanban:conversation-unread';

export type KanbanConversationUnreadBridgeDetail = {
  conversationId: string;
  unreadCount: number;
};

export function emitKanbanConversationUnread(conversationId: string, unreadCount: number): void {
  if (typeof conversationId !== 'string' || conversationId.length === 0) return;
  if (!Number.isFinite(unreadCount) || unreadCount < 0) return;
  window.dispatchEvent(
    new CustomEvent<KanbanConversationUnreadBridgeDetail>(KANBAN_CONVERSATION_UNREAD_BRIDGE_EVENT, {
      detail: { conversationId, unreadCount: Math.floor(unreadCount) },
    }),
  );
}
