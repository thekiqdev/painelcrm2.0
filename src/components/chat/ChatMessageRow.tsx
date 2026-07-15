/**
 * F6.5 — Message Row memoization (skip re-render se fingerprint estável).
 */

import { memo, type ReactNode } from 'react';
import { messageUiFingerprint } from '@/features/chat-core/store/selectorMemo';
import { recordMessageRowRender } from '@/features/chat-core/metrics/renderOptimizationMetrics';

export type ChatMessageRowProps = {
  message: {
    id: string;
    status?: string | null;
    body?: string | null;
    sentAt?: string | null;
    direction?: string | null;
    updated_at?: string | null;
  };
  children: ReactNode;
};

function ChatMessageRowInner({ children }: ChatMessageRowProps) {
  recordMessageRowRender();
  return <>{children}</>;
}

/**
 * Comparador customizado: ignora identidade de `children`.
 * Mudanças de status/corpo disparam re-render; updates de outras msgs não.
 */
export const ChatMessageRow = memo(ChatMessageRowInner, (prev, next) => {
  return messageUiFingerprint(prev.message) === messageUiFingerprint(next.message);
});

ChatMessageRow.displayName = 'ChatMessageRow';
