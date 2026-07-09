/**
 * F5.7 — API pública do Domain Store para a UI.
 *
 * Componentes devem importar apenas deste módulo (ou hooks exportados aqui).
 * Não importar `session`, `actions`, `integration` ou `syncStoreFrom*` na UI.
 */

export { shouldUseChatDomainStore } from './flags';
export {
  isChatStoreSourceOfTruth,
  ensureChatDomainStoreSession,
  readStoreConversationCount,
  applyStoreMessages,
  setStoreLoadingConversations,
  setStoreLoadingMessages,
} from './consolidation';
export { applyFloatingMessagesUpdater } from './messageMutations';
export { useChatConversationList } from './hooks/useChatConversationList';
export { useChatMessages } from './hooks/useChatMessages';
export { useChatSelection } from './hooks/useChatSelection';
export { useFloatingConversationListData } from './hooks/useFloatingConversationListData';
export { useFloatingConversationMessages } from './hooks/useFloatingConversationMessages';
