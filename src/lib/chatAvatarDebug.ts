/**
 * Diagnóstico opcional — ativar com `VITE_CHAT_AVATAR_DEBUG=true` ou `=1`.
 * Limita logs por sessão para não travar o consola em listas grandes.
 */

const MAX_LOGS = 300;
let remaining = MAX_LOGS;

export function isChatAvatarDebugEnabled(): boolean {
  return (
    import.meta.env.VITE_CHAT_AVATAR_DEBUG === 'true' ||
    import.meta.env.VITE_CHAT_AVATAR_DEBUG === '1'
  );
}

export function chatAvatarDebugLog(phase: string, detail: Record<string, unknown>): void {
  if (!isChatAvatarDebugEnabled()) return;
  if (remaining <= 0) return;
  remaining -= 1;
  // eslint-disable-next-line no-console
  console.info(`[ChatAvatarDebug] ${phase}`, detail);
}

/** Para `AvatarImage`: não consome o orçamento global (erros são raros). */
export function chatAvatarDebugLogImageError(detail: Record<string, unknown>): void {
  if (!isChatAvatarDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.info('[ChatAvatarDebug] AvatarImage.onError', detail);
}
