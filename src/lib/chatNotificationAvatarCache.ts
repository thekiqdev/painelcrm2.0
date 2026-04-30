/**
 * Última lista de conversas carregada no Chat (mesma prioridade de avatar que o inbox).
 * Usado pelo sininho para enriquecer notificações antigas ou sem `contact_avatar_url` no payload.
 */
const avatarByConversationId = new Map<string, string>();

export function replaceChatInboxAvatarCache(
  entries: Array<{ id: string; avatarUrl?: string | null }>,
): void {
  avatarByConversationId.clear();
  for (const e of entries) {
    const u = typeof e.avatarUrl === 'string' ? e.avatarUrl.trim() : '';
    if (e.id && u) avatarByConversationId.set(e.id, u);
  }
}

export function getChatInboxAvatarFromCache(conversationId: string | null | undefined): string | null {
  if (!conversationId) return null;
  return avatarByConversationId.get(conversationId) ?? null;
}
