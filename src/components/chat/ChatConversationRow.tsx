/**
 * F6.5 — Conversation Row memoization (skip re-render se fingerprint estável).
 */

import { memo, type ReactNode } from 'react';
import { conversationUiFingerprint } from '@/features/chat-core/store/selectorMemo';
import { recordConversationRowRender } from '@/features/chat-core/metrics/renderOptimizationMetrics';

export type ChatConversationRowProps = {
  conversation: {
    id: string;
    unreadCount?: number | null;
    lastMessageAt?: string | null;
    lastMessagePreview?: string | null;
    attendance_status?: string | null;
    assignee_display?: string | null;
    client_id?: string | null;
    leadId?: string | null;
    conversation_type?: string | null;
    provider?: string | null;
  };
  isActive: boolean;
  children: ReactNode;
};

function ChatConversationRowInner({ children }: ChatConversationRowProps) {
  // Telemetria síncrona (sem useEffect) — evita loops com filhos que medem layout (Popper).
  recordConversationRowRender();
  return <>{children}</>;
}

/**
 * Comparador customizado: ignora identidade de `children`.
 * Se a conversa / isActive não mudaram, reutiliza a árvore anterior.
 */
export const ChatConversationRow = memo(ChatConversationRowInner, (prev, next) => {
  return (
    prev.isActive === next.isActive &&
    conversationUiFingerprint(prev.conversation) ===
      conversationUiFingerprint(next.conversation)
  );
});

ChatConversationRow.displayName = 'ChatConversationRow';
