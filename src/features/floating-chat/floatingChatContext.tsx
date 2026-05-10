import { createContext, useContext } from 'react';
import type { FloatingChatPanel } from './floatingChatTypes';

export type FloatingChatContextValue = {
  listOpen: boolean;
  setListOpen: (v: boolean) => void;
  toggleList: () => void;
  panels: FloatingChatPanel[];
  activeWindowId: string | null;
  focusWindow: (conversationId: string) => void;
  /** epoch ms até quando mostrar pulse na pill minimizada */
  pulseUntil: Record<string, number>;
  openOrFocusConversation: (conversationId: string) => void;
  minimizePanel: (conversationId: string) => void;
  expandPanel: (conversationId: string) => void;
  closePanel: (conversationId: string) => void;
  /** Remove só do shell flutuante (não encerra atendimento). */
  closeFloatingConversation: (conversationId: string) => void;
  composerDrafts: Record<string, string>;
  setComposerDraft: (conversationId: string, text: string) => void;
  instanceIds: string[];
  inboxScope: 'tenant' | 'owner';
  /** Desktop: janela flutuante; mobile (< md): overlay full-screen sem mudar de rota. */
  openConversationInContext: (conversationId: string) => void;
  openChatForClient: (clientId: string) => Promise<string | null>;
  openChatForLead: (leadId: string, options?: { createIfMissing?: boolean }) => Promise<string | null>;
  closeMobileConversationOverlay: () => void;
  compactProfileOpenByConversationId: Record<string, boolean>;
  toggleCompactProfile: (conversationId: string) => void;
  setCompactProfileOpen: (conversationId: string, open: boolean) => void;
};

export const FloatingChatContext = createContext<FloatingChatContextValue | null>(null);

export function useFloatingChat(): FloatingChatContextValue {
  const ctx = useContext(FloatingChatContext);
  if (!ctx) {
    throw new Error('useFloatingChat must be used within FloatingChatProvider');
  }
  return ctx;
}

export function useFloatingChatOptional(): FloatingChatContextValue | null {
  return useContext(FloatingChatContext);
}
