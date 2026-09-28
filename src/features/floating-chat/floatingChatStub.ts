import type { FloatingChatContextValue } from './floatingChatContext';
import {
  enqueueFloatingChatClient,
  enqueueFloatingChatLead,
  enqueueFloatingConversation,
} from './floatingChatPending';

const noop = () => {};
const noopAsync = async () => null as string | null;

export function createFloatingChatStub(armLoad: () => void): FloatingChatContextValue {
  const arm = () => armLoad();

  return {
    listOpen: false,
    setListOpen: noop,
    toggleList: arm,
    panels: [],
    activeWindowId: null,
    focusWindow: (conversationId) => {
      arm();
      enqueueFloatingConversation(conversationId);
    },
    pulseUntil: {},
    openOrFocusConversation: (conversationId) => {
      arm();
      enqueueFloatingConversation(conversationId);
    },
    minimizePanel: noop,
    expandPanel: noop,
    closePanel: noop,
    closeFloatingConversation: noop,
    composerDrafts: {},
    setComposerDraft: noop,
    instanceIds: [],
    instancesLoading: false,
    inboxScope: 'tenant',
    openConversationInContext: (conversationId) => {
      arm();
      enqueueFloatingConversation(conversationId);
    },
    openChatForClient: async (clientId) => {
      arm();
      return enqueueFloatingChatClient(clientId);
    },
    openChatForLead: async (leadId, options) => {
      arm();
      return enqueueFloatingChatLead(leadId, options);
    },
    closeMobileConversationOverlay: noop,
    compactProfileOpenByConversationId: {},
    toggleCompactProfile: noop,
    setCompactProfileOpen: noop,
    appointmentPanelOpenByConversationId: {},
    openAppointmentPanel: noop,
    closeAppointmentPanel: noop,
  };
}

/** Stub inerte quando chat flutuante ainda não carregou (evita throw em useFloatingChat). */
export function createInertFloatingChatStub(): FloatingChatContextValue {
  return {
    listOpen: false,
    setListOpen: noop,
    toggleList: noop,
    panels: [],
    activeWindowId: null,
    focusWindow: noop,
    pulseUntil: {},
    openOrFocusConversation: noop,
    minimizePanel: noop,
    expandPanel: noop,
    closePanel: noop,
    closeFloatingConversation: noop,
    composerDrafts: {},
    setComposerDraft: noop,
    instanceIds: [],
    instancesLoading: false,
    inboxScope: 'tenant',
    openConversationInContext: noop,
    openChatForClient: noopAsync,
    openChatForLead: noopAsync,
    closeMobileConversationOverlay: noop,
    compactProfileOpenByConversationId: {},
    toggleCompactProfile: noop,
    setCompactProfileOpen: noop,
    appointmentPanelOpenByConversationId: {},
    openAppointmentPanel: noop,
    closeAppointmentPanel: noop,
  };
}
