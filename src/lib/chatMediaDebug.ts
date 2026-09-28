/** Diagnóstico opcional — ativar com `VITE_CHAT_MEDIA_DEBUG=true`. */

export function isChatMediaDebugEnabled(): boolean {
  return import.meta.env.VITE_CHAT_MEDIA_DEBUG === 'true' || import.meta.env.VITE_CHAT_MEDIA_DEBUG === '1';
}

export function chatMediaDebugLog(
  event:
    | 'chat_media_url_missing'
    | 'chat_media_render_failed'
    | 'chat_avatar_missing'
    | 'chat_avatar_preserved_existing'
    | 'chat_avatar_updated',
  detail: Record<string, unknown>,
): void {
  if (!isChatMediaDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.info(`[ChatMediaDebug] ${event}`, detail);
}
