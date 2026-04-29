/** Disparar após atualizar a lista de conversas no /chat para refrescar o badge do menu. */
export const CHAT_NAV_UNREAD_REFRESH_EVENT = 'painelcrm:chat:nav-unread-refresh';

export function emitChatNavUnreadRefresh(): void {
  window.dispatchEvent(new CustomEvent(CHAT_NAV_UNREAD_REFRESH_EVENT));
}
