/**
 * Diagnóstico opcional — ativar com `CHAT_AVATAR_DEBUG=true` ou `=1` no ambiente do backend.
 */

export function isChatAvatarDebugEnabled(): boolean {
  const v = process.env.CHAT_AVATAR_DEBUG;
  return v === '1' || v === 'true';
}

export function chatAvatarDebugLog(phase: string, detail: Record<string, unknown>): void {
  if (!isChatAvatarDebugEnabled()) return;
  console.info('[ChatAvatarDebug]', phase, detail);
}
