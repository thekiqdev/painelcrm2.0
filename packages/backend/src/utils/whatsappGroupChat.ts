/** Tipo persistido em `chat_conversations.conversation_type` (community reservado para Fase 3+). */
export type ChatConversationType = 'direct' | 'group' | 'community';

export type ChatPayloadNormalizedLike = {
  externalChatId: string;
  metadata?: unknown;
};

export function deriveConversationTypeFromNormalized(chatData: ChatPayloadNormalizedLike): ChatConversationType {
  const jid = String(chatData.externalChatId || '').trim();
  const meta = (chatData.metadata as Record<string, unknown>) || {};
  if (jid.endsWith('@g.us') || meta.wa_isGroup === true || meta.isGroup === true) {
    return 'group';
  }
  return 'direct';
}

/**
 * Campos para metadata de mensagens em grupo (payload UazAPI / Baileys-like).
 */
export function extractGroupMessageMetadataForDb(message: Record<string, unknown>): Record<string, unknown> {
  const key = message.key && typeof message.key === 'object' ? (message.key as Record<string, unknown>) : {};
  const participantRaw =
    (typeof message.participant === 'string' && message.participant) ||
    (typeof key.participant === 'string' && key.participant) ||
    null;
  const senderJidCandidates = [
    typeof message.sender === 'string' ? message.sender : null,
    typeof message.senderJid === 'string' ? message.senderJid : null,
    participantRaw,
    typeof key.remoteJid === 'string' ? key.remoteJid : null,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);
  const sender_jid = senderJidCandidates[0] ?? null;

  const senderNameCandidates = [
    typeof message.senderName === 'string' ? message.senderName : null,
    typeof message.pushName === 'string' ? message.pushName : null,
    typeof message.notifyName === 'string' ? message.notifyName : null,
    typeof message.verifiedBizName === 'string' ? message.verifiedBizName : null,
  ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  const sender_name = senderNameCandidates[0] ?? null;

  const out: Record<string, unknown> = {};
  if (sender_jid) out.sender_jid = sender_jid;
  if (sender_name) out.sender_name = sender_name.trim();
  if (participantRaw) out.participant = participantRaw;
  if (message.quoted != null) out.quoted = message.quoted;
  if (message.quotedMessage != null) out.quoted = message.quotedMessage;
  if (message.mentions != null) out.mentions = message.mentions;
  if (Array.isArray(message.mentionedJidList)) out.mentions = message.mentionedJidList;
  return out;
}
