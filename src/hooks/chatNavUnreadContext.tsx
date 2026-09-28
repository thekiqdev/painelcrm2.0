import React, { createContext, useContext } from 'react';
import { useChatNavUnreadCount } from '@/hooks/useChatNavUnreadCount';

const ChatNavUnreadContext = createContext<number>(0);

/** Uma única subscrição de unread (evita polling duplicado sidebar + bubble). */
export function ChatNavUnreadProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const count = useChatNavUnreadCount(enabled);
  return <ChatNavUnreadContext.Provider value={count}>{children}</ChatNavUnreadContext.Provider>;
}

export function useSharedChatNavUnreadCount(): number {
  return useContext(ChatNavUnreadContext);
}
